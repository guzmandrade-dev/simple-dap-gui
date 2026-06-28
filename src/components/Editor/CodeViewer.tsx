import { useEffect, useRef, useState, useCallback, useMemo, Component, type ReactNode } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-markup-templating';
import 'prismjs/components/prism-php';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-markdown';
import { useEditorStore } from '../../stores/editorStore';
import { useDebugStore } from '../../stores/debugStore';
import { getLanguageForFile, fetchFileContent } from '../../utils/fileLoader';

interface Settings {
  editorCommand: string;
  editorArgs: string;
}

const DEFAULT_SETTINGS: Settings = {
  editorCommand: 'code',
  editorArgs: '{file}',
};

interface CodeViewerProps {
  className?: string;
  onCollapse?: () => void;
}

const prismLanguageMap: Record<string, string> = {
  php: 'php',
  javascript: 'javascript',
  typescript: 'typescript',
  json: 'json',
  xml: 'markup',
  html: 'markup',
  css: 'css',
  scss: 'css',
  markdown: 'markdown',
  sql: 'sql',
};

const MAX_RENDER_LINES = 10_000;

function quotePath(filePath: string): string {
  // Wrap paths in double quotes and escape any existing double quotes so
  // spaces and special characters don't break the shell command.
  return `"${filePath.replace(/"/g, '\\"')}"`;
}

