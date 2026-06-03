import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  // File operations
  readFile: (path: string) => Promise<string>;
  fileExists: (path: string) => Promise<boolean>;
  readDirectory: (path: string) => Promise<Array<{ name: string; path: string; isDirectory: boolean }>>;
  writeFile: (path: string, content: string) => Promise<{ success: boolean; error?: string }>;
  createDirectory: (path: string) => Promise<{ success: boolean; error?: string }>;
  getLaunchConfig: () => Promise<Record<string, unknown> | null>;
  getWorkspaceRoot: () => Promise<string>;
  setWorkspaceRoot: (root: string) => Promise<string>;
  pathResolve: (...paths: string[]) => Promise<string>;
  pathJoin: (...paths: string[]) => Promise<string>;
  
  // Folder operations
  openFolder: () => Promise<void>;
  onFolderOpened: (callback: (path: string) => void) => () => void;
  onWorkspaceChanged: (callback: (path: string) => void) => () => void;

  // Settings
  getAppSettings: () => Promise<{ theme: 'dark' | 'light'; editorCommand: string; editorArgs: string }>;
  setAppSettings: (settings: Partial<{ theme: 'dark' | 'light'; editorCommand: string; editorArgs: string }>) => Promise<{ theme: 'dark' | 'light'; editorCommand: string; editorArgs: string }>;
  onSettingsChanged: (callback: (settings: { theme: 'dark' | 'light'; editorCommand: string; editorArgs: string }) => void) => () => void;

  // Window controls
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  execCommand: (command: string) => Promise<{ stdout: string; stderr: string }>;
  
  // Debug session
  debugStart: (config: Record<string, unknown>, initialBreakpoints?: [string, number[]][]) => Promise<{ success: boolean; error?: string }>;
  debugStop: () => Promise<{ success: boolean }>;
  debugContinue: () => Promise<{ success: boolean }>;
  debugStepOver: () => Promise<{ success: boolean }>;
  debugStepInto: () => Promise<{ success: boolean }>;
  debugStepOut: () => Promise<{ success: boolean }>;
  debugPause: () => Promise<{ success: boolean }>;
  debugSetBreakpoints: (filePath: string, lines: number[]) => Promise<{ success: boolean }>;
  debugFetchVariables: (variablesReference: number) => Promise<{ success: boolean; variables: unknown[] }>;
  debugEvaluate: (expression: string, frameId?: number) => Promise<{ success: boolean; result: unknown }>;
  debugIsActive: () => Promise<boolean>;
  
  // DAP Events
  onDapStopped: (callback: (event: unknown) => void) => () => void;
  onDapStackTrace: (callback: (body: unknown) => void) => () => void;
  onDapScopes: (callback: (body: unknown) => void) => () => void;
  onDapVariables: (callback: (data: unknown) => void) => () => void;
  onDapChildVariables: (callback: (data: unknown) => void) => () => void;
  onDapTerminated: (callback: () => void) => () => void;
  onDapExited: (callback: () => void) => () => void;
  
  // Adapter management
  getAdapterCatalog: () => Promise<AdapterInfo[]>;
  installAdapter: (adapterId: string) => Promise<AdapterInfo>;
  uninstallAdapter: (adapterId: string) => Promise<void>;
  getAdapterPath: (adapterId: string) => Promise<string | null>;
  installCustomAdapter: () => Promise<AdapterInfo>;
}

export interface AdapterInfo {
  id: string;
  name: string;
  description: string;
  publisher: string;
  version: string;
  downloadUrl: string;
  installed: boolean;
  installPath?: string;
  entryPoint?: string;
  supportedLanguages: string[];
  isCustom?: boolean;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  readFile: (path: string) => ipcRenderer.invoke('read-file', path),
  fileExists: (path: string) => ipcRenderer.invoke('file-exists', path),
  readDirectory: (path: string) => ipcRenderer.invoke('read-directory', path),
  writeFile: (path: string, content: string) => ipcRenderer.invoke('write-file', path, content),
  createDirectory: (path: string) => ipcRenderer.invoke('create-directory', path),
  getLaunchConfig: () => ipcRenderer.invoke('get-launch-config'),
  getWorkspaceRoot: () => ipcRenderer.invoke('get-workspace-root'),
  setWorkspaceRoot: (root: string) => ipcRenderer.invoke('set-workspace-root', root),
  pathResolve: (...paths: string[]) => ipcRenderer.invoke('path-resolve', ...paths),
  pathJoin: (...paths: string[]) => ipcRenderer.invoke('path-join', ...paths),
  
