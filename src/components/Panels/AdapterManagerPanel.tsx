import { useState, useEffect } from 'react';
import { AdapterInfo } from '../../utils/adapterManager';

export function AdapterManagerPanel() {
  const [adapters, setAdapters] = useState<AdapterInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAdapters();
  }, []);

  const loadAdapters = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const catalog = await window.electronAPI?.getAdapterCatalog();
      if (catalog) {
        setAdapters(catalog);
      }
    } catch (err) {
      setError('Failed to load adapter catalog');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInstall = async (adapterId: string) => {
    setInstalling(adapterId);
    setError(null);

    try {
      const installed = await window.electronAPI?.installAdapter(adapterId);
      if (installed) {
        setAdapters(prev =>
          prev.map(a => a.id === adapterId ? { ...a, installed: true, installPath: installed.installPath } : a)
        );
      }
    } catch (err) {
      setError(`Failed to install adapter: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setInstalling(null);
    }
  };

  const handleUninstall = async (adapterId: string) => {
    try {
      await window.electronAPI?.uninstallAdapter(adapterId);
      setAdapters(prev =>
        prev.map(a => a.id === adapterId ? { ...a, installed: false, installPath: undefined } : a)
      );
    } catch (err) {
      setError(`Failed to uninstall adapter: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleInstallCustom = async () => {
    setInstalling('custom');
    setError(null);
    try {
      const installed = await window.electronAPI?.installCustomAdapter();
      if (installed) {
        setAdapters(prev => {
          const idx = prev.findIndex(a => a.id === installed.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = installed;
            return next;
          }
          return [...prev, installed];
        });
      }
    } catch (err) {
      setError(`Failed to install adapter: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setInstalling(null);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 text-secondary">
        <div>Loading adapters...</div>
      </div>
    );
  }

  return (
    <div className="p-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-secondary uppercase">Debug Adapters</h3>
        <div className="flex gap-2 items-center">
          <button
            onClick={handleInstallCustom}
            disabled={installing === 'custom'}
            className="text-xs px-2 py-1 border border-accent text-accent disabled:opacity-50"
            title="Install from a .vsix file"
          >
            {installing === 'custom' ? 'Installing...' : 'Install from .vsix'}
          </button>
          <button
            onClick={loadAdapters}
            className="text-xs text-accent"
            title="Refresh"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 p-2 border border-danger text-xs text-danger">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-danger"
          >
            ×
          </button>
        </div>
      )}

      <div className="space-y-2">
        {adapters.map((adapter) => (
          <div
            key={adapter.id}
            className={`p-2 border ${
              adapter.installed
                ? 'border-success bg-panel'
                : 'border-border bg-panel'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="font-medium text-sm text-text">
                  {adapter.name}
                  {adapter.isCustom && (
                    <span className="ml-1 text-xs text-accent">(custom)</span>
                  )}
                </div>
                <div className="text-xs text-muted">
                  {adapter.publisher} • v{adapter.version}
                </div>
                <div className="text-xs text-secondary mt-1">
                  {adapter.description}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {adapter.supportedLanguages.map(lang => (
                    <span
                      key={lang}
                      className="px-1.5 py-0.5 bg-elevated text-xs text-secondary"
                    >
                      {lang}
                    </span>
                  ))}
                </div>
              </div>

              <div className="ml-2">
                {adapter.installed ? (
                  <button
                    onClick={() => handleUninstall(adapter.id)}
                    className="px-2 py-1 bg-danger text-danger-text text-xs"
                    disabled={installing === adapter.id}
                  >
                    {installing === adapter.id ? '...' : 'Uninstall'}
                  </button>
                ) : (
                  <button
                    onClick={() => handleInstall(adapter.id)}
                    className="px-2 py-1 bg-accent text-accent-text text-xs"
                    disabled={installing === adapter.id}
                  >
                    {installing === adapter.id ? 'Installing...' : 'Install'}
                  </button>
                )}
              </div>
            </div>

            {adapter.installed && (
              <div className="mt-2 text-xs text-success flex items-center gap-1">
                <span>✓</span>
                <span>Installed</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {adapters.length === 0 && (
        <div className="text-center py-4 text-muted text-sm">
          No adapters available
        </div>
      )}
    </div>
  );
}
