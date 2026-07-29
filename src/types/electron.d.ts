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

export interface ElectronAPI {
  // File operations
  readFile: (path: string) => Promise<string>;
  fileExists: (path: string) => Promise<boolean>;
  readDirectory: (path: string) => Promise<Array<{ name: string; path: string; isDirectory: boolean }>>;
  writeFile: (path: string, content: string) => Promise<{ success: boolean; error?: string }>;
  createDirectory: (path: string) => Promise<{ success: boolean; error?: string }>;
  getLaunchConfig: () => Promise<Record<string, unknown> | null>;
  getGlobalLaunchConfig: () => Promise<Record<string, unknown> | null>;
  getWorkspaceRoot: () => Promise<string>;
  setWorkspaceRoot: (root: string) => Promise<string>;
  pathResolve: (...paths: string[]) => Promise<string>;
  pathJoin: (...paths: string[]) => Promise<string>;

  // Search
  searchFiles: (query: string) => Promise<{ success: boolean; error?: string; results?: Array<{ path: string; score: number }> }>;
  searchContent: (query: string, options?: { caseSensitive?: boolean; regex?: boolean; globs?: string[] }) => Promise<{ success: boolean; error?: string; results?: Array<{ path: string; line: number; text: string }> }>;

  // Folder operations
  openFolder: () => Promise<void>;
  onFolderOpened: (callback: (path: string) => void) => () => void;
  onWorkspaceChanged: (callback: (path: string) => void) => () => void;

  // Menu-driven actions
  onOpenSearch: (callback: (mode: 'files' | 'content') => void) => () => void;
  onDebugAction: (callback: (action: string) => void) => () => void;

  // Settings
  getAppSettings: () => Promise<{ theme: 'dark' | 'light'; editorCommand: string; editorArgs: string; persistentBreakpoints: boolean; globalLaunchConfigJson: string }>;
  setAppSettings: (settings: Partial<{ theme: 'dark' | 'light'; editorCommand: string; editorArgs: string; persistentBreakpoints: boolean; globalLaunchConfigJson: string }>) => Promise<{ theme: 'dark' | 'light'; editorCommand: string; editorArgs: string; persistentBreakpoints: boolean; globalLaunchConfigJson: string }>;
  onSettingsChanged: (callback: (settings: { theme: 'dark' | 'light'; editorCommand: string; editorArgs: string; persistentBreakpoints: boolean; globalLaunchConfigJson: string }) => void) => () => void;
  getAppVersion: () => Promise<string>;

  // Window controls
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  execCommand: (command: string) => Promise<{ stdout: string; stderr: string }>;
  
  // Debug session operations
  debugStart: (config: Record<string, unknown>, initialBreakpoints?: [string, number[]][], initialExceptionFilters?: string[]) => Promise<{ success: boolean; error?: string }>;
  debugStop: () => Promise<{ success: boolean }>;
  debugDetach: () => Promise<{ success: boolean }>;
  debugContinue: () => Promise<{ success: boolean }>;
  debugStepOver: () => Promise<{ success: boolean }>;
  debugStepInto: () => Promise<{ success: boolean }>;
  debugStepOut: () => Promise<{ success: boolean }>;
  debugPause: () => Promise<{ success: boolean }>;
  debugSetBreakpoints: (filePath: string, lines: number[]) => Promise<{ success: boolean }>;
  debugSetExceptionBreakpoints: (filters: string[]) => Promise<{ success: boolean }>;
  debugFetchVariables: (variablesReference: number) => Promise<{ success: boolean; variables: unknown[] }>;
  debugEvaluate: (expression: string, frameId?: number) => Promise<{ success: boolean; result: unknown }>;
  debugIsActive: () => Promise<boolean>;
  
  // Debug event listeners
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

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
