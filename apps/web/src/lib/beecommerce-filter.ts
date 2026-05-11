// Heurystyka "czy to projekt BeeCommerce?"
// Single source of truth dla filtrowania zakładki /yesterday
// (i innych widoków, które mają oddzielać pracę firmową od prywatnej).

import fs from 'node:fs';
import path from 'node:path';

export type SourceKind = 'aw' | 'aw-browser' | 'slack' | 'tempo' | 'plan' | 'git' | 'file';

export interface SourceEvent {
  kind: SourceKind;
  // AW
  app?: string;
  title?: string;
  url?: string;
  project?: string;       // już wyciągnięty przez extractProjectInfo / extractTerminalInfo
  // Slack
  channel?: string;
  isDirectMessage?: boolean;
  // Tempo
  issueKey?: string;      // np. "BCI-42"
  // Plan
  planContent?: string;   // markdown body do skanu słów kluczowych
  // Git / file
  repoPath?: string;      // absolutna ścieżka repo
  filePath?: string;      // absolutna ścieżka pliku
}

export interface BeeCommercePatterns {
  pathPrefixes: string[];          // prefixy ścieżek = BeeCommerce
  repoNames: string[];             // nazwy katalogów repo BC (basename)
  jiraProjects: string[];          // prefixy Jira (BCI, NEU, ...)
  slackChannelRegex: RegExp;
  domainKeywords: string[];        // hosty/domen w URL = BC
  contentKeywords: string[];       // słowa kluczowe w tytułach/treści planów
}

export interface PersonalPatterns {
  pathPrefixes: string[];
  repoNames: string[];
  slackChannelRegex: RegExp;
  /** Słowa kluczowe w treści planów / tytułach które wykluczają jako personal. */
  contentKeywords: string[];
  /** Domeny w URL traktowane jako personal (osobista marka, klienci prywatni itp.). */
  domainKeywords: string[];
}

// =====================================================================
// PATTERNS (do edycji ręcznej; w przyszłości /settings/projects)
// =====================================================================

export const BEECOMMERCE_PATTERNS: BeeCommercePatterns = {
  pathPrefixes: [
    '/Users/gaca/projects/beecommerce/',
    '/home/bgaca/projects/',                 // serwer dev.beecommerce.pl
  ],
  repoNames: [
    'ai-timetracker',
    'beecommerce-ai-toolkit',
    'neuca',
    'bee-team',
    'ai-project-portfolio',
    'ai-project-hemplab',
    'ai-project-hemplab2',
    'ai-project-figma-css-generator',
    'ai-project-agrosimex-lookbook',
    'ai-project-wsip-mvp',
    'ai-portfolio',
  ],
  jiraProjects: ['BCI', 'BC', 'BEE', 'NEU', 'TLM'],
  slackChannelRegex: /^#?(bee-?|beecommerce|neuca|tlm|hemplab|wsip|agrosimex)/i,
  domainKeywords: [
    'beecommerce.ai',
    'beecommerce.pl',
    'beecommerce.atlassian.net',
    'dev.beecommerce.pl',
  ],
  contentKeywords: [
    'beecommerce',
    'neuca',
    'bee-team',
    'ai-timetracker',
    'beecommerce-ai-toolkit',
    'hemplab',
    'agrosimex',
    'wsip',
    'pilot_project',
  ],
};

// Auto-discovered BC repo basenames z FS (cache na proces).
let _autoBcRepos: Set<string> | null = null;
function autoBcRepos(): Set<string> {
  if (_autoBcRepos) return _autoBcRepos;
  const set = new Set<string>(BEECOMMERCE_PATTERNS.repoNames.map((r) => r.toLowerCase()));
  for (const prefix of BEECOMMERCE_PATTERNS.pathPrefixes) {
    try {
      const entries = fs.readdirSync(prefix, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('_')) {
          set.add(entry.name.toLowerCase());
        }
      }
    } catch {
      // Brak katalogu — skip.
    }
  }
  _autoBcRepos = set;
  return set;
}

export const PERSONAL_PATTERNS: PersonalPatterns = {
  pathPrefixes: [
    '/Users/gaca/projects/personal/',
  ],
  repoNames: [
    'dziennikzywienia',
    'zapiszsiedoflow',
    'timesheet-editor',
    'agent-pack',
    'sizehunter',
    'vegas-rolety',
    'rolety-vegas',
    'flow',
    'biurozlobinski',
    'mechanikguznik',
  ],
  slackChannelRegex: /^#?(personal|prywatne|family|rodzina)/i,
  contentKeywords: [
    'linkedin',
    'bartoszgaca.pl',
    'biurozlobinski',
    'mechanikguznik',
    'osobista marka',
    'media plan',
    'personal brand',
  ],
  domainKeywords: [
    'bartoszgaca.pl',
    'biurozlobinski.pl',
    'mechanikguznik.pl',
    'linkedin.com',
  ],
};

// =====================================================================
// CORE: isBeeCommerce(event)
// =====================================================================

export function isBeeCommerce(event: SourceEvent): boolean {
  // EXCLUDE wins — jeśli pasuje do personal, na pewno nie BC.
  if (matchesPersonal(event)) return false;
  // Następnie sprawdź pozytywne dopasowania BC.
  return matchesBeeCommerce(event);
}

