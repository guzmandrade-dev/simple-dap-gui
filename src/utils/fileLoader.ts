export async function fetchFileContent(path: string): Promise<string> {
  if (!window.electronAPI) {
    throw new Error('Electron API not available');
  }
  
  try {
    return await window.electronAPI.readFile(path);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to load file: ${path}\n${message}`);
  }
}

export async function checkFileExists(path: string): Promise<boolean> {
  if (!window.electronAPI) {
    return false;
  }
  
  try {
    return await window.electronAPI.fileExists(path);
  } catch {
    return false;
  }
}

export function getLanguageForFile(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    'php': 'php',
    'js': 'javascript',
    'ts': 'typescript',
    'jsx': 'javascript',
    'tsx': 'typescript',
    'py': 'python',
    'c': 'c',
    'cpp': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'java': 'java',
    'go': 'go',
    'rs': 'rust',
    'rb': 'ruby',
    'json': 'json',
    'xml': 'xml',
    'yaml': 'yaml',
    'yml': 'yaml',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'sass': 'scss',
    'md': 'markdown',
    'sh': 'shell',
    'bash': 'shell',
    'zsh': 'shell',
    'ps1': 'powershell',
    'sql': 'sql',
    'dockerfile': 'dockerfile',
  };
  return map[ext || ''] || 'plaintext';
}

export function isTextFile(path: string): boolean {
  const binaryExtensions = new Set([
    'exe', 'dll', 'so', 'dylib', 'bin', 'obj', 'o',
    'jpg', 'jpeg', 'png', 'gif', 'bmp', 'ico', 'svg',
    'mp3', 'mp4', 'wav', 'avi', 'mov', 'mkv',
    'zip', 'tar', 'gz', 'rar', '7z',
    'pdf', 'doc', 'docx', 'xls', 'xlsx',
  ]);
  
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return !binaryExtensions.has(ext);
}