// Skan plików zmodyfikowanych wczoraj w katalogach BeeCommerce.
// Pomija node_modules, .next, .git, .turbo, dist, build.

import fs from 'node:fs/promises';
import path from 'node:path';
import { BEECOMMERCE_PATTERNS } from './beecommerce-filter';

export interface ChangedFile {
  path: string;
  repo: string | undefined;       // pierwsza nazwa katalogu pasująca do BEECOMMERCE_PATTERNS.repoNames
  mtime: string;                  // ISO
  sizeBytes: number;
}

const SKIP_DIRS = new Set([
  'node_modules', '.next', '.git', '.turbo', 'dist', 'build', 'coverage',
  '.cache', '.vercel', '.parcel-cache', 'out', 'tmp', '.DS_Store',
]);

const MAX_DEPTH = 8;
const HARD_FILE_LIMIT = 5_000;

function dayBoundsLocal(date: string): { start: number; end: number } {
  const [y, m, d] = date.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0).getTime();
  const end = new Date(y, m - 1, d + 1, 0, 0, 0).getTime();
  return { start, end };
}

export async function findChangedFiles(date: string): Promise<ChangedFile[]> {
  const { start, end } = dayBoundsLocal(date);
  const results: ChangedFile[] = [];

  for (const root of BEECOMMERCE_PATTERNS.pathPrefixes) {
    try {
      const stat = await fs.stat(root);
      if (!stat.isDirectory()) continue;
      await walk(root, 0, start, end, results);
    } catch {
      // Brak katalogu na tej maszynie.
    }
    if (results.length >= HARD_FILE_LIMIT) break;
  }

  return results.sort((a, b) => b.mtime.localeCompare(a.mtime));
}

async function walk(
  dir: string,
  depth: number,
  start: number,
  end: number,
  acc: ChangedFile[]
): Promise<void> {
  if (depth > MAX_DEPTH) return;
  if (acc.length >= HARD_FILE_LIMIT) return;

  let entries: { name: string; isDirectory: () => boolean; isFile: () => boolean }[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (acc.length >= HARD_FILE_LIMIT) return;
    if (SKIP_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith('.')) continue;

    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await walk(full, depth + 1, start, end, acc);
    } else if (entry.isFile()) {
      try {
        const stat = await fs.stat(full);
        if (stat.mtimeMs >= start && stat.mtimeMs < end) {
          acc.push({
            path: full,
            repo: matchedRepoName(full),
            mtime: new Date(stat.mtimeMs).toISOString(),
            sizeBytes: stat.size,
          });
        }
      } catch {
        // ignored — symlink, brak uprawnień itp.
      }
    }
  }
}

function matchedRepoName(filePath: string): string | undefined {
  const segments = filePath.split(path.sep).filter(Boolean);
  for (const seg of segments) {
    const lc = seg.toLowerCase();
    const matched = BEECOMMERCE_PATTERNS.repoNames.find((r) => r.toLowerCase() === lc);
    if (matched) return matched;
  }
  return undefined;
}
