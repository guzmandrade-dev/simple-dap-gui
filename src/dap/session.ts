import { DAPClient } from './client';
import { LaunchConfiguration } from './types';
import { DebugProtocol } from '@vscode/debugprotocol';
import * as path from 'path';
import * as os from 'os';

export class DebugSession {
  client: DAPClient;
  private currentThreadId: number | undefined;
  private workspaceRoot: string;
  private pathMappings: Record<string, string> = {};
  private pendingBreakpoints = new Map<string, number[]>();
  private isInitialized = false;
  private initializedPromise: Promise<void>;
  private initializedResolve!: () => void;

  constructor(private config: LaunchConfiguration, workspaceRoot: string = '') {
    this.client = new DAPClient();
    this.setupEventHandlers();

    // Always fall back to the current working directory so ${workspaceFolder}
    // can be resolved even if no folder was explicitly opened.
    this.workspaceRoot = workspaceRoot || process.cwd();

    // Store raw path mappings. ${workspaceFolder} is resolved lazily so the
    // most recent workspace root is always used.
    if (config.pathMappings) {
      for (const [serverPrefix, localPrefix] of Object.entries(config.pathMappings)) {
        this.pathMappings[serverPrefix] = localPrefix;
      }
    }

    this.initializedPromise = new Promise((resolve) => {
      this.initializedResolve = resolve;
    });
  }

  private setupEventHandlers() {
    this.client.on('stopped', this.onStopped.bind(this));
    this.client.on('output', this.onOutput.bind(this));
    this.client.on('breakpoint', this.onBreakpointEvent.bind(this));
    this.client.on('terminated', this.onTerminated.bind(this));
    this.client.on('exited', this.onExited.bind(this));
    this.client.on('initialized', this.onInitialized.bind(this));
  }

  private async onInitialized() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Send all pending breakpoints that were queued before initialization
    for (const [filePath, lines] of this.pendingBreakpoints) {
      await this.setBreakpoints(filePath, lines);
    }
    this.pendingBreakpoints.clear();

    // Send pending exception breakpoints
    if (this.pendingExceptionBreakpoints) {
      await this.setExceptionBreakpoints(this.pendingExceptionBreakpoints);
      this.pendingExceptionBreakpoints = null;
    }

    // Notify adapter that configuration is complete so it can start executing
    await this.client.sendRequest('configurationDone');

