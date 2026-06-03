import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { watch as fsWatch, FSWatcher } from 'fs';
import { ADAPTER_CATALOG, AdapterInfo, InstalledAdapterManifest } from '../src/utils/adapterManager';
import { DebugSession } from '../src/dap/session';
import { LaunchConfiguration } from '../src/dap/types';
import { DebugProtocol } from '@vscode/debugprotocol';

// Store reference to main window
let mainWindow: BrowserWindow | null = null;
let currentProjectPath: string | null = null;

// Adapters storage directory
const getAdaptersDir = () => path.join(app.getPath('userData'), 'adapters');

const MANIFEST_FILENAME = 'adapters-manifest.json';
const getManifestPath = () => path.join(getAdaptersDir(), MANIFEST_FILENAME);

async function loadInstalledManifest(): Promise<InstalledAdapterManifest[]> {
  try {
    const content = await fs.readFile(getManifestPath(), 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

async function saveInstalledManifest(manifest: InstalledAdapterManifest[]): Promise<void> {
  const adaptersDir = getAdaptersDir();
  await fs.mkdir(adaptersDir, { recursive: true });
  await fs.writeFile(getManifestPath(), JSON.stringify(manifest, null, 2), 'utf-8');
}

// App Settings
export interface AppSettings {
  theme: 'dark' | 'light';
  editorCommand: string;
  editorArgs: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  editorCommand: 'code',
  editorArgs: '{file}',
};

const SETTINGS_FILENAME = 'settings.json';
const getSettingsPath = () => path.join(app.getPath('userData'), SETTINGS_FILENAME);

async function loadSettings(): Promise<AppSettings> {
  try {
    const content = await fs.readFile(getSettingsPath(), 'utf-8');
    const parsed = JSON.parse(content) as Partial<AppSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

async function saveSettings(settings: AppSettings): Promise<void> {
  const settingsPath = getSettingsPath();
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

let currentSettings: AppSettings = { ...DEFAULT_SETTINGS };
let settingsWatcher: FSWatcher | null = null;

async function initSettings(): Promise<void> {
  currentSettings = await loadSettings();

  const settingsPath = getSettingsPath();
  try {
    await fs.access(settingsPath);
  } catch {
    await saveSettings(currentSettings);
  }

  settingsWatcher = fsWatch(settingsPath, async (eventType: string) => {
    if (eventType === 'change') {
      try {
        const updated = await loadSettings();
        currentSettings = updated;
        mainWindow?.webContents.send('settings-changed', updated);
      } catch (err) {
        console.error('Failed to reload settings after file change:', err);
      }
    }
  });
}

app.on('quit', () => {
  settingsWatcher?.close();
});

// Debug Session Manager - runs in main process only
class DebugSessionManager {
  private session: DebugSession | null = null;

  async start(config: LaunchConfiguration, initialBreakpoints?: Map<string, number[]>): Promise<void> {
    this.session = new DebugSession(config);
    
    // Queue any breakpoints that were set before the session started
    if (initialBreakpoints) {
      for (const [filePath, lines] of initialBreakpoints) {
        this.session.setBreakpoints(filePath, lines);
      }
    }

    // Get adapter path
    const adapterPath = await this.getAdapterPath(config.type);
    if (!adapterPath) {
      throw new Error(`Adapter not found for type: ${config.type}`);
    }

    // Setup event forwarding to renderer
    this.setupEventHandlers();

    // Start the session
    await this.session.start(adapterPath);
  }

  async stop(): Promise<void> {
    if (this.session) {
      await this.session.disconnect();
      this.session = null;
    }
  }

  async continue(): Promise<void> {
    await this.session?.continue();
  }

  async stepOver(): Promise<void> {
    await this.session?.stepOver();
  }

  async stepInto(): Promise<void> {
    await this.session?.stepInto();
  }

  async stepOut(): Promise<void> {
    await this.session?.stepOut();
  }

  async pause(): Promise<void> {
    await this.session?.pause();
  }

  async setBreakpoints(filePath: string, lines: number[]): Promise<void> {
    await this.session?.setBreakpoints(filePath, lines);
  }

  async fetchVariables(variablesReference: number): Promise<DebugProtocol.Variable[]> {
    if (!this.session) return [];
    const response = await this.session.client.sendRequest('variables', {
      variablesReference,
    }) as DebugProtocol.VariablesResponse;
    return response.body.variables;
  }

  async evaluate(expression: string, frameId?: number): Promise<DebugProtocol.EvaluateResponse['body'] | null> {
    if (!this.session) return null;
    return this.session.evaluate(expression, frameId);
  }

  isActive(): boolean {
    return this.session !== null;
  }

  private async getAdapterPath(type: string): Promise<string | null> {
    const adaptersDir = getAdaptersDir();

    // First, check catalog adapters
    const catalogAdapter = ADAPTER_CATALOG.find(a =>
      a.id === `felixfbecker.${type}-debug` || a.supportedLanguages.includes(type)
    );
    if (catalogAdapter?.entryPoint) {
      const adapterPath = path.join(adaptersDir, catalogAdapter.id, catalogAdapter.entryPoint);
      try {
        await fs.access(adapterPath);
        return adapterPath;
      } catch {
        // not installed, continue to check custom
      }
    }

    // Then, check custom installed adapters that support this language
    const manifest = await loadInstalledManifest();
    const customAdapter = manifest.find(a => a.supportedLanguages.includes(type));
    if (customAdapter) {
      const adapterPath = path.join(customAdapter.installPath, customAdapter.entryPoint);
      try {
        await fs.access(adapterPath);
        return adapterPath;
      } catch {
        return null;
      }
    }

    return null;
  }

  private setupEventHandlers(): void {
    if (!this.session) return;

    // Forward events to renderer
    this.session.client.on('stopped', (event: DebugProtocol.StoppedEvent['body']) => {
      mainWindow?.webContents.send('dap-stopped', event);
    });

    this.session.client.on('stackTrace', (body: DebugProtocol.StackTraceResponse['body']) => {
      mainWindow?.webContents.send('dap-stack-trace', body);
    });

    this.session.client.on('scopes', (body: DebugProtocol.ScopesResponse['body']) => {
      mainWindow?.webContents.send('dap-scopes', body);
    });

    this.session.client.on('variables', (data: { frameId: number; scopeId: number; variables: DebugProtocol.Variable[] }) => {
      mainWindow?.webContents.send('dap-variables', data);
    });

    this.session.client.on('childVariables', (data: { variablesReference: number; variables: DebugProtocol.Variable[] }) => {
      mainWindow?.webContents.send('dap-child-variables', data);
    });

    this.session.client.on('terminated', () => {
      mainWindow?.webContents.send('dap-terminated');
      this.session = null;
    });

    this.session.client.on('exited', () => {
      mainWindow?.webContents.send('dap-exited');
      this.session = null;
    });
  }
}

const debugManager = new DebugSessionManager();

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    show: false,
  });

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load from the dist folder
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    console.log('Loading from:', indexPath);
    mainWindow.loadFile(indexPath);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// Open folder dialog
async function openFolder() {
  if (!mainWindow) return;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Open Project Folder',
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const folderPath = result.filePaths[0];
    currentProjectPath = folderPath;

    // Notify renderer process
    mainWindow.webContents.send('folder-opened', folderPath);

    console.log('Opened folder:', folderPath);
  }
}

// App event handlers
app.whenReady().then(async () => {
  await initSettings();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Helper to download file with progress
async function downloadFile(
  url: string,
  dest: string,
  onProgress?: (downloaded: number, total: number) => void
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }

  const total = parseInt(response.headers.get('content-length') || '0');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const chunks: Buffer[] = [];
  let downloaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(Buffer.from(value));
    downloaded += value.length;
    onProgress?.(downloaded, total);
  }

  const buffer = Buffer.concat(chunks);
  await fs.writeFile(dest, buffer);
}

// Helper to extract .vsix file
async function extractVsix(vsixPath: string, destPath: string): Promise<void> {
  await fs.mkdir(destPath, { recursive: true });

  const AdmZip = (await import('adm-zip')).default;
  const zip = new AdmZip(vsixPath);
  zip.extractAllTo(destPath, true);
}

// Parse .vsix package.json metadata without extracting to disk
async function parseVsixPackageJson(vsixPath: string): Promise<Record<string, unknown> | null> {
  try {
    const { default: AdmZip } = await import('adm-zip');
    const zip = new AdmZip(vsixPath);
    const entry = zip.getEntry('extension/package.json');
    if (!entry) return null;
    const content = entry.getData().toString('utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// Infer adapter metadata from .vsix package.json
function inferAdapterFromPackageJson(pkg: Record<string, unknown>): {
  id: string;
  name: string;
  description: string;
  publisher: string;
  version: string;
  entryPoint: string;
  supportedLanguages: string[];
} | null {
  const id = `${pkg.publisher}.${pkg.name}`;
  if (!id || !pkg.name) return null;

  // VS Code debug adapters declare their entry point in contributes.debuggers
  const contributes = pkg.contributes as Record<string, unknown> | undefined;
  const debuggers = contributes?.debuggers as Array<Record<string, unknown>> | undefined;
  if (!debuggers || debuggers.length === 0) return null;

  const dbg = debuggers[0];
  const program = dbg.program as string | undefined;

  // Determine entry point. Some adapters ship a Node program, others a runtime + program combo
  let entryPoint = '';
  if (program) {
    entryPoint = `extension/${program}`;
  } else if (pkg.main) {
    // fallback to extension main
    entryPoint = `extension/${pkg.main}`;
  } else {
    return null;
  }

  const languages: string[] = [];
  if (Array.isArray(dbg.languages)) {
    for (const lang of dbg.languages) {
      if (typeof lang === 'string') languages.push(lang);
    }
  }
  // fallback: if no languages declared, try to infer from name
  if (languages.length === 0) {
    const nameLower = String(pkg.name).toLowerCase();
    if (nameLower.includes('php')) languages.push('php');
    else if (nameLower.includes('python')) languages.push('python');
    else if (nameLower.includes('node') || nameLower.includes('js')) languages.push('javascript');
    else if (nameLower.includes('go')) languages.push('go');
    else if (nameLower.includes('rust')) languages.push('rust');
    else if (nameLower.includes('cpp') || nameLower.includes('c++') || nameLower.includes('lldb')) languages.push('cpp', 'c');
    else languages.push('unknown');
  }

  return {
    id,
    name: String(pkg.displayName || pkg.name),
    description: String(pkg.description || ''),
    publisher: String(pkg.publisher || 'unknown'),
    version: String(pkg.version || '0.0.0'),
    entryPoint,
    supportedLanguages: languages,
  };
}

// IPC handlers
ipcMain.handle('read-file', async (_event, filePath: string) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (err) {
    throw new Error(`Failed to read ${filePath}: ${err}`);
  }
});

ipcMain.handle('file-exists', async (_event, filePath: string) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('open-folder', async () => {
  await openFolder();
});

// Window control handlers
ipcMain.handle('window-minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window-close', () => {
  mainWindow?.close();
});

// Execute command
ipcMain.handle('exec-command', async (_event, command: string) => {
  const { exec } = await import('child_process');
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error.message);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
});

ipcMain.handle('get-launch-config', async () => {
  try {
    const configPath = path.join(currentProjectPath || process.cwd(), '.vscode', 'launch.json');
    const content = await fs.readFile(configPath, 'utf-8');

    // Remove comments from JSON (VS Code allows comments in launch.json)
    const cleanedContent = content
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');

    return JSON.parse(cleanedContent);
  } catch {
    return null;
  }
});

ipcMain.handle('get-workspace-root', () => {
  return currentProjectPath || process.cwd();
});

ipcMain.handle('set-workspace-root', (_event, root: string) => {
  currentProjectPath = root;
  // Notify renderer that workspace changed
  mainWindow?.webContents.send('workspace-changed', root);
  return root;
});

ipcMain.handle('get-app-settings', async () => {
  return currentSettings;
});

ipcMain.handle('set-app-settings', async (_event, settings: Partial<AppSettings>) => {
  currentSettings = { ...currentSettings, ...settings };
  await saveSettings(currentSettings);
  mainWindow?.webContents.send('settings-changed', currentSettings);
  return currentSettings;
});

ipcMain.handle('path-resolve', (_event, ...paths: string[]) => {
  return path.resolve(...paths);
});

ipcMain.handle('path-join', (_event, ...paths: string[]) => {
  return path.join(...paths);
});

// Read directory contents
ipcMain.handle('read-directory', async (_event, dirPath: string) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const nodes = entries.map(entry => ({
      name: entry.name,
      path: path.join(dirPath, entry.name),
      isDirectory: entry.isDirectory(),
    }));
    
    // Sort: directories first, then files, both alphabetically
    nodes.sort((a, b) => {
      if (a.isDirectory === b.isDirectory) {
        return a.name.localeCompare(b.name);
      }
      return a.isDirectory ? -1 : 1;
    });
    
    return nodes;
  } catch (err) {
    console.error('Failed to read directory:', err);
    return [];
  }
});

// Create directory
ipcMain.handle('create-directory', async (_event, dirPath: string) => {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    return { success: true };
  } catch (err) {
    console.error('Failed to create directory:', err);
    return { success: false, error: String(err) };
  }
});

// Write file
ipcMain.handle('write-file', async (_event, filePath: string, content: string) => {
  try {
    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    console.error('Failed to write file:', err);
    return { success: false, error: String(err) };
  }
});

// Debug Session IPC Handlers

ipcMain.handle('debug-start', async (_event, config: LaunchConfiguration, initialBreakpoints?: [string, number[]][]) => {
  try {
    const breakpoints = initialBreakpoints ? new Map(initialBreakpoints) : undefined;
    await debugManager.start(config, breakpoints);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('debug-stop', async () => {
  await debugManager.stop();
  return { success: true };
});

ipcMain.handle('debug-continue', async () => {
  await debugManager.continue();
  return { success: true };
});

ipcMain.handle('debug-step-over', async () => {
  await debugManager.stepOver();
  return { success: true };
});

ipcMain.handle('debug-step-into', async () => {
    await debugManager.stepInto();
  return { success: true };
});

ipcMain.handle('debug-step-out', async () => {
  await debugManager.stepOut();
  return { success: true };
});

ipcMain.handle('debug-pause', async () => {
  await debugManager.pause();
  return { success: true };
});

ipcMain.handle('debug-set-breakpoints', async (_event, filePath: string, lines: number[]) => {
  await debugManager.setBreakpoints(filePath, lines);
  return { success: true };
});

ipcMain.handle('debug-fetch-variables', async (_event, variablesReference: number) => {
  const variables = await debugManager.fetchVariables(variablesReference);
  return { success: true, variables };
});

ipcMain.handle('debug-evaluate', async (_event, expression: string, frameId?: number) => {
  const result = await debugManager.evaluate(expression, frameId);
  return { success: !!result, result };
});

ipcMain.handle('debug-is-active', () => {
  return debugManager.isActive();
});

// Adapter Management IPC Handlers

ipcMain.handle('get-adapter-catalog', async (): Promise<AdapterInfo[]> => {
  const adaptersDir = getAdaptersDir();
  const adapters: AdapterInfo[] = [];

  for (const adapter of ADAPTER_CATALOG) {
    const installPath = path.join(adaptersDir, adapter.id);
    const entryPointPath = path.join(installPath, adapter.entryPoint || '');

    try {
      await fs.access(entryPointPath);
      adapters.push({
        ...adapter,
        installed: true,
        installPath,
      });
    } catch {
      adapters.push(adapter);
    }
  }

  // Merge with custom adapters from manifest
  const manifest = await loadInstalledManifest();
  for (const custom of manifest) {
    const entryPointPath = path.join(custom.installPath, custom.entryPoint);
    let installed = false;
    try {
      await fs.access(entryPointPath);
      installed = true;
    } catch { /* not found */ }

    const idx = adapters.findIndex(a => a.id === custom.id);
    const customInfo: AdapterInfo = {
      id: custom.id,
      name: custom.name,
      description: custom.description,
      publisher: custom.publisher,
      version: custom.version,
      downloadUrl: '',
      installed,
      installPath: custom.installPath,
      entryPoint: custom.entryPoint,
      supportedLanguages: custom.supportedLanguages,
      isCustom: true,
    };

    if (idx >= 0) {
      adapters[idx] = customInfo;
    } else {
      adapters.push(customInfo);
    }
  }

  return adapters;
});

ipcMain.handle('install-adapter', async (_event, adapterId: string): Promise<AdapterInfo> => {
  const adapter = ADAPTER_CATALOG.find(a => a.id === adapterId);
  if (!adapter) {
    throw new Error(`Unknown adapter: ${adapterId}`);
  }

  const adaptersDir = getAdaptersDir();
  const installPath = path.join(adaptersDir, adapterId);
  const vsixPath = path.join(adaptersDir, `${adapterId}.vsix`);

  try {
    // Ensure adapters directory exists
    await fs.mkdir(adaptersDir, { recursive: true });

    // Download the .vsix file
    await downloadFile(adapter.downloadUrl, vsixPath);

    // Extract the .vsix (it's just a zip)
    await extractVsix(vsixPath, installPath);

    // Clean up .vsix file
    await fs.unlink(vsixPath);

    return {
      ...adapter,
      installed: true,
      installPath,
    };
  } catch (error) {
    // Clean up on failure
    try {
      await fs.rm(installPath, { recursive: true, force: true });
      await fs.unlink(vsixPath).catch(() => {});
    } catch {}
    throw error;
  }
});

ipcMain.handle('uninstall-adapter', async (_event, adapterId: string): Promise<void> => {
  const adaptersDir = getAdaptersDir();
  const installPath = path.join(adaptersDir, adapterId);
  await fs.rm(installPath, { recursive: true, force: true });

  // Remove from manifest if custom
  const manifest = await loadInstalledManifest();
  const idx = manifest.findIndex(a => a.id === adapterId);
  if (idx >= 0) {
    manifest.splice(idx, 1);
    await saveInstalledManifest(manifest);
  }
});

ipcMain.handle('get-adapter-path', async (_event, adapterId: string): Promise<string | null> => {
  const adapter = ADAPTER_CATALOG.find(a => a.id === adapterId);
  if (adapter?.entryPoint) {
    const adaptersDir = getAdaptersDir();
    const adapterPath = path.join(adaptersDir, adapterId, adapter.entryPoint);
    try {
      await fs.access(adapterPath);
      return adapterPath;
    } catch {
      // fall through to custom
    }
  }

  const manifest = await loadInstalledManifest();
  const custom = manifest.find(a => a.id === adapterId);
  if (custom) {
    const adapterPath = path.join(custom.installPath, custom.entryPoint);
    try {
      await fs.access(adapterPath);
      return adapterPath;
    } catch {
      return null;
    }
  }

  return null;
});

// Install a custom adapter from a user-picked .vsix file — auto-parses metadata
ipcMain.handle('install-custom-adapter', async (): Promise<AdapterInfo> => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'VS Code Extension', extensions: ['vsix'] }],
  });
  if (result.canceled || result.filePaths.length === 0) {
    throw new Error('No file selected');
  }
  const vsixPath = result.filePaths[0];

  const pkg = await parseVsixPackageJson(vsixPath);
  if (!pkg) {
    throw new Error('Could not parse extension/package.json from .vsix');
  }

  const meta = inferAdapterFromPackageJson(pkg);
  if (!meta) {
    throw new Error('Could not infer adapter metadata from .vsix. Is this a debug adapter extension?');
  }

  const adaptersDir = getAdaptersDir();
  const installPath = path.join(adaptersDir, meta.id);

  try {
    await fs.mkdir(adaptersDir, { recursive: true });
    await extractVsix(vsixPath, installPath);

    // Verify entry point exists
    const entryFull = path.join(installPath, meta.entryPoint);
    try {
      await fs.access(entryFull);
    } catch {
      throw new Error(
        `Entry point not found after extraction: "${meta.entryPoint}". ` +
        `The adapter may require external binaries or a different entry point.`
      );
    }

    // Add to manifest
    const manifest = await loadInstalledManifest();
    const idx = manifest.findIndex(a => a.id === meta.id);
    const entry: InstalledAdapterManifest = {
      ...meta,
      installPath,
      installedAt: new Date().toISOString(),
    };
    if (idx >= 0) {
      manifest[idx] = entry;
    } else {
      manifest.push(entry);
    }
    await saveInstalledManifest(manifest);

    return {
      ...meta,
      downloadUrl: '',
      installed: true,
      installPath,
      isCustom: true,
    };
  } catch (error) {
    try {
      await fs.rm(installPath, { recursive: true, force: true });
    } catch {}
    throw error;
  }
});
