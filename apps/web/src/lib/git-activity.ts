// Skan commitów wczoraj w repach BeeCommerce.

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { BEECOMMERCE_PATTERNS } from './beecommerce-filter';

export interface GitCommit {
  hash: string;
  shortHash: string;
  subject: string;
  authorEmail: string;
  authorDate: string;       // ISO
  repo: string;             // basename
  repoPath: string;         // absolutna ścieżka
}

const MAX_DEPTH = 4; // jak głęboko skanujemy w poszukiwaniu .git
const COMMAND_TIMEOUT_MS = 8_000;

export async function findGitRepos(): Promise<string[]> {
  const found = new Set<string>();
  for (const prefix of BEECOMMERCE_PATTERNS.pathPrefixes) {
    try {
      const stat = await fs.stat(prefix);
      if (!stat.isDirectory()) continue;
      await walkForGitRepos(prefix, 0, found);
    } catch {
      // Prefix nie istnieje na tej maszynie — pomijamy.
    }
  }
  return Array.from(found);
}

async function walkForGitRepos(dir: string, depth: number, acc: Set<string>): Promise<void> {
  if (depth > MAX_DEPTH) return;
  let entries: { name: string; isDirectory: () => boolean }[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name.startsWith('.')) {
      if (entry.name === '.git') {
        acc.add(dir);
      }
      continue;
    }
    const sub = path.join(dir, entry.name);
    try {
      const gitDir = path.join(sub, '.git');
      const gitStat = await fs.stat(gitDir);
      if (gitStat.isDirectory() || gitStat.isFile()) {
        acc.add(sub);
        continue; // nie schodź głębiej do submodułów
      }
    } catch {
      // brak .git, schodzimy
    }
    await walkForGitRepos(sub, depth + 1, acc);
  }
}

export async function getCommitsForDate(date: string, authorEmail?: string): Promise<GitCommit[]> {
  const repos = await findGitRepos();
  const since = `${date} 00:00:00`;
  const until = `${date} 23:59:59`;

  const perRepo = await Promise.all(
    repos.map((repo) => commitsInRepo(repo, since, until, authorEmail).catch(() => []))
  );
  return perRepo.flat();
}

async function commitsInRepo(repoPath: string, since: string, until: string, authorEmail?: string): Promise<GitCommit[]> {
  const args = [
    'log',
    `--since=${since}`,
    `--until=${until}`,
    '--pretty=format:%H|%h|%s|%ae|%aI',
    '--no-color',
  ];
  if (authorEmail) args.push(`--author=${authorEmail}`);

  const stdout = await runGit(repoPath, args);
  if (!stdout.trim()) return [];

  return stdout
    .split('\n')
    .filter(Boolean)
    .map((line): GitCommit | null => {
      const parts = line.split('|');
      if (parts.length < 5) return null;
      const [hash, shortHash, subject, ae, ad] = parts;
      return {
        hash,
        shortHash,
        subject,
        authorEmail: ae,
        authorDate: ad,
        repo: path.basename(repoPath),
        repoPath,
      };
    })
    .filter((c): c is GitCommit => c !== null);
}

function runGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, { cwd, env: process.env });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('git timeout'));
    }, COMMAND_TIMEOUT_MS);
    proc.stdout.on('data', (c) => { stdout += c.toString(); });
    proc.stderr.on('data', (c) => { stderr += c.toString(); });
    proc.on('error', (err) => { clearTimeout(timer); reject(err); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`git exit ${code}: ${stderr.slice(0, 200)}`));
      else resolve(stdout);
    });
  });
}

export async function getCurrentGitUserEmail(): Promise<string | null> {
  try {
    const out = await runGit(process.cwd(), ['config', 'user.email']);
    return out.trim() || null;
  } catch {
    return null;
  }
}
