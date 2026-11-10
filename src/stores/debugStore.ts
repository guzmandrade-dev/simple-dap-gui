import { create } from 'zustand';
import { DebugProtocol } from '@vscode/debugprotocol';
import { LaunchConfiguration } from '../dap/types';
import { useEditorStore } from './editorStore';
import { classifyStopSource, virtualSourceKey, MAX_OUTPUT_LINES } from '../utils/debugNavigation';

const BREAKPOINTS_FILENAME = '.vscode/dap-gui.breakpoints.json';

// Guards against double listener registration (React StrictMode runs
// effects twice in development, which would duplicate DAP event handlers).
let dapListenersRegistered = false;

async function getBreakpointsPath(): Promise<string | null> {
  if (!window.electronAPI) return null;
  const root = await window.electronAPI.getWorkspaceRoot();
  if (!root) return null;
  return window.electronAPI.pathJoin(root, BREAKPOINTS_FILENAME);
}

async function loadBreakpoints(): Promise<Map<string, Set<number>>> {
  if (!window.electronAPI) return new Map();
  try {
    const settings = await window.electronAPI.getAppSettings();
    if (!settings.persistentBreakpoints) return new Map();
  } catch {
    return new Map();
  }

  const bpPath = await getBreakpointsPath();
  if (!bpPath) return new Map();
  try {
    const exists = await window.electronAPI!.fileExists(bpPath);
    if (!exists) return new Map();
    const content = await window.electronAPI!.readFile(bpPath);
    const data = JSON.parse(content) as Record<string, number[]>;
    const map = new Map<string, Set<number>>();
    for (const [file, lines] of Object.entries(data)) {
      map.set(file, new Set(lines));
    }
    return map;
  } catch (err) {
    console.error('Failed to load breakpoints:', err);
    return new Map();
  }
}

async function saveBreakpoints(breakpoints: Map<string, Set<number>>): Promise<void> {
  if (!window.electronAPI) return;
  try {
    const settings = await window.electronAPI.getAppSettings();
    if (!settings.persistentBreakpoints) return;
  } catch {
    return;
  }

  const bpPath = await getBreakpointsPath();
  if (!bpPath) return;
  try {
    const data: Record<string, number[]> = {};
    for (const [file, lines] of breakpoints) {
      if (lines.size > 0) {
        data[file] = Array.from(lines);
      }
    }
    const json = JSON.stringify(data, null, 2);
    await window.electronAPI!.writeFile(bpPath, json);
  } catch (err) {
    console.error('Failed to save breakpoints:', err);
  }
}

export interface SourceUnavailableInfo {
  name?: string;
  path?: string;
  sourceReference?: number;
  error?: string;
}

export interface OutputEntry {
  text: string;
  category?: string;
}

interface DebugState {
  // Session state
  isSessionActive: boolean;
  isPaused: boolean;
  stopReason: string | undefined;
  stopDescription: string | undefined;

  // Data from DAP
  threads: DebugProtocol.Thread[];
  stackFrames: DebugProtocol.StackFrame[];
  scopes: DebugProtocol.Scope[];
  variables: Map<number, DebugProtocol.Variable[]>;

  // Console output from the debuggee
  output: OutputEntry[];

  // Current position
  currentThreadId: number | undefined;
  currentFrameId: number | undefined;
  currentFile: string | undefined;
  currentLine: number | undefined;

  // Set when the stopped frame's source is not available as a local file.
  // The session stays alive in that case; the editor shows an explanatory
  // panel instead of crashing or going blank.
  currentSourceUnavailable: SourceUnavailableInfo | null;

  // Breakpoints
  breakpoints: Map<string, Set<number>>;
  breakpointVerified: Map<string, Map<number, boolean>>;

  // Exception breakpoints (e.g. Notice, Warning, Error, Exception, Everything)
  exceptionBreakpoints: Map<string, boolean>;

  // Workspace
  workspaceRoot: string;
  recentConfigs: LaunchConfiguration[];

  // Watch expressions
  watches: Array<{ id: string; expression: string; result?: string; type?: string; variablesReference?: number }>;

