// Path mapping utilities for converting between server and local paths
import * as path from 'path';

function getPathSeparator(): string {
  if (typeof process !== 'undefined' && process.platform) {
    return process.platform === 'win32' ? '\\' : '/';
  }
  return '/';
}

export interface VariableContext {
  userHome: string;
  workspaceFolder: string;
  workspaceFolderBasename: string;
  pathSeparator: string;
}

export function getDefaultVariableContext(workspaceRoot: string, userHome?: string): VariableContext {
  const workspaceFolder = workspaceRoot || (typeof process !== 'undefined' ? process.cwd() : '/');
  return {
    userHome: userHome ?? (typeof process !== 'undefined' ? (process.env.HOME || process.env.USERPROFILE || '') : ''),
    workspaceFolder,
    workspaceFolderBasename: workspaceFolder.split(/[\\/]/).filter(Boolean).pop() || '',
    pathSeparator: getPathSeparator(),
  };
}

export function resolveVariables(value: string, context: VariableContext): string {
  return value
    .replace(/\$\{userHome\}/g, context.userHome)
    .replace(/\$\{workspaceFolder\}/g, context.workspaceFolder)
    .replace(/\$\{workspaceFolderBasename\}/g, context.workspaceFolderBasename)
    .replace(/\$\{pathSeparator\}/g, context.pathSeparator);
}

export function resolvePathMappings(
  serverPath: string,
  mappings: Record<string, string>,
  workspaceRoot: string,
  userHome?: string
): string {
  const context = getDefaultVariableContext(workspaceRoot, userHome);
  for (const [serverPrefix, localPrefix] of Object.entries(mappings)) {
    const resolvedServerPrefix = resolveVariables(serverPrefix, context);
    const resolvedLocal = resolveVariables(localPrefix, context);
    if (serverPath.startsWith(resolvedServerPrefix)) {
      return serverPath.replace(resolvedServerPrefix, resolvedLocal);
    }
  }
  return serverPath;
}

export function resolveLocalToServerPath(
  localPath: string,
  mappings: Record<string, string>,
  workspaceRoot: string,
  userHome?: string
): string {
  const context = getDefaultVariableContext(workspaceRoot, userHome);
  for (const [serverPrefix, localPrefix] of Object.entries(mappings)) {
    const resolvedServerPrefix = resolveVariables(serverPrefix, context);
    const resolvedLocal = resolveVariables(localPrefix, context);
    if (localPath.startsWith(resolvedLocal)) {
      return localPath.replace(resolvedLocal, resolvedServerPrefix);
    }
  }
  return localPath;
}

export function normalizePath(path: string): string {
  // Normalize path separators to forward slashes
  return path.replace(/\\/g, '/');
}

export function getFileName(path: string): string {
  const normalized = normalizePath(path);
  const parts = normalized.split('/');
  return parts[parts.length - 1] || '';
}

export function getDirectory(path: string): string {
  const normalized = normalizePath(path);
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash > 0 ? normalized.substring(0, lastSlash) : '';
}

export function isAbsolutePath(path: string): boolean {
  if (path.startsWith('/')) return true;
  if (/^[a-zA-Z]:/.test(path)) return true; // Windows drive letter
  return false;
}

export function isPathInside(parent: string, child: string): boolean {
  const normalizedParent = normalizePath(path.resolve(parent));
  const normalizedChild = normalizePath(path.resolve(child));
  if (normalizedParent === normalizedChild) return true;
  const prefix = normalizedParent.endsWith('/') ? normalizedParent : normalizedParent + '/';
  return normalizedChild.startsWith(prefix);
}
