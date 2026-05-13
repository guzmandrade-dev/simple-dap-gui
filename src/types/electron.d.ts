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
}

export interface ElectronAPI {
  // File operations
  readFile: (path: string) => Promise<string>;
  fileExists: (path: string) => Promise<boolean>;
  getLaunchConfig: () => Promise<Record<string, unknown> | null>;
  getWorkspaceRoot: () => Promise<string>;
  setWorkspaceRoot: (root: string) => Promise<string>;
  pathResolve: (...paths: string[]) => Promise<string>;
  pathJoin: (...paths: string[]) => Promise<string>;
  
  // Folder operations
  openFolder: () => Promise<void>;
  onFolderOpened: (callback: (path: string) => void) => () => void;
  onWorkspaceChanged: (callback: (path: string) => void) => () => void;
  
  // Debug session operations
  debugStart: (config: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
  debugStop: () => Promise<{ success: boolean }>;
  debugContinue: () => Promise<{ success: boolean }>;
  debugStepOver: () => Promise<{ success: boolean }>;
  debugStepInto: () => Promise<{ success: boolean }>;
  debugStepOut: () => Promise<{ success: boolean }>;
  debugPause: () => Promise<{ success: boolean }>;
  debugSetBreakpoints: (filePath: string, lines: number[]) => Promise<{ success: boolean }>;
  debugIsActive: () => Promise<boolean>;
  
  // Debug event listeners
  onDapStopped: (callback: (event: unknown) => void) => () => void;
  onDapStackTrace: (callback: (body: unknown) => void) => () => void;
  onDapScopes: (callback: (body: unknown) => void) => () => void;
  onDapVariables: (callback: (data: unknown) => void) => () => void;
  onDapTerminated: (callback: () => void) => () => void;
  onDapExited: (callback: () => void) => () => void;
  
  // Adapter management
  getAdapterCatalog: () => Promise<AdapterInfo[]>;
  installAdapter: (adapterId: string) => Promise<AdapterInfo>;
  uninstallAdapter: (adapterId: string) => Promise<void>;
  getAdapterPath: (adapterId: string) => Promise<string | null>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};