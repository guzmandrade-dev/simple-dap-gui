import { useDebugStore } from '../../stores/debugStore';
import { getFileName } from '../../utils/pathMapping';

export function BreakpointsPanel() {
  const { breakpoints, removeBreakpoint, toggleBreakpointEnabled, isBreakpointEnabled } = useDebugStore();

  const breakpointEntries = Array.from(breakpoints.entries());

  if (breakpointEntries.length === 0) {
    return (
      <div className="p-4 text-muted text-sm">
        No breakpoints set
      </div>
    );
  }

  return (
    <div className="p-2">
      <h3 className="text-sm font-bold text-secondary uppercase mb-2 px-2">Breakpoints</h3>
      <div className="space-y-1">
        {breakpointEntries.map(([file, lines]) => (
          <div key={file} className="mb-2">
            <div className="text-sm text-muted font-medium px-1 truncate" title={file}>
              {getFileName(file)}
            </div>
            {Array.from(lines).map(line => (
              <div 
                key={`${file}:${line}`} 
                className="flex items-center gap-2 p-1"
              >
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
                  className="text-danger text-sm px-1 leading-none flex items-center justify-center hover:bg-elevated rounded"
                  title="Remove breakpoint"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
