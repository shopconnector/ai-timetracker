// Agregator zakładki "Wczoraj" — łączy 6 źródeł, filtruje BC, grupuje per-projekt.
// SERVER-ONLY (używa node:fs, child_process). Nie importuj z client componentów —
// zamiast tego: pure helpery (formatMinutes, yesterdayDate) są w `morning-format.ts`.

import { getActivitiesForDate, type GroupedActivity } from './activitywatch';
import { getSlackActivitiesForDate } from './slack';
import { getWorklogsForDate, type Worklog } from './tempo';
import { scanPlans, type PlanFile } from './plans-scan';
import { getCommitsForDate, getCurrentGitUserEmail, type GitCommit } from './git-activity';
import { findChangedFiles, type ChangedFile } from './file-activity';
import { isBeeCommerce, deriveProjectKey, projectLabel, type SourceEvent } from './beecommerce-filter';
import { callGemini } from './gemini';

export interface ProjectSection {
  key: string;
  label: string;
  minutes: number;
  sources: {
    aw: Array<{ app: string; title: string; minutes: number; project?: string; isCodeEditor?: boolean }>;
    slack: Array<{ channel: string; minutes: number }>;
    tempo: Array<{ issueKey: string; description?: string; minutes: number }>;
    plans: Array<{ path: string; fileName: string; title: string; mtime: string }>;
    git: Array<{ repo: string; commits: Array<{ shortHash: string; subject: string; authorDate: string }> }>;
    files: Array<{ path: string; mtime: string }>;
  };
  summary?: string;
}

export interface YesterdayReport {
  date: string;
  generatedAt: string;
  projects: ProjectSection[];
  totals: {
    trackedMinutes: number;
    tempoMinutes: number;
    commitsCount: number;
    projectsCount: number;
  };
  proposalForToday: Array<{ project: string; item: string; source: 'plan' | 'tempo' }>;
  warnings: string[];
}

interface AggregatorOptions {
  date: string;
  withSummary?: boolean;
  /** Twardy timeout dla całej agregacji (default 25_000 ms). Po tym zwracamy częściowy raport z warningiem. */
  timeoutMs?: number;
}

