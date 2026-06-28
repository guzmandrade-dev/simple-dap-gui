import { useState, useEffect } from 'react';
import { useConfigStore } from '../../stores/configStore';

interface Settings {
  editorCommand: string;
  editorArgs: string;
  persistentBreakpoints: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  editorCommand: 'code',
  editorArgs: '{file}',
  persistentBreakpoints: false,
};

function quotePath(filePath: string): string {
  return `"${filePath.replace(/"/g, '\\"')}"`;
}

const EDITOR_PRESETS = {
  code: { command: 'code', args: '{file}', label: 'VS Code' },
  zed: { command: 'zed', args: '{file}:{line}', label: 'Zed' },
  vim: { command: 'vim', args: '{file}', label: 'Vim (terminal)' },
};

type EditorPresetKey = keyof typeof EDITOR_PRESETS | 'custom';

function IconFolder({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h4l2 2h6v8H2V3z" />
    </svg>
  );
}

function detectEditorMode(command: string): EditorPresetKey {
  for (const [key, preset] of Object.entries(EDITOR_PRESETS)) {
    if (preset.command === command) return key as EditorPresetKey;
  }
  return 'custom';
}

export function SettingsPanel() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [editorMode, setEditorMode] = useState<EditorPresetKey>('code');
  const [customCommand, setCustomCommand] = useState('');
  const [saved, setSaved] = useState(false);
  const { theme, setTheme } = useConfigStore();

  useEffect(() => {
    const load = async () => {
      try {
        const appSettings = await window.electronAPI?.getAppSettings();
        if (appSettings) {
          const next = {
            editorCommand: appSettings.editorCommand,
            editorArgs: appSettings.editorArgs,
            persistentBreakpoints: appSettings.persistentBreakpoints,
          };
          setSettings(next);
          const mode = detectEditorMode(next.editorCommand);
          setEditorMode(mode);
          if (mode === 'custom') {
            setCustomCommand(next.editorCommand);
          }
        }
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
    };
    load();

    const unsubscribe = window.electronAPI?.onSettingsChanged((appSettings) => {
      const next = {
        editorCommand: appSettings.editorCommand,
        editorArgs: appSettings.editorArgs,
        persistentBreakpoints: appSettings.persistentBreakpoints,
      };
      setSettings(next);
      const mode = detectEditorMode(next.editorCommand);
      setEditorMode(mode);
      if (mode === 'custom') {
        setCustomCommand(next.editorCommand);
      }
    });
    return () => unsubscribe?.();
  }, []);

  const updateEditorMode = (mode: EditorPresetKey) => {
    setEditorMode(mode);
    if (mode === 'custom') {
      const command = customCommand || '';
      setSettings({ ...settings, editorCommand: command });
    } else {
      const preset = EDITOR_PRESETS[mode];
      setSettings({ ...settings, editorCommand: preset.command, editorArgs: preset.args });
    }
  };

  const updateCustomCommand = (value: string) => {
    setCustomCommand(value);
    if (editorMode === 'custom') {
      setSettings({ ...settings, editorCommand: value });
    }
  };

  const saveSettings = async () => {
    try {
      await window.electronAPI?.setAppSettings({
        editorCommand: settings.editorCommand,
        editorArgs: settings.editorArgs,
        persistentBreakpoints: settings.persistentBreakpoints,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  };

  const openInEditor = async (filePath: string, line?: number) => {
    const args = settings.editorArgs
      .replace('{file}', quotePath(filePath))
      .replace('{line}', line?.toString() || '1');

    try {
      await window.electronAPI?.execCommand(`${settings.editorCommand} ${args}`);
    } catch (err) {
      console.error('Failed to open editor:', err);
      alert(`Failed to open editor: ${err}`);
    }
  };

  return (
    <div className="p-4 space-y-6">
      <section>
        <h3 className="text-sm font-medium text-text mb-3">Appearance</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Theme</label>
            <select value={theme} onChange={(e) => setTheme(e.target.value as 'dark' | 'light')} className="w-full">
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
        </div>
      </section>

      <section className="border-t border-border-subtle pt-4">
        <h3 className="text-sm font-medium text-text mb-3">External Editor</h3>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Editor</label>
            <select
              value={editorMode}
              onChange={(e) => updateEditorMode(e.target.value as EditorPresetKey)}
              className="w-full"
            >
              <option value="code">VS Code</option>
              <option value="zed">Zed</option>
              <option value="vim">Vim (terminal)</option>
              <option value="custom">Custom...</option>
            </select>

            {editorMode === 'custom' && (
              <input
                type="text"
                value={customCommand}
                onChange={(e) => updateCustomCommand(e.target.value)}
                placeholder="Enter command (e.g. cursor)"
                className="w-full mt-2"
              />
            )}

            <p className="text-xs text-text-muted mt-2">
              Commands are resolved against your PATH using <code className="bg-bg-tertiary px-1 rounded">where</code> on Windows
              and <code className="bg-bg-tertiary px-1 rounded">which</code> on macOS/Linux, and fall back to common
              install locations. Use the full path if your editor is not found.
            </p>
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Arguments Template</label>
            <input
              type="text"
              value={settings.editorArgs}
              onChange={(e) => setSettings({ ...settings, editorArgs: e.target.value })}
              className="w-full"
              placeholder="{file}"
            />
            <p className="text-xs text-text-muted mt-1">
              Use {'{file}'} for file path and {'{line}'} for line number
            </p>
          </div>

          <button onClick={saveSettings} className="w-full btn btn-primary">
            {saved ? 'Saved' : 'Save Settings'}
          </button>
        </div>
      </section>

      <section className="border-t border-border-subtle pt-4">
        <h3 className="text-sm font-medium text-text mb-3">Debugger</h3>

        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.persistentBreakpoints}
              onChange={(e) => setSettings({ ...settings, persistentBreakpoints: e.target.checked })}
              className="w-4 h-4 accent-accent"
            />
            <span className="text-sm text-text">Persistent Breakpoints</span>
          </label>
          <p className="text-xs text-text-muted">
            Save breakpoints to <code className="bg-bg-tertiary px-1 rounded">.vscode/dap-gui.breakpoints.json</code> and restore them on project open.
          </p>
        </div>
      </section>

      <section className="border-t border-border-subtle pt-4">
        <h3 className="text-sm font-medium text-text mb-3">Quick Actions</h3>

        <button
          onClick={async () => {
            const root = await window.electronAPI?.getWorkspaceRoot();
            if (root) {
              openInEditor(root);
            }
          }}
          className="btn btn-ghost w-full justify-start"
        >
          <IconFolder />
          <span>Open Workspace in Editor</span>
        </button>
      </section>

      <section className="border-t border-border-subtle pt-4">
        <h3 className="text-sm font-medium text-text mb-1">About</h3>
        <p className="text-xs text-text-muted">
          simple-dap-gui v0.4.1<br />
          A DAP Debugger GUI built with Electron
        </p>
      </section>
    </div>
  );
}
