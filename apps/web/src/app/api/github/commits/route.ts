import { NextResponse } from 'next/server';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const execAsync = promisify(exec);

const PROJECTS_ROOT = process.env.PROJECTS_ROOT || '/Users/gaca/projects/beecommerce';
const AUTHOR_FILTER = process.env.GIT_AUTHOR_FILTER || 'gaca';

interface Commit {
  repo: string;
  hash: string;
  shortHash: string;
  date: string;
  time: string;
  author: string;
  subject: string;
  remote?: string;
}

async function listRepos(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root);
    const repos: string[] = [];
    for (const e of entries) {
      if (e.startsWith('.') || e.startsWith('_')) continue;
      const p = join(root, e);
      try {
        const s = await stat(p);
        if (!s.isDirectory()) continue;
        const gitDir = join(p, '.git');
        const gs = await stat(gitDir).catch(() => null);
        if (gs) repos.push(p);
      } catch {}
    }
    return repos;
  } catch {
    return [];
  }
}

async function commitsForRepo(repoPath: string, since: string, until: string): Promise<Commit[]> {
  const repoName = repoPath.split('/').pop() || repoPath;
  const fmt = '%H|%h|%ad|%an|%s';
  const cmd = `git -C "${repoPath}" log --since="${since} 00:00:00" --until="${until} 23:59:59" --author="${AUTHOR_FILTER}" --pretty=format:"${fmt}" --date=format:"%Y-%m-%d %H:%M:%S" --no-merges 2>/dev/null || true`;
  let stdout = '';
  try {
    const r = await execAsync(cmd, { maxBuffer: 4 * 1024 * 1024 });
    stdout = r.stdout || '';
  } catch {
    return [];
  }
  if (!stdout.trim()) return [];

  let remote: string | undefined;
  try {
    const r = await execAsync(`git -C "${repoPath}" remote get-url origin 2>/dev/null || true`);
    const url = (r.stdout || '').trim();
    if (url) {
      const m = url.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
      remote = m ? `https://github.com/${m[1]}` : url;
    }
  } catch {}

  return stdout
    .trim()
    .split('\n')
    .map((line) => {
      const [hash, shortHash, dateField, author, ...rest] = line.split('|');
      const [date, time] = (dateField || '').split(' ');
      return {
        repo: repoName,
        hash,
        shortHash,
        date: date || '',
        time: time || '',
        author: author || '',
        subject: rest.join('|'),
        remote,
      };
    })
    .filter((c) => c.hash);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const from = searchParams.get('from') || date || new Date().toISOString().slice(0, 10);
    const to = searchParams.get('to') || date || from;
    const groupBy = searchParams.get('groupBy') || 'flat';

    const repos = await listRepos(PROJECTS_ROOT);
    if (repos.length === 0) {
      return NextResponse.json({ from, to, total: 0, repos: 0, commits: [], message: `No git repos under ${PROJECTS_ROOT}` });
    }

    const all = (await Promise.all(repos.map((r) => commitsForRepo(r, from, to)))).flat();
    all.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));

    if (groupBy === 'repo') {
      const byRepo: Record<string, Commit[]> = {};
      for (const c of all) {
        if (!byRepo[c.repo]) byRepo[c.repo] = [];
        byRepo[c.repo].push(c);
      }
      return NextResponse.json({ from, to, total: all.length, repos: repos.length, byRepo });
    }
    if (groupBy === 'date') {
      const byDate: Record<string, Commit[]> = {};
      for (const c of all) {
        if (!byDate[c.date]) byDate[c.date] = [];
        byDate[c.date].push(c);
      }
      return NextResponse.json({ from, to, total: all.length, repos: repos.length, byDate });
    }

    return NextResponse.json({ from, to, total: all.length, repos: repos.length, commits: all });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error', commits: [] },
      { status: 500 },
    );
  }
}
