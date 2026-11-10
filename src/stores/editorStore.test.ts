import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEditorStore } from './editorStore';

function mockElectronAPI(overrides: Record<string, unknown> = {}) {
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    readFile: vi.fn(async (p: string) => `content of ${p}`),
    fileExists: vi.fn(async () => true),
    ...overrides,
  };
}

function resetStore() {
  useEditorStore.setState({
    currentFile: undefined,
    currentLine: undefined,
    openFiles: [],
    fileContents: new Map(),
    fileErrors: new Map(),
  });
}

describe('editorStore', () => {
  beforeEach(() => {
    resetStore();
    mockElectronAPI();
  });

  it('openFile loads content and selects the file', async () => {
    await useEditorStore.getState().openFile('/workspace/index.php', 12);
    const state = useEditorStore.getState();
    expect(state.currentFile).toBe('/workspace/index.php');
    expect(state.currentLine).toBe(12);
    expect(state.openFiles).toContain('/workspace/index.php');
    expect(state.getFileContent('/workspace/index.php')).toBe('content of /workspace/index.php');
    expect(state.getFileError('/workspace/index.php')).toBeUndefined();
  });

  it('openFile records an error but still selects the file when reading fails', async () => {
    mockElectronAPI({
      readFile: vi.fn(async () => { throw new Error('ENOENT: no such file'); }),
    });
    await useEditorStore.getState().openFile('/remote/missing.php');
    const state = useEditorStore.getState();
    expect(state.currentFile).toBe('/remote/missing.php');
    expect(state.getFileContent('/remote/missing.php')).toBeUndefined();
    expect(state.getFileError('/remote/missing.php')).toContain('ENOENT');
  });

  it('openFile works without the electron API (no crash)', async () => {
    (window as unknown as { electronAPI: unknown }).electronAPI = undefined;
    await useEditorStore.getState().openFile('/any/file.php');
    expect(useEditorStore.getState().currentFile).toBe('/any/file.php');
  });

  it('setVirtualContent stores adapter-provided source without disk access', () => {
    const readFile = vi.fn();
    mockElectronAPI({ readFile });
    useEditorStore.getState().setVirtualContent('dap://source/7/index.php', '<?php echo 1;', 3);
    const state = useEditorStore.getState();
    expect(state.currentFile).toBe('dap://source/7/index.php');
    expect(state.currentLine).toBe(3);
    expect(state.getFileContent('dap://source/7/index.php')).toBe('<?php echo 1;');
    expect(readFile).not.toHaveBeenCalled();
  });

  it('openFile on a virtual path never touches disk', async () => {
    const readFile = vi.fn();
    mockElectronAPI({ readFile });
    useEditorStore.getState().setVirtualContent('dap://source/7/index.php', 'abc');
    await useEditorStore.getState().openFile('dap://source/7/index.php', 9);
    expect(readFile).not.toHaveBeenCalled();
    expect(useEditorStore.getState().currentLine).toBe(9);
  });

  it('closeFile switches to another open file', async () => {
    await useEditorStore.getState().openFile('/a.php');
    await useEditorStore.getState().openFile('/b.php');
    useEditorStore.getState().closeFile('/b.php');
    const state = useEditorStore.getState();
    expect(state.currentFile).toBe('/a.php');
    expect(state.openFiles).toEqual(['/a.php']);
    expect(state.getFileContent('/b.php')).toBeUndefined();
  });

  it('reloadFile refreshes content and clears errors', async () => {
    const readFile = vi.fn()
      .mockRejectedValueOnce(new Error('bad'))
      .mockResolvedValueOnce('fresh content');
    mockElectronAPI({ readFile });
    await useEditorStore.getState().openFile('/a.php');
    expect(useEditorStore.getState().getFileError('/a.php')).toBeTruthy();
    await useEditorStore.getState().reloadFile('/a.php');
    expect(useEditorStore.getState().getFileContent('/a.php')).toBe('fresh content');
    expect(useEditorStore.getState().getFileError('/a.php')).toBeUndefined();
  });

  it('reloadFile is a no-op for virtual sources', async () => {
    const readFile = vi.fn();
    mockElectronAPI({ readFile });
    useEditorStore.getState().setVirtualContent('dap://source/1/x.php', 'abc');
    await useEditorStore.getState().reloadFile('dap://source/1/x.php');
    expect(readFile).not.toHaveBeenCalled();
    expect(useEditorStore.getState().getFileContent('dap://source/1/x.php')).toBe('abc');
  });
});
