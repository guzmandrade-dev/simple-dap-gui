import { describe, it, expect } from 'vitest';
import * as path from 'path';
import {
  resolvePathMappings,
  resolveLocalToServerPath,
  normalizePath,
  getFileName,
  getDirectory,
  isAbsolutePath,
  isPathInside,
} from './pathMapping';

describe('resolvePathMappings', () => {
  it('maps a server path to a local path using workspaceFolder', () => {
    const result = resolvePathMappings(
      '/var/www/html/index.php',
      { '/var/www/html': '${workspaceFolder}' },
      '/home/user/project'
    );
    expect(result).toBe('/home/user/project/index.php');
  });

  it('maps a server path to an absolute local path', () => {
    const result = resolvePathMappings(
      '/server/app/src/main.php',
      { '/server/app': '/local/app' },
      '/home/user/project'
    );
    expect(result).toBe('/local/app/src/main.php');
  });

  it('returns the original path when no mapping matches', () => {
    const result = resolvePathMappings(
      '/other/path/file.php',
      { '/var/www/html': '${workspaceFolder}' },
      '/home/user/project'
    );
    expect(result).toBe('/other/path/file.php');
  });

  it('handles nested mappings by using the first match', () => {
    const result = resolvePathMappings(
      '/var/www/html/src/index.php',
      {
        '/var/www/html': '${workspaceFolder}',
        '/var/www/html/src': '${workspaceFolder}/source',
      },
      '/home/user/project'
    );
    // First match wins
    expect(result).toBe('/home/user/project/src/index.php');
  });

  it('replaces all occurrences of workspaceFolder', () => {
    const result = resolvePathMappings(
      '/app/index.php',
      { '/app': '${workspaceFolder}/${workspaceFolder}' },
      '/home/user'
    );
    expect(result).toBe('/home/user//home/user/index.php');
  });

  it('resolves userHome in server and local prefixes', () => {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const result = resolvePathMappings(
      '/server/home/index.php',
      { '/server/home': '${userHome}/project' },
      '/home/user/workspace'
    );
    expect(result).toBe(home.replace(/\\\\/g, '/') + '/project/index.php');
  });

  it('resolves workspaceFolderBasename in local prefix', () => {
    const result = resolvePathMappings(
      '/server/index.php',
      { '/server': '/tmp/${workspaceFolderBasename}' },
      '/home/user/my-project'
    );
    expect(result).toBe('/tmp/my-project/index.php');
  });

  it('resolves pathSeparator in local prefix', () => {
    const sep = path.sep;
    const result = resolvePathMappings(
      '/server/index.php',
      { '/server/': '${workspaceFolder}${pathSeparator}' },
      '/home/user/project'
    );
    expect(result).toBe('/home/user/project' + sep + 'index.php');
  });
});

describe('resolveLocalToServerPath', () => {
  it('maps a local path to a server path', () => {
    const result = resolveLocalToServerPath(
      '/home/user/project/index.php',
      { '/var/www/html': '${workspaceFolder}' },
      '/home/user/project'
    );
    expect(result).toBe('/var/www/html/index.php');
  });

  it('maps using an absolute local prefix', () => {
    const result = resolveLocalToServerPath(
      '/local/app/src/main.php',
      { '/server/app': '/local/app' },
      '/home/user/project'
    );
    expect(result).toBe('/server/app/src/main.php');
  });

  it('returns the original path when no reverse mapping matches', () => {
    const result = resolveLocalToServerPath(
      '/other/path/file.php',
      { '/var/www/html': '${workspaceFolder}' },
      '/home/user/project'
    );
    expect(result).toBe('/other/path/file.php');
  });
});

describe('normalizePath', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalizePath('C:\\Users\\file.php')).toBe('C:/Users/file.php');
  });

  it('leaves forward slashes unchanged', () => {
    expect(normalizePath('/usr/local/bin')).toBe('/usr/local/bin');
  });
});

describe('getFileName', () => {
  it('extracts the file name from a Unix path', () => {
    expect(getFileName('/var/www/html/index.php')).toBe('index.php');
  });

  it('extracts the file name from a Windows path', () => {
    expect(getFileName('C:\\\\Users\\\\file.php')).toBe('file.php');
  });

  it('returns empty string for a trailing slash', () => {
    expect(getFileName('/var/www/html/')).toBe('');
  });
});

describe('getDirectory', () => {
  it('extracts the directory from a Unix path', () => {
    expect(getDirectory('/var/www/html/index.php')).toBe('/var/www/html');
  });

  it('returns empty string for a root path', () => {
    expect(getDirectory('/file.php')).toBe('');
  });
});

describe('isAbsolutePath', () => {
  it('recognizes Unix absolute paths', () => {
    expect(isAbsolutePath('/var/www/html')).toBe(true);
  });

  it('recognizes Windows absolute paths', () => {
    expect(isAbsolutePath('C:\\\\Users')).toBe(true);
    expect(isAbsolutePath('D:/project')).toBe(true);
  });

  it('returns false for relative paths', () => {
    expect(isAbsolutePath('src/index.php')).toBe(false);
    expect(isAbsolutePath('./file.php')).toBe(false);
  });
});describe('isPathInside', () => {
  it('returns true for a path inside the parent', () => {
    expect(isPathInside('/home/user/project', '/home/user/project/src/index.php')).toBe(true);
  });

  it('returns true when paths are equal', () => {
    expect(isPathInside('/home/user/project', '/home/user/project')).toBe(true);
  });

  it('returns false for a path outside the parent', () => {
    expect(isPathInside('/home/user/project', '/home/other/file.php')).toBe(false);
  });

  it('handles Windows paths', () => {
    expect(isPathInside('C:/project', 'C:/project/src/index.php')).toBe(true);
    expect(isPathInside('C:/project', 'C:/other/file.php')).toBe(false);
  });
});
