import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDebugStore } from './debugStore';
import { useEditorStore } from './editorStore';
import { MAX_OUTPUT_LINES } from '../utils/debugNavigation';

function mockElectronAPI(overrides: Record<string, unknown> = {}) {
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    getWorkspaceRoot: vi.fn(async () => '/workspace'),
    getAppSettings: vi.fn(async () => ({ persistentBreakpoints: false })),
    pathResolve: vi.fn(async (...parts: string[]) => parts.join('/')),
    pathJoin: vi.fn(async (...parts: string[]) => parts.join('/')),
    fileExists: vi.fn(async () => true),
    readFile: vi.fn(async (p: string) => `content of ${p}`),
    debugStop: vi.fn(async () => ({ success: true })),
    debugDetach: vi.fn(async () => ({ success: true })),
    debugFetchSource: vi.fn(async () => ({ success: true, content: '<?php echo 1;' })),
    debugEvaluate: vi.fn(async () => ({ success: true, result: { result: '1', variablesReference: 0 } })),
    onDapStopped: vi.fn(() => () => {}),
    onDapStackTrace: vi.fn(() => () => {}),
    onDapScopes: vi.fn(() => () => {}),
    onDapVariables: vi.fn(() => () => {}),
    onDapChildVariables: vi.fn(() => () => {}),
    onDapOutput: vi.fn(() => () => {}),
    onDapTerminated: vi.fn(() => () => {}),
    onDapExited: vi.fn(() => () => {}),
    ...overrides,
  };
}

function resetStores() {
  useDebugStore.setState({
    isSessionActive: true,
    isPaused: false,
    stopReason: undefined,
    stopDescription: undefined,
    threads: [],
    stackFrames: [],
    scopes: [],
    variables: new Map(),
    output: [],
    currentThreadId: undefined,
    currentFrameId: undefined,
    currentFile: undefined,
    currentLine: undefined,
    currentSourceUnavailable: null,
    breakpoints: new Map(),
    breakpointVerified: new Map(),
    exceptionBreakpoints: new Map(),
    workspaceRoot: '/workspace',
    recentConfigs: [],
    watches: [],
  });
  useEditorStore.setState({
    currentFile: undefined,
    currentLine: undefined,
    openFiles: [],
    fileContents: new Map(),
    fileErrors: new Map(),
  });
}

