import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { indexFiles, searchFileNames, runJsContentSearch, IGNORED_DIRS } from './search';

let root: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'dap-search-test-'));
  fs.mkdirSync(path.join(root, 'src', 'components'), { recursive: true });
  fs.mkdirSync(path.join(root, 'node_modules', 'dep'), { recursive: true });
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'index.php'), "<?php echo 'hello';\n");
  fs.writeFileSync(path.join(root, 'src', 'components', 'App.tsx'), "export const App = () => null; // Hello World\n");
  fs.writeFileSync(path.join(root, 'README.md'), '# Test\nHELLO again\n');
  fs.writeFileSync(path.join(root, 'node_modules', 'dep', 'index.js'), 'module.exports = 1; // hello\n');
  fs.writeFileSync(path.join(root, '.git', 'HEAD'), 'ref: hello\n');
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('indexFiles', () => {
  it('indexes files but skips ignored directories', async () => {
    const index = await indexFiles(root);
    const rel = index.files.map(f => path.relative(root, f));
    expect(rel).toContain(path.join('src', 'index.php'));
    expect(rel).toContain(path.join('README.md'));
    expect(rel.some(f => f.includes('node_modules'))).toBe(false);
    expect(rel.some(f => f.includes('.git'))).toBe(false);
  });

  it('exposes the ignore list', () => {
    expect(IGNORED_DIRS.has('node_modules')).toBe(true);
    expect(IGNORED_DIRS.has('.git')).toBe(true);
  });
});

describe('searchFileNames', () => {
  it('returns the first files for an empty query', async () => {
    const index = await indexFiles(root);
    const results = await searchFileNames(index, '');
    expect(results.length).toBeGreaterThan(0);
    expect(path.isAbsolute(results[0].path)).toBe(true);
  });

  it('matches on relative paths and returns absolute paths', async () => {
    const index = await indexFiles(root);
    const results = await searchFileNames(index, 'app.tsx');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].path).toBe(path.join(root, 'src', 'components', 'App.tsx'));
  });

  it('does not match files inside ignored directories', async () => {
    const index = await indexFiles(root);
    const results = await searchFileNames(index, 'dep/index');
    expect(results.length).toBe(0);
  });
});

describe('runJsContentSearch', () => {
  it('finds fixed-string matches with line numbers', async () => {
    const results = await runJsContentSearch(root, 'hello');
    const rel = results.map(r => path.relative(root, r.path));
    expect(rel).toContain(path.join('src', 'index.php'));
    expect(results.find(r => r.path.endsWith('index.php'))?.line).toBe(1);
  });

  it('is case-insensitive by default and case-sensitive on request', async () => {
    const insensitive = await runJsContentSearch(root, 'HELLO');
    expect(insensitive.length).toBeGreaterThan(0);
    const sensitive = await runJsContentSearch(root, 'HELLO', { caseSensitive: true });
    expect(sensitive.length).toBeGreaterThan(0);
    const sensitiveLower = await runJsContentSearch(root, 'hello', { caseSensitive: true });
    // 'hello' lowercase appears in index.php and node_modules (excluded) — README has HELLO only
    const relSensitive = sensitiveLower.map(r => path.relative(root, r.path));
    expect(relSensitive).toContain(path.join('src', 'index.php'));
    expect(relSensitive).not.toContain('README.md');
  });

  it('supports regular expressions', async () => {
    const results = await runJsContentSearch(root, "echo '.*'", { regex: true });
    expect(results.some(r => r.path.endsWith('index.php'))).toBe(true);
  });

  it('treats the query literally when regex is off', async () => {
    const results = await runJsContentSearch(root, "echo '.*'", { regex: false });
    expect(results.length).toBe(0);
  });

  it('filters by glob', async () => {
    const results = await runJsContentSearch(root, 'HELLO', { globs: ['*.md'] });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(r => r.path.endsWith('.md'))).toBe(true);
  });

  it('returns nothing for an empty query', async () => {
    expect(await runJsContentSearch(root, '   ')).toEqual([]);
  });
});
