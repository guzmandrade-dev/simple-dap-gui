import { useDebugStore } from '../../stores/debugStore';
import { getFileName } from '../../utils/pathMapping';

function IconCross({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 2l8 8M10 2L2 10" />
    </svg>
  );
}

export function BreakpointsPanel() {
  const { breakpoints, removeBreakpoint, toggleBreakpointEnabled, isBreakpointEnabled } = useDebugStore();

  const breakpointEntries = Array.from(breakpoints.entries());

  if (breakpointEntries.length === 0) {
    return <div className="p-4 text-text-secondary text-sm">No breakpoints set</div>;
  }

  return (
    <div className="py-2">
      <h3 className="text-xs font-medium text-text-muted uppercase mb-1 px-3">Breakpoints</h3>
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
    </div>
  );
}
