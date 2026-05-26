/**
 * Atlassian OAuth 2.0 (3LO) client for Jira + Confluence Cloud — PKCE + client_secret.
 *
 * Atlassian classifies all OAuth 2.0 (3LO) apps as confidential clients, so
 * client_secret is required at token exchange even when PKCE is used. PKCE
 * (RFC 7636) is layered on top as defense-in-depth against code interception.
 *
 * Both client_id and client_secret are baked into the build:
 *  - client_id:     DEFAULT_CLIENT_ID constant below (or ATLASSIAN_OAUTH_CLIENT_ID env)
 *  - client_secret: process.env.ATLASSIAN_OAUTH_CLIENT_SECRET, injected at build
 *                   time via next.config.ts (sourced from GitHub Actions Secret).
 *
 * Token storage: .env.local (single-tenant, plain-text). Refresh tokens rotate
 * on every use, so refreshing is guarded by an in-process mutex (a second
 * concurrent refresh would invalidate the first one's response).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { randomBytes, createHash } from 'crypto';

// ---------- Config ----------

export const ATLASSIAN_OAUTH_SCOPES = [
  'offline_access',
  'read:me',
  'read:jira-user', // required for /rest/api/3/myself (test connection + status)
  'read:jira-work',
  'write:jira-work',
  'read:confluence-space.summary',
  'read:confluence-content.summary',
  'read:confluence-content.all',
  'write:confluence-content',
  'read:confluence-user',
];

// ---------- PKCE helpers (RFC 7636) ----------

export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

const AUTHORIZE_URL = 'https://auth.atlassian.com/authorize';
const TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const REVOKE_URL = 'https://auth.atlassian.com/oauth/token/revoke';
const RESOURCES_URL = 'https://api.atlassian.com/oauth/token/accessible-resources';

const DEFAULT_REDIRECT_URI = 'http://localhost:5666/timetracker/api/auth/atlassian/callback';
const DEFAULT_SITE_URL = 'https://beecommerce.atlassian.net';

// Public OAuth 2.0 (PKCE) client_id — registered in developer.atlassian.com
// by the TimeTracker maintainer. PKCE flow makes this safe to embed (no secret).
// Override via ATLASSIAN_OAUTH_CLIENT_ID env if running against another tenant.
const DEFAULT_CLIENT_ID = '1zuJd04NRQsFJJkwVoWDmIvmDW2Mrakz';

/**
 * Filter out .env.example placeholder values. Prevents the bug where a fresh
 * install copies .env.example to .env.local with stale "your-company.atlassian.net"
 * placeholders, which would otherwise override the embedded defaults.
 */
function realValue(v: string | undefined, ...placeholders: string[]): string | undefined {
  if (!v) return undefined;
  const lower = v.toLowerCase();
  for (const p of placeholders) {
    if (lower.includes(p.toLowerCase())) return undefined;
  }
  return v;
}

// ---------- Types ----------

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: 'Bearer';
}

export interface AccessibleResource {
  id: string;
  url: string;
  name: string;
  scopes: string[];
  avatarUrl?: string;
}

export interface OAuthEnv {
  clientId?: string;
  clientSecret?: string;
  siteUrl: string;
  redirectUri: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  cloudId?: string;
  userEmail?: string;
  userName?: string;
  scopes?: string;
}

// ---------- Env file IO ----------
// Mirrors getEnvFilePath() in app/api/settings/route.ts — kept in sync manually.

function getEnvFilePath(): string {
  const explicitDir = process.env.TIMETRACKER_DATA_DIR;
  if (explicitDir) return join(explicitDir, '.env.local');

  const cwd = process.cwd();
  const dataEnvPath = join(cwd, 'data', '.env.local');
  if (existsSync(dataEnvPath)) return dataEnvPath;

  const cwdPkg = join(cwd, 'package.json');
  if (existsSync(cwdPkg)) {
    try {
      const pkg = JSON.parse(readFileSync(cwdPkg, 'utf-8')) as { name?: string };
      if (pkg.name === '@timetracker/web') return join(cwd, '.env.local');
    } catch {
      /* ignore */
    }
  }

  if (process.platform === 'darwin') return join(homedir(), '.timetracker', '.env.local');
  return join(cwd, '.env.local');
}

const ATLASSIAN_ENV_SECTION = '# Atlassian OAuth 2.0';

/**
 * Update specific Atlassian OAuth env vars in .env.local AND in-memory process.env.
 * Pass a value of `null` to delete a line. Other vars are preserved untouched.
 */
