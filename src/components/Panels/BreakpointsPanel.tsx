import { useDebugStore } from '../../stores/debugStore';
import { getFileName } from '../../utils/pathMapping';

const DEFAULT_EXCEPTION_FILTERS = [
  { id: 'notice', label: 'Notice' },
  { id: 'warning', label: 'Warning' },
  { id: 'error', label: 'Error' },
  { id: 'exception', label: 'Exception' },
  { id: 'everything', label: 'Everything' },
];

function IconCross({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 2l8 8M10 2L2 10" />
    </svg>
  );
}

export function BreakpointsPanel() {
  const {
    breakpoints,
    removeBreakpoint,
    toggleBreakpointEnabled,
    isBreakpointEnabled,
    exceptionBreakpoints,
    toggleExceptionBreakpoint,
  } = useDebugStore();

  const breakpointEntries = Array.from(breakpoints.entries());

  return (
    <div className="py-2 space-y-3">
      <div>
        <h3 className="text-xs font-medium text-text-muted uppercase mb-1 px-3">Breakpoints</h3>
        {breakpointEntries.length === 0 ? (
          <div className="px-3 text-text-secondary text-sm">No breakpoints set</div>
        ) : (
          <div>
            {breakpointEntries.map(([file, lines]) => (
              <div key={file} className="mb-2">
                <div className="text-xs text-text-muted font-medium px-3 truncate" title={file}>
                  {getFileName(file)}
                </div>
                {Array.from(lines).map((line) => (
                  <div key={`${file}:${line}`} className="flex items-center gap-2 px-3 py-0.5 hover:bg-bg-tertiary group">
                    <input
                      type="checkbox"
                      checked={isBreakpointEnabled(file, line)}
                      onChange={() => toggleBreakpointEnabled(file, line)}
                      className="w-4 h-4 accent-accent"
                    />
                    <span className="text-sm font-mono text-text flex-1">
                      Line {line}
                    </span>
                    <button
                      onClick={() => removeBreakpoint(file, line)}
                      className="text-text-muted hover:text-danger px-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove breakpoint"
                      aria-label="Remove breakpoint"
                    >
                      <IconCross />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border-subtle pt-2">
        <h3 className="text-xs font-medium text-text-muted uppercase mb-1 px-3">Stop On</h3>
        <div>
          {DEFAULT_EXCEPTION_FILTERS.map((filter) => (
            <label
              key={filter.id}
              className="flex items-center gap-2 px-3 py-0.5 hover:bg-bg-tertiary cursor-pointer"
              title={`Break when the adapter reports a ${filter.label.toLowerCase()}`}
            >
              <input
                type="checkbox"
                checked={exceptionBreakpoints.has(filter.id)}
                onChange={() => toggleExceptionBreakpoint(filter.id)}
                className="w-4 h-4 accent-accent"
              />
              <span className="text-sm text-text">{filter.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
