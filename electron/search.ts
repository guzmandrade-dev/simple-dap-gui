import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile } from 'child_process';

export interface FileSearchResult {
  path: string;
  score: number;
}

export interface ContentSearchResult {
  path: string;
  line: number;
  text: string;
}

export interface SearchIndex {
  root: string;
  files: string[];
  lastUpdated: number;
}

const IGNORED_DIRS = new Set([
  '.git', '.svn', '.hg', 'node_modules', 'vendor', 'dist', 'build', 'out',
  '.next', '.nuxt', 'coverage', '.cache', '.turbo', '.vscode', '.idea',
  '__pycache__', '.pytest_cache', 'target', 'Debug', 'Release', 'obj',
]);

const BINARY_EXTENSIONS = new Set([
  'exe', 'dll', 'so', 'dylib', 'bin', 'obj', 'o',
  'jpg', 'jpeg', 'png', 'gif', 'bmp', 'ico', 'svg', 'webp',
  'mp3', 'mp4', 'wav', 'avi', 'mov', 'mkv', 'webm',
  'zip', 'tar', 'gz', 'rar', '7z', 'bz2', 'xz',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'ttf', 'otf', 'woff', 'woff2', 'eot',
  'node', 'wasm',
]);

async function* walkDirectory(dirPath: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        yield* walkDirectory(fullPath);
      }
    } else if (entry.isFile()) {
      yield fullPath;
    }
  }
}

export async function indexFiles(rootPath: string): Promise<SearchIndex> {
  const files: string[] = [];
  for await (const filePath of walkDirectory(rootPath)) {
    files.push(filePath);
  }
  return {
    root: rootPath,
    files,
    lastUpdated: Date.now(),
  };
}

export async function searchFileNames(
  index: SearchIndex,
  query: string
): Promise<FileSearchResult[]> {
  if (!query.trim()) {
    return index.files.slice(0, 200).map(filePath => ({ path: filePath, score: 0 }));
  }

  const { default: fuzzysort } = await import('fuzzysort');
  const results = fuzzysort.go(query, index.files, {
    threshold: -10000,
    limit: 100,
  });

  return results.map(result => ({
    path: result.target,
    score: result.score,
  }));
}

function toAbsolutePath(rootPath: string, filePath: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.join(rootPath, filePath);
}

export async function searchFileContent(
  rootPath: string,
  query: string,
  options: { caseSensitive?: boolean; regex?: boolean; globs?: string[] } = {}
): Promise<ContentSearchResult[]> {
  if (!query.trim()) {
    return [];
  }

  const rgPath = await getRipgrepPath();
  if (rgPath) {
    return runRipgrepSearch(rgPath, rootPath, query, options);
  }

  // Fall back to a pure-JS search so the app works without ripgrep installed.
  return runJsContentSearch(rootPath, query, options);
}

function buildRipgrepArgs(
  query: string,
  options: { caseSensitive?: boolean; regex?: boolean; globs?: string[] }
): string[] {
  const args: string[] = ['--json', '-n', '--max-columns=200'];

  if (!options.caseSensitive) {
    args.push('-i');
  }

  if (options.regex) {
    args.push('-e', query);
  } else {
    args.push('-F', query);
  }

  if (options.globs && options.globs.length > 0) {
    for (const glob of options.globs) {
      args.push('-g', glob);
    }
  }

  // Exclude common binary/ignored directories
  for (const dir of IGNORED_DIRS) {
    args.push('-g', `!${dir}/`);
  }

  // Always add the search path explicitly to avoid rg hanging on Windows
  args.push('.');

  return args;
}

interface RipgrepMatch {
  path: string;
  line: number;
  text: string;
}

async function runRipgrepSearch(
  rgPath: string,
  rootPath: string,
  query: string,
  options: { caseSensitive?: boolean; regex?: boolean; globs?: string[] }
): Promise<ContentSearchResult[]> {
  const args = buildRipgrepArgs(query, options);
  return new Promise((resolve, reject) => {
    execFile(rgPath, args, { cwd: rootPath, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error && error.code !== 1) {
        reject(new Error(`ripgrep failed: ${stderr || error.message}`));
        return;
      }

      const matches: RipgrepMatch[] = [];
      if (!stdout) {
        resolve(matches);
        return;
      }

      for (const line of stdout.split('\n')) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'match' && parsed.data) {
            const data = parsed.data;
            const relativePath = data.path?.text || '';
            matches.push({
              path: toAbsolutePath(rootPath, relativePath),
              line: data.line_number || 0,
              text: (data.lines?.text || '').replace(/\r?\n$/, ''),
            });
          }
        } catch {
          // Ignore malformed JSON lines
        }
      }

      resolve(matches);
    });
  });
}

async function runJsContentSearch(
  rootPath: string,
  query: string,
  options: { caseSensitive?: boolean; regex?: boolean; globs?: string[] }
): Promise<ContentSearchResult[]> {
  const results: ContentSearchResult[] = [];
  const maxResults = 200;
  const maxFileSize = 2 * 1024 * 1024; // 2 MB

  let pattern: RegExp;
  const flags = options.caseSensitive ? 'g' : 'gi';
  if (options.regex) {
    pattern = new RegExp(query, flags);
  } else {
    pattern = new RegExp(escapeRegex(query), flags);
  }

  const globs = options.globs && options.globs.length > 0 ? options.globs : undefined;

  for await (const filePath of walkDirectory(rootPath)) {
    if (results.length >= maxResults) break;
    if (!isTextFile(filePath)) continue;
    if (globs && !matchesAnyGlob(filePath, globs)) continue;

    try {
      const stats = await fs.stat(filePath);
      if (!stats.isFile() || stats.size > maxFileSize) continue;

      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split(/\r?\n/);

      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          results.push({
            path: filePath,
            line: i + 1,
            text: lines[i].slice(0, 200),
          });
          if (results.length >= maxResults) break;
        }
      }
    } catch {
      // Skip files we cannot read
    }
  }

  return results;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesAnyGlob(filePath: string, globs: string[]): boolean {
  const name = path.basename(filePath);
  return globs.some(glob => {
    const regex = new RegExp(
      '^' + glob.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    );
    return regex.test(name);
  });
}

function isTextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase().replace(/^\./, '');
  return !BINARY_EXTENSIONS.has(ext);
}

let cachedRipgrepPath: string | null | undefined;

async function getRipgrepPath(): Promise<string | null> {
  if (cachedRipgrepPath !== undefined) {
    return cachedRipgrepPath;
  }

  // Try PATH using Node's built-in execFile with 'rg --version'.
  const found = await findExecutableInPath('rg');
  if (found) {
    cachedRipgrepPath = found;
    return found;
  }

  // Try common install locations on Windows
  if (process.platform === 'win32') {
    const candidates = [
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages', 'BurntSushi.ripgrep.MSVC_Microsoft.Winget.Source_8wekyb3d8bbwe', 'ripgrep-13.0.0-x86_64-pc-windows-msvc', 'rg.exe'),
      path.join(process.env.ProgramFiles || '', 'ripgrep', 'rg.exe'),
      path.join(process.env['ProgramFiles(x86)'] || '', 'ripgrep', 'rg.exe'),
      'C:\\tools\\rg.exe',
    ];
    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        cachedRipgrepPath = candidate;
        return candidate;
      } catch {
        // continue
      }
    }
  }

  cachedRipgrepPath = null;
  return null;
}

function findExecutableInPath(command: string): Promise<string | null> {
  return new Promise((resolve) => {
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
    const shellFlag = process.platform === 'win32' ? '/c' : '-c';
    const checkCommand = process.platform === 'win32' ? `where ${command}` : `which ${command}`;

    execFile(shell, [shellFlag, checkCommand], { env: process.env }, (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve(null);
        return;
      }
      const first = stdout.trim().split(/\r?\n/)[0];
      resolve(first || null);
    });
  });
}
