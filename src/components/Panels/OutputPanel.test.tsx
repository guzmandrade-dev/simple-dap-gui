import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OutputPanel } from './OutputPanel';
import { useDebugStore } from '../../stores/debugStore';

beforeEach(() => {
  (window as unknown as { electronAPI: unknown }).electronAPI = undefined;
  useDebugStore.setState({
    isSessionActive: true,
    isPaused: false,
    output: [],
  });
});

describe('OutputPanel', () => {
  it('shows an empty state when there is no output', () => {
    render(<OutputPanel />);
    expect(screen.getByText(/No output yet/i)).toBeTruthy();
  });

  it('renders console output entries', () => {
    useDebugStore.setState({
      output: [
        { text: 'hello world\n', category: 'stdout' },
        { text: 'something failed\n', category: 'stderr' },
      ],
    });
    render(<OutputPanel />);
    expect(screen.getByText(/hello world/)).toBeTruthy();
    expect(screen.getByText(/something failed/)).toBeTruthy();
  });

  it('clears the console via the clear button', () => {
    useDebugStore.setState({ output: [{ text: 'x', category: 'stdout' }] });
    render(<OutputPanel />);
    fireEvent.click(screen.getByLabelText('Clear console'));
    expect(useDebugStore.getState().output).toEqual([]);
  });

  it('shows a session hint when no session is active and console is empty', () => {
    useDebugStore.setState({ isSessionActive: false, output: [] });
    render(<OutputPanel />);
    expect(screen.getByText(/No active debug session/i)).toBeTruthy();
  });
});
