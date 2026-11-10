import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CodeViewer } from './CodeViewer';
import { useDebugStore } from '../../stores/debugStore';
import { useEditorStore } from '../../stores/editorStore';

beforeEach(() => {
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    getAppSettings: vi.fn(async () => ({
      theme: 'dark',
      editorCommand: 'code',
      editorArgs: '{file}',
      persistentBreakpoints: false,
      globalLaunchConfigJson: '',
    })),
    onSettingsChanged: vi.fn(() => () => {}),
  };
  useDebugStore.setState({
    isSessionActive: true,
    isPaused: false,
    breakpoints: new Map(),
    currentSourceUnavailable: null,
    stackFrames: [],
  });
  useEditorStore.setState({
    currentFile: undefined,
    currentLine: undefined,
    openFiles: [],
    fileContents: new Map(),
    fileErrors: new Map(),
  });
});

describe('CodeViewer', () => {
  it('shows the empty state when no file is open', () => {
    render(<CodeViewer />);
    expect(screen.getByText(/No file open/i)).toBeTruthy();
  });

  it('shows an explanatory panel when stopped in a source that is not available locally', () => {
    useDebugStore.setState({
      isPaused: true,
      currentLine: 42,
      currentSourceUnavailable: { path: '/var/www/html/vendor/lib.php', sourceReference: 99 },
    });
    render(<CodeViewer />);
    expect(screen.getByText(/Source not available locally/i)).toBeTruthy();
    expect(screen.getByText(/\/var\/www\/html\/vendor\/lib\.php/)).toBeTruthy();
    expect(screen.getByText(/debug session is still active/i)).toBeTruthy();
    expect(screen.getByText(/Load source from debug adapter/i)).toBeTruthy();
  });

  it('renders adapter-provided (virtual) source as read-only with the current line', () => {
    useDebugStore.setState({
      isPaused: true,
      currentFile: 'dap://source/99/lib.php',
      currentLine: 2,
    });
    useEditorStore.setState({
      currentFile: 'dap://source/99/lib.php',
      currentLine: 2,
      openFiles: ['dap://source/99/lib.php'],
      fileContents: new Map([['dap://source/99/lib.php', '<?php\nvendor_code();\n']]),
    });
    const { container } = render(<CodeViewer />);
    expect(screen.getByText(/adapter source/i)).toBeTruthy();
    // Prism splits tokens into spans, so assert on the rendered text content
    expect(container.textContent).toContain('vendor_code();');
  });

  it('shows a file error panel when the file cannot be read', () => {
    useEditorStore.setState({
      currentFile: '/missing/file.php',
      openFiles: ['/missing/file.php'],
      fileContents: new Map(),
      fileErrors: new Map([['/missing/file.php', 'ENOENT: no such file or directory']]),
    });
    render(<CodeViewer />);
    expect(screen.getByText(/Unable to open file/i)).toBeTruthy();
    expect(screen.getByText(/ENOENT/)).toBeTruthy();
  });
});