function matchesPersonal(event: SourceEvent): boolean {
  const p = PERSONAL_PATTERNS;

  for (const candidate of [event.repoPath, event.filePath, event.project, event.title]) {
    if (!candidate) continue;
    const lc = candidate.toLowerCase();
    if (p.pathPrefixes.some((pre) => lc.includes(pre.toLowerCase()))) return true;
    if (p.repoNames.some((r) => lc.includes(r.toLowerCase()))) return true;
  }

  if (event.channel && p.slackChannelRegex.test(event.channel)) return true;

  // URL → domena personal
  if (event.url) {
    const lu = event.url.toLowerCase();
    if (p.domainKeywords.some((d) => lu.includes(d))) return true;
  }

  // Plan content / title — szukaj keywordów personal (linkedin, bartoszgaca.pl…).
  const content = event.planContent || event.title;
  if (content) {
    const lc = content.toLowerCase();
    if (p.contentKeywords.some((k) => lc.includes(k))) return true;
  }

  return false;
}

function matchesBeeCommerce(event: SourceEvent): boolean {
  const b = BEECOMMERCE_PATTERNS;
  const repos = autoBcRepos();

  // 1. Path prefix (git, file)
  for (const candidate of [event.repoPath, event.filePath]) {
    if (!candidate) continue;
    if (b.pathPrefixes.some((pre) => candidate.startsWith(pre))) return true;
  }

  // 2. Repo / project name (whitelist + auto-discovered)
  const projectNames = [
    event.project,
    event.repoPath ? path.basename(event.repoPath) : undefined,
  ].filter(Boolean) as string[];
  for (const name of projectNames) {
    const lc = name.toLowerCase();
    if (repos.has(lc)) return true;
    if (b.repoNames.some((r) => lc.includes(r.toLowerCase()))) return true;
  }

  // 3. AW window/editor title — szukaj nazw repo BC (auto-discovered + whitelist)
  if (event.title) {
    const lt = event.title.toLowerCase();
    for (const r of repos) {
      // Tylko gdy nazwa repo jest "wystarczająco unikalna" — min 5 znaków, żeby
      // krótkie generic nazwy (np. "web", "app") nie generowały false-positive.
      if (r.length >= 5 && lt.includes(r)) return true;
    }
  }

  // 4. Browser URL — domena BC
  if (event.url) {
    const lu = event.url.toLowerCase();
    if (b.domainKeywords.some((d) => lu.includes(d))) return true;
  }

  // 5. Slack — kanał lub DM ze stakeholderem (heurystyka regex)
  if (event.channel && b.slackChannelRegex.test(event.channel)) return true;

  // 6. Tempo — prefix Jira projektu
  if (event.issueKey) {
    const prefix = event.issueKey.split('-')[0]?.toUpperCase();
    if (prefix && b.jiraProjects.includes(prefix)) return true;
  }

  // 7. Plan content scan
  if (event.planContent) {
    const lc = event.planContent.toLowerCase();
    if (b.contentKeywords.some((k) => lc.includes(k))) return true;
  }

  return false;
}

// =====================================================================
// PROJECT KEY DERIVATION — żeby grupować eventy w jedną kartę
// =====================================================================

export function deriveProjectKey(event: SourceEvent): string {
  // 1. Tempo: prefix Jira (BCI → "jira-bci")
  if (event.issueKey) {
    const prefix = event.issueKey.split('-')[0]?.toLowerCase();
    if (prefix) return `jira-${prefix}`;
  }

  // 2. Repo path (git, file): basename pod BC pathPrefix
  for (const candidate of [event.repoPath, event.filePath]) {
    if (!candidate) continue;
    for (const prefix of BEECOMMERCE_PATTERNS.pathPrefixes) {
      if (candidate.startsWith(prefix)) {
        const rest = candidate.slice(prefix.length);
        const firstSeg = rest.split(/[\/\\]+/).filter(Boolean)[0];
        if (firstSeg) return firstSeg;
      }
    }
    const repoName = matchedRepoName(candidate);
    if (repoName) return repoName;
  }

  // 3. Explicit project (z extractProjectInfo / extractTerminalInfo)
  if (event.project) {
    const lc = event.project.toLowerCase();
    const matched = BEECOMMERCE_PATTERNS.repoNames.find((r) => lc.includes(r.toLowerCase()));
    if (matched) return matched;
    return event.project;
  }

  // 4. AW title — wyciągnij nazwę repo z tytułu
  if (event.title) {
    const lt = event.title.toLowerCase();
    const matched = BEECOMMERCE_PATTERNS.repoNames.find((r) => lt.includes(r.toLowerCase()));
    if (matched) return matched;
  }

  // 5. Browser URL — domena
  if (event.url) {
    try {
      const host = new URL(event.url).hostname.replace(/^www\./, '');
      if (host.includes('atlassian.net')) return 'atlassian';
      return host;
    } catch {
      // ignored
    }
  }

  // 6. Slack channel
  if (event.channel) {
    return `slack-${event.channel.replace(/^#/, '')}`;
  }

  return 'misc-bc';
}

function matchedRepoName(filePath: string): string | undefined {
  // Spróbuj dopasować jakikolwiek z BEECOMMERCE_PATTERNS.repoNames jako segment ścieżki
  const segments = filePath.split(/[\/\\]+/).filter(Boolean);
  for (const seg of segments) {
    const lc = seg.toLowerCase();
    const matched = BEECOMMERCE_PATTERNS.repoNames.find((r) => r.toLowerCase() === lc);
    if (matched) return matched;
  }
  return undefined;
}

export function projectLabel(key: string): string {
  if (key.startsWith('jira-')) return key.replace('jira-', '').toUpperCase() + ' (Jira)';
  if (key.startsWith('slack-')) return '#' + key.replace('slack-', '');
  return key;
}