function writeAtlassianEnv(updates: Record<string, string | null>): void {
  const envPath = getEnvFilePath();
  const envDir = dirname(envPath);
  if (!existsSync(envDir)) mkdirSync(envDir, { recursive: true });

  let content = '';
  try {
    content = readFileSync(envPath, 'utf-8');
  } catch {
    /* file may not exist yet */
  }

  const lines = content.split('\n');
  const existing = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([A-Z_]+)=/);
    if (m) existing.set(m[1], i);
  }

  for (const [key, value] of Object.entries(updates)) {
    if (value === null) {
      // Delete line in-place. Use empty string so subsequent indexes stay valid.
      const idx = existing.get(key);
      if (idx !== undefined) lines[idx] = '';
      delete process.env[key];
      continue;
    }

    const idx = existing.get(key);
    if (idx !== undefined) {
      lines[idx] = `${key}=${value}`;
    } else {
      let sectionIdx = lines.findIndex((l) => l === ATLASSIAN_ENV_SECTION);
      if (sectionIdx < 0) {
        if (lines[lines.length - 1] !== '') lines.push('');
        lines.push(ATLASSIAN_ENV_SECTION);
        sectionIdx = lines.length - 1;
      }
      let insertAt = sectionIdx + 1;
      while (insertAt < lines.length && lines[insertAt].match(/^[A-Z_]+=/)) insertAt++;
      lines.splice(insertAt, 0, `${key}=${value}`);
      existing.set(key, insertAt);
    }
    process.env[key] = value;
  }

  // Collapse multiple consecutive blank lines down to one.
  const collapsed: string[] = [];
  for (const l of lines) {
    if (l === '' && collapsed[collapsed.length - 1] === '') continue;
    collapsed.push(l);
  }
  writeFileSync(envPath, collapsed.join('\n'));
}

// ---------- Public env accessors ----------

export function loadOAuthEnv(): OAuthEnv {
  return {
    clientId: realValue(process.env.ATLASSIAN_OAUTH_CLIENT_ID, 'your-', 'placeholder') || DEFAULT_CLIENT_ID,
    clientSecret: realValue(process.env.ATLASSIAN_OAUTH_CLIENT_SECRET, 'your-', 'placeholder'),
    siteUrl: realValue(process.env.ATLASSIAN_OAUTH_SITE_URL, 'your-company', 'your-tenant', 'example.atlassian') || DEFAULT_SITE_URL,
    redirectUri: process.env.ATLASSIAN_OAUTH_REDIRECT_URI || DEFAULT_REDIRECT_URI,
    accessToken: process.env.ATLASSIAN_OAUTH_ACCESS_TOKEN || undefined,
    refreshToken: process.env.ATLASSIAN_OAUTH_REFRESH_TOKEN || undefined,
    expiresAt: process.env.ATLASSIAN_OAUTH_EXPIRES_AT || undefined,
    cloudId: process.env.ATLASSIAN_OAUTH_CLOUD_ID || undefined,
    userEmail: process.env.ATLASSIAN_OAUTH_USER_EMAIL || undefined,
    userName: process.env.ATLASSIAN_OAUTH_USER_NAME || undefined,
    scopes: process.env.ATLASSIAN_OAUTH_SCOPES || undefined,
  };
}

export function saveOAuthTokens(payload: {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  cloudId?: string;
  userEmail?: string;
  userName?: string;
  scopes?: string;
}): void {
  const updates: Record<string, string | null> = {
    ATLASSIAN_OAUTH_ACCESS_TOKEN: payload.accessToken,
    ATLASSIAN_OAUTH_REFRESH_TOKEN: payload.refreshToken,
    ATLASSIAN_OAUTH_EXPIRES_AT: payload.expiresAt,
  };
  if (payload.cloudId !== undefined) updates.ATLASSIAN_OAUTH_CLOUD_ID = payload.cloudId;
  if (payload.userEmail !== undefined) updates.ATLASSIAN_OAUTH_USER_EMAIL = payload.userEmail;
  if (payload.userName !== undefined) updates.ATLASSIAN_OAUTH_USER_NAME = payload.userName;
  if (payload.scopes !== undefined) updates.ATLASSIAN_OAUTH_SCOPES = payload.scopes;
  writeAtlassianEnv(updates);
}

export function clearOAuthTokens(): void {
  // Keep client_id/secret/site_url so reconnect doesn't require re-typing.
  writeAtlassianEnv({
    ATLASSIAN_OAUTH_ACCESS_TOKEN: null,
    ATLASSIAN_OAUTH_REFRESH_TOKEN: null,
    ATLASSIAN_OAUTH_EXPIRES_AT: null,
    ATLASSIAN_OAUTH_CLOUD_ID: null,
    ATLASSIAN_OAUTH_USER_EMAIL: null,
    ATLASSIAN_OAUTH_USER_NAME: null,
    ATLASSIAN_OAUTH_SCOPES: null,
  });
}