  // Actions
  initialize: () => Promise<void>;
  startSession: (config: LaunchConfiguration) => Promise<void>;
  stopSession: () => Promise<void>;
  detachSession: () => Promise<void>;
  continue: () => Promise<void>;
  stepOver: () => Promise<void>;
  stepInto: () => Promise<void>;
  stepOut: () => Promise<void>;
  pause: () => Promise<void>;
  selectFrame: (frameId: number) => void;
  setCurrentLocation: (file: string | undefined, line: number | undefined, frameId?: number) => void;

  // Event handlers
  onStopped: (body: DebugProtocol.StoppedEvent['body']) => void;
  onStackTrace: (body: DebugProtocol.StackTraceResponse['body']) => Promise<void>;
  onScopes: (body: DebugProtocol.ScopesResponse['body']) => void;
  onVariables: (data: { frameId: number; scopeId: number; variables: DebugProtocol.Variable[] }) => void;
  onChildVariables: (data: { variablesReference: number; variables: DebugProtocol.Variable[] }) => void;
  onOutput: (body: DebugProtocol.OutputEvent['body']) => void;
  clearOutput: () => void;
  fetchChildVariables: (variablesReference: number) => Promise<void>;

  // Navigation to a stack frame; handles sources that are not local files
  navigateToFrame: (frame: DebugProtocol.StackFrame) => Promise<void>;
  fetchAndOpenAdapterSource: (sourceReference: number, name?: string, line?: number, path?: string) => Promise<void>;

  // Watch management
  addWatch: (expression: string) => void;
  removeWatch: (id: string) => void;
  evaluateWatches: () => Promise<void>;
  onEvaluate: (data: { expression: string; result: string; type?: string; variablesReference?: number }) => void;

  // Breakpoint management
  setBreakpoint: (file: string, line: number) => Promise<void>;
  removeBreakpoint: (file: string, line: number) => Promise<void>;
  toggleBreakpointEnabled: (file: string, line: number) => void;
  isBreakpointEnabled: (file: string, line: number) => boolean;
  reloadBreakpoints: () => Promise<void>;

  // Exception breakpoint management
  setExceptionBreakpoint: (filter: string, enabled: boolean) => Promise<void>;
  toggleExceptionBreakpoint: (filter: string) => Promise<void>;
  isExceptionBreakpointEnabled: (filter: string) => boolean;
}

function resetSessionState() {
  return {
    isSessionActive: false,
    isPaused: false,
    stopReason: undefined,
    stopDescription: undefined,
    threads: [] as DebugProtocol.Thread[],
    stackFrames: [] as DebugProtocol.StackFrame[],
    scopes: [] as DebugProtocol.Scope[],
    variables: new Map<number, DebugProtocol.Variable[]>(),
    currentThreadId: undefined,
    currentFrameId: undefined,
    currentFile: undefined,
    currentLine: undefined,
    currentSourceUnavailable: null,
  };
}

