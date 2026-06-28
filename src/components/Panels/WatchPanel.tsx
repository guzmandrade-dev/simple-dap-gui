import { useState, useCallback } from 'react';
import { useDebugStore } from '../../stores/debugStore';

function IconPlus({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v12M2 8h12" />
    </svg>
  );
}

function IconCross({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 2l8 8M10 2L2 10" />
    </svg>
  );
}

export function WatchPanel() {
  const { watches, isSessionActive, isPaused, addWatch, removeWatch } = useDebugStore();
  const [inputValue, setInputValue] = useState('');

  const handleAdd = useCallback(() => {
    const expr = inputValue.trim();
    if (expr) {
      addWatch(expr);
      setInputValue('');
    }
  }, [inputValue, addWatch]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAdd();
    }
  }, [handleAdd]);

  if (!isSessionActive) {
    return <div className="p-4 text-text-secondary text-sm">No active debug session</div>;
  }

  return (
    <div className="py-2">
      <h3 className="text-xs font-medium text-text-muted uppercase mb-1 px-3">Watch</h3>

      <div className="flex gap-2 mb-2 px-3">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Expression to watch..."
          className="flex-1"
        />
        <button onClick={handleAdd} className="btn btn-primary px-2" title="Add watch" aria-label="Add watch">
          <IconPlus />
        </button>
      </div>

      {watches.length === 0 && (
        <div className="px-3 text-text-muted text-sm italic">No watch expressions. Add one above.</div>
      )}

      <div className="font-mono text-sm">
        {watches.map((watch) => (
          <div
            key={watch.id}
            className="grid grid-cols-[auto_1fr_auto] gap-x-1 items-start px-3 py-0.5 hover:bg-bg-tertiary group"
          >
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-accent">{watch.expression}</span>
              <span className="text-text-muted">=</span>
            </div>
            <span className={`${getValueColor(watch.type)} break-all`}>
              {isPaused ? (watch.result ?? '...') : 'Not available'}
            </span>
            <button
              onClick={() => removeWatch(watch.id)}
              className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger px-1 transition-opacity"
              title="Remove watch"
              aria-label="Remove watch"
            >
              <IconCross />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function getValueColor(type?: string): string {
  const colors: Record<string, string> = {
    string: 'text-success',
    number: 'text-warning',
    boolean: 'text-accent',
    null: 'text-text-muted',
    undefined: 'text-text-muted',
    object: 'text-warning',
    array: 'text-warning',
    error: 'text-danger',
  };
  return colors[type || ''] || 'text-text';
}
