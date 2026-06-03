import { DAPClient } from './client';
import { LaunchConfiguration } from './types';
import { DebugProtocol } from '@vscode/debugprotocol';

export class DebugSession {
  client: DAPClient;
  private currentThreadId: number | undefined;
  private pathMappings: Record<string, string> = {};
  private pendingBreakpoints = new Map<string, number[]>();
  private isInitialized = false;
  private initializedPromise: Promise<void>;
  private initializedResolve!: () => void;

  constructor(private config: LaunchConfiguration) {
    this.client = new DAPClient();
    this.setupEventHandlers();
    
    // Store path mappings from config
    if (config.pathMappings) {
      this.pathMappings = config.pathMappings;
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
    console.log('Adapter initialized event received');

    // Send all pending breakpoints that were queued before initialization
    for (const [filePath, lines] of this.pendingBreakpoints) {
      await this.setBreakpoints(filePath, lines);
    }
    this.pendingBreakpoints.clear();

    // Notify adapter that configuration is complete so it can start executing
    await this.client.sendRequest('configurationDone');
    console.log('Configuration done sent');

    this.initializedResolve();
  }

  async start(adapterPath: string) {
    await this.client.spawn(adapterPath);
    
    // Initialize sequence
    const initResponse = await this.client.sendRequest('initialize', {
      clientID: 'dapdesk',
      clientName: 'DapDesk',
      adapterID: this.config.type,
      pathFormat: 'path',
      linesStartAt1: true,
      columnsStartAt1: true,
      supportsVariableType: true,
      supportsRunInTerminalRequest: false,
    }) as DebugProtocol.InitializeResponse;

    console.log('Adapter initialized:', initResponse.body);

    if (this.config.request === 'launch') {
      await this.client.sendRequest('launch', this.config);
    } else {
      await this.client.sendRequest('attach', this.config);
    }

    // Wait for the adapter to emit 'initialized' and for us to send 'configurationDone'
    await this.initializedPromise;
  }

  private async onStopped(event: DebugProtocol.StoppedEvent['body']) {
    console.log('Stopped event:', event);
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
    console.log('Output:', event.output);
    this.client.emit('outputEvent', event);
  }

  private onBreakpointEvent(event: DebugProtocol.BreakpointEvent['body']) {
    console.log('Breakpoint event:', event);
    this.client.emit('breakpointEvent', event);
  }

  private onTerminated(event: DebugProtocol.TerminatedEvent['body']) {
    console.log('Terminated:', event);
    this.client.emit('terminatedEvent', event);
  }

  private onExited(event: DebugProtocol.ExitedEvent['body']) {
    console.log('Exited with code:', event.exitCode);
    this.client.emit('exitedEvent', event);
  }

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

  async disconnect(restart?: boolean) {
    try {
      await this.client.sendRequest('disconnect', { restart });
    } finally {
      // Resolve initialization promise in case we're still waiting during teardown
      this.initializedResolve();
      this.client.dispose();
    }
  }

  serverToLocalPath(serverPath: string): string {
    // Apply path mappings to convert server path to local path
    for (const [serverPrefix, localPrefix] of Object.entries(this.pathMappings)) {
      if (serverPath.startsWith(serverPrefix)) {
        return serverPath.replace(serverPrefix, localPrefix);
      }
    }
    // If no mapping matches, return as-is
    return serverPath;
  }

  private localToServerPath(localPath: string): string {
    // Apply path mappings to convert local path to server path
    // We need to find the reverse mapping
    for (const [serverPrefix, localPrefix] of Object.entries(this.pathMappings)) {
      if (localPath.startsWith(localPrefix)) {
        return localPath.replace(localPrefix, serverPrefix);
      }
    }
    // If no mapping matches, return as-is
    return localPath;
  }
}