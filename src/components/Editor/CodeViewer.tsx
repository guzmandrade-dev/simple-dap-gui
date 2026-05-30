import Editor, { OnMount } from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { useDebugStore } from '../../stores/debugStore';
import { useConfigStore } from '../../stores/configStore';
import { getLanguageForFile, fetchFileContent } from '../../utils/fileLoader';

interface Settings {
  editorCommand: string;
  editorArgs: string;
}

const DEFAULT_SETTINGS: Settings = {
  editorCommand: 'code',
  editorArgs: '{file}:{line}',
};

interface CodeViewerProps {
  className?: string;
}

export function CodeViewer({ className }: CodeViewerProps) {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);
  const breakpointsRef = useRef<Map<string, Set<number>>>(new Map());
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  
  const { currentFile, fileContents } = useEditorStore();
  const { 
    currentLine, 
    isPaused, 
    breakpoints, 
    setBreakpoint, 
    removeBreakpoint 
  } = useDebugStore();
  const { theme } = useConfigStore();

  // Keep breakpoints ref up to date so the editor mount handler always sees the latest
  breakpointsRef.current = breakpoints;

  useEffect(() => {
    const saved = localStorage.getItem('dapdesk-settings');
    if (saved) {
      try {
        setSettings(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
    }
  }, []);

  const openInEditor = async () => {
    if (!currentFile) return;
    
    const line = currentLine || 1;
    const args = settings.editorArgs
      .replace('{file}', currentFile)
      .replace('{line}', line.toString());
    
    try {
      await window.electronAPI?.execCommand?.(`${settings.editorCommand} ${args}`);
    } catch (err) {
      console.error('Failed to open editor:', err);
      alert(`Failed to open ${settings.editorCommand}. Make sure it's installed and in your PATH.`);
    }
  };

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.onMouseDown((e: any) => {
      const targetType = e.target.type;
      
      // Check if click is in gutter area
      const isGutter = 
        targetType === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
        targetType === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS;
      
      // Check if click is directly on a breakpoint glyph decoration
      // (Monaco may report a different target type when clicking on custom decorations)
      let isBreakpointElement = false;
      let el = e.target.element;
      const editorDomNode = editor.getDomNode();
      while (el && el !== editorDomNode) {
        if (el.classList?.contains('breakpoint-glyph')) {
          isBreakpointElement = true;
          break;
        }
        el = el.parentElement;
      }
      
      if (isGutter || isBreakpointElement) {
        const line = e.target.position?.lineNumber;
        if (!line || !currentFile) return;
        
        const fileBPs = breakpointsRef.current.get(currentFile) || new Set();
        const hasBP = fileBPs.has(line);
        
        if (hasBP) {
          removeBreakpoint(currentFile, line);
        } else {
          setBreakpoint(currentFile, line);
        }
      }
    });
  };

  useEffect(() => {
    if (!currentFile) return;
    
    const loadFile = async () => {
      try {
        const content = await fetchFileContent(currentFile);
        useEditorStore.setState((state) => ({
          fileContents: new Map(state.fileContents).set(currentFile, content)
        }));
      } catch (err) {
        console.error('Failed to load file:', err);
      }
    };
    
    if (!fileContents.has(currentFile)) {
      loadFile();
    }
  }, [currentFile]);

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current || !currentFile) return;
    
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    const model = editor.getModel();
    
    if (!model) return;

    if (decorationsRef.current.length > 0) {
      editor.deltaDecorations(decorationsRef.current, []);
    }

    const newDecorations: any[] = [];
    
    const fileBPs = breakpoints.get(currentFile) || new Set();
    fileBPs.forEach(line => {
      newDecorations.push({
        range: new monaco.Range(line, 1, line, 1),
        options: {
          glyphMarginClassName: 'breakpoint-glyph',
          overviewRuler: { color: '#dc2626', position: 1 },
          minimap: { color: '#dc2626', position: 1 },
        }
      });
    });
    
    if (isPaused && currentLine) {
      newDecorations.push({
        range: new monaco.Range(currentLine, 1, currentLine, 1),
        options: {
          isWholeLine: true,
          className: 'current-line-highlight',
          glyphMarginClassName: 'breakpoint-glyph current-line-glyph',
        }
      });
      
      editor.revealLineInCenter(currentLine);
    }

    decorationsRef.current = editor.deltaDecorations([], newDecorations);
  }, [currentFile, currentLine, breakpoints, isPaused]);

  const content = currentFile ? fileContents.get(currentFile) || '' : '';
  const language = currentFile ? getLanguageForFile(currentFile) : 'plaintext';
  const fileName = currentFile ? currentFile.split('/').pop() : '';

  if (!currentFile) {
    return (
      <div className={`${className} flex items-center justify-center bg-surface text-muted`}>
        <div className="text-center">
          <div className="text-4xl mb-2">📁</div>
          <div>No file open</div>
          <div className="text-sm mt-2">Open a file from the explorer to view code</div>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="h-full flex flex-col">
        <div className="h-9 bg-panel border-b border-border flex items-center justify-between px-3 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-secondary text-sm truncate" title={currentFile}>
              {fileName}
            </span>
            {currentLine && (
              <span className="text-xs text-muted">
                :{currentLine}
              </span>
            )}
          </div>
          
          <button
            onClick={openInEditor}
            className="flex items-center gap-1.5 px-2 py-1 text-xs bg-elevated text-secondary"
            title={`Open in ${settings.editorCommand}`}
          >
            <span>📝</span>
            <span>Open in Editor</span>
          </button>
        </div>
        
        <div className="flex-1">
          <Editor
            height="100%"
            theme={theme === 'light' ? 'vs' : 'vs-dark'}
            path={currentFile}
            value={content}
            language={language}
            options={{
              readOnly: true,
              glyphMargin: true,
              lineNumbers: 'on',
              folding: true,
              minimap: { enabled: true },
              automaticLayout: true,
            }}
            onMount={handleEditorMount}
          />
        </div>
      </div>
    </div>
  );
}
