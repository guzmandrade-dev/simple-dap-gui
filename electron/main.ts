import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ADAPTER_CATALOG, AdapterInfo } from '../src/utils/adapterManager';
import { DebugSession } from '../src/dap/session';
import { LaunchConfiguration } from '../src/dap/types';
import { DebugProtocol } from '@vscode/debugprotocol';

// Store reference to main window
let mainWindow: BrowserWindow | null = null;
let currentProjectPath: string | null = null;

// Adapters storage directory
const getAdaptersDir = () => path.join(app.getPath('userData'), 'adapters');

// Debug Session Manager - runs in main process only
class DebugSessionManager {
  private session: DebugSession | null = null;

  async start(config: LaunchConfiguration): Promise<void> {
    this.session = new DebugSession(config);
    
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

  isActive(): boolean {
    return this.session !== null;
  }

  private async getAdapterPath(type: string): Promise<string | null> {
    const adapter = ADAPTER_CATALOG.find(a => 
      a.id === `felixfbecker.${type}-debug` || a.supportedLanguages.includes(type)
    );
    if (!adapter?.entryPoint) return null;
    
    const adaptersDir = getAdaptersDir();
    const adapterPath = path.join(adaptersDir, adapter.id, adapter.entryPoint);
    
    try {
      await fs.access(adapterPath);
      return adapterPath;
    } catch {
      return null;
    }
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
    titleBarStyle: 'default',
    show: false,
  });

  // Setup menu
  setupMenu();

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

// Setup application menu
function setupMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Folder',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            await openFolder();
          },
        },
        {
          label: 'Open Recent',
          submenu: [], // Will be populated dynamically
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            mainWindow?.webContents.reload();
          },
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          click: () => {
            mainWindow?.webContents.toggleDevTools();
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

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
app.whenReady().then(() => {
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

// Helper to get adapters directory

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

  // Use system unzip command
  const { exec } = await import('child_process');
  return new Promise((resolve, reject) => {
    exec(`unzip -o "${vsixPath}" -d "${destPath}"`, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
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

ipcMain.handle('path-resolve', (_event, ...paths: string[]) => {
  return path.resolve(...paths);
});

ipcMain.handle('path-join', (_event, ...paths: string[]) => {
  return path.join(...paths);
});

// Debug Session IPC Handlers

ipcMain.handle('debug-start', async (_event, config: LaunchConfiguration) => {
  try {
    await debugManager.start(config);
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
});

ipcMain.handle('get-adapter-path', async (_event, adapterId: string): Promise<string | null> => {
  const adapter = ADAPTER_CATALOG.find(a => a.id === adapterId);
  if (!adapter?.entryPoint) return null;

  const adaptersDir = getAdaptersDir();
  const adapterPath = path.join(adaptersDir, adapterId, adapter.entryPoint);

  try {
    await fs.access(adapterPath);
    return adapterPath;
  } catch {
    return null;
  }
});
