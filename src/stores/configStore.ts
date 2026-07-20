import { create } from 'zustand';
import { LaunchConfiguration } from '../dap/types';

interface ConfigState {
  configs: LaunchConfiguration[];
  selectedConfig: LaunchConfiguration | null;
  workspaceRoot: string;
  theme: 'dark' | 'light';

  // Actions
  loadConfigs: () => Promise<void>;
  loadGlobalConfigs: () => Promise<void>;
  selectConfig: (name: string) => void;
  addConfig: (config: LaunchConfiguration) => void;
  removeConfig: (name: string) => void;
  getSelectedConfig: () => LaunchConfiguration | null;
  setWorkspaceRoot: (root: string) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  loadTheme: () => void;
}

export const useConfigStore = create<ConfigState>()((set, get) => ({
  configs: [],
  selectedConfig: null,
  workspaceRoot: '',
  theme: 'dark',

  loadConfigs: async () => {
    const [vscodeConfig, globalConfig] = await Promise.all([
      window.electronAPI?.getLaunchConfig().catch((err) => {
        console.error('Failed to load workspace launch config:', err);
        return null;
      }),
      window.electronAPI?.getGlobalLaunchConfig().catch((err) => {
        console.error('Failed to load global launch config:', err);
        return null;
      }),
    ]);

    console.log('Loaded workspace launch config:', vscodeConfig);
    console.log('Loaded global launch config:', globalConfig);

    const workspaceConfigs = (vscodeConfig && Array.isArray(vscodeConfig.configurations))
      ? (vscodeConfig.configurations as LaunchConfiguration[])
      : [];
    const globalConfigs = (globalConfig && Array.isArray(globalConfig.configurations))
      ? (globalConfig.configurations as LaunchConfiguration[])
      : [];

    // Merge: workspace configs first, then globals. Workspace entries override globals by name.
    const merged = new Map<string, LaunchConfiguration>();
    for (const config of [...globalConfigs, ...workspaceConfigs]) {
      if (config?.name) {
        merged.set(config.name, config);
      }
    }

    const configs = Array.from(merged.values());
    console.log('Setting merged configs:', configs);
    set({ configs });

    // Select first config if none selected or the current selection is no longer available
    const currentName = get().selectedConfig?.name;
    if (configs.length > 0 && (!currentName || !configs.some(c => c.name === currentName))) {
      set({ selectedConfig: configs[0] });
    } else if (configs.length === 0) {
      set({ selectedConfig: null });
    }

    // Get workspace root
    try {
      const root = await window.electronAPI?.getWorkspaceRoot();
      console.log('Workspace root:', root);
      if (root) {
        set({ workspaceRoot: root });
      }
    } catch (err) {
      console.error('Failed to get workspace root:', err);
    }
  },

  loadGlobalConfigs: async () => {
    await get().loadConfigs();
  },

  selectConfig: (name: string) => {
    const config = get().configs.find(c => c.name === name);
    if (config) {
      set({ selectedConfig: config });
    }
  },

  addConfig: (config: LaunchConfiguration) => {
    const configs = get().configs.filter(c => c.name !== config.name);
    set({ configs: [...configs, config] });
  },

  removeConfig: (name: string) => {
    const configs = get().configs.filter(c => c.name !== name);
    set({ 
      configs,
      selectedConfig: get().selectedConfig?.name === name ? null : get().selectedConfig,
    });
  },

  getSelectedConfig: () => {
    return get().selectedConfig;
  },

  setWorkspaceRoot: (root: string) => {
    set({ workspaceRoot: root });
  },

  setTheme: (theme: 'dark' | 'light') => {
    set({ theme });
    document.documentElement.setAttribute('data-theme', theme);
    window.electronAPI?.setAppSettings({ theme });
  },

  loadTheme: async () => {
    try {
      const settings = await window.electronAPI?.getAppSettings();
      const theme = settings?.theme || 'dark';
      set({ theme });
      document.documentElement.setAttribute('data-theme', theme);
    } catch (err) {
      console.error('Failed to load theme from settings:', err);
      set({ theme: 'dark' });
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  },
}));
