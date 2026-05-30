import { useState, useEffect } from 'react';
import { useConfigStore } from '../../stores/configStore';

interface Settings {
  editorCommand: string;
  editorArgs: string;
}

const DEFAULT_SETTINGS: Settings = {
  editorCommand: 'code',
  editorArgs: '{file}:{line}',
};

export function SettingsPanel() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const { theme, setTheme } = useConfigStore();

  useEffect(() => {
    const saved = localStorage.getItem('dapdesk-settings');
    if (saved) {
      try {
        setSettings(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
    }
  }, []);

  const saveSettings = () => {
    localStorage.setItem('dapdesk-settings', JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const openInEditor = async (filePath: string, line?: number) => {
    const { exec } = await import('child_process');
    const args = settings.editorArgs
      .replace('{file}', filePath)
      .replace('{line}', line?.toString() || '1');
    
    exec(`${settings.editorCommand} ${args}`, (err) => {
      if (err) {
        console.error('Failed to open editor:', err);
        alert(`Failed to open editor: ${err.message}`);
      }
    });
  };

  return (
    <div className="p-4 space-y-6">
      <div>
        <h3 className="text-sm font-bold text-text mb-4">Appearance</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-secondary mb-1">Theme</label>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as 'dark' | 'light')}
              className="w-full bg-elevated border border-border px-2 py-1 text-sm text-text"
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-bold text-text mb-4">External Editor</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-secondary mb-1">Editor Command</label>
            <select
              value={settings.editorCommand}
              onChange={(e) => setSettings({ ...settings, editorCommand: e.target.value })}
              className="w-full bg-elevated border border-border px-2 py-1 text-sm text-text"
            >
              <option value="code">VS Code (code)</option>
              <option value="code-insiders">VS Code Insiders</option>
              <option value="cursor">Cursor</option>
              <option value="zed">Zed</option>
              <option value="subl">Sublime Text</option>
              <option value="atom">Atom</option>
              <option value="vim">Vim</option>
              <option value="nvim">Neovim</option>
              <option value="custom">Custom...</option>
            </select>
            
            {settings.editorCommand === 'custom' && (
              <input
                type="text"
                value={settings.editorCommand === 'custom' ? '' : settings.editorCommand}
                onChange={(e) => setSettings({ ...settings, editorCommand: e.target.value })}
                placeholder="Enter command..."
                className="w-full mt-2 bg-elevated border border-border px-2 py-1 text-sm text-text"
              />
            )}
          </div>

          <div>
            <label className="block text-xs text-secondary mb-1">Arguments Template</label>
            <input
              type="text"
              value={settings.editorArgs}
              onChange={(e) => setSettings({ ...settings, editorArgs: e.target.value })}
              className="w-full bg-elevated border border-border px-2 py-1 text-sm text-text"
              placeholder="{file}:{line}"
            />
            <p className="text-xs text-muted mt-1">
              Use {'{file}'} for file path and {'{line}'} for line number
            </p>
          </div>

          <button
            onClick={saveSettings}
            className="w-full bg-accent text-text text-sm py-2"
          >
            {saved ? '✓ Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-bold text-text mb-4">Quick Actions</h3>
        
        <div className="space-y-2">
          <button
            onClick={async () => {
              const root = await window.electronAPI?.getWorkspaceRoot();
              if (root) {
                openInEditor(root);
              }
            }}
            className="w-full bg-elevated text-text text-sm py-2 px-3 text-left"
          >
            📁 Open Workspace in Editor
          </button>

          <button
            onClick={async () => {
              const root = await window.electronAPI?.getWorkspaceRoot();
              if (root) {
                const configPath = await window.electronAPI?.pathJoin(root, '.vscode', 'launch.json');
                const exists = await window.electronAPI?.fileExists(configPath);
                if (exists) {
                  openInEditor(configPath);
                } else {
                  alert('launch.json does not exist. Create it first!');
                }
              }
            }}
            className="w-full bg-elevated text-text text-sm py-2 px-3 text-left"
          >
            ⚙️ Edit launch.json
          </button>
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-bold text-text mb-2">About</h3>
        <p className="text-xs text-muted">
          DapDesk v0.1.0<br />
          A DAP Debugger GUI built with Electron
        </p>
      </div>
    </div>
  );
}
