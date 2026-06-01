import * as fs from 'fs/promises';
import * as path from 'path';

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

// Catalog of popular debug adapters from Open VSX
// URLs use the Open VSX API format: https://open-vsx.org/api/{namespace}/{extension}/latest
export const ADAPTER_CATALOG: AdapterInfo[] = [
  {
    id: 'felixfbecker.php-debug',
    name: 'PHP Debug',
    description: 'Debug support for PHP with XDebug',
    publisher: 'felixfbecker',
    version: '1.34.0',
    // Using GitHub releases as fallback since Open VSX may not have all versions
    downloadUrl: 'https://github.com/xdebug/vscode-php-debug/releases/download/v1.34.0/php-debug-1.34.0.vsix',
    installed: false,
    entryPoint: 'extension/out/phpDebug.js',
    supportedLanguages: ['php'],
  },
  {
    id: 'ms-python.debugpy',
    name: 'Python Debugger',
    description: 'Python debugging with debugpy',
    publisher: 'ms-python',
    version: '2024.0.0',
    downloadUrl: 'https://open-vsx.org/api/ms-python/debugpy/latest/file/ms-python.debugpy-2024.0.0.vsix',
    installed: false,
    entryPoint: 'extension/bundled/libs/debugpy/adapter',
    supportedLanguages: ['python'],
  },
  {
    id: 'vadimcn.vscode-lldb',
    name: 'CodeLLDB',
    description: 'Native debugger for LLDB',
    publisher: 'vadimcn',
    version: '1.10.0',
    downloadUrl: 'https://open-vsx.org/api/vadimcn/vscode-lldb/latest/file/vadimcn.vscode-lldb-1.10.0.vsix',
    installed: false,
    entryPoint: 'extension/adapter/codelldb',
    supportedLanguages: ['c', 'cpp', 'rust'],
  },
  {
    id: 'ms-vscode.node-debug2',
    name: 'Node Debug',
    description: 'Node.js debugging',
    publisher: 'ms-vscode',
    version: '1.44.0',
    downloadUrl: 'https://open-vsx.org/api/ms-vscode/node-debug2/latest/file/ms-vscode.node-debug2-1.44.0.vsix',
    installed: false,
    entryPoint: 'extension/out/src/nodeDebug.js',
    supportedLanguages: ['javascript', 'typescript'],
  },
];

// Manifest for user-installed custom adapters
export interface InstalledAdapterManifest {
  id: string;
  name: string;
  description: string;
  publisher: string;
  version: string;
  entryPoint: string;
  supportedLanguages: string[];
  installPath: string;
  installedAt: string;
}

const MANIFEST_FILENAME = 'adapters-manifest.json';

export class AdapterManager {
  private adaptersDir: string;

  constructor(adaptersDir: string) {
    this.adaptersDir = adaptersDir;
  }

  private getManifestPath(): string {
    return path.join(this.adaptersDir, MANIFEST_FILENAME);
  }

  async loadInstalledManifest(): Promise<InstalledAdapterManifest[]> {
    try {
      const content = await fs.readFile(this.getManifestPath(), 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  async saveInstalledManifest(manifest: InstalledAdapterManifest[]): Promise<void> {
    await fs.mkdir(this.adaptersDir, { recursive: true });
    await fs.writeFile(this.getManifestPath(), JSON.stringify(manifest, null, 2), 'utf-8');
  }

  async getInstalledAdapters(): Promise<AdapterInfo[]> {
    const adapters: AdapterInfo[] = [];

    for (const adapter of ADAPTER_CATALOG) {
      const installPath = `${this.adaptersDir}/${adapter.id}`;
      const entryPointPath = `${installPath}/${adapter.entryPoint}`;

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
  }

  async getAllAdapters(): Promise<AdapterInfo[]> {
    const catalog = await this.getInstalledAdapters();
    const manifest = await this.loadInstalledManifest();

    // Convert manifest entries to AdapterInfo and merge
    const customAdapters: AdapterInfo[] = manifest.map(m => ({
      id: m.id,
      name: m.name,
      description: m.description,
      publisher: m.publisher,
      version: m.version,
      downloadUrl: '', // custom adapters don't have a download URL
      installed: true,
      installPath: m.installPath,
      entryPoint: m.entryPoint,
      supportedLanguages: m.supportedLanguages,
      isCustom: true,
    }));

    // Merge: custom adapters override catalog entries if same id
    const all = [...catalog];
    for (const custom of customAdapters) {
      const idx = all.findIndex(a => a.id === custom.id);
      if (idx >= 0) {
        all[idx] = custom;
      } else {
        all.push(custom);
      }
    }

    return all;
  }

  getAdapterPath(adapterId: string): string | null {
    const adapter = ADAPTER_CATALOG.find(a => a.id === adapterId);
    if (!adapter?.entryPoint) return null;
    return `${this.adaptersDir}/${adapterId}/${adapter.entryPoint}`;
  }

  getAdapterForLanguage(language: string): AdapterInfo | undefined {
    return ADAPTER_CATALOG.find(a =>
      a.installed && a.supportedLanguages.includes(language)
    );
  }
}

export const adapterManager = new AdapterManager('./adapters');
