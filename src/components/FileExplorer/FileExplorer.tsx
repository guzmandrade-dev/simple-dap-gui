import { useState, useEffect, useCallback } from 'react';

interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

interface FileExplorerProps {
  className?: string;
  onFileSelect: (path: string) => void;
}

export function FileExplorer({ className, onFileSelect }: FileExplorerProps) {
  const [rootPath, setRootPath] = useState<string>('');
  const [files, setFiles] = useState<FileNode[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadRoot = async () => {
      const root = await window.electronAPI?.getWorkspaceRoot();
      if (root) {
        setRootPath(root);
      }
    };
    loadRoot();
  }, []);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onFolderOpened((path: string) => {
      setRootPath(path);
      setExpandedDirs(new Set());
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    if (rootPath) {
      loadDirectory(rootPath);
    }
  }, [rootPath]);

  const loadDirectory = useCallback(async (dirPath: string) => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI?.readDirectory?.(dirPath);
      if (result) {
        setFiles(result);
      }
    } catch (err) {
      console.error('Failed to load directory:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const toggleDirectory = (path: string) => {
    const newExpanded = new Set(expandedDirs);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedDirs(newExpanded);
  };

  const handleFileClick = (node: FileNode) => {
    if (node.isDirectory) {
      toggleDirectory(node.path);
    } else {
      onFileSelect(node.path);
    }
  };

  const renderNode = (node: FileNode, depth: number = 0) => {
    const isExpanded = expandedDirs.has(node.path);
    const paddingLeft = depth * 16 + 8;

    return (
      <div key={node.path}>
        <div
          onClick={() => handleFileClick(node)}
          className={`
            flex items-center gap-1 py-1 px-2 cursor-pointer text-sm
            ${node.isDirectory ? 'text-text' : 'text-secondary'}
          `}
          style={{ paddingLeft: `${paddingLeft}px` }}
        >
          {node.isDirectory && (
            <span className="text-muted w-4">
              {isExpanded ? '▼' : '▶'}
            </span>
          )}
          {!node.isDirectory && <span className="w-4" />}
          
          <span className="mr-1">
            {node.isDirectory ? (isExpanded ? '📂' : '📁') : getFileIcon(node.name)}
          </span>
          
          <span className="truncate">{node.name}</span>
        </div>
        
        {node.isDirectory && isExpanded && node.children && (
          <div>
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const getFileIcon = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js':
      case 'ts':
      case 'jsx':
      case 'tsx':
        return '📜';
      case 'json':
        return '📋';
      case 'md':
        return '📝';
      case 'html':
      case 'htm':
        return '🌐';
      case 'css':
      case 'scss':
      case 'sass':
        return '🎨';
      case 'php':
        return '🐘';
      case 'py':
        return '🐍';
      case 'java':
        return '☕';
      case 'c':
      case 'cpp':
      case 'h':
      case 'hpp':
        return '⚙️';
      default:
        return '📄';
    }
  };

  if (!rootPath) {
    return (
      <div className={`${className} bg-panel flex flex-col h-full`}>
        <div className="p-3 border-b border-border">
          <h3 className="text-xs font-bold text-secondary uppercase">Explorer</h3>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted text-sm p-4 text-center">
          No folder opened
          <br />
          <span className="text-xs text-muted">
            Use File → Open Folder
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className} bg-panel flex flex-col h-full`}>
      <div className="p-3 border-b border-border">
        <h3 className="text-xs font-bold text-secondary uppercase truncate" title={rootPath}>
          {rootPath.split('/').pop() || rootPath}
        </h3>
      </div>
      
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 text-muted text-sm">Loading...</div>
        ) : files.length === 0 ? (
          <div className="p-4 text-muted text-sm">Empty folder</div>
        ) : (
          files.map(node => renderNode(node))
        )}
      </div>
    </div>
  );
}