function getPrismLanguage(filePath: string): string | null {
  const lang = getLanguageForFile(filePath);
  const mapped = prismLanguageMap[lang];
  if (!mapped) return null;
  const grammar = Prism.languages[mapped];
  return grammar ? mapped : null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function highlightLine(line: string, lang: string | null): string {
  if (!lang) return escapeHtml(line);
  try {
    const grammar = Prism.languages[lang];
    if (!grammar) return escapeHtml(line);
    return Prism.highlight(line, grammar, lang);
  } catch (e) {
    console.error('Prism highlight error:', e);
    return escapeHtml(line);
  }
}

// ── Error Boundary ──────────────────────────────────────────────

interface EBState {
  hasError: boolean;
  error?: Error;
}

class CodeViewerErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  EBState
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('CodeViewer crashed:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// ── Inner component ─────────────────────────────────────────────

function CodeViewerInner({ className, onCollapse }: CodeViewerProps) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { currentFile, fileContents, reloadFile } = useEditorStore();
  const {
    currentLine,
    isPaused,
    breakpoints,
    setBreakpoint,
    removeBreakpoint,
  } = useDebugStore();

  // Load settings
  useEffect(() => {
    const load = async () => {
      try {
        const appSettings = await window.electronAPI?.getAppSettings();
        if (appSettings) {
          setSettings({
            editorCommand: appSettings.editorCommand,
            editorArgs: appSettings.editorArgs,
          });
        }
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
    };
    load();

    const unsubscribe = window.electronAPI?.onSettingsChanged((appSettings) => {
      setSettings({
        editorCommand: appSettings.editorCommand,
        editorArgs: appSettings.editorArgs,
      });
    });
    return () => unsubscribe?.();
  }, []);

  const openInEditor = async () => {
    if (!currentFile) return;
    const line = currentLine || 1;
    const args = settings.editorArgs
      .replace('{file}', quotePath(currentFile))
      .replace('{line}', line.toString());
    try {
      await window.electronAPI?.execCommand?.(`${settings.editorCommand} ${args}`);
    } catch (err) {
      console.error('Failed to open editor:', err);
      alert(`Failed to open ${settings.editorCommand}. Make sure it's installed and in your PATH.`);
    }
  };

  // Load file content
  useEffect(() => {
    if (!currentFile) return;
    const loadFile = async () => {
      try {
        const content = await fetchFileContent(currentFile);
        useEditorStore.setState((state) => ({
          fileContents: new Map(state.fileContents).set(currentFile, content),
        }));
      } catch (err) {
        console.error('Failed to load file:', err);
      }
    };
    if (!fileContents.has(currentFile)) {
      loadFile();
    }
  }, [currentFile]);

  const rawContent = currentFile ? fileContents.get(currentFile) || '' : '';
  // Strip Windows \r so lines don't end with carriage returns
  const content = rawContent.replace(/\r/g, '');
  const lines = useMemo(() => content.split('\n'), [content]);
  const fileBPs = currentFile ? breakpoints.get(currentFile) : undefined;
  const prismLang = useMemo(() => (currentFile ? getPrismLanguage(currentFile) : null), [currentFile]);

  const toggleBreakpoint = useCallback((line: number) => {
    if (!currentFile) return;
    if (fileBPs?.has(line)) {
      removeBreakpoint(currentFile, line);
    } else {
      setBreakpoint(currentFile, line);
    }
  }, [currentFile, fileBPs, setBreakpoint, removeBreakpoint]);

  // Scroll current line into view
  useEffect(() => {
    if (!currentLine || !scrollRef.current) return;
    if (currentLine < 1 || currentLine > lines.length) return;
    // Calculate approximate scroll position instead of using refs
    const lineHeight = 20;
    const targetScroll = (currentLine - 1) * lineHeight - scrollRef.current.clientHeight / 2 + lineHeight / 2;
    scrollRef.current.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
  }, [currentLine, lines.length]);

  const fileName = currentFile ? currentFile.split(/[\\/]/).pop() : '';
  const isTruncated = lines.length > MAX_RENDER_LINES;
  const visibleLines = isTruncated ? lines.slice(0, MAX_RENDER_LINES) : lines;

  if (!currentFile) {
    return (
      <div className={`${className} flex items-center justify-center bg-bg text-text-muted`}>
        <div className="text-center">
          <div className="text-2xl mb-2 text-text-secondary">No file open</div>
          <div className="text-sm">Open a file from the explorer to view code</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className} h-full flex flex-col`}>
      <div className="h-9 bg-bg-secondary border-b border-border-subtle flex items-center justify-between px-3 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={openInEditor}
            className="btn btn-ghost text-xs shrink-0"
            title={`Open in ${settings.editorCommand}`}
          >
            <span>Open in Editor</span>
          </button>
          <button
            onClick={() => currentFile && reloadFile(currentFile)}
            className="btn btn-ghost text-xs shrink-0"
            title="Reload file from disk"
          >
            <span>Reload</span>
          </button>
          <span className="text-text-secondary text-sm truncate" title={currentFile}>
            {fileName}
          </span>
          {currentLine && <span className="text-xs text-text-muted">:{currentLine}</span>}
        </div>
        <button
          onClick={onCollapse}
          className="w-7 h-7 flex items-center justify-center rounded bg-bg-tertiary text-text-secondary hover:text-text hover:bg-hover transition-colors shrink-0"
          title="Collapse editor"
          aria-label="Collapse editor"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 4l5 4-5 4" />
          </svg>
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto min-h-0">
        <div className="flex font-mono text-[13px] leading-5">
          <div className="flex-shrink-0 select-none text-right bg-bg-secondary border-r border-border-subtle">
            {visibleLines.map((_, i) => {
              const lineNum = i + 1;
              const hasBP = fileBPs?.has(lineNum);
              const isCurrent = currentLine === lineNum && isPaused;
              return (
                <div
                  key={`gutter-${lineNum}`}
                  onClick={() => toggleBreakpoint(lineNum)}
                  className={`
                    px-2 cursor-pointer flex items-center justify-end gap-1
                    ${isCurrent ? 'bg-current-line text-warning' : 'text-text-muted hover:text-text hover:bg-bg-tertiary'}
                  `}
                  style={{ height: '20px' }}
                  title={hasBP ? 'Remove breakpoint' : 'Add breakpoint'}
                >
                  {hasBP && (
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-danger shrink-0" />
                  )}
                  <span className="w-6 text-right">{lineNum}</span>
                </div>
              );
            })}
          </div>

          <div className="flex-1 min-w-0">
            {visibleLines.map((line, i) => {
              const lineNum = i + 1;
              const isCurrent = currentLine === lineNum && isPaused;
              const highlighted = highlightLine(line, prismLang);

              return (
                <div
                  key={`line-${lineNum}`}
                  className={`
                    px-3 whitespace-pre
                    ${isCurrent ? 'bg-current-line border-l-2 border-warning' : ''}
                  `}
                  style={{ height: '20px' }}
                  dangerouslySetInnerHTML={{ __html: highlighted || '&nbsp;' }}
                />
              );
            })}
          </div>
        </div>

        {isTruncated && (
          <div className="p-4 text-center text-text-muted text-sm">
            File truncated — {lines.length.toLocaleString()} lines total.
            <br />
            Use "Open in Editor" to view the full file.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Exported wrapped component ──────────────────────────────────

export function CodeViewer(props: CodeViewerProps) {
  return (
    <CodeViewerErrorBoundary
      fallback={
        <div className={`${props.className} flex items-center justify-center bg-bg text-danger`}>
          <div className="text-center">
            <div className="text-lg font-medium mb-2">Viewer Error</div>
            <div className="text-sm text-text-secondary">The code viewer crashed. Check the DevTools console for details.</div>
          </div>
        </div>
      }
    >
      <CodeViewerInner {...props} />
    </CodeViewerErrorBoundary>
  );
}
