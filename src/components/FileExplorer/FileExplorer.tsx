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

function IconChevron({ className, direction }: { className?: string; direction: 'right' | 'down' }) {
  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: direction === 'down' ? 'rotate(90deg)' : undefined }}
    >
      <path d="M4 2l4 4-4 4" />
    </svg>
  );
}

function IconFolder({ className, open }: { className?: string; open?: boolean }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {open ? (
        <>
          <path d="M2 4h4l2 2h6v7H2V4z" />
        </>
      ) : (
        <>
          <path d="M2 3h4l2 2h6v8H2V3z" />
        </>
      )}
    </svg>
  );
}

function IconFile({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6l-4-4z" />
      <path d="M9 2v4h4" />
    </svg>
  );
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
          className="flex items-center gap-1 py-1 px-2 cursor-pointer text-sm select-none text-text-secondary hover:text-text hover:bg-bg-tertiary"
          style={{ paddingLeft: `${paddingLeft}px` }}
        >
          {node.isDirectory ? (
            <span className="text-text-muted w-4 flex items-center justify-center">
              <IconChevron direction={isExpanded ? 'down' : 'right'} />
            </span>
          ) : (
            <span className="w-4" />
          )}

          <span className="mr-1.5 text-text-muted">
            {node.isDirectory ? <IconFolder open={isExpanded} /> : <IconFile />}
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

  const rootName = rootPath.replace(/\\/g, '/').split('/').pop() || rootPath;

  if (!rootPath) {
    return (
      <div className={`${className} bg-bg-secondary flex flex-col h-full`}>
        <div className="px-3 py-2 border-b border-border-subtle">
          <h3 className="text-xs font-medium text-text-muted uppercase">Explorer</h3>
        </div>
        <div className="flex-1 flex items-center justify-center text-text-muted text-sm p-4 text-center">
          No folder opened
          <br />
          <span className="text-xs">Use File → Open Folder</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className} bg-bg-secondary flex flex-col h-full`}>
      <div className="px-3 py-2 border-b border-border-subtle">
        <h3 className="text-xs font-medium text-text-muted uppercase truncate" title={rootPath}>
          {rootName}
        </h3>
      </div>

      <div className="flex-1 overflow-auto min-w-0">
        {isLoading ? (
          <div className="p-4 text-text-muted text-sm">Loading...</div>
        ) : files.length === 0 ? (
          <div className="p-4 text-text-muted text-sm">Empty folder</div>
        ) : (
          files.map(node => renderNode(node))
        )}
      </div>
    </div>
  );
}