export const useDebugStore = create<DebugState>()((set, get) => ({
  // Initial state
  ...resetSessionState(),
  isSessionActive: false,
  breakpoints: new Map(),
  breakpointVerified: new Map(),
  exceptionBreakpoints: new Map(),
  workspaceRoot: '',
  recentConfigs: [],
  watches: [],
  output: [],

  initialize: async () => {
    // Get workspace root from Electron
    if (window.electronAPI) {
      const root = await window.electronAPI.getWorkspaceRoot();
      set({ workspaceRoot: root });

      // Load persisted breakpoints
      const loaded = await loadBreakpoints();
      if (loaded.size > 0) {
        set({ breakpoints: loaded });
      }

      // Setup DAP event listeners (once — StrictMode double-invokes effects)
      if (!dapListenersRegistered) {
        dapListenersRegistered = true;

        window.electronAPI.onDapStopped((event) => {
          get().onStopped(event as DebugProtocol.StoppedEvent['body']);
        });

        window.electronAPI.onDapStackTrace((body) => {
          get().onStackTrace(body as DebugProtocol.StackTraceResponse['body']).catch((err) => {
            console.error('Error handling stack trace:', err);
          });
        });

        window.electronAPI.onDapScopes((body) => {
          get().onScopes(body as DebugProtocol.ScopesResponse['body']);
        });

        window.electronAPI.onDapVariables((data) => {
          get().onVariables(data as { frameId: number; scopeId: number; variables: DebugProtocol.Variable[] });
        });

        window.electronAPI.onDapChildVariables((data) => {
          get().onChildVariables(data as { variablesReference: number; variables: DebugProtocol.Variable[] });
        });

        window.electronAPI.onDapOutput((body) => {
          get().onOutput(body as DebugProtocol.OutputEvent['body']);
        });

        window.electronAPI.onDapTerminated(() => {
          get().stopSession();
        });

        window.electronAPI.onDapExited(() => {
          get().stopSession();
        });
      }
    }
  },

  startSession: async (config) => {
    try {
      // Collect breakpoints that were set before the session started
      const breakpoints = get().breakpoints;
      const initialBreakpoints: [string, number[]][] = [];
      for (const [file, lines] of breakpoints) {
        initialBreakpoints.push([file, Array.from(lines)]);
      }

      const initialExceptionFilters = Array.from(get().exceptionBreakpoints.keys());
      const result = await window.electronAPI?.debugStart(config as unknown as Record<string, unknown>, initialBreakpoints, initialExceptionFilters);

      if (result?.success) {
        set({
          ...resetSessionState(),
          isSessionActive: true,
        });

        // Add to recent configs
        const recent = get().recentConfigs.filter(c => c.name !== config.name);
        recent.unshift(config);
        set({ recentConfigs: recent.slice(0, 5) });
      } else {
        const errorMsg = result?.error || 'Unknown error starting debug session';
        console.error('Failed to start session:', errorMsg);
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error('Failed to start session:', error);
      throw error;
    }
  },

  onStopped: (body) => {
    set({
      isPaused: true,
      currentThreadId: body.threadId,
      stopReason: body.reason,
      stopDescription: body.text ?? body.description,
      currentSourceUnavailable: null,
    });
  },

  onStackTrace: async (body) => {
    set({ stackFrames: body.stackFrames });

    // Update current location from top frame
    if (body.stackFrames.length > 0) {
      await get().navigateToFrame(body.stackFrames[0]);
    }
  },

  navigateToFrame: async (frame) => {
    const source = frame.source;
    const rawPath = source?.path?.trim() || '';

    // Normalize the adapter-reported path to a local absolute path.
    let resolvedPath = rawPath;
    if (rawPath && window.electronAPI) {
      try {
        resolvedPath = await window.electronAPI.pathResolve(rawPath);
      } catch {
        resolvedPath = rawPath;
      }
    }

    // Only treat the path as a local file when it actually exists on disk.
    // A stop in a file outside the project (or on a remote server) must not
    // break the session — we fall back to adapter-provided source or an
    // explanatory panel instead.
    let fileExists = false;
    if (resolvedPath && window.electronAPI) {
      try {
        fileExists = await window.electronAPI.fileExists(resolvedPath);
      } catch {
        fileExists = false;
      }
    }

    const stopSource = classifyStopSource({
      path: resolvedPath || undefined,
      name: source?.name,
      sourceReference: source?.sourceReference,
      fileExists,
    });

    if (stopSource.kind === 'file') {
      set({
        currentFile: stopSource.path,
        currentLine: frame.line,
        currentFrameId: frame.id,
        currentSourceUnavailable: null,
      });
      await useEditorStore.getState().openFile(stopSource.path, frame.line);
    } else if (stopSource.kind === 'adapter') {
      set({
        currentFile: undefined,
        currentLine: frame.line,
        currentFrameId: frame.id,
        currentSourceUnavailable: {
          name: stopSource.name ?? source?.name,
          path: stopSource.path,
          sourceReference: stopSource.sourceReference,
        },
      });
      // Try to pull the source content straight from the adapter so the
      // user still sees the code where the debugger stopped.
      await get().fetchAndOpenAdapterSource(stopSource.sourceReference, stopSource.name ?? source?.name, frame.line, stopSource.path);
    } else {
      set({
        currentFile: undefined,
        currentLine: frame.line,
        currentFrameId: frame.id,
        currentSourceUnavailable: {
          name: source?.name,
          path: stopSource.path,
        },
      });
    }

    // Re-evaluate watches for the new frame
    get().evaluateWatches();
  },

  fetchAndOpenAdapterSource: async (sourceReference, name, line, path) => {
    try {
      const result = await window.electronAPI?.debugFetchSource(sourceReference);
      if (result?.success && typeof result.content === 'string' && result.content.length > 0) {
        const key = virtualSourceKey(sourceReference, name);
        useEditorStore.getState().setVirtualContent(key, result.content, line);
        set({ currentFile: key, currentSourceUnavailable: null });
      } else {
        set({
          currentSourceUnavailable: {
            name,
            path,
            sourceReference,
            error: result?.error || 'The adapter did not return source content for this frame.',
          },
        });
      }
    } catch (err) {
      set({
        currentSourceUnavailable: {
          name,
          path,
          sourceReference,
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  },

  onScopes: (body) => {
    set({ scopes: body.scopes });
  },

  onVariables: (data) => {
    const { variables } = get();
    const frameVars = variables.get(data.frameId) || [];
    frameVars.push(...data.variables);
    variables.set(data.frameId, frameVars);
    set({ variables: new Map(variables) });
  },

  onChildVariables: (data) => {
    const { variables } = get();
    variables.set(data.variablesReference, data.variables);
    set({ variables: new Map(variables) });
  },

  onOutput: (body) => {
    if (!body || typeof body.output !== 'string') return;
    const entry: OutputEntry = { text: body.output, category: body.category };
    const output = [...get().output, entry];
    set({ output: output.length > MAX_OUTPUT_LINES ? output.slice(output.length - MAX_OUTPUT_LINES) : output });
  },

  clearOutput: () => {
    set({ output: [] });
  },

  fetchChildVariables: async (variablesReference) => {
    const result = await window.electronAPI?.debugFetchVariables(variablesReference);
    if (result?.success && result.variables) {
      const { variables } = get();
      variables.set(variablesReference, result.variables as DebugProtocol.Variable[]);
      set({ variables: new Map(variables) });
    }
  },

  addWatch: (expression) => {
    const watches = [...get().watches];
    watches.push({
      id: crypto.randomUUID(),
      expression,
    });
    set({ watches });
    // Evaluate immediately if paused
    if (get().isPaused) {
      get().evaluateWatches();
    }
  },

  removeWatch: (id) => {
    set({ watches: get().watches.filter(w => w.id !== id) });
  },

  evaluateWatches: async () => {
    const { watches, currentFrameId } = get();
    if (watches.length === 0) return;

    const results = await Promise.all(
      watches.map(async (watch) => {
        try {
          const result = await window.electronAPI?.debugEvaluate(watch.expression, currentFrameId);
          if (result?.success && result.result) {
            const body = result.result as { result: string; type?: string; variablesReference?: number };
            return {
              ...watch,
              result: body.result,
              type: body.type,
              variablesReference: body.variablesReference,
            };
          }
          return { ...watch, result: 'Error', type: 'error' };
        } catch {
          return { ...watch, result: 'Error', type: 'error' };
        }
      })
    );

    set({ watches: results });
  },

  onEvaluate: (data) => {
    const watches = get().watches.map((w) =>
      w.expression === data.expression
        ? { ...w, result: data.result, type: data.type, variablesReference: data.variablesReference }
        : w
    );
    set({ watches });
  },

  stopSession: async () => {
    await window.electronAPI?.debugStop();
    set(resetSessionState());
  },

  detachSession: async () => {
    await window.electronAPI?.debugDetach();
    set(resetSessionState());
  },

  continue: async () => {
    await window.electronAPI?.debugContinue();
    set({ isPaused: false, stopReason: undefined, stopDescription: undefined, currentSourceUnavailable: null });
  },

  stepOver: async () => {
    await window.electronAPI?.debugStepOver();
  },

  stepInto: async () => {
    await window.electronAPI?.debugStepInto();
  },

  stepOut: async () => {
    await window.electronAPI?.debugStepOut();
  },

  pause: async () => {
    await window.electronAPI?.debugPause();
  },

  selectFrame: (frameId: number) => {
    const frame = get().stackFrames.find(f => f.id === frameId);
    if (frame) {
      get().navigateToFrame(frame).catch((err) => {
        console.error('Error navigating to frame:', err);
      });
    }
  },

  setCurrentLocation: (file: string | undefined, line: number | undefined, frameId?: number) => {
    set({
      currentFile: file,
      currentLine: line,
      currentFrameId: frameId,
    });
  },

  setBreakpoint: async (file: string, line: number) => {
    // Track locally first
    const breakpoints = new Map(get().breakpoints);
    const fileBPs = breakpoints.get(file) || new Set();
    fileBPs.add(line);
    breakpoints.set(file, fileBPs);

    // Track verification status
    const verified = new Map(get().breakpointVerified);
    const fileVerified = verified.get(file) || new Map();
    fileVerified.set(line, false);
    verified.set(file, fileVerified);

    set({ breakpoints, breakpointVerified: verified });

    // Persist to disk
    await saveBreakpoints(breakpoints);

    // Send to adapter if session active
    if (get().isSessionActive) {
      await window.electronAPI?.debugSetBreakpoints(file, Array.from(fileBPs));
    }
  },

  removeBreakpoint: async (file: string, line: number) => {
    const breakpoints = new Map(get().breakpoints);
    const fileBPs = breakpoints.get(file);
    if (fileBPs) {
      fileBPs.delete(line);
      if (fileBPs.size === 0) {
        breakpoints.delete(file);
      }
    }

    const verified = new Map(get().breakpointVerified);
    const fileVerified = verified.get(file);
    if (fileVerified) {
      fileVerified.delete(line);
      if (fileVerified.size === 0) {
        verified.delete(file);
      }
    }

    set({ breakpoints, breakpointVerified: verified });

    // Persist to disk
    await saveBreakpoints(breakpoints);

    if (get().isSessionActive) {
      const lines = breakpoints.get(file) || new Set();
      await window.electronAPI?.debugSetBreakpoints(file, Array.from(lines));
    }
  },

  toggleBreakpointEnabled: (file: string, line: number) => {
    // For now, just toggle removal/re-adding
    const breakpoints = get().breakpoints;
    const fileBPs = breakpoints.get(file);
    if (fileBPs?.has(line)) {
      get().removeBreakpoint(file, line);
    } else {
      get().setBreakpoint(file, line);
    }
  },

  isBreakpointEnabled: (file: string, line: number) => {
    const fileBPs = get().breakpoints.get(file);
    return fileBPs?.has(line) || false;
  },

  setExceptionBreakpoint: async (filter: string, enabled: boolean) => {
    const exceptionBreakpoints = new Map(get().exceptionBreakpoints);
    if (enabled) {
      exceptionBreakpoints.set(filter, true);
    } else {
      exceptionBreakpoints.delete(filter);
    }
    set({ exceptionBreakpoints });

    if (get().isSessionActive) {
      const filters = Array.from(exceptionBreakpoints.keys());
      await window.electronAPI?.debugSetExceptionBreakpoints(filters);
    }
  },

  toggleExceptionBreakpoint: async (filter: string) => {
    const enabled = !get().isExceptionBreakpointEnabled(filter);
    await get().setExceptionBreakpoint(filter, enabled);
  },

  isExceptionBreakpointEnabled: (filter: string) => {
    return get().exceptionBreakpoints.has(filter);
  },

  reloadBreakpoints: async () => {
    const root = await window.electronAPI?.getWorkspaceRoot();
    if (root) {
      set({ workspaceRoot: root });
    }
    const loaded = await loadBreakpoints();
    if (loaded.size > 0) {
      set({ breakpoints: loaded });
    }
  },
}));
