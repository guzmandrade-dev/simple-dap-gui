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
    <div className="h-6 bg-panel border-t border-border flex items-center px-4 text-xs text-secondary">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          <span className={`w-2 h-2 ${isActive ? 'bg-success' : 'bg-muted'}`} />
          <span>{isActive ? 'Debugging' : 'Idle'}</span>
        </div>
        
        {workspaceRoot && (
          <div className="flex items-center gap-2">
            <span className="text-muted">|</span>
            <span className="truncate max-w-[400px]" title={workspaceRoot}>{workspaceRoot}</span>
          </div>
        )}
        
        {currentFile && (
          <div className="flex items-center gap-2">
            <span className="text-muted">|</span>
            <span className="truncate max-w-[300px]">{currentFile}</span>
            {currentLine && <span>:{currentLine}</span>}
          </div>
        )}
        
        {fileCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-muted">|</span>
            <span>{fileCount} file{fileCount !== 1 ? 's' : ''} open</span>
          </div>
        )}
      </div>
    </div>
  );
}
