import { useEffect, useState, useRef, useCallback } from 'react';
import { useDebugStore } from './stores/debugStore';
import { useConfigStore } from './stores/configStore';
import { useEditorStore } from './stores/editorStore';
import { TitleBar } from './components/TitleBar/TitleBar';
import { Toolbar } from './components/Toolbar/Toolbar';
import { Sidebar } from './components/Panels/Sidebar';
import { FileExplorer } from './components/FileExplorer/FileExplorer';
import { CodeViewer } from './components/Editor/CodeViewer';
import { StatusBar } from './components/StatusBar/StatusBar';
import { ResizablePanel } from './components/ResizablePanel/ResizablePanel';

const COLLAPSE_THRESHOLD = 120;
const MIN_EDITOR_WIDTH = 300;

function App() {
  const { initialize, isSessionActive, isPaused, startSession, stopSession, continue: continueExecution, stepOver, stepInto, stepOut, reloadBreakpoints } = useDebugStore();
  const { loadConfigs, setWorkspaceRoot, loadTheme, selectedConfig } = useConfigStore();
  const { openFile } = useEditorStore();
  const [explorerWidth, setExplorerWidth] = useState(250);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isEditorCollapsed, setIsEditorCollapsed] = useState(false);
  const [preCollapseWidths, setPreCollapseWidths] = useState({ explorer: 250, sidebar: 280 });
  const mainRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const suppressAutoCollapse = useRef(false);

  useEffect(() => {
    initialize();
    loadConfigs();
    loadTheme();

    const unsubscribeFolder = window.electronAPI?.onFolderOpened((path: string) => {
      console.log('Folder opened:', path);
      try {
        setWorkspaceRoot(path);
        loadConfigs();
        reloadBreakpoints();
      } catch (err) {
        console.error('Error handling folder opened:', err);
      }
    });

    const unsubscribeWorkspace = window.electronAPI?.onWorkspaceChanged((path: string) => {
      console.log('Workspace changed:', path);
      try {
        setWorkspaceRoot(path);
        loadConfigs();
        reloadBreakpoints();
      } catch (err) {
        console.error('Error handling workspace changed:', err);
      }
    });

    return () => {
      unsubscribeFolder?.();
      unsubscribeWorkspace?.();
    };
  }, []);

  // Auto-collapse editor when it gets too small from sidebar dragging or window resize
  useEffect(() => {
    if (isEditorCollapsed || !editorRef.current) return;

    const observer = new ResizeObserver((entries) => {
      if (suppressAutoCollapse.current) return;
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width < COLLAPSE_THRESHOLD) {
          setPreCollapseWidths({ explorer: explorerWidth, sidebar: sidebarWidth });
          setIsEditorCollapsed(true);
        }
      }
    });

    observer.observe(editorRef.current);
    return () => observer.disconnect();
  }, [isEditorCollapsed, explorerWidth, sidebarWidth]);

  // Sync debugStore currentFile to editorStore so the code viewer opens automatically
  useEffect(() => {
    let prevCurrentFile: string | undefined = useDebugStore.getState().currentFile;
    const unsubscribe = useDebugStore.subscribe((state) => {
      if (state.currentFile && state.currentFile !== prevCurrentFile) {
        useEditorStore.getState().openFile(state.currentFile);
      }
      prevCurrentFile = state.currentFile;
    });
    return unsubscribe;
  }, []);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input, textarea, or contenteditable
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Shift+F5: Stop
      if (e.key === 'F5' && e.shiftKey) {
        e.preventDefault();
        if (isSessionActive) {
          stopSession();
        }
        return;
      }

      // F5: Start / Continue
      if (e.key === 'F5') {
        e.preventDefault();
        if (!isSessionActive) {
          if (selectedConfig) {
            startSession(selectedConfig);
          }
        } else if (isPaused) {
          continueExecution();
        }
        return;
      }

      // F10: Step Over
      if (e.key === 'F10') {
        e.preventDefault();
        if (isSessionActive && isPaused) {
          stepOver();
        }
        return;
      }

      // Shift+F11: Step Out
      if (e.key === 'F11' && e.shiftKey) {
        e.preventDefault();
        if (isSessionActive && isPaused) {
          stepOut();
        }
        return;
      }

      // F11: Step Into
      if (e.key === 'F11') {
        e.preventDefault();
        if (isSessionActive && isPaused) {
          stepInto();
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSessionActive, isPaused, selectedConfig, startSession, continueExecution, stopSession, stepOver, stepInto, stepOut]);

  const handleFileSelect = useCallback((path: string) => {
    openFile(path);
    // Auto-expand editor if collapsed when a file is clicked
    if (isEditorCollapsed) {
      handleExpandEditor();
    }
  }, [isEditorCollapsed, openFile]);

  const handleExpandEditor = useCallback(() => {
    suppressAutoCollapse.current = true;
    setIsEditorCollapsed(false);

    // Ensure restored widths leave enough room for the editor
    if (mainRef.current) {
      const containerWidth = mainRef.current.clientWidth;
      const totalPanels = preCollapseWidths.explorer + preCollapseWidths.sidebar;
      const availableForEditor = containerWidth - totalPanels;

      if (availableForEditor < MIN_EDITOR_WIDTH) {
        // Need to shrink panels proportionally to make room
        const needed = MIN_EDITOR_WIDTH - availableForEditor;
        const totalShrinkable = Math.max(0, preCollapseWidths.explorer - 150) + Math.max(0, preCollapseWidths.sidebar - 200);

        if (totalShrinkable > 0) {
          const explorerShrink = Math.max(0, preCollapseWidths.explorer - 150) / totalShrinkable * needed;
          const sidebarShrink = Math.max(0, preCollapseWidths.sidebar - 200) / totalShrinkable * needed;
          setExplorerWidth(Math.max(150, preCollapseWidths.explorer - explorerShrink));
          setSidebarWidth(Math.max(200, preCollapseWidths.sidebar - sidebarShrink));
        } else {
          // Fallback: just give editor minimum and split rest
          setExplorerWidth(150);
          setSidebarWidth(Math.max(200, containerWidth - MIN_EDITOR_WIDTH - 150));
        }
      } else {
        setExplorerWidth(preCollapseWidths.explorer);
        setSidebarWidth(preCollapseWidths.sidebar);
      }
    } else {
      setExplorerWidth(preCollapseWidths.explorer);
      setSidebarWidth(preCollapseWidths.sidebar);
    }

    // Re-enable auto-collapse after layout has settled
    requestAnimationFrame(() => {
      setTimeout(() => {
        suppressAutoCollapse.current = false;
      }, 300);
    });
  }, [preCollapseWidths]);

  const handleCollapseEditor = useCallback(() => {
    setPreCollapseWidths({ explorer: explorerWidth, sidebar: sidebarWidth });
    setIsEditorCollapsed(true);
  }, [explorerWidth, sidebarWidth]);

  const handleSidebarResize = useCallback((width: number) => {
    setSidebarWidth(width);
    if (mainRef.current && !suppressAutoCollapse.current) {
      const containerWidth = mainRef.current.clientWidth;
      const editorWidth = containerWidth - explorerWidth - width;
      if (editorWidth < COLLAPSE_THRESHOLD) {
        setPreCollapseWidths({ explorer: explorerWidth, sidebar: width });
        setIsEditorCollapsed(true);
      }
    }
  }, [explorerWidth]);

  return (
    <div className="flex flex-col h-screen bg-bg text-text overflow-hidden">
      <TitleBar />
      <Toolbar />

      <div className="flex flex-1 overflow-hidden" ref={mainRef}>
        {isEditorCollapsed ? (
          <>
            <ResizablePanel
              defaultWidth={explorerWidth}
              minWidth={150}
              maxWidth={2000}
              onResize={setExplorerWidth}
              className="border-r border-border-subtle"
            >
              <FileExplorer onFileSelect={handleFileSelect} />
            </ResizablePanel>

            <div className="flex-1 min-w-0 bg-bg-secondary overflow-hidden" style={{ minWidth: 150 }}>
              <Sidebar />
            </div>

            <div className="w-10 flex-shrink-0 bg-bg-secondary border-l border-border-subtle flex flex-col items-center py-4 gap-4">
              <button
                onClick={handleExpandEditor}
                className="w-7 h-7 flex items-center justify-center rounded bg-bg-tertiary text-text-secondary hover:text-text hover:bg-hover transition-colors"
                title="Expand editor"
                aria-label="Expand editor"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4l-5 4 5 4" />
                </svg>
              </button>
              <div className="w-5 h-px bg-border" />
              <span className="text-xs text-text-muted writing-mode-vertical font-medium tracking-wide">Editor</span>
            </div>
          </>
        ) : (
          <>
            <ResizablePanel
              defaultWidth={explorerWidth}
              minWidth={150}
              maxWidth={400}
              onResize={setExplorerWidth}
              className="border-r border-border-subtle"
            >
              <FileExplorer onFileSelect={handleFileSelect} />
            </ResizablePanel>

            <ResizablePanel
              defaultWidth={sidebarWidth}
              minWidth={200}
              maxWidth={2000}
              onResize={handleSidebarResize}
              className="border-r border-border-subtle"
            >
              <Sidebar />
            </ResizablePanel>

            <main className="flex-1 flex flex-col min-w-0" ref={editorRef}>
              <CodeViewer className="flex-1" onCollapse={handleCollapseEditor} />
            </main>
          </>
        )}
      </div>

      <StatusBar isActive={isSessionActive} />
    </div>
  );
}

export default App;
