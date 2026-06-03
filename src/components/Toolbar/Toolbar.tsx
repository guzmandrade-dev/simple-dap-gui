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

export function Toolbar() {
  const { isSessionActive, isPaused, startSession, stopSession, continue: continueExecution, stepOver, stepInto, stepOut, pause } = useDebugStore();
  const { selectedConfig, configs, selectConfig, loadConfigs } = useConfigStore();
  const [showNoConfigModal, setShowNoConfigModal] = useState(false);

  const handleStart = () => {
    if (selectedConfig) {
      startSession(selectedConfig);
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
    } catch (e) {}

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
    <div className="h-12 bg-panel border-b border-border flex items-center px-4 gap-4">
      <div className="flex gap-2">
        <button 
          onClick={() => window.electronAPI?.openFolder()}
          className="flex items-center gap-2 px-3 py-1.5 bg-elevated text-sm font-medium"
          title="Open Folder (Ctrl+O)"
        >
          <span>📁</span>
          <span>Open</span>
        </button>
        
        <div className="w-px h-6 bg-border mx-1"></div>
        
        {!isSessionActive ? (
          <button 
            onClick={handleStart}
            disabled={!selectedConfig}
            className="flex items-center gap-2 px-3 py-1.5 bg-success text-success-text disabled:bg-elevated disabled:text-text disabled:cursor-not-allowed text-sm font-medium"
          >
            <span>▶</span>
            <span>Debug</span>
          </button>
        ) : (
          <>
            <button 
              onClick={stopSession}
              className="flex items-center gap-2 px-3 py-1.5 bg-danger text-danger-text text-sm font-medium"
            >
              <span>⏹</span>
              <span>Stop</span>
            </button>
            
            {isPaused ? (
              <>
                <button 
                  onClick={continueExecution} 
                  className="flex items-center gap-2 px-3 py-1.5 bg-success text-success-text text-sm font-medium"
                >
                  <span>▶</span>
                  <span>Continue</span>
                </button>
                <button 
                  onClick={stepOver} 
                  className="flex items-center gap-2 px-3 py-1.5 bg-elevated text-sm font-medium"
                >
                  <span>⤷</span>
                  <span>Step Over</span>
                </button>
                <button 
                  onClick={stepInto} 
                  className="flex items-center gap-2 px-3 py-1.5 bg-elevated text-sm font-medium"
                >
                  <span>⤵</span>
                  <span>Step Into</span>
                </button>
                <button 
                  onClick={stepOut} 
                  className="flex items-center gap-2 px-3 py-1.5 bg-elevated text-sm font-medium"
                >
                  <span>⤴</span>
                  <span>Step Out</span>
                </button>
              </>
            ) : (
              <button 
                onClick={pause} 
                className="flex items-center gap-2 px-3 py-1.5 bg-warning text-warning-text text-sm font-medium"
              >
                <span>⏸</span>
                <span>Pause</span>
              </button>
            )}
          </>
        )}
      </div>
      
      <div className="flex-1 flex items-center gap-2">
        <select
          value={selectedConfig?.name || ''}
          onChange={(e) => selectConfig(e.target.value)}
          className="flex-1 max-w-md px-3 py-1.5 bg-elevated border border-border text-sm focus:outline-none focus:border-accent"
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
            className="px-3 py-1.5 bg-accent text-accent-text text-sm font-medium whitespace-nowrap"
          >
            + Create launch.json
          </button>
        )}
      </div>
      
      <div className="text-sm text-secondary">
        {isSessionActive && (isPaused ? '⏸ Paused' : '▶ Running')}
      </div>

      {/* No Config Modal */}
      {showNoConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-panel border border-border rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-text mb-2">No Debug Configuration</h3>
            <p className="text-sm text-secondary mb-4">
              You need a <code className="bg-elevated px-1 rounded">.vscode/launch.json</code> file to start debugging. Open a folder that contains one, or create it now.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowNoConfigModal(false)}
                className="px-4 py-2 text-sm text-secondary hover:text-text"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowNoConfigModal(false);
                  createLaunchJson();
                }}
                className="px-4 py-2 text-sm bg-accent text-accent-text rounded hover:opacity-90"
              >
                Create launch.json
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
