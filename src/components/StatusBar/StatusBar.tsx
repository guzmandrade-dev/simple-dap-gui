import { useDebugStore } from '../../stores/debugStore';
import { useEditorStore } from '../../stores/editorStore';
import { useConfigStore } from '../../stores/configStore';
import { isVirtualSourcePath } from '../../utils/debugNavigation';

interface StatusBarProps {
  isActive: boolean;
}

function displayPath(path: string): string {
  if (isVirtualSourcePath(path)) {
    // dap://source/<ref>/<name> → <name> (adapter source)
    const name = path.split('/').pop();
    return name ? `${name} (adapter)` : path;
  }
  return path;
}

export function StatusBar({ isActive }: StatusBarProps) {
  const { currentFile, currentLine, isPaused, stopReason, stopDescription, currentSourceUnavailable } = useDebugStore();
  const { fileContents } = useEditorStore();
  const { workspaceRoot } = useConfigStore();

  const fileCount = fileContents.size;

  return (
    <div className="h-7 bg-bg-secondary border-t border-border-subtle flex items-center px-3 text-xs text-text-secondary">
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-success' : 'bg-text-muted'}`} />
          <span>{isActive ? 'Debugging' : 'Idle'}</span>
        </div>

        {isActive && isPaused && (
          <div className="flex items-center gap-1.5">
            <span className="text-warning bg-current-line px-1.5 py-0.5 rounded font-medium" title={stopDescription || stopReason}>
              {stopReason || 'paused'}
            </span>
          </div>
        )}

        {isActive && currentSourceUnavailable && (
          <span className="text-warning" title="Stopped in a source that is not available locally">
            source unavailable
          </span>
        )}

        {workspaceRoot && (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-text-muted">{workspaceRoot}</span>
          </div>
        )}

        {currentFile && (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate max-w-[300px]" title={currentFile}>{displayPath(currentFile)}</span>
            {currentLine && <span className="text-text-muted">:{currentLine}</span>}
          </div>
        )}

        {fileCount > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-text-muted">{fileCount} file{fileCount !== 1 ? 's' : ''} open</span>
          </div>
        )}
      </div>
    </div>
  );
}
