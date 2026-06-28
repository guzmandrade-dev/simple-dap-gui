import { useDebugStore } from '../../stores/debugStore';
import { useEditorStore } from '../../stores/editorStore';
import { useConfigStore } from '../../stores/configStore';

interface StatusBarProps {
  isActive: boolean;
}

export function StatusBar({ isActive }: StatusBarProps) {
  const { currentFile, currentLine } = useDebugStore();
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

        {workspaceRoot && (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-text-muted">{workspaceRoot}</span>
          </div>
        )}

        {currentFile && (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate max-w-[300px]" title={currentFile}>{currentFile}</span>
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
