import fuzzysort from 'fuzzysort';

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

export function fuzzySearchFiles(query: string, files: string[]): FileSearchResult[] {
  if (!query.trim()) {
    return files.slice(0, 200).map(path => ({ path, score: 0 }));
  }

  const results = fuzzysort.go(query, files, {
    threshold: -10000,
    limit: 100,
  });

  return results.map(result => ({
    path: result.target,
    score: result.score,
  }));
}
