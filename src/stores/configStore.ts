import { create } from 'zustand';
import { LaunchConfiguration } from '../dap/types';

interface ConfigState {
  configs: LaunchConfiguration[];
  selectedConfig: LaunchConfiguration | null;
  workspaceRoot: string;
  theme: 'dark' | 'light';

  // Actions
  loadConfigs: () => Promise<void>;
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
    try {
      const vscodeConfig = await window.electronAPI?.getLaunchConfig();
      console.log('Loaded launch config:', vscodeConfig);
      
      if (vscodeConfig && Array.isArray(vscodeConfig.configurations)) {
        const configs = vscodeConfig.configurations as LaunchConfiguration[];
        console.log('Setting configs:', configs);
        set({ configs });
        
        // Select first config if none selected
        if (!get().selectedConfig && configs.length > 0) {
          set({ selectedConfig: configs[0] });
        }
      } else {
        // Clear configs if no valid configurations
        set({ configs: [] });
      }
    } catch (err) {
      console.error('Failed to load configs:', err);
      set({ configs: [] });
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
