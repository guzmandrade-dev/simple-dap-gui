import { describe, it, expect } from 'vitest';
import { classifyStopSource, virtualSourceKey, isVirtualSourcePath, MAX_OUTPUT_LINES } from './debugNavigation';

describe('classifyStopSource', () => {
  it('classifies an existing local file as file', () => {
    expect(classifyStopSource({ path: '/workspace/index.php', fileExists: true })).toEqual({
      kind: 'file',
      path: '/workspace/index.php',
    });
  });

  it('falls back to adapter source when the file does not exist locally but has a sourceReference', () => {
    expect(classifyStopSource({ path: '/var/www/html/index.php', sourceReference: 7, fileExists: false, name: 'index.php' })).toEqual({
      kind: 'adapter',
      sourceReference: 7,
      path: '/var/www/html/index.php',
      name: 'index.php',
    });
  });

  it('prefers the local file when it exists even if a sourceReference is present', () => {
    expect(classifyStopSource({ path: '/workspace/index.php', sourceReference: 7, fileExists: true })).toEqual({
      kind: 'file',
      path: '/workspace/index.php',
    });
  });

  it('classifies frames without any usable source as none', () => {
    expect(classifyStopSource({})).toEqual({ kind: 'none', path: undefined, name: undefined });
    expect(classifyStopSource({ path: '   ', fileExists: false })).toEqual({ kind: 'none', path: undefined, name: undefined });
    expect(classifyStopSource({ name: 'native code' })).toEqual({ kind: 'none', path: undefined, name: 'native code' });
  });

  it('treats sourceReference 0 as no adapter source', () => {
    expect(classifyStopSource({ sourceReference: 0, path: '/x.php', fileExists: false }).kind).toBe('none');
  });
});

describe('virtualSourceKey', () => {
  it('builds a stable dap:// key', () => {
    expect(virtualSourceKey(7, 'index.php')).toBe('dap://source/7/index.php');
  });

  it('sanitizes unsafe characters in names', () => {
    expect(virtualSourceKey(3, 'a/b\\c:d.php')).toBe('dap://source/3/a_b_c_d.php');
  });

  it('handles missing names', () => {
    expect(virtualSourceKey(3)).toBe('dap://source/3/source');
  });
});

describe('isVirtualSourcePath', () => {
  it('detects virtual paths', () => {
    expect(isVirtualSourcePath('dap://source/1/x.php')).toBe(true);
    expect(isVirtualSourcePath('/workspace/index.php')).toBe(false);
    expect(isVirtualSourcePath('C:\\project\\index.php')).toBe(false);
  });
});

describe('MAX_OUTPUT_LINES', () => {
  it('is a positive cap', () => {
    expect(MAX_OUTPUT_LINES).toBeGreaterThan(0);
  });
});