describe('debugStore stop navigation', () => {
  beforeEach(() => {
    resetStores();
    mockElectronAPI();
  });

  it('onStopped records the reason and pauses', () => {
    useDebugStore.getState().onStopped({ reason: 'exception', threadId: 4, text: 'Uncaught Error' });
    const state = useDebugStore.getState();
    expect(state.isPaused).toBe(true);
    expect(state.currentThreadId).toBe(4);
    expect(state.stopReason).toBe('exception');
    expect(state.stopDescription).toBe('Uncaught Error');
  });

  it('opens a local file when the stopped frame exists on disk', async () => {
    await useDebugStore.getState().onStackTrace({
      stackFrames: [{ id: 1, name: 'main', line: 10, column: 1, source: { path: '/workspace/index.php' } }],
      totalFrames: 1,
    });
    const state = useDebugStore.getState();
    expect(state.currentFile).toBe('/workspace/index.php');
    expect(state.currentLine).toBe(10);
    expect(state.currentFrameId).toBe(1);
    expect(state.currentSourceUnavailable).toBeNull();
    expect(useEditorStore.getState().currentFile).toBe('/workspace/index.php');
    expect(useEditorStore.getState().getFileContent('/workspace/index.php')).toBe('content of /workspace/index.php');
  });

  it('falls back to adapter source when the stopped file is not on disk (out-of-project stop)', async () => {
    mockElectronAPI({
      fileExists: vi.fn(async () => false),
      debugFetchSource: vi.fn(async () => ({ success: true, content: '<?php vendor code();' })),
    });
    useDebugStore.getState().onStopped({ reason: 'breakpoint', threadId: 1 });
    await useDebugStore.getState().onStackTrace({
      stackFrames: [{
        id: 2,
        name: 'vendor',
        line: 42,
        column: 1,
        source: { path: '/var/www/html/vendor/lib.php', name: 'lib.php', sourceReference: 99 },
      }],
      totalFrames: 1,
    });
    const state = useDebugStore.getState();
    // Session must stay alive and paused
    expect(state.isPaused).toBe(true);
    // Source content pulled from the adapter and shown as a virtual file
    expect(state.currentFile).toBe('dap://source/99/lib.php');
    expect(state.currentSourceUnavailable).toBeNull();
    expect(useEditorStore.getState().getFileContent('dap://source/99/lib.php')).toBe('<?php vendor code();');
    expect(window.electronAPI.debugFetchSource).toHaveBeenCalledWith(99);
  });

  it('keeps the session usable and flags the source when neither disk nor adapter can provide it', async () => {
    mockElectronAPI({
      fileExists: vi.fn(async () => false),
      debugFetchSource: vi.fn(async () => ({ success: false, error: 'unknown sourceReference' })),
    });
    useDebugStore.getState().onStopped({ reason: 'breakpoint', threadId: 1 });
    await useDebugStore.getState().onStackTrace({
      stackFrames: [{
        id: 5,
        name: 'external',
        line: 7,
        column: 1,
        source: { path: '/elsewhere/file.php', sourceReference: 123 },
      }],
      totalFrames: 1,
    });
    const state = useDebugStore.getState();
    expect(state.isPaused).toBe(true);
    expect(state.isSessionActive).toBe(true);
    expect(state.currentFile).toBeUndefined();
    expect(state.currentSourceUnavailable).toMatchObject({
      path: '/elsewhere/file.php',
      sourceReference: 123,
      error: 'unknown sourceReference',
    });
  });

  it('handles frames with no source at all', async () => {
    await useDebugStore.getState().onStackTrace({
      stackFrames: [{ id: 9, name: 'native', line: 0, column: 0 }],
      totalFrames: 1,
    });
    const state = useDebugStore.getState();
    expect(state.currentSourceUnavailable).toMatchObject({ name: undefined, path: undefined });
    expect(state.currentFrameId).toBe(9);
  });

  it('selectFrame navigates using the same logic', async () => {
    useDebugStore.setState({
      stackFrames: [
        { id: 1, name: 'a', line: 1, column: 1, source: { path: '/workspace/a.php' } },
        { id: 2, name: 'b', line: 2, column: 1, source: { path: '/workspace/b.php' } },
      ],
    });
    useDebugStore.getState().selectFrame(2);
    await new Promise((r) => setTimeout(r, 10));
    expect(useDebugStore.getState().currentFile).toBe('/workspace/b.php');
    expect(useDebugStore.getState().currentFrameId).toBe(2);
  });

  it('stopSession resets session state but keeps console output', async () => {
    useDebugStore.getState().onOutput({ category: 'stdout', output: 'hello\n' });
    useDebugStore.getState().onStopped({ reason: 'breakpoint', threadId: 1 });
    await useDebugStore.getState().stopSession();
    const state = useDebugStore.getState();
    expect(state.isSessionActive).toBe(false);
    expect(state.isPaused).toBe(false);
    expect(state.stopReason).toBeUndefined();
    expect(state.currentSourceUnavailable).toBeNull();
    expect(state.output.length).toBe(1);
    expect(window.electronAPI.debugStop).toHaveBeenCalled();
  });

  it('continue clears the stop reason', async () => {
    mockElectronAPI({ debugContinue: vi.fn(async () => ({ success: true })) });
    useDebugStore.getState().onStopped({ reason: 'step', threadId: 1 });
    await useDebugStore.getState().continue();
    const state = useDebugStore.getState();
    expect(state.isPaused).toBe(false);
    expect(state.stopReason).toBeUndefined();
  });
});

describe('debugStore output', () => {
  beforeEach(() => {
    resetStores();
    mockElectronAPI();
  });

  it('appends output entries with their category', () => {
    useDebugStore.getState().onOutput({ category: 'stderr', output: 'error!' });
    useDebugStore.getState().onOutput({ category: 'stdout', output: 'ok' });
    expect(useDebugStore.getState().output).toEqual([
      { text: 'error!', category: 'stderr' },
      { text: 'ok', category: 'stdout' },
    ]);
  });

  it('ignores malformed output events', () => {
    useDebugStore.getState().onOutput({} as never);
    expect(useDebugStore.getState().output).toEqual([]);
  });

  it('caps the output buffer at MAX_OUTPUT_LINES', () => {
    for (let i = 0; i < MAX_OUTPUT_LINES + 50; i++) {
      useDebugStore.getState().onOutput({ category: 'stdout', output: `line ${i}` });
    }
    const output = useDebugStore.getState().output;
    expect(output.length).toBe(MAX_OUTPUT_LINES);
    expect(output[0].text).toBe('line 50');
    expect(output[output.length - 1].text).toBe(`line ${MAX_OUTPUT_LINES + 49}`);
  });

  it('clearOutput empties the console', () => {
    useDebugStore.getState().onOutput({ category: 'stdout', output: 'x' });
    useDebugStore.getState().clearOutput();
    expect(useDebugStore.getState().output).toEqual([]);
  });
});
