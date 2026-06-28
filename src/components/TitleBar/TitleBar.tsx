import { useState, useEffect } from 'react';

function LogoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 512 512" fill="none">
      <rect x="48" y="48" width="416" height="416" rx="96" fill="#4f8ef7" />
      <path d="M192 128 L96 256 L192 384" stroke="#f9fafb" strokeWidth="48" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M320 128 L416 256 L320 384" stroke="#f9fafb" strokeWidth="48" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="256" cy="256" r="44" fill="#f9fafb" />
    </svg>
  );
}

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    // Could query the main process for initial maximized state if desired.
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
    <div className="h-10 bg-bg-secondary flex items-center justify-between select-none app-drag-region border-b border-border-subtle">
      <div className="flex items-center gap-2 px-3 app-no-drag-region">
        <LogoIcon className="w-4 h-4" />
        <span className="text-sm font-medium text-text">simple-dap-gui</span>
      </div>

      <div className="flex items-center app-no-drag-region">
        <button
          onClick={handleMinimize}
          className="w-10 h-10 flex items-center justify-center text-text-secondary hover:text-text hover:bg-bg-tertiary transition-colors"
          title="Minimize"
          aria-label="Minimize"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <rect x="1" y="5.5" width="10" height="1" />
          </svg>
        </button>

        <button
          onClick={handleMaximize}
          className="w-10 h-10 flex items-center justify-center text-text-secondary hover:text-text hover:bg-bg-tertiary transition-colors"
          title={isMaximized ? 'Restore' : 'Maximize'}
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.25">
              <rect x="2" y="4" width="8" height="6" />
              <path d="M2 4V2.5h8" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.25">
              <rect x="1.5" y="1.5" width="9" height="9" />
            </svg>
          )}
        </button>

        <button
          onClick={handleClose}
          className="w-10 h-10 flex items-center justify-center text-text-secondary hover:text-text hover:bg-danger transition-colors"
          title="Close"
          aria-label="Close"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.25">
            <path d="M2 2l8 8M10 2L2 10" />
          </svg>
        </button>
      </div>
    </div>
  );
}
