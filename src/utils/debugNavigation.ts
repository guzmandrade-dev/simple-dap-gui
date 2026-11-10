// Decides how the UI should present the source of a stopped stack frame.
// A frame can point to a local file, to adapter-provided source (DAP
// `source` request, sourceReference > 0), or to nothing usable at all
// (e.g. native code). The debug session must stay alive in every case.

export type StopSource =
  | { kind: 'file'; path: string }
  | { kind: 'adapter'; sourceReference: number; name?: string; path?: string }
  | { kind: 'none'; name?: string; path?: string };

export interface StopSourceInput {
  path?: string;
  name?: string;
  sourceReference?: number;
  /** Whether the resolved local path exists on disk. */
  fileExists?: boolean;
}

export function classifyStopSource(input: StopSourceInput): StopSource {
  const path = input.path?.trim() || undefined;
  const name = input.name?.trim() || undefined;
  if (path && input.fileExists) {
    return { kind: 'file', path };
  }
  if (input.sourceReference !== undefined && input.sourceReference > 0) {
    return { kind: 'adapter', sourceReference: input.sourceReference, path, name };
  }
  return { kind: 'none', path, name };
}

/** Virtual (in-memory) file key used to display adapter-provided source. */
export function virtualSourceKey(sourceReference: number, name?: string): string {
  const safeName = (name || 'source').replace(/[^\w.-]/g, '_');
  return `dap://source/${sourceReference}/${safeName}`;
}

export function isVirtualSourcePath(path: string): boolean {
  return path.startsWith('dap://');
}

/** Maximum number of console output lines kept in memory. */
export const MAX_OUTPUT_LINES = 2000;
