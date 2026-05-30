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

// Recursively find and update a node in the tree by its path
function updateNodeInTree(
  nodes: FileNode[],
  targetPath: string,
  updater: (node: FileNode) => FileNode
): FileNode[] {
  return nodes.map(node => {
    if (node.path === targetPath) {
      return updater(node);
    }
    if (node.children) {
      return { ...node, children: updateNodeInTree(node.children, targetPath, updater) };
    }
    return node;
  });
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

  const loadRootDirectory = useCallback(async () => {
    if (!rootPath) return;
    setIsLoading(true);
    try {
      const result = await window.electronAPI?.readDirectory?.(rootPath);
      if (result) {
        setFiles(result);
      }
    } catch (err) {
      console.error('Failed to load directory:', err);
    } finally {
      setIsLoading(false);
    }
  }, [rootPath]);

  useEffect(() => {
    loadRootDirectory();
  }, [loadRootDirectory]);

  const handleDirectoryToggle = useCallback(async (node: FileNode) => {
    const isExpanded = expandedDirs.has(node.path);

    if (isExpanded) {
      setExpandedDirs(prev => {
        const next = new Set(prev);
        next.delete(node.path);
        return next;
      });
    } else {
      // Load children on first expand
      if (node.isDirectory && node.children === undefined) {
        try {
          const result = await window.electronAPI?.readDirectory?.(node.path);
          if (result) {
            const children = result.map(child => ({
              ...child,
              children: child.isDirectory ? undefined : undefined
            }));
            setFiles(prev => updateNodeInTree(prev, node.path, n => ({ ...n, children })));
          }
        } catch (err) {
          console.error('Failed to load subdirectory:', err);
        }
      }

      setExpandedDirs(prev => {
        const next = new Set(prev);
        next.add(node.path);
        return next;
      });
    }
  }, [expandedDirs]);

  const handleFileClick = (node: FileNode) => {
    if (node.isDirectory) {
      handleDirectoryToggle(node);
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
            flex items-center gap-1 py-1 px-2 cursor-pointer text-sm select-none
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

        {node.isDirectory && isExpanded && node.children && node.children.length > 0 && (
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

      <div className="flex-1 overflow-auto min-w-0">
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
