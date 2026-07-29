import { create } from 'zustand';

interface EditorState {
  currentFile: string | undefined;
  currentLine: number | undefined;
  openFiles: string[];
  fileContents: Map<string, string>;
  
  // Actions
  openFile: (path: string, line?: number) => Promise<void>;
  closeFile: (path: string) => void;
  setCurrentFile: (path: string | undefined) => void;
  setCurrentLine: (line: number | undefined) => void;
  getFileContent: (path: string) => string | undefined;
  isFileOpen: (path: string) => boolean;
  reloadFile: (path: string) => Promise<void>;
}

export const useEditorStore = create<EditorState>()((set, get) => ({
  // Initial state
  currentFile: undefined,
  currentLine: undefined,
  openFiles: [],
  fileContents: new Map(),

  openFile: async (path: string, line?: number) => {
    const { openFiles, fileContents } = get();

    // Always reload content from disk so external edits are picked up
    try {
      if (window.electronAPI) {
        const content = await window.electronAPI.readFile(path);
        fileContents.set(path, content);

        // Add to openFiles only if not already there
        const newOpenFiles = openFiles.includes(path) ? openFiles : [...openFiles, path];

        set({
          openFiles: newOpenFiles,
          currentFile: path,
          currentLine: line,
          fileContents: new Map(fileContents),
        });
      }
    } catch (err) {
      console.error('Failed to open file:', path, err);
    }
  },

  reloadFile: async (path: string) => {
    const { fileContents } = get();
    
    try {
      if (window.electronAPI) {
        const content = await window.electronAPI.readFile(path);
        fileContents.set(path, content);
        set({
          fileContents: new Map(fileContents),
        });
      }
    } catch (err) {
      console.error('Failed to reload file:', path, err);
    }
  },

  closeFile: (path: string) => {
    const { openFiles, fileContents, currentFile } = get();
    
    const newOpenFiles = openFiles.filter(f => f !== path);
    fileContents.delete(path);
    
    // If closing current file, switch to another open file or clear
    let newCurrentFile = currentFile;
    if (currentFile === path) {
      newCurrentFile = newOpenFiles.length > 0 ? newOpenFiles[newOpenFiles.length - 1] : undefined;
    }

    set({
      openFiles: newOpenFiles,
      currentFile: newCurrentFile,
      fileContents: new Map(fileContents),
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

  isFileOpen: (path: string) => {
    return get().openFiles.includes(path);
  },
}));
