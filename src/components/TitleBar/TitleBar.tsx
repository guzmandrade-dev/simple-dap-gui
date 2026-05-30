import { useState, useEffect } from 'react';

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const checkMaximized = async () => {};
    checkMaximized();
  }, []);

  const handleMinimize = () => {
    window.electronAPI?.windowMinimize();
  };

  const handleMaximize = () => {
    window.electronAPI?.windowMaximize();
    setIsMaximized(!isMaximized);
  };

  const handleClose = () => {
    window.electronAPI?.windowClose();
  };

  return (
    <div className="h-8 bg-panel flex items-center justify-between select-none app-drag-region">
      <div className="flex-1 px-4 text-sm text-secondary font-medium truncate">
        DapDesk - DAP Debugger GUI
      </div>
      
      <div className="flex items-center app-no-drag-region">
        <button
          onClick={handleMinimize}
          className="w-12 h-8 flex items-center justify-center text-secondary"
          title="Minimize"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <rect x="0" y="5" width="12" height="2" />
          </svg>
        </button>
        
        <button
          onClick={handleMaximize}
          className="w-12 h-8 flex items-center justify-center text-secondary"
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M2 4v6h8V4H2zm1 1h6v4H3V5z" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <rect x="1" y="1" width="10" height="10" stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
          )}
        </button>
        
        <button
          onClick={handleClose}
          className="w-12 h-8 flex items-center justify-center text-secondary"
          title="Close"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