export async function buildYesterdayReport(opts: AggregatorOptions): Promise<YesterdayReport> {
  const { date, withSummary = false, timeoutMs = 25_000 } = opts;
  const warnings: string[] = [];

  // Hard deadline — gdyby któryś z fetchy wisiał (sieć, AW restart, Slack rate limit),
  // chcemy oddać cokolwiek mamy zamiast wisieć w nieskończoność.
  const deadline = Promise.race([
    runAggregation(date, withSummary, warnings),
    new Promise<YesterdayReport>((_, reject) => {
      setTimeout(() => reject(new Error(`Aggregator deadline ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);

  try {
    return await deadline;
  } catch (e) {
    // Nawet hard timeout — zwracamy minimalny raport z warningiem zamiast 500.
    return {
      date,
      generatedAt: new Date().toISOString(),
      projects: [],
      totals: { trackedMinutes: 0, tempoMinutes: 0, commitsCount: 0, projectsCount: 0 },
      proposalForToday: [],
      warnings: [...warnings, `Hard timeout: ${e instanceof Error ? e.message : String(e)}`],
    };
  }
}

async function runAggregation(
  date: string,
  withSummary: boolean,
  warnings: string[]
): Promise<YesterdayReport> {

  // --- 6 źródeł równolegle, każde z per-source timeoutem ---
  // Bez timeoutu pojedyncze wisi (AW restart, Slack rate-limit) zatrzymuje cały
  // request na top-level deadline. Z timeoutem 8s mamy graceful degradation:
  // jedno źródło padnie → reszta pojawia się normalnie z warningiem.
  const SOURCE_TIMEOUT = 8_000;
  const [activitiesRes, slackRes, worklogsRes, plansRes, gitEmailRes, filesRes] = await Promise.allSettled([
    withTimeout(getActivitiesForDate(date), SOURCE_TIMEOUT, 'AW timeout'),
    withTimeout(getSlackActivitiesForDate(date), SOURCE_TIMEOUT, 'Slack timeout'),
    withTimeout(getWorklogsForDate(date), SOURCE_TIMEOUT, 'Tempo timeout'),
    withTimeout(scanPlans(date), SOURCE_TIMEOUT, 'Plans timeout'),
    withTimeout(getCurrentGitUserEmail(), 2_000, 'git config timeout'),
    withTimeout(findChangedFiles(date), SOURCE_TIMEOUT, 'Files timeout'),
  ]);

  const activities = settledValue<GroupedActivity[]>(activitiesRes, [], (e) => warnings.push(`AW: ${e}`));
  const slack = settledValue<GroupedActivity[]>(slackRes, [], (e) => warnings.push(`Slack: ${e}`));
  const worklogs = settledValue<Worklog[]>(worklogsRes, [], (e) => warnings.push(`Tempo: ${e}`));
  const plans = settledValue<PlanFile[]>(plansRes, [], (e) => warnings.push(`Plans: ${e}`));
  const gitEmail = settledValue<string | null>(gitEmailRes, null);
  const files = settledValue<ChangedFile[]>(filesRes, [], (e) => warnings.push(`Files: ${e}`));

  let commits: GitCommit[] = [];
  try {
    commits = await withTimeout(getCommitsForDate(date, gitEmail || undefined), 10_000, 'Git timeout');
  } catch (e) {
    warnings.push(`Git: ${e instanceof Error ? e.message : String(e)}`);
  }

  // --- Filtr BeeCommerce + grupowanie per projekt ---
  const sections = new Map<string, ProjectSection>();

  function ensureSection(key: string, label: string): ProjectSection {
    let s = sections.get(key);
    if (!s) {
      s = {
        key,
        label,
        minutes: 0,
        sources: { aw: [], slack: [], tempo: [], plans: [], git: [], files: [] },
      };
      sections.set(key, s);
    }
    return s;
  }

  // 1. AW (window + browser + editor + terminal)
  for (const a of activities) {
    if (a.isPrivate) continue;
    const ev: SourceEvent = {
      kind: 'aw',
      app: a.app,
      title: a.title,
      project: a.project,
    };
    if (!isBeeCommerce(ev)) continue;
    const key = deriveProjectKey(ev);
    const minutes = Math.round(a.totalSeconds / 60);
    const section = ensureSection(key, projectLabel(key));
    section.minutes += minutes;
    section.sources.aw.push({
      app: a.app,
      title: a.title,
      minutes,
      project: a.project,
      isCodeEditor: a.isCodeEditor,
    });
  }

  // 2. Slack (jest GroupedActivity z `channel` na poziomie meta)
  for (const s of slack) {
    if (s.isPrivate) continue;
    const ev: SourceEvent = {
      kind: 'slack',
      app: s.app,
      title: s.title,
      channel: s.channel,
      isDirectMessage: !s.channel?.startsWith('#'),
    };
    if (!isBeeCommerce(ev)) continue;
    const key = deriveProjectKey(ev);
    const minutes = Math.round(s.totalSeconds / 60);
    const section = ensureSection(key, projectLabel(key));
    section.minutes += minutes;
    section.sources.slack.push({
      channel: s.channel || s.title,
      minutes,
    });
  }

  // 3. Tempo
  for (const w of worklogs) {
    const ev: SourceEvent = { kind: 'tempo', issueKey: w.issue.key };
    if (!isBeeCommerce(ev)) continue;
    const key = deriveProjectKey(ev);
    const minutes = Math.round(w.timeSpentSeconds / 60);
    const section = ensureSection(key, projectLabel(key));
    // Tempo NIE dolicza się do `minutes` projektu (te są z AW), żeby nie liczyć podwójnie.
    section.sources.tempo.push({
      issueKey: w.issue.key,
      description: w.description,
      minutes,
    });
  }

  // 4. Plans
  for (const p of plans) {
    const ev: SourceEvent = { kind: 'plan', planContent: `${p.title}\n${p.excerpt}\n${p.fullContent ?? ''}` };
    if (!isBeeCommerce(ev)) continue;
    // Klucz projektu z planu — szukamy nazwy repo BC w tytule/treści.
    const key = pickProjectKeyFromPlan(p) || 'plans-bc';
    const section = ensureSection(key, projectLabel(key));
    section.sources.plans.push({
      path: p.path,
      fileName: p.fileName,
      title: p.title,
      mtime: p.mtime,
    });
  }

  // 5. Git
  for (const c of commits) {
    const ev: SourceEvent = { kind: 'git', repoPath: c.repoPath };
    if (!isBeeCommerce(ev)) continue;
    const key = deriveProjectKey(ev);
    const section = ensureSection(key, projectLabel(key));
    let bucket = section.sources.git.find((g) => g.repo === c.repo);
    if (!bucket) {
      bucket = { repo: c.repo, commits: [] };
      section.sources.git.push(bucket);
    }
    bucket.commits.push({
      shortHash: c.shortHash,
      subject: c.subject,
      authorDate: c.authorDate,
    });
  }

  // 6. Files
  for (const f of files) {
    const ev: SourceEvent = { kind: 'file', filePath: f.path, project: f.repo };
    if (!isBeeCommerce(ev)) continue;
    const key = deriveProjectKey(ev);
    const section = ensureSection(key, projectLabel(key));
    section.sources.files.push({ path: f.path, mtime: f.mtime });
  }

  // --- Sortowanie sekcji wg czasu (AW), potem #commitów, potem #planów ---
  const projects = Array.from(sections.values()).sort((a, b) => {
    if (b.minutes !== a.minutes) return b.minutes - a.minutes;
    const ac = a.sources.git.reduce((s, r) => s + r.commits.length, 0);
    const bc = b.sources.git.reduce((s, r) => s + r.commits.length, 0);
    if (bc !== ac) return bc - ac;
    return b.sources.plans.length - a.sources.plans.length;
  });

  // --- Limit szczegółów per sekcja, żeby UI nie tonął ---
  for (const p of projects) {
    p.sources.aw = p.sources.aw.sort((a, b) => b.minutes - a.minutes).slice(0, 8);
    p.sources.slack = p.sources.slack.sort((a, b) => b.minutes - a.minutes).slice(0, 6);
    p.sources.files = p.sources.files.slice(0, 12);
    for (const repo of p.sources.git) {
      repo.commits = repo.commits.sort((a, b) => b.authorDate.localeCompare(a.authorDate)).slice(0, 10);
    }
  }

  // --- Opcjonalny Gemini summary per sekcja ---
  if (withSummary && process.env.GEMINI_API_KEY) {
    await Promise.all(
      projects.map(async (p) => {
        try {
          p.summary = await summarizeProject(p);
        } catch (e) {
          warnings.push(`Gemini[${p.key}]: ${e instanceof Error ? e.message : String(e)}`);
        }
      })
    );
  }

  // --- Totals ---
  const trackedMinutes = projects.reduce((s, p) => s + p.minutes, 0);
  const tempoMinutes = projects.reduce(
    (s, p) => s + p.sources.tempo.reduce((ss, t) => ss + t.minutes, 0),
    0
  );
  const commitsCount = projects.reduce(
    (s, p) => s + p.sources.git.reduce((ss, g) => ss + g.commits.length, 0),
    0
  );

  // --- Propozycja na dziś (proste reguły) ---
  const proposalForToday = buildProposal(projects);

  return {
    date,
    generatedAt: new Date().toISOString(),
    projects,
    totals: {
      trackedMinutes,
      tempoMinutes,
      commitsCount,
      projectsCount: projects.length,
    },
    proposalForToday,
    warnings,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

function settledValue<T>(
  res: PromiseSettledResult<T>,
  fallback: T,
  onError?: (msg: string) => void
): T {
  if (res.status === 'fulfilled') return res.value;
  if (onError) onError(res.reason instanceof Error ? res.reason.message : String(res.reason));
  return fallback;
}

function pickProjectKeyFromPlan(p: PlanFile): string | null {
  const blob = `${p.title}\n${p.excerpt}`.toLowerCase();
  // Spróbuj dopasować do znanych nazw repo (z BEECOMMERCE_PATTERNS).
  // Inline import żeby nie tworzyć cykli.
  const repoNames = [
    'ai-timetracker', 'beecommerce-ai-toolkit', 'neuca', 'bee-team',
    'ai-project-portfolio', 'hemplab', 'agrosimex', 'wsip',
  ];
  for (const r of repoNames) {
    if (blob.includes(r)) return r;
  }
  return null;
}

function buildProposal(projects: ProjectSection[]): YesterdayReport['proposalForToday'] {
  const out: YesterdayReport['proposalForToday'] = [];
  for (const p of projects) {
    for (const plan of p.sources.plans.slice(0, 2)) {
      out.push({
        project: p.label,
        item: `Dokończ plan: ${plan.title}`,
        source: 'plan',
      });
    }
    for (const t of p.sources.tempo.slice(0, 2)) {
      out.push({
        project: p.label,
        item: `${t.issueKey}${t.description ? ` — ${t.description.slice(0, 80)}` : ''}`,
        source: 'tempo',
      });
    }
    if (out.length >= 8) break;
  }
  return out;
}

async function summarizeProject(p: ProjectSection): Promise<string> {
  const apps = p.sources.aw.slice(0, 5).map((a) => `${a.app} ${a.minutes}min`).join(', ');
  const commits = p.sources.git
    .flatMap((g) => g.commits.map((c) => `${g.repo}: ${c.subject}`))
    .slice(0, 5)
    .join('\n');
  const plans = p.sources.plans.map((pl) => pl.title).slice(0, 5).join('\n');
  const tempo = p.sources.tempo.map((t) => `${t.issueKey} ${t.minutes}min`).join(', ');

  const prompt = `Podsumuj 1-2 zdaniami po polsku co Bartosz robił wczoraj na projekcie "${p.label}".
Trzymaj się faktów, bez halucynacji. Bez nagłówków, bez listy.

Czas w aplikacjach: ${apps || 'brak'}
Commity:
${commits || 'brak'}
Plany Claude Code (mtime wczoraj):
${plans || 'brak'}
Worklogi Tempo: ${tempo || 'brak'}`;

  const text = await callGemini(prompt, {
    apiKey: process.env.GEMINI_API_KEY!,
    temperature: 0.2,
    maxTokens: 200,
    responseMimeType: 'text/plain',
  });
  return text.trim();
}

// Re-export pure helpers żeby istniejące importy z morning-summary nadal działały.
export { formatMinutes, yesterdayDate, previousWorkday } from './morning-format';
