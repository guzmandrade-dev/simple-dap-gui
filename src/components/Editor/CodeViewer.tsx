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
import { isVirtualSourcePath } from '../../utils/debugNavigation';

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

  const { currentFile, currentLine, fileContents, fileErrors, reloadFile, setCurrentLine } = useEditorStore();
  const {
    isPaused,
    breakpoints,
    setBreakpoint,
    removeBreakpoint,
    currentSourceUnavailable,
    fetchAndOpenAdapterSource,
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

  // Load file content for files that are selected but not yet in memory
  // (e.g. opened before this mount, or read races). Errors are tracked in the
  // editor store so both explorer-opened and debug-opened files show them.
  useEffect(() => {
    if (!currentFile || isVirtualSourcePath(currentFile)) return;
    if (!fileContents.has(currentFile) && !fileErrors.has(currentFile)) {
      fetchFileContent(currentFile)
        .then((content) => {
          useEditorStore.setState((state) => ({
            fileContents: new Map(state.fileContents).set(currentFile, content),
          }));
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          console.error('Failed to load file:', err);
          useEditorStore.setState((state) => ({
            fileErrors: new Map(state.fileErrors).set(currentFile, message),
          }));
        });
    }
  }, [currentFile, fileContents, fileErrors]);

  const fileError = currentFile ? fileErrors.get(currentFile) ?? null : null;
  const isVirtual = currentFile ? isVirtualSourcePath(currentFile) : false;

  const rawContent = currentFile ? fileContents.get(currentFile) || '' : '';
  // Strip Windows \r so lines don't end with carriage returns
  const content = rawContent.replace(/\r/g, '');
  const lines = useMemo(() => content.split('\n'), [content]);
  const fileBPs = currentFile ? breakpoints.get(currentFile) : undefined;
  const prismLang = useMemo(() => (currentFile ? getPrismLanguage(currentFile) : null), [currentFile]);

  // Memoize syntax highlighting: Prism.highlight per line is expensive and
  // must not re-run on every render (any store update re-renders this view).
  const isTruncated = lines.length > MAX_RENDER_LINES;
  const visibleLines = useMemo(
    () => (isTruncated ? lines.slice(0, MAX_RENDER_LINES) : lines),
    [lines, isTruncated]
  );
  const highlightedLines = useMemo(
    () => visibleLines.map((line) => highlightLine(line, prismLang)),
    [visibleLines, prismLang]
  );

  const toggleBreakpoint = useCallback((line: number) => {
    if (!currentFile || isVirtual) return; // adapter-provided source is read-only
    if (fileBPs?.has(line)) {
      removeBreakpoint(currentFile, line);
    } else {
      setBreakpoint(currentFile, line);
    }
  }, [currentFile, isVirtual, fileBPs, setBreakpoint, removeBreakpoint]);

  // Scroll current line into view only when it comes from an external jump
  // (e.g. search result or debug stop), not from a user click inside the viewer.
  const lastJumpedLineRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!currentLine || !scrollRef.current) return;
    if (currentLine < 1 || currentLine > lines.length) return;
    if (lastJumpedLineRef.current === currentLine) return;
    lastJumpedLineRef.current = currentLine;
    const lineHeight = 20;
    const targetScroll = (currentLine - 1) * lineHeight - scrollRef.current.clientHeight / 2 + lineHeight / 2;
    // jsdom (tests) does not implement scrollTo
    if (typeof scrollRef.current.scrollTo === 'function') {
      scrollRef.current.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
    }
  }, [currentLine, lines.length]);

  const fileName = currentFile ? currentFile.split(/[\\/]/).pop() : '';

  // The debugger stopped somewhere whose source is not a local file (e.g. a
  // file outside the project or on a remote server). Keep the session alive
  // and explain instead of breaking.
  if (isPaused && currentSourceUnavailable) {
    const info = currentSourceUnavailable;
    const displayName = info.name || info.path?.split(/[\\/]/).pop() || 'Unknown source';
    return (
      <div className={`${className} flex flex-col h-full`}>
        <div className="h-9 bg-bg-secondary border-b border-border-subtle flex items-center justify-between px-3 flex-shrink-0">
          <span className="text-text-secondary text-sm truncate" title={info.path || info.name}>
            {displayName}
            {currentLine ? <span className="text-text-muted">:{currentLine}</span> : null}
          </span>
          <span className="text-xs text-warning font-medium">source unavailable</span>
        </div>
        <div className="flex-1 flex items-center justify-center bg-bg p-6 overflow-auto">
          <div className="max-w-lg w-full bg-bg-secondary border border-border-subtle rounded p-4">
            <div className="flex items-center gap-2 text-warning mb-2">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 1.5L15 14H1L8 1.5z" />
                <path d="M8 6v4" />
                <path d="M8 12.5h.01" />
              </svg>
              <span className="font-medium">Source not available locally</span>
            </div>
            <p className="text-sm text-text-secondary mb-3">
              The debugger stopped in a file that is not part of the open workspace and cannot be read
              from disk. The debug session is still active — use Continue or the step controls to keep going.
            </p>
            {(info.path || info.name) && (
              <code className="block text-xs font-mono bg-bg-tertiary p-2 rounded break-all text-text mb-3">
                {info.path || info.name}
              </code>
            )}
            {info.error && (
              <p className="text-xs text-text-muted whitespace-pre-wrap mb-3">{info.error}</p>
            )}
            {info.sourceReference !== undefined && (
              <button
                onClick={() => fetchAndOpenAdapterSource(info.sourceReference!, info.name, currentLine, info.path)}
                className="btn btn-primary text-xs"
              >
                Load source from debug adapter
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!currentFile) {
    return (
      <div className={`${className} flex items-center justify-center bg-bg text-text-muted`}>
        <div className="text-center">
          <svg className="mx-auto mb-3 text-text-muted" width="40" height="40" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6l-4-4z" />
            <path d="M9 2v4h4" />
            <path d="M5.5 9l1.5 1.5L9.5 8" />
          </svg>
          <div className="text-base mb-1 text-text-secondary">No file open</div>
          <div className="text-sm">Open a file from the explorer to view code</div>
        </div>
      </div>
    );
  }

  if (fileError) {
    return (
      <div className={`${className} flex flex-col h-full`}>
        <div className="h-9 bg-bg-secondary border-b border-border-subtle flex items-center justify-between px-3 flex-shrink-0">
          <span className="text-text-secondary text-sm truncate" title={currentFile}>
            {fileName}
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center bg-bg p-6 overflow-auto">
          <div className="max-w-lg w-full bg-bg-secondary border border-border-subtle rounded p-4">
            <div className="flex items-center gap-2 text-danger mb-2">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="6" />
                <path d="M8 5v3" />
                <path d="M8 11h.01" />
              </svg>
              <span className="font-medium">Unable to open file</span>
            </div>
            <p className="text-sm text-text-secondary mb-3">
              This file cannot be read from disk:
            </p>
            <code className="block text-xs font-mono bg-bg-tertiary p-2 rounded break-all text-text mb-3">
              {currentFile}
            </code>
            <p className="text-xs text-text-muted whitespace-pre-wrap">
              {fileError}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className} h-full flex flex-col`}>
      <div className="h-9 bg-bg-secondary border-b border-border-subtle flex items-center justify-between px-3 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {!isVirtual && (
            <>
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
            </>
          )}
          <span className="text-text-secondary text-sm truncate" title={currentFile}>
            {fileName}
          </span>
          {isVirtual && (
            <span className="text-xs text-warning bg-current-line px-1.5 py-0.5 rounded" title="This source was provided by the debug adapter and is read-only">
              adapter source · read-only
            </span>
          )}
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
              const isCurrent = currentLine === lineNum;
              const isDebugCurrent = isCurrent && isPaused;
              return (
                <div
                  key={`gutter-${lineNum}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleBreakpoint(lineNum);
                  }}
                  className={`
                    px-2 ${isVirtual ? 'cursor-default' : 'cursor-pointer'} flex items-center justify-end gap-1
                    ${isDebugCurrent ? 'bg-current-line text-warning' : ''}
                    ${isCurrent && !isDebugCurrent ? 'bg-current-line-accent text-success font-semibold' : ''}
                    ${!isCurrent ? 'text-text-muted hover:text-text hover:bg-bg-tertiary' : ''}
                  `}
                  style={{ height: '20px' }}
                  title={isVirtual ? 'Breakpoints are not supported in adapter-provided source' : hasBP ? 'Remove breakpoint' : 'Add breakpoint'}
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
            {visibleLines.map((_, i) => {
              const lineNum = i + 1;
              const isCurrent = currentLine === lineNum;
              const isDebugCurrent = isCurrent && isPaused;
              const highlighted = highlightedLines[i];

              return (
                <div
                  key={`line-${lineNum}`}
                  onClick={() => {
                    lastJumpedLineRef.current = currentLine;
                    setCurrentLine(lineNum);
                  }}
                  className={`
                    px-3 whitespace-pre cursor-text
                    ${isDebugCurrent ? 'bg-current-line border-l-2 border-warning' : ''}
                    ${isCurrent && !isDebugCurrent ? 'bg-current-line-accent border-l-2 border-success/60' : ''}
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
