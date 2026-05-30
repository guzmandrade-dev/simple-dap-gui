import { useEffect, useState } from 'react';
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

function App() {
  const { initialize, isSessionActive } = useDebugStore();
  const { loadConfigs, setWorkspaceRoot, loadTheme } = useConfigStore();
  const { openFile } = useEditorStore();
  const [explorerWidth, setExplorerWidth] = useState(250);
  const [sidebarWidth, setSidebarWidth] = useState(280);

  useEffect(() => {
    initialize();
    loadConfigs();
    loadTheme();

    // Listen for folder opened events from main process
    const unsubscribeFolder = window.electronAPI?.onFolderOpened((path: string) => {
      console.log('Folder opened:', path);
      try {
        setWorkspaceRoot(path);
        loadConfigs(); // Reload configs from new workspace
      } catch (err) {
        console.error('Error handling folder opened:', err);
      }
    });

    // Listen for workspace changed events
    const unsubscribeWorkspace = window.electronAPI?.onWorkspaceChanged((path: string) => {
      console.log('Workspace changed:', path);
      try {
        setWorkspaceRoot(path);
        loadConfigs();
      } catch (err) {
        console.error('Error handling workspace changed:', err);
      }
    });

    return () => {
      unsubscribeFolder?.();
      unsubscribeWorkspace?.();
    };
  }, []);

  const handleFileSelect = (path: string) => {
    openFile(path);
  };

  return (
    <div className="flex flex-col h-screen bg-surface text-text overflow-hidden">
      <TitleBar />
      
      <Toolbar />
      
      <div className="flex flex-1 overflow-hidden">
        <ResizablePanel 
          defaultWidth={explorerWidth}
          minWidth={150}
          maxWidth={400}
          onResize={setExplorerWidth}
        >
          <FileExplorer onFileSelect={handleFileSelect} />
        </ResizablePanel>
        
        <ResizablePanel 
          defaultWidth={sidebarWidth}
          minWidth={200}
          maxWidth={500}
          onResize={setSidebarWidth}
        >
          <Sidebar />
        </ResizablePanel>
        
        <main className="flex-1 flex flex-col min-w-0">
          <CodeViewer className="flex-1" />
        </main>
      </div>
      
      <StatusBar isActive={isSessionActive} />
    </div>
  );
}

export default App;
