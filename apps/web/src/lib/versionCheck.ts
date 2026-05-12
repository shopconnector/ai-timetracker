const GITHUB_REPO = 'shopconnector/ai-timetracker';
// 5 minutes — short enough that users see new releases shortly after publish,
// long enough to stay well under GitHub's 60 req/h anonymous rate limit
// (worst case: ~12 requests per hour per server instance).
const CACHE_TTL_MS = 5 * 60 * 1000;

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  assets: GitHubAsset[];
}

export interface VersionInfo {
  current: string;
  latest: string;
  hasUpdate: boolean;
  downloadUrl: string | null;
  releaseUrl: string;
  releaseNotes: string;
  publishedAt: string;
  platform: string;
  checkedAt: string;
}

let cachedRelease: { data: GitHubRelease; fetchedAt: number } | null = null;

/**
 * Clear the cached release data so the next check fetches fresh info.
 * Call after selfupdate completes to ensure new version is shown.
 */
export function clearVersionCache(): void {
  cachedRelease = null;
}

/**
 * Compare two semver strings. Returns:
 *  -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
export function compareVersions(v1: string, v2: string): number {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const a = parse(v1);
  const b = parse(v2);

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const partA = a[i] ?? 0;
    const partB = b[i] ?? 0;
    if (partA < partB) return -1;
    if (partA > partB) return 1;
  }
  return 0;
}

export function getCurrentVersion(): string {
  return process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0';
}

export async function fetchLatestRelease(): Promise<GitHubRelease> {
  if (cachedRelease && Date.now() - cachedRelease.fetchedAt < CACHE_TTL_MS) {
    return cachedRelease.data;
  }

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
    {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10000),
      // Disable Next.js fetch cache — we already have an in-memory cache
      // with a tight TTL above. The Next.js layer was adding 1h staleness
      // on top, defeating the 5-minute refresh expectation.
      cache: 'no-store',
    }
  );

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status}`);
  }

  const data: GitHubRelease = await res.json();
  cachedRelease = { data, fetchedAt: Date.now() };
  return data;
}

export function getDownloadUrl(
  assets: GitHubAsset[],
  platform: string
): string | null {
  if (platform === 'win32') {
    const exe = assets.find((a) =>
      /TimeTracker-Setup-.*-x64\.exe$/i.test(a.name)
    );
    return exe?.browser_download_url ?? null;
  }
  if (platform === 'darwin') {
    const dmg = assets.find((a) =>
      /TimeTracker-.*-macos-arm64\.dmg$/i.test(a.name)
    );
    return dmg?.browser_download_url ?? null;
  }
  // Linux — no installer yet, use release page
  return null;
}

export function getPlatform(): string {
  return process.platform;
}
