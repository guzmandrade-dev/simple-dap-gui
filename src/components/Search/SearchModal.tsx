import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { getFileName, normalizePath } from '../../utils/pathMapping';

interface SearchFileResult {
  path: string;
  score: number;
}

interface SearchContentResult {
  path: string;
  line: number;
  text: string;
}

type SearchMode = 'files' | 'content';

interface SearchModalProps {
  isOpen: boolean;
  initialMode?: 'files' | 'content';
  onClose: () => void;
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="5" />
      <path d="M11 11l3 3" />
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

function IconText({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h8M4 8h8M4 12h5" />
    </svg>
  );
}

function IconClose({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4l8 8M12 4L4 12" />
    </svg>
  );
}

export function SearchModal({ isOpen, initialMode = 'files', onClose }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>(initialMode);
  const [fileResults, setFileResults] = useState<SearchFileResult[]>([]);
  const [contentResults, setContentResults] = useState<SearchContentResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { openFile } = useEditorStore();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setFileResults([]);
      setContentResults([]);
      setError(null);
      setSelectedIndex(0);
      setMode(initialMode);
      // Focus on next tick so the modal is rendered
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, initialMode]);

  const performSearch = useCallback(async (searchQuery: string, searchMode: SearchMode) => {
    if (!searchQuery.trim()) {
      setFileResults([]);
      setContentResults([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (searchMode === 'files') {
        const response = await window.electronAPI?.searchFiles(searchQuery);
        if (response?.success && response.results) {
          setFileResults(response.results);
          setContentResults([]);
        } else {
          setError(response?.error || 'Search failed');
          setFileResults([]);
          setContentResults([]);
        }
      } else {
        const response = await window.electronAPI?.searchContent(searchQuery);
        if (response?.success && response.results) {
          setContentResults(response.results);
          setFileResults([]);
        } else {
          setError(response?.error || 'Search failed');
          setFileResults([]);
          setContentResults([]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setFileResults([]);
      setContentResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    setSelectedIndex(0);
    setIsLoading(true);
    debounceRef.current = setTimeout(() => {
      performSearch(query, mode);
    }, 200);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, mode, isOpen, performSearch]);

  const allResults = useMemo(() => {
    return mode === 'files'
      ? fileResults.map(r => ({ type: 'file' as const, ...r }))
      : contentResults.map(r => ({ type: 'content' as const, ...r }));
  }, [fileResults, contentResults, mode]);

  const handleSelect = useCallback((index: number) => {
    const result = allResults[index];
    if (!result) return;

    if (result.type === 'file') {
      openFile(result.path);
    } else {
      openFile(result.path, result.line);
    }
    onClose();
  }, [allResults, openFile, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (allResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % allResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + allResults.length) % allResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSelect(selectedIndex);
    }
  }, [allResults.length, handleSelect, onClose, selectedIndex]);

  useEffect(() => {
    const selectedEl = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement | null;
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-24 bg-black/40 dark:bg-black/60 backdrop-blur-sm">
      <div className="bg-panel border border-border shadow-2xl w-full max-w-2xl mx-4 rounded-xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border-subtle bg-elevated">
          <IconSearch className="text-text-secondary" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === 'files' ? 'Search files by name...' : 'Search file contents...'}
            className="flex-1 bg-transparent border-none outline-none text-text placeholder:text-text-muted text-base font-medium"
          />
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text p-1.5 rounded hover:bg-hover transition-colors"
            title="Close (Esc)"
            aria-label="Close search"
          >
            <IconClose />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border-subtle bg-panel">
          <button
            onClick={() => setMode('files')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              mode === 'files'
                ? 'bg-accent text-accent-text shadow-sm'
                : 'text-text-secondary hover:text-text hover:bg-elevated'
            }`}
          >
            <IconFile />
            <span>Files</span>
          </button>
          <button
            onClick={() => setMode('content')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              mode === 'content'
                ? 'bg-accent text-accent-text shadow-sm'
                : 'text-text-secondary hover:text-text hover:bg-elevated'
            }`}
          >
            <IconText />
            <span>Content</span>
          </button>
          <span className="ml-auto text-xs text-text-muted">
            {isLoading ? 'Searching...' : `${allResults.length} result${allResults.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {/* Results */}
        <div ref={listRef} className="flex-1 overflow-auto min-h-0 bg-panel">
          {error && (
            <div className="p-4 text-danger text-sm">
              {error}
            </div>
          )}

          {!error && allResults.length === 0 && !isLoading && query.trim() && (
            <div className="p-8 text-center text-text-secondary text-sm">
              No results found for <span className="text-text font-medium">"{query}"</span>
            </div>
          )}

          {!error && allResults.length === 0 && !query.trim() && (
            <div className="p-8 text-center text-text-secondary text-sm">
              Type to search {mode === 'files' ? 'files by name' : 'file contents'}
            </div>
          )}

          {allResults.map((result, index) => {
            const isSelected = index === selectedIndex;
            if (result.type === 'file') {
              const normalized = normalizePath(result.path);
              return (
                <div
                  key={`file-${result.path}`}
                  data-index={index}
                  onClick={() => handleSelect(index)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`px-4 py-2.5 cursor-pointer flex items-center gap-3 border-b border-border-subtle last:border-b-0 ${
                    isSelected ? 'bg-accent text-accent-text' : 'text-text hover:bg-hover'
                  }`}
                >
                  <IconFile className={isSelected ? 'text-accent-text' : 'text-text-secondary'} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate font-medium">{getFileName(result.path)}</div>
                    <div className={`text-xs truncate ${isSelected ? 'text-accent-text/90' : 'text-text-muted'}`}>
                      {normalized}
                    </div>
                  </div>
                </div>
              );
            }

            const normalized = normalizePath(result.path);
            return (
              <div
                key={`content-${result.path}-${result.line}-${index}`}
                data-index={index}
                onClick={() => handleSelect(index)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`px-4 py-2.5 cursor-pointer flex items-start gap-3 border-b border-border-subtle last:border-b-0 ${
                  isSelected ? 'bg-accent text-accent-text' : 'text-text hover:bg-hover'
                }`}
              >
                <IconText className={isSelected ? 'text-accent-text mt-0.5' : 'text-text-secondary mt-0.5'} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate font-medium">{getFileName(result.path)}:{result.line}</div>
                  <div className={`text-xs truncate font-mono ${isSelected ? 'text-accent-text/90' : 'text-text-secondary'}`}>
                    {result.text}
                  </div>
                  <div className={`text-xs truncate ${isSelected ? 'text-accent-text/80' : 'text-text-muted'}`}>
                    {normalized}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border-subtle bg-elevated text-xs text-text-muted flex items-center justify-between">
          <span>↑↓ to navigate · Enter to open · Esc to close</span>
          <span>Powered by fuzzysort / ripgrep</span>
        </div>
      </div>
    </div>
  );
}
