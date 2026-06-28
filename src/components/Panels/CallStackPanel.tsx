import { useDebugStore } from '../../stores/debugStore';
import { getFileName } from '../../utils/pathMapping';

export function CallStackPanel() {
  const { stackFrames, currentFrameId, selectFrame, isSessionActive, isPaused } = useDebugStore();

  if (!isSessionActive) {
    return (
      <div className="p-4 text-text-secondary text-sm">
        No active debug session
      </div>
    );
  }

  if (!isPaused) {
    return (
      <div className="p-4 text-text-secondary text-sm">
        Program is running. Stack trace will appear when paused.
      </div>
    );
  }

  if (stackFrames.length === 0) {
    return (
      <div className="p-4 text-text-secondary text-sm">
        No stack frames available
      </div>
    );
  }

  return (
    <div className="py-2">
      <h3 className="text-xs font-medium text-text-muted uppercase mb-1 px-3">Call Stack</h3>
      <div>
        {stackFrames.map((frame, index) => (
          <div
            key={frame.id}
            onClick={() => selectFrame(frame.id)}
            className={`cursor-pointer px-3 py-1.5 text-sm transition-colors ${
              frame.id === currentFrameId
                ? 'bg-accent text-accent-text'
                : 'text-text hover:bg-bg-tertiary'
            }`}
            title={`${frame.name} — click to navigate`}
          >
            <div className="flex items-center gap-2">
              <span className={`text-xs w-4 text-right shrink-0 ${frame.id === currentFrameId ? 'text-accent-text/70' : 'text-text-muted'}`}>
                {index}
              </span>
              <div className="min-w-0">
                <div className="font-medium truncate">{frame.name}</div>
                <div className={`text-xs truncate font-mono ${frame.id === currentFrameId ? 'text-accent-text/80' : 'text-text-muted'}`}>
                  {frame.source?.path ? getFileName(frame.source.path) : 'Unknown'}:{frame.line}
                  {frame.column && frame.column > 0 ? `:${frame.column}` : ''}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
