import { useState } from 'react';
import { useDebugStore } from '../../stores/debugStore';
import { useConfigStore } from '../../stores/configStore';

const DEFAULT_LAUNCH_JSON = {
  version: '0.2.0',
  configurations: [
    {
      name: 'Listen for Xdebug',
      type: 'php',
      request: 'launch',
      port: 9003,
    },
    {
      name: 'Launch currently open script',
      type: 'php',
      request: 'launch',
      program: '${file}',
      cwd: '${fileDirname}',
      port: 0,
      runtimeArgs: ['-dxdebug.start_with_request=yes'],
      env: {
        XDEBUG_MODE: 'debug,develop',
        XDEBUG_CONFIG: 'client_port=${port}',
      },
    },
  ],
};

function IconFolder({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h4l2 2h6v8H2V3z" />
    </svg>
  );
}

function IconPlay({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 2l10 6-10 6V2z" />
    </svg>
  );
}

function IconStop({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <rect x="3" y="3" width="10" height="10" />
    </svg>
  );
}

function IconPause({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <rect x="3" y="2" width="4" height="12" />
      <rect x="9" y="2" width="4" height="12" />
    </svg>
  );
}

function IconStepOver({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h7" />
      <path d="M8 5l3 3-3 3" />
      <path d="M3 4v8" />
    </svg>
  );
}

function IconStepInto({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v9" />
      <path d="M5 8l3 3 3-3" />
      <path d="M3 14h10" />
    </svg>
  );
}

function IconStepOut({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 14V5" />
      <path d="M5 6l3-3 3 3" />
      <path d="M3 2h10" />
    </svg>
  );
}

function IconPlus({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v12M2 8h12" />
    </svg>
  );
}

export function Toolbar() {
  const { isSessionActive, isPaused, startSession, stopSession, continue: continueExecution, stepOver, stepInto, stepOut, pause } = useDebugStore();
  const { selectedConfig, configs, selectConfig, loadConfigs } = useConfigStore();
  const [showNoConfigModal, setShowNoConfigModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleStart = async () => {
    if (selectedConfig) {
      try {
        await startSession(selectedConfig);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(msg);
        console.error('Failed to start session:', err);
      }
    } else {
      setShowNoConfigModal(true);
    }
  };

  const createLaunchJson = async () => {
    const root = await window.electronAPI?.getWorkspaceRoot();
    if (!root) {
      alert('Please open a folder first');
      return;
    }

    const vscodeDir = await window.electronAPI?.pathJoin(root, '.vscode');
    const configPath = await window.electronAPI?.pathJoin(vscodeDir, 'launch.json');

    const exists = await window.electronAPI?.fileExists(configPath);
    if (exists) {
      const overwrite = confirm('launch.json already exists. Overwrite?');
      if (!overwrite) return;
    }

    try {
      await window.electronAPI?.createDirectory?.(vscodeDir);
    } catch (e) {
      // Directory may already exist
    }

    const content = JSON.stringify(DEFAULT_LAUNCH_JSON, null, 2);
    try {
      await window.electronAPI?.writeFile?.(configPath, content);
      alert('launch.json created!');
      loadConfigs();
    } catch (err) {
      alert('Failed to create launch.json: ' + err);
    }
  };

  return (
    <div className="h-10 bg-bg-secondary border-b border-border-subtle flex items-center px-3 gap-3">
      <button
        onClick={() => window.electronAPI?.openFolder()}
        className="btn btn-outline"
        title="Open Folder (Ctrl+O)"
      >
        <IconFolder />
        <span>Open</span>
      </button>

      <div className="w-px h-5 bg-border" />

      {!isSessionActive ? (
        <button
          onClick={handleStart}
          disabled={!selectedConfig}
          className="btn btn-primary"
          title="Start Debugging (F5)"
        >
          <IconPlay />
          <span>Debug</span>
        </button>
      ) : (
        <>
          <button onClick={stopSession} className="btn btn-danger" title="Stop (Shift+F5)">
            <IconStop />
            <span>Stop</span>
          </button>

          {isPaused ? (
            <>
              <button onClick={continueExecution} className="btn btn-primary" title="Continue (F5)">
                <IconPlay />
                <span>Continue</span>
              </button>
              <button onClick={stepOver} className="btn btn-ghost" title="Step Over (F10)">
                <IconStepOver />
                <span>Step Over</span>
              </button>
              <button onClick={stepInto} className="btn btn-ghost" title="Step Into (F11)">
                <IconStepInto />
                <span>Step Into</span>
              </button>
              <button onClick={stepOut} className="btn btn-ghost" title="Step Out (Shift+F11)">
                <IconStepOut />
                <span>Step Out</span>
              </button>
            </>
          ) : (
            <button onClick={pause} className="btn btn-ghost" title="Pause">
              <IconPause />
              <span>Pause</span>
            </button>
          )}
        </>
      )}

      <div className="flex-1 flex items-center gap-2 min-w-0">
        <select
          value={selectedConfig?.name || ''}
          onChange={(e) => selectConfig(e.target.value)}
          className="flex-1 max-w-md"
        >
          <option value="">Select configuration...</option>
          {configs.map((config) => (
            <option key={config.name} value={config.name}>
              {config.name}
            </option>
          ))}
        </select>

        {configs.length === 0 && (
          <button
            onClick={createLaunchJson}
            className="btn btn-primary whitespace-nowrap"
          >
            <IconPlus />
            <span>Create launch.json</span>
          </button>
        )}
      </div>

      {isSessionActive && (
        <div className={`text-xs font-medium ${isPaused ? 'text-warning' : 'text-success'}`}>
          {isPaused ? 'Paused' : 'Running'}
        </div>
      )}

      {/* No Config Modal */}
      {showNoConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-bg-secondary border border-border shadow-xl p-5 max-w-sm w-full mx-4">
            <h3 className="text-base font-medium text-text mb-2">No Debug Configuration</h3>
            <p className="text-sm text-text-secondary mb-4">
              You need a <code className="bg-bg-tertiary px-1 rounded">.vscode/launch.json</code> file to start debugging. Open a folder that contains one, or create it now.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowNoConfigModal(false)}
                className="btn btn-ghost"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowNoConfigModal(false);
                  createLaunchJson();
                }}
                className="btn btn-primary"
              >
                Create launch.json
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {errorMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-bg-secondary border border-border shadow-xl p-5 max-w-md w-full mx-4">
            <h3 className="text-base font-medium text-danger mb-2">Debug Session Failed</h3>
            <p className="text-sm text-text-secondary mb-4 whitespace-pre-wrap">{errorMessage}</p>
            {errorMessage.includes('Adapter not found') && (
              <p className="text-sm text-text-secondary mb-4">
                Install the PHP Debug adapter from the <strong>Adapters</strong> panel, or download it from the{' '}
                <a
                  href="https://github.com/xdebug/vscode-php-debug/releases"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  releases page
                </a>.
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setErrorMessage(null)} className="btn btn-primary">
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
