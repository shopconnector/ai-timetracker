import { NextResponse } from 'next/server';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getCurrentGitUserEmail } from '@/lib/git-activity';
import { getGithubUser, getGithubCommits, type GithubCommit } from '@/lib/github';

const execAsync = promisify(exec);

function getProjectsRoot(): string {
  return process.env.PROJECTS_ROOT || '';
}

/**
 * Resolve the git author filter:
 *   1. GIT_AUTHOR_FILTER env var (set in Settings)
 *   2. `git config user.email` from the current shell environment
 *   3. empty (no author filter — returns ALL commits in matching repos)
 */
async function getAuthorFilter(): Promise<string> {
  const explicit = process.env.GIT_AUTHOR_FILTER;
  if (explicit && explicit.trim()) return explicit.trim();

  const fromGit = await getCurrentGitUserEmail();
  return fromGit || '';
}

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

async function commitsForRepo(repoPath: string, since: string, until: string, authorFilter: string): Promise<Commit[]> {
  const repoName = repoPath.split('/').pop() || repoPath;
  const fmt = '%H|%h|%ad|%an|%s';
  const authorClause = authorFilter ? ` --author="${authorFilter}"` : '';
  const cmd = `git -C "${repoPath}" log --since="${since} 00:00:00" --until="${until} 23:59:59"${authorClause} --pretty=format:"${fmt}" --date=format:"%Y-%m-%d %H:%M:%S" --no-merges 2>/dev/null || true`;
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

function groupCommits(all: Array<Commit | GithubCommit>, groupBy: string, fromTo: { from: string; to: string }, repoCount: number, source: 'api' | 'local') {
  if (groupBy === 'repo') {
    const byRepo: Record<string, Array<Commit | GithubCommit>> = {};
    for (const c of all) {
      if (!byRepo[c.repo]) byRepo[c.repo] = [];
      byRepo[c.repo].push(c);
    }
    return NextResponse.json({ ...fromTo, total: all.length, repos: repoCount, source, byRepo });
  }
  if (groupBy === 'date') {
    const byDate: Record<string, Array<Commit | GithubCommit>> = {};
    for (const c of all) {
      if (!byDate[c.date]) byDate[c.date] = [];
      byDate[c.date].push(c);
    }
    return NextResponse.json({ ...fromTo, total: all.length, repos: repoCount, source, byDate });
  }
  return NextResponse.json({ ...fromTo, total: all.length, repos: repoCount, source, commits: all });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const from = searchParams.get('from') || date || new Date().toISOString().slice(0, 10);
    const to = searchParams.get('to') || date || from;
    const groupBy = searchParams.get('groupBy') || 'flat';

    // Strategy 1: GitHub REST API (when GITHUB_TOKEN is set)
    // Cross-platform, no local clones required.
    const githubToken = process.env.GITHUB_TOKEN;
    if (githubToken) {
      const userOrErr = await getGithubUser(githubToken);
      if ('error' in userOrErr) {
        return NextResponse.json({
          from, to, total: 0, repos: 0, commits: [],
          source: 'api',
          message: `GitHub API ${userOrErr.status || ''}: ${userOrErr.error.slice(0, 200)}. Sprawdź token w Settings → Git / Activity.`,
        });
      }
      const commits = await getGithubCommits(githubToken, userOrErr.login, from, to);
      const repoNames = new Set(commits.map((c) => c.repo));
      return groupCommits(commits, groupBy, { from, to }, repoNames.size, 'api');
    }

    // Strategy 2: Local git scan (fallback when no token)
    const projectsRoot = getProjectsRoot();
    const authorFilter = await getAuthorFilter();

    if (!projectsRoot) {
      return NextResponse.json({
        from, to, total: 0, repos: 0, commits: [],
        message: 'PROJECTS_ROOT nie jest ustawiony. Otwórz Settings → Git / Activity i wskaż katalog z lokalnymi repozytoriami.',
        configHint: { projectsRoot: '', gitAuthorFilter: authorFilter, settingsUrl: '/settings' },
      });
    }

    if (!existsSync(projectsRoot)) {
      return NextResponse.json({
        from, to, total: 0, repos: 0, commits: [],
        message: `Katalog "${projectsRoot}" nie istnieje na tej maszynie. Popraw ścieżkę w Settings → Git / Activity.`,
        configHint: { projectsRoot, gitAuthorFilter: authorFilter, settingsUrl: '/settings' },
      });
    }

    const repos = await listRepos(projectsRoot);
    if (repos.length === 0) {
      return NextResponse.json({
        from, to, total: 0, repos: 0, commits: [],
        message: `Brak repozytoriów git pod "${projectsRoot}". Sprawdź ścieżkę albo upewnij się że katalogi mają podkatalog .git.`,
        configHint: { projectsRoot, gitAuthorFilter: authorFilter, settingsUrl: '/settings' },
      });
    }

    const all = (await Promise.all(repos.map((r) => commitsForRepo(r, from, to, authorFilter)))).flat();
    all.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));

    return groupCommits(all, groupBy, { from, to }, repos.length, 'local');
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error', commits: [] },
      { status: 500 },
    );
  }
}