export function isOAuthConfigured(): boolean {
  const e = loadOAuthEnv();
  return !!(e.accessToken && e.refreshToken && e.cloudId);
}

export function isOAuthRegistered(): boolean {
  const e = loadOAuthEnv();
  return !!(e.clientId && e.clientSecret);
}

// ---------- OAuth flow ----------

export function buildAuthorizationUrl(state: string, codeChallenge: string): string {
  const env = loadOAuthEnv();
  if (!env.clientId) {
    throw new Error('ATLASSIAN_OAUTH_CLIENT_ID not set — register OAuth app in developer.atlassian.com first');
  }
  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: env.clientId,
    scope: ATLASSIAN_OAUTH_SCOPES.join(' '),
    redirect_uri: env.redirectUri,
    state,
    response_type: 'code',
    prompt: 'consent',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<OAuthTokenResponse> {
  const env = loadOAuthEnv();
  if (!env.clientId || !env.clientSecret) {
    throw new Error('Atlassian OAuth client_id/secret not configured (set ATLASSIAN_OAUTH_CLIENT_SECRET in env)');
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: env.clientId,
      client_secret: env.clientSecret,
      code,
      redirect_uri: env.redirectUri,
      code_verifier: codeVerifier,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Token exchange failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function refreshAccessTokenRaw(refreshToken: string): Promise<OAuthTokenResponse> {
  const env = loadOAuthEnv();
  if (!env.clientId || !env.clientSecret) {
    throw new Error('Atlassian OAuth client_id/secret not configured');
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: env.clientId,
      client_secret: env.clientSecret,
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Refresh failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return res.json();
}

export async function getAccessibleResources(accessToken: string): Promise<AccessibleResource[]> {
  const res = await fetch(RESOURCES_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`accessible-resources failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const env = loadOAuthEnv();
  if (!env.clientId || !env.clientSecret) return; // best-effort
  await fetch(REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      token: refreshToken,
    }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {
    /* best-effort: revoke is nice-to-have, not critical */
  });
}

// ---------- Refresh mutex ----------
// Atlassian rotates refresh_token on every use. Two concurrent refreshes would
// both succeed at the HTTP level, but the second response carries a refresh
// token that's already been invalidated by the first — silent lockout.

let refreshPromise: Promise<string> | null = null;

export async function getValidAccessToken(): Promise<string> {
  const env = loadOAuthEnv();
  if (!env.accessToken || !env.refreshToken || !env.expiresAt) {
    throw new Error('Not connected to Atlassian — complete OAuth flow in Settings first');
  }
  const expiresAtMs = Date.parse(env.expiresAt);
  if (Number.isFinite(expiresAtMs) && Date.now() < expiresAtMs - 60_000) {
    return env.accessToken;
  }
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const next = await refreshAccessTokenRaw(env.refreshToken!);
      const nextExpiresAt = new Date(Date.now() + next.expires_in * 1000).toISOString();
      saveOAuthTokens({
        accessToken: next.access_token,
        refreshToken: next.refresh_token,
        expiresAt: nextExpiresAt,
        scopes: next.scope,
      });
      return next.access_token;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Force a refresh ignoring the cached access token. Used by atlassianFetch
 * after a 401 to handle the edge case where the access token was revoked
 * before its stated expires_at.
 */
export async function forceRefreshAccessToken(): Promise<string> {
  const env = loadOAuthEnv();
  if (!env.refreshToken) {
    throw new Error('No refresh token — reconnect Atlassian in Settings');
  }
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const next = await refreshAccessTokenRaw(env.refreshToken!);
      const nextExpiresAt = new Date(Date.now() + next.expires_in * 1000).toISOString();
      saveOAuthTokens({
        accessToken: next.access_token,
        refreshToken: next.refresh_token,
        expiresAt: nextExpiresAt,
        scopes: next.scope,
      });
      return next.access_token;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

// ---------- High-level helpers used by Jira/Confluence clients ----------

export function getJiraOAuthBase(): string {
  const env = loadOAuthEnv();
  if (!env.cloudId) {
    throw new Error('ATLASSIAN_OAUTH_CLOUD_ID not set — complete OAuth flow first');
  }
  return `https://api.atlassian.com/ex/jira/${env.cloudId}`;
}

export function getConfluenceOAuthBase(): string {
  const env = loadOAuthEnv();
  if (!env.cloudId) {
    throw new Error('ATLASSIAN_OAUTH_CLOUD_ID not set — complete OAuth flow first');
  }
  return `https://api.atlassian.com/ex/confluence/${env.cloudId}`;
}