    this.initializedResolve();
  }

  private expandConfig(): LaunchConfiguration {
    const ctx = this.getVariableContext();

    const expandValue = (value: unknown): unknown => {
      if (typeof value === 'string') {
        return this.resolveVariables(value, ctx);
      }
      if (Array.isArray(value)) {
        return value.map(expandValue);
      }
      if (value && typeof value === 'object') {
        const expanded: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(value)) {
          expanded[key] = expandValue(val);
        }
        return expanded;
      }
      return value;
    };

    const expanded = expandValue(this.config) as LaunchConfiguration;

    // Remove pathMappings from the config sent to the adapter. We handle all
    // server/local path conversion ourselves so overlapping prefixes are resolved
    // with our longest-prefix-first logic rather than the adapter's logic.
    if (expanded.pathMappings) {
      delete (expanded as unknown as Record<string, unknown>).pathMappings;
    }

    return expanded;
  }

  async start(adapterPath: string) {
    await this.client.spawn(adapterPath);

    // Expand local filesystem variables in the config before sending it to the
    // adapter. The adapter doesn't understand ${userHome}/${workspaceFolder}/etc.
    const expandedConfig = this.expandConfig();

    // Initialize sequence
    await this.client.sendRequest('initialize', {
      clientID: 'simple-dap-gui',
      clientName: 'simple-dap-gui',
      adapterID: expandedConfig.type,
      pathFormat: 'path',
      linesStartAt1: true,
      columnsStartAt1: true,
      supportsVariableType: true,
      supportsRunInTerminalRequest: false,
    }) as DebugProtocol.InitializeResponse;

    if (expandedConfig.request === 'launch') {
      await this.client.sendRequest('launch', expandedConfig);
    } else {
      await this.client.sendRequest('attach', expandedConfig);
    }

    // Wait for the adapter to emit 'initialized' and for us to send 'configurationDone'
    await this.initializedPromise;
  }

  private async onStopped(event: DebugProtocol.StoppedEvent['body']) {
    this.currentThreadId = event.threadId;

    // Always fetch stack trace on stop
    if (event.threadId) {
      const stack = await this.client.sendRequest('stackTrace', {
        threadId: event.threadId,
        startFrame: 0,
        levels: 20,
      }) as DebugProtocol.StackTraceResponse;

      // Emit for UI
      this.client.emit('stackTrace', stack.body);

      // Fetch variables for top frame
      if (stack.body.stackFrames.length > 0) {
        await this.fetchVariables(stack.body.stackFrames[0].id);
      }
    }

    // Emit stopped event for store
    this.client.emit('stoppedEvent', event);
  }

  private async fetchVariables(frameId: number) {
    try {
      // Get scopes for frame
      const scopesResponse = await this.client.sendRequest('scopes', {
        frameId: frameId,
      }) as DebugProtocol.ScopesResponse;

      this.client.emit('scopes', scopesResponse.body);

      // Fetch variables for each scope
      for (const scope of scopesResponse.body.scopes) {
        if (scope.variablesReference > 0) {
          const varsResponse = await this.client.sendRequest('variables', {
            variablesReference: scope.variablesReference,
          }) as DebugProtocol.VariablesResponse;

          this.client.emit('variables', {
            frameId: frameId,
            scopeId: scope.variablesReference,
            variables: varsResponse.body.variables,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching variables:', error);
    }
  }

  private onOutput(event: DebugProtocol.OutputEvent['body']) {
    this.client.emit('outputEvent', event);
  }

  private onBreakpointEvent(event: DebugProtocol.BreakpointEvent['body']) {
    this.client.emit('breakpointEvent', event);
  }

  private onTerminated(event: DebugProtocol.TerminatedEvent['body']) {
    this.client.emit('terminatedEvent', event);
  }

  private onExited(event: DebugProtocol.ExitedEvent['body']) {
    this.client.emit('exitedEvent', event);
  }

  private pendingExceptionBreakpoints: string[] | null = null;

  async setBreakpoints(filePath: string, lines: number[]) {
    // If the adapter hasn't emitted 'initialized' yet, queue the breakpoints
    if (!this.isInitialized) {
      this.pendingBreakpoints.set(filePath, lines);
      return;
    }

    // Convert local path to server path if needed
    const serverPath = this.localToServerPath(filePath);

    await this.client.sendRequest('setBreakpoints', {
      source: { path: serverPath },
      breakpoints: lines.map(line => ({ line })),
    });
  }

  async setExceptionBreakpoints(filters: string[]) {
    if (!this.isInitialized) {
      this.pendingExceptionBreakpoints = filters;
      return;
    }

    await this.client.sendRequest('setExceptionBreakpoints', {
      filters,
    });
  }

  async stepOver() {
    if (this.currentThreadId) {
      await this.client.sendRequest('next', {
        threadId: this.currentThreadId,
      });
    }
  }

  async stepInto() {
    if (this.currentThreadId) {
      await this.client.sendRequest('stepIn', {
        threadId: this.currentThreadId,
      });
    }
  }

  async stepOut() {
    if (this.currentThreadId) {
      await this.client.sendRequest('stepOut', {
        threadId: this.currentThreadId,
      });
    }
  }

  async continue() {
    if (this.currentThreadId) {
      await this.client.sendRequest('continue', {
        threadId: this.currentThreadId,
      });
    }
  }

  async pause(threadId?: number) {
    const targetThreadId = threadId || this.currentThreadId;
    if (targetThreadId) {
      await this.client.sendRequest('pause', {
        threadId: targetThreadId,
      });
    }
  }

  async fetchChildVariables(variablesReference: number) {
    const response = await this.client.sendRequest('variables', {
      variablesReference,
    }) as DebugProtocol.VariablesResponse;

    this.client.emit('childVariables', {
      variablesReference,
      variables: response.body.variables,
    });
  }

  async evaluate(expression: string, frameId?: number) {
    const response = await this.client.sendRequest('evaluate', {
      expression,
      frameId,
      context: 'watch',
    }) as DebugProtocol.EvaluateResponse;

    this.client.emit('evaluate', {
      expression,
      result: response.body.result,
      type: response.body.type,
      variablesReference: response.body.variablesReference,
    });

    return response.body;
  }

  async disconnect(restart?: boolean, terminateDebuggee?: boolean) {
    try {
      await this.client.sendRequest('disconnect', { restart, terminateDebuggee });
    } finally {
      // Resolve initialization promise in case we're still waiting during teardown
      this.initializedResolve();
      this.client.dispose();
    }
  }

  async detach() {
    // Disconnect without killing the debuggee
    await this.disconnect(false, false);
  }

  private getVariableContext() {
    // On Windows USERPROFILE is more reliable than os.homedir() in some packaged
    // contexts; use it first, then fall back to os.homedir() / HOME.
    const userHome = process.platform === 'win32'
      ? (process.env.USERPROFILE || os.homedir() || '/home/user')
      : (os.homedir() || process.env.HOME || '/home/user');
    return {
      userHome,
      workspaceFolder: this.workspaceRoot,
      workspaceFolderBasename: this.workspaceRoot.split(/[\\\\/]/).filter(Boolean).pop() || '',
      pathSeparator: path.sep,
    };
  }

  private resolveVariables(value: string, ctx = this.getVariableContext()): string {
    return value
      .replace(/\$\{userHome\}/g, ctx.userHome)
      .replace(/\$\{workspaceFolder\}/g, ctx.workspaceFolder)
      .replace(/\$\{workspaceFolderBasename\}/g, ctx.workspaceFolderBasename)
      .replace(/\$\{pathSeparator\}/g, ctx.pathSeparator);
  }

  serverToLocalPath(serverPath: string): string {
    // Apply explicit path mappings to convert server path to local path
    for (const [serverPrefix, localPrefix] of Object.entries(this.pathMappings)) {
      const resolvedServerPrefix = this.resolveVariables(serverPrefix);
      const resolvedLocalPrefix = this.resolveVariables(localPrefix);
      if (serverPath.startsWith(resolvedServerPrefix)) {
        return serverPath.replace(resolvedServerPrefix, resolvedLocalPrefix);
      }
    }

    // Fallback: some adapters embed ${workspaceFolder} directly in the server
    // path (e.g. /some/prefix/${workspaceFolder}/file.php). Treat the placeholder
    // as the project root and use everything after it as the relative path.
    const resolvedPlaceholder = this.resolveVariables('${workspaceFolder}');
    const pivot = serverPath.indexOf(resolvedPlaceholder);
    if (pivot !== -1) {
      const suffix = serverPath.slice(pivot + resolvedPlaceholder.length);
      return path.join(this.workspaceRoot, suffix.replace(/^[\\/]+/, ''));
    }

    // If no mapping matches, return as-is
    return serverPath;
  }

  private localToServerPath(localPath: string): string {
    // Apply path mappings to convert local path to server path
    for (const [serverPrefix, localPrefix] of Object.entries(this.pathMappings)) {
      const resolvedServerPrefix = this.resolveVariables(serverPrefix);
      const resolvedLocalPrefix = this.resolveVariables(localPrefix);
      if (localPath.startsWith(resolvedLocalPrefix)) {
        return localPath.replace(resolvedLocalPrefix, resolvedServerPrefix);
      }
    }
    // If no mapping matches, return as-is
    return localPath;
  }
}
