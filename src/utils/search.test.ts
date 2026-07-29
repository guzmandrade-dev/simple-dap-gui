import { describe, it, expect } from 'vitest';
import { fuzzySearchFiles } from './search';

describe('fuzzySearchFiles', () => {
  const files = [
    '/project/src/components/App.tsx',
    '/project/src/utils/helpers.ts',
    '/project/src/index.ts',
    '/project/package.json',
    '/project/README.md',
  ];

  it('returns all files when query is empty', () => {
    const results = fuzzySearchFiles('', files);
    expect(results.length).toBe(files.length);
  });

  it('finds files by fuzzy matching', () => {
    const results = fuzzySearchFiles('aptsx', files);
    expect(results.some(r => r.path.endsWith('App.tsx'))).toBe(true);
  });

  it('limits results', () => {
    const manyFiles = Array.from({ length: 250 }, (_, i) => `/project/file${i}.ts`);
    const results = fuzzySearchFiles('file', manyFiles);
    expect(results.length).toBeLessThanOrEqual(100);
  });
});