  // Folder operations
  openFolder: () => ipcRenderer.invoke('open-folder'),
  onFolderOpened: (callback: (path: string) => void) => {
    const handler = (_event: unknown, path: string) => callback(path);
    ipcRenderer.on('folder-opened', handler);
    return () => ipcRenderer.removeListener('folder-opened', handler);
  },
  onWorkspaceChanged: (callback: (path: string) => void) => {
    const handler = (_event: unknown, path: string) => callback(path);
    ipcRenderer.on('workspace-changed', handler);
    return () => ipcRenderer.removeListener('workspace-changed', handler);
  },

  // Settings
  getAppSettings: () => ipcRenderer.invoke('get-app-settings'),
  setAppSettings: (settings: Partial<{ theme: 'dark' | 'light'; editorCommand: string; editorArgs: string }>) =>
    ipcRenderer.invoke('set-app-settings', settings),
  onSettingsChanged: (callback: (settings: { theme: 'dark' | 'light'; editorCommand: string; editorArgs: string }) => void) => {
    const handler = (_event: unknown, settings: unknown) => callback(settings as { theme: 'dark' | 'light'; editorCommand: string; editorArgs: string });
    ipcRenderer.on('settings-changed', handler);
    return () => ipcRenderer.removeListener('settings-changed', handler);
  },

  // Window controls
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  execCommand: (command: string) => ipcRenderer.invoke('exec-command', command),
  
  // Debug session
  debugStart: (config: Record<string, unknown>, initialBreakpoints?: [string, number[]][]) => ipcRenderer.invoke('debug-start', config, initialBreakpoints),
  debugStop: () => ipcRenderer.invoke('debug-stop'),
  debugContinue: () => ipcRenderer.invoke('debug-continue'),
  debugStepOver: () => ipcRenderer.invoke('debug-step-over'),
  debugStepInto: () => ipcRenderer.invoke('debug-step-into'),
  debugStepOut: () => ipcRenderer.invoke('debug-step-out'),
  debugPause: () => ipcRenderer.invoke('debug-pause'),
  debugSetBreakpoints: (filePath: string, lines: number[]) => 
    ipcRenderer.invoke('debug-set-breakpoints', filePath, lines),
  debugFetchVariables: (variablesReference: number) =>
    ipcRenderer.invoke('debug-fetch-variables', variablesReference),
  debugEvaluate: (expression: string, frameId?: number) =>
    ipcRenderer.invoke('debug-evaluate', expression, frameId),
  debugIsActive: () => ipcRenderer.invoke('debug-is-active'),
  
  // DAP Events
  onDapStopped: (callback: (event: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data);
    ipcRenderer.on('dap-stopped', handler);
    return () => ipcRenderer.removeListener('dap-stopped', handler);
  },
  onDapStackTrace: (callback: (body: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data);
    ipcRenderer.on('dap-stack-trace', handler);
    return () => ipcRenderer.removeListener('dap-stack-trace', handler);
  },
  onDapScopes: (callback: (body: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data);
    ipcRenderer.on('dap-scopes', handler);
    return () => ipcRenderer.removeListener('dap-scopes', handler);
  },
  onDapVariables: (callback: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data);
    ipcRenderer.on('dap-variables', handler);
    return () => ipcRenderer.removeListener('dap-variables', handler);
  },
  onDapChildVariables: (callback: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data);
    ipcRenderer.on('dap-child-variables', handler);
    return () => ipcRenderer.removeListener('dap-child-variables', handler);
  },
  onDapTerminated: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('dap-terminated', handler);
    return () => ipcRenderer.removeListener('dap-terminated', handler);
  },
  onDapExited: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('dap-exited', handler);
    return () => ipcRenderer.removeListener('dap-exited', handler);
  },
  
  // Adapter management
  getAdapterCatalog: () => ipcRenderer.invoke('get-adapter-catalog'),
  installAdapter: (adapterId: string) => ipcRenderer.invoke('install-adapter', adapterId),
  uninstallAdapter: (adapterId: string) => ipcRenderer.invoke('uninstall-adapter', adapterId),
  getAdapterPath: (adapterId: string) => ipcRenderer.invoke('get-adapter-path', adapterId),
  installCustomAdapter: () => ipcRenderer.invoke('install-custom-adapter'),
});
