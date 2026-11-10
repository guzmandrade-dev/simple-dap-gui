import { useEffect, useRef } from 'react';
import { useDebugStore } from '../../stores/debugStore';

function IconTrash({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4h12" />
      <path d="M6 4V2.5A.5.5 0 016.5 2h3a.5.5 0 01.5.5V4" />
      <path d="M4 4l.7 9a1 1 0 001 .9h4.6a1 1 0 001-.9L12 4" />
      <path d="M6.5 7v4M9.5 7v4" />
    </svg>
  );
}

function categoryClass(category?: string): string {
  switch (category) {
    case 'stderr':
      return 'text-danger';
    case 'important':
      return 'text-warning';
    case 'console':
      return 'text-accent';
    default:
      return 'text-text-secondary';
  }
}

export function OutputPanel() {
  const { output, clearOutput, isSessionActive } = useDebugStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  // Auto-scroll to the newest output unless the user scrolled up
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [output]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  return (
    <div className="py-2 flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-1 px-3">
        <h3 className="text-xs font-medium text-text-muted uppercase">Console</h3>
        <button
          onClick={clearOutput}
          className="text-text-muted hover:text-danger p-1 rounded transition-colors"
          title="Clear console"
          aria-label="Clear console"
        >
          <IconTrash />
        </button>
      </div>

      {!isSessionActive && output.length === 0 ? (
        <div className="p-4 text-text-secondary text-sm">No active debug session</div>
      ) : output.length === 0 ? (
        <div className="px-3 text-text-muted text-sm italic">No output yet.</div>
      ) : (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-auto min-h-0 font-mono text-xs px-3 py-1 bg-bg"
        >
          {output.map((entry, i) => (
            <div key={i} className={`whitespace-pre-wrap break-all ${categoryClass(entry.category)}`}>
              {entry.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
