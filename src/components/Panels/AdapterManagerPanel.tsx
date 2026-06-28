import { useState, useEffect } from 'react';
import { AdapterInfo } from '../../utils/adapterManager';

function IconRefresh({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 8a6 6 0 0110.24-4.24M14 8a6 6 0 01-10.24 4.24" />
      <path d="M14 4v4h-4M2 12v-4h4" />
    </svg>
  );
}

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
        setAdapters((prev) =>
          prev.map((a) => (a.id === adapterId ? { ...a, installed: true, installPath: installed.installPath } : a))
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
      setAdapters((prev) =>
        prev.map((a) => (a.id === adapterId ? { ...a, installed: false, installPath: undefined } : a))
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
        setAdapters((prev) => {
          const idx = prev.findIndex((a) => a.id === installed.id);
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
    return <div className="p-4 text-text-secondary text-sm">Loading adapters...</div>;
  }

  return (
    <div className="py-2">
      <div className="flex items-center justify-between mb-2 px-3">
        <h3 className="text-xs font-medium text-text-muted uppercase">Debug Adapters</h3>
        <div className="flex gap-2 items-center">
          <button
            onClick={handleInstallCustom}
            disabled={installing === 'custom'}
            className="btn btn-ghost text-xs"
            title="Install from a .vsix file"
          >
            {installing === 'custom' ? 'Installing...' : 'Install from .vsix'}
          </button>
          <button onClick={loadAdapters} className="btn btn-ghost p-1.5" title="Refresh" aria-label="Refresh">
            <IconRefresh />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-2 p-2 mx-3 border border-danger text-xs text-danger flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-danger hover:text-text">
            ×
          </button>
        </div>
      )}

      <div className="divide-y divide-border-subtle">
        {adapters.map((adapter) => (
          <div
            key={adapter.id}
            className={`px-3 py-2 ${adapter.installed ? 'bg-bg-secondary/50' : ''}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text truncate">
                  {adapter.name}
                  {adapter.isCustom && <span className="ml-1 text-xs text-accent">(custom)</span>}
                </div>
                <div className="text-xs text-text-muted">
                  {adapter.publisher} • v{adapter.version}
                </div>
                <div className="text-xs text-text-secondary mt-1">{adapter.description}</div>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {adapter.supportedLanguages.map((lang) => (
                    <span key={lang} className="px-1.5 py-0.5 bg-bg-tertiary text-[10px] text-text-secondary rounded">
                      {lang}
                    </span>
                  ))}
                </div>
              </div>

              <div className="shrink-0">
                {adapter.installed ? (
                  <button
                    onClick={() => handleUninstall(adapter.id)}
                    className="btn btn-danger text-xs"
                    disabled={installing === adapter.id}
                  >
                    {installing === adapter.id ? '...' : 'Uninstall'}
                  </button>
                ) : (
                  <button
                    onClick={() => handleInstall(adapter.id)}
                    className="btn btn-primary text-xs"
                    disabled={installing === adapter.id}
                  >
                    {installing === adapter.id ? 'Installing...' : 'Install'}
                  </button>
                )}
              </div>
            </div>

            {adapter.installed && (
              <div className="mt-1.5 text-xs text-success flex items-center gap-1">
                Installed
              </div>
            )}
          </div>
        ))}
      </div>

      {adapters.length === 0 && (
        <div className="text-center py-4 text-text-muted text-sm">No adapters available</div>
      )}
    </div>
  );
}
