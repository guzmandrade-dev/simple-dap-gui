import { useState, useCallback } from 'react';
import { useDebugStore } from '../../stores/debugStore';

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
    return (
      <div className="p-4 text-muted text-sm">
        No active debug session
      </div>
    );
  }

  return (
    <div className="p-2">
      <h3 className="text-xs font-bold text-secondary uppercase mb-2 px-2">Watch</h3>

      <div className="flex gap-1 mb-3 px-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Expression to watch..."
          className="flex-1 bg-elevated border border-border rounded px-2 py-1 text-sm text-text placeholder-muted focus:outline-none focus:border-accent"
        />
        <button
          onClick={handleAdd}
          className="bg-accent text-white px-3 py-1 rounded text-sm hover:opacity-90"
        >
          +
        </button>
      </div>

      {watches.length === 0 && (
        <div className="px-2 text-muted text-sm italic">
          No watch expressions. Add one above.
        </div>
      )}

      <div className="font-mono text-sm">
        {watches.map((watch) => (
          <div
            key={watch.id}
            className="grid grid-cols-[auto_1fr_auto] gap-x-1 items-start p-1 hover:bg-elevated rounded group"
          >
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-accent">{watch.expression}</span>
              <span className="text-muted">=</span>
            </div>
            <span className={getValueColor(watch.type) + ' break-all'}>
              {isPaused ? (watch.result ?? '...') : 'Not available'}
            </span>
            <button
              onClick={() => removeWatch(watch.id)}
              className="opacity-0 group-hover:opacity-100 text-muted hover:text-error px-1 transition-opacity"
              title="Remove watch"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function getValueColor(type?: string): string {
  const colors: Record<string, string> = {
    'string': 'text-success',
    'number': 'text-warning',
    'boolean': 'text-accent',
    'null': 'text-muted',
    'undefined': 'text-muted',
    'object': 'text-warning',
    'array': 'text-warning',
    'error': 'text-error',
  };
  return colors[type || ''] || 'text-text';
}
