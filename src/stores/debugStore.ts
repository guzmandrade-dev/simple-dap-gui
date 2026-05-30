import { create } from 'zustand';
import { DebugProtocol } from '@vscode/debugprotocol';
import { LaunchConfiguration } from '../dap/types';

interface DebugState {
  // Session state
  isSessionActive: boolean;
  isPaused: boolean;

  // Data from DAP
  threads: DebugProtocol.Thread[];
  stackFrames: DebugProtocol.StackFrame[];
  scopes: DebugProtocol.Scope[];
  variables: Map<number, DebugProtocol.Variable[]>;

  // Current position
  currentThreadId: number | undefined;
  currentFrameId: number | undefined;
  currentFile: string | undefined;
  currentLine: number | undefined;

  // Breakpoints
  breakpoints: Map<string, Set<number>>;
  breakpointVerified: Map<string, Map<number, boolean>>;

  // Workspace
  workspaceRoot: string;
  recentConfigs: LaunchConfiguration[];

  // Actions
  initialize: () => Promise<void>;
  startSession: (config: LaunchConfiguration) => Promise<void>;
  stopSession: () => Promise<void>;
  continue: () => Promise<void>;
  stepOver: () => Promise<void>;
  stepInto: () => Promise<void>;
  stepOut: () => Promise<void>;
  pause: () => Promise<void>;
  selectFrame: (frameId: number) => void;

  // Event handlers
  onStopped: (body: DebugProtocol.StoppedEvent['body']) => void;
  onStackTrace: (body: DebugProtocol.StackTraceResponse['body']) => void;
  onScopes: (body: DebugProtocol.ScopesResponse['body']) => void;
  onVariables: (data: { frameId: number; scopeId: number; variables: DebugProtocol.Variable[] }) => void;

  // Breakpoint management
  setBreakpoint: (file: string, line: number) => Promise<void>;
  removeBreakpoint: (file: string, line: number) => Promise<void>;
  toggleBreakpointEnabled: (file: string, line: number) => void;
  isBreakpointEnabled: (file: string, line: number) => boolean;
}

export const useDebugStore = create<DebugState>()((set, get) => ({
  // Initial state
  isSessionActive: false,
  isPaused: false,
  threads: [],
  stackFrames: [],
  scopes: [],
  variables: new Map(),
  currentThreadId: undefined,
  currentFrameId: undefined,
  currentFile: undefined,
  currentLine: undefined,
  breakpoints: new Map(),
  breakpointVerified: new Map(),
  workspaceRoot: '',
  recentConfigs: [],

  initialize: async () => {
    // Get workspace root from Electron
    if (window.electronAPI) {
      const root = await window.electronAPI.getWorkspaceRoot();
      set({ workspaceRoot: root });
      
      // Setup DAP event listeners
      window.electronAPI.onDapStopped((event) => {
        get().onStopped(event as DebugProtocol.StoppedEvent['body']);
      });
    
      window.electronAPI.onDapStackTrace((body) => {
        get().onStackTrace(body as DebugProtocol.StackTraceResponse['body']);
      });
    
      window.electronAPI.onDapScopes((body) => {
        get().onScopes(body as DebugProtocol.ScopesResponse['body']);
      });
    
      window.electronAPI.onDapVariables((data) => {
        get().onVariables(data as { frameId: number; scopeId: number; variables: DebugProtocol.Variable[] });
      });
      
      window.electronAPI.onDapTerminated(() => {
        get().stopSession();
      });
      
      window.electronAPI.onDapExited(() => {
        get().stopSession();
      });
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

      const result = await window.electronAPI?.debugStart(config as unknown as Record<string, unknown>, initialBreakpoints);
      
      if (result?.success) {
        set({ 
          isSessionActive: true,
          isPaused: false,
          threads: [],
          stackFrames: [],
          scopes: [],
          variables: new Map(),
          currentThreadId: undefined,
          currentFrameId: undefined,
          currentFile: undefined,
          currentLine: undefined,
        });

        // Add to recent configs
        const recent = get().recentConfigs.filter(c => c.name !== config.name);
        recent.unshift(config);
        set({ recentConfigs: recent.slice(0, 5) });
      } else {
        console.error('Failed to start session:', result?.error);
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
    });
  },

  onStackTrace: (body) => {
    set({ stackFrames: body.stackFrames });

    // Update current location from top frame
    if (body.stackFrames.length > 0) {
      const topFrame = body.stackFrames[0];
      
      // Convert server path to local path via IPC
      window.electronAPI.pathResolve(topFrame.source?.path || '').then(localPath => {
        set({
          currentFile: localPath,
          currentLine: topFrame.line,
          currentFrameId: topFrame.id,
        });
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

  stopSession: async () => {
    await window.electronAPI?.debugStop();
    set({
      isSessionActive: false,
      isPaused: false,
      threads: [],
      stackFrames: [],
      scopes: [],
      variables: new Map(),
      currentThreadId: undefined,
      currentFrameId: undefined,
      currentFile: undefined,
      currentLine: undefined,
    });
  },

  continue: async () => {
    await window.electronAPI?.debugContinue();
    set({ isPaused: false });
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
    set({ currentFrameId: frameId });
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
}));
