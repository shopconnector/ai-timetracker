// Skan ~/.claude/plans/*.md i wyciągnięcie planów z mtime w wybranym dniu.

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export interface PlanFile {
  path: string;
  fileName: string;
  title: string;          // pierwsza linia '# ...'
  mtime: string;          // ISO
  sizeBytes: number;
  excerpt: string;        // pierwsze ~400 znaków bez nagłówka — do filtra BC i preview
  fullContent?: string;   // pełna treść (do skanu słów kluczowych); jeśli plik > 200KB, ucinamy
}

const PLANS_DIR = path.join(os.homedir(), '.claude', 'plans');
const MAX_BYTES_TO_READ = 200 * 1024; // 200 KB cap per plan

function dayBoundsLocal(date: string): { start: number; end: number } {
  // date = "YYYY-MM-DD" w czasie lokalnym (Europe/Warsaw na maszynie usera)
  const [y, m, d] = date.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0).getTime();
  const end = new Date(y, m - 1, d + 1, 0, 0, 0).getTime();
  return { start, end };
}

export async function scanPlans(date: string): Promise<PlanFile[]> {
  const { start, end } = dayBoundsLocal(date);

  let entries: string[];
  try {
    entries = await fs.readdir(PLANS_DIR);
  } catch {
    return [];
  }

  const mdFiles = entries.filter((f) => f.endsWith('.md'));

  const results = await Promise.all(
    mdFiles.map(async (fileName) => {
      const fullPath = path.join(PLANS_DIR, fileName);
      try {
        const stat = await fs.stat(fullPath);
        const mtimeMs = stat.mtimeMs;
        if (mtimeMs < start || mtimeMs >= end) return null;

        // Czytaj z capem
        const content = await readCapped(fullPath, MAX_BYTES_TO_READ);
        const title = extractTitle(content) || fileName.replace(/\.md$/, '');
        const excerpt = makeExcerpt(content);

        return {
          path: fullPath,
          fileName,
          title,
          mtime: new Date(mtimeMs).toISOString(),
          sizeBytes: stat.size,
          excerpt,
          fullContent: content,
        } as PlanFile;
      } catch {
        return null;
      }
    })
  );

  return results.filter((r): r is PlanFile => r !== null).sort((a, b) => a.mtime.localeCompare(b.mtime));
}

async function readCapped(filePath: string, capBytes: number): Promise<string> {
  const fh = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(capBytes);
    const { bytesRead } = await fh.read(buf, 0, capBytes, 0);
    return buf.subarray(0, bytesRead).toString('utf8');
  } finally {
    await fh.close();
  }
}

function extractTitle(content: string): string | null {
  const m = content.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1].trim() : null;
}

function makeExcerpt(content: string): string {
  const noHeader = content.replace(/^#\s+.*$/m, '').trim();
  return noHeader.slice(0, 400).replace(/\s+/g, ' ');
}
