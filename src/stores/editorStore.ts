import { create } from 'zustand';
import { isVirtualSourcePath } from '../utils/debugNavigation';

interface EditorState {
  currentFile: string | undefined;
  currentLine: number | undefined;
  openFiles: string[];
  fileContents: Map<string, string>;
  fileErrors: Map<string, string>;

  // Actions
  openFile: (path: string, line?: number) => Promise<void>;
  setVirtualContent: (path: string, content: string, line?: number) => void;
  closeFile: (path: string) => void;
  setCurrentFile: (path: string | undefined) => void;
  setCurrentLine: (line: number | undefined) => void;
  getFileContent: (path: string) => string | undefined;
  getFileError: (path: string) => string | undefined;
  isFileOpen: (path: string) => boolean;
  reloadFile: (path: string) => Promise<void>;
}

export const useEditorStore = create<EditorState>()((set, get) => ({
  // Initial state
  currentFile: undefined,
  currentLine: undefined,
  openFiles: [],
  fileContents: new Map(),
  fileErrors: new Map(),

  openFile: async (path: string, line?: number) => {
    const { openFiles, fileContents, fileErrors } = get();

    // Virtual paths (dap://...) are in-memory only — never read from disk.
    if (isVirtualSourcePath(path)) {
      const newOpenFiles = openFiles.includes(path) ? openFiles : [...openFiles, path];
      set({
        openFiles: newOpenFiles,
        currentFile: path,
        currentLine: line,
      });
      return;
    }

    // Always select the file, even if reading fails — the error is recorded
    // so the viewer can show a proper "unable to open" state instead of
    // silently keeping the previous file.
    const newOpenFiles = openFiles.includes(path) ? openFiles : [...openFiles, path];
    set({ openFiles: newOpenFiles, currentFile: path, currentLine: line });

    // Always reload content from disk so external edits are picked up
    try {
      if (window.electronAPI) {
        const content = await window.electronAPI.readFile(path);
        fileContents.set(path, content);
        fileErrors.delete(path);
        set({
          fileContents: new Map(fileContents),
          fileErrors: new Map(fileErrors),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Failed to open file:', path, err);
      fileContents.delete(path);
      fileErrors.set(path, message);
      set({
        fileContents: new Map(fileContents),
        fileErrors: new Map(fileErrors),
      });
    }
  },

  setVirtualContent: (path: string, content: string, line?: number) => {
    const { openFiles, fileContents, fileErrors } = get();
    fileContents.set(path, content);
    fileErrors.delete(path);
    const newOpenFiles = openFiles.includes(path) ? openFiles : [...openFiles, path];
    set({
      openFiles: newOpenFiles,
      currentFile: path,
      currentLine: line,
      fileContents: new Map(fileContents),
      fileErrors: new Map(fileErrors),
    });
  },

  reloadFile: async (path: string) => {
    if (isVirtualSourcePath(path)) return;
    const { fileContents, fileErrors } = get();

    try {
      if (window.electronAPI) {
        const content = await window.electronAPI.readFile(path);
        fileContents.set(path, content);
        fileErrors.delete(path);
        set({
          fileContents: new Map(fileContents),
          fileErrors: new Map(fileErrors),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Failed to reload file:', path, err);
      fileErrors.set(path, message);
      set({ fileErrors: new Map(fileErrors) });
    }
  },

  closeFile: (path: string) => {
    const { openFiles, fileContents, fileErrors, currentFile } = get();

    const newOpenFiles = openFiles.filter(f => f !== path);
    fileContents.delete(path);
    fileErrors.delete(path);

    // If closing current file, switch to another open file or clear
    let newCurrentFile = currentFile;
    if (currentFile === path) {
      newCurrentFile = newOpenFiles.length > 0 ? newOpenFiles[newOpenFiles.length - 1] : undefined;
    }

    set({
      openFiles: newOpenFiles,
      currentFile: newCurrentFile,
      fileContents: new Map(fileContents),
      fileErrors: new Map(fileErrors),
    });
  },

  setCurrentFile: (path: string | undefined) => {
    set({ currentFile: path });
  },

  setCurrentLine: (line: number | undefined) => {
    set({ currentLine: line });
  },

  getFileContent: (path: string) => {
    return get().fileContents.get(path);
  },

  getFileError: (path: string) => {
    return get().fileErrors.get(path);
  },

  isFileOpen: (path: string) => {
    return get().openFiles.includes(path);
  },
}));
