/**
 * GitHub REST API client.
 *
 * Used as an alternative to local-git-scan when the user provides a Personal Access Token.
 * Works cross-platform without requiring local clones — useful for managers / mobile users.
 *
 * Token scopes needed:
 *   - `public_repo` — for events on public repos
 *   - `repo`        — to also see events on private repos (recommended)
 *
 * Generate at https://github.com/settings/tokens (Classic) or https://github.com/settings/tokens?type=beta (Fine-grained).
 */

const GITHUB_API = 'https://api.github.com';

export interface GithubUser {
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

export interface GithubCommit {
  repo: string;
  hash: string;
  shortHash: string;
  date: string;       // YYYY-MM-DD
  time: string;       // HH:MM:SS
  author: string;
  subject: string;
  remote?: string;    // https://github.com/owner/repo
  url?: string;       // https://github.com/owner/repo/commit/<sha>
}

interface GithubEvent {
  id: string;
  type: string;
  created_at: string;
  repo: { id: number; name: string; url: string };
  payload: {
    commits?: Array<{
      sha: string;
      message: string;
      author?: { name?: string; email?: string };
    }>;
  };
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/**
 * GET /user — verify token works and identify the authenticated user.
 * Returns null on failure (caller should treat as 401).
 */
export async function getGithubUser(token: string): Promise<GithubUser | { error: string; status: number }> {
  try {
    const res = await fetch(`${GITHUB_API}/user`, {
      headers: authHeaders(token),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { error: await res.text().catch(() => `HTTP ${res.status}`), status: res.status };
    }
    return (await res.json()) as GithubUser;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), status: 0 };
  }
}

/**
 * GET /users/{login}/events?per_page=100
 *
 * Returns the user's *public* event feed (limited to ~90 days, max 300 events
 * across multiple pages). PushEvents contain the commits we care about.
 *
 * For richer data, the user can also use `/users/{login}/events?per_page=100`
 * (public only) — private events require `/users/{login}/events?token=...`
 * with proper PAT scope, which is what we do here.
 *
 * Filters by [from, to] date range (inclusive) on event creation time.
 * Dates are YYYY-MM-DD strings interpreted as local-day boundaries.
 */
export async function getGithubCommits(
  token: string,
  login: string,
  from: string,
  to: string,
): Promise<GithubCommit[]> {
  const fromMs = new Date(`${from}T00:00:00`).getTime();
  const toMs = new Date(`${to}T23:59:59.999`).getTime();

  const collected: GithubCommit[] = [];
  // Walk up to 3 pages (300 events) — older events get cut by GitHub anyway (~90 day window).
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(
      `${GITHUB_API}/users/${encodeURIComponent(login)}/events?per_page=100&page=${page}`,
      {
        headers: authHeaders(token),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) break;

    const events = (await res.json()) as GithubEvent[];
    if (events.length === 0) break;

    // Track the earliest event timestamp this page; if it's already older than `from`,
    // we don't need further pages.
    let earliest = Infinity;
    for (const ev of events) {
      const t = new Date(ev.created_at).getTime();
      if (t < earliest) earliest = t;
      if (t < fromMs || t > toMs) continue;
      if (ev.type !== 'PushEvent' || !ev.payload?.commits) continue;

      const repoFull = ev.repo.name; // "owner/repo"
      const repoName = repoFull.split('/').pop() || repoFull;
      const remote = `https://github.com/${repoFull}`;
      const isoDate = new Date(ev.created_at);
      const date = isoDate.toISOString().slice(0, 10);
      const time = isoDate.toISOString().slice(11, 19);

      for (const c of ev.payload.commits) {
        const shortHash = c.sha.slice(0, 7);
        collected.push({
          repo: repoName,
          hash: c.sha,
          shortHash,
          date,
          time,
          author: c.author?.name || c.author?.email || '',
          subject: c.message.split('\n')[0],
          remote,
          url: `${remote}/commit/${c.sha}`,
        });
      }
    }

    if (earliest < fromMs) break;
    if (events.length < 100) break;
  }

  // Newest first
  collected.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  return collected;
}
