/**
 * Tempo Cloud OAuth 2.0 (3-legged) client.
 *
 * IMPORTANT: Tempo OAuth is a SEPARATE auth system from Atlassian OAuth.
 *   - Atlassian OAuth: auth.atlassian.com + api.atlassian.com (Jira + Confluence)
 *   - Tempo OAuth:     {tenant}.atlassian.net/plugins/servlet/ac/io.tempo.jira + api.tempo.io
 * They have different client_id/secret pairs and different consent screens.
 *
 * Token endpoint accepts form-urlencoded body (NOT JSON, unlike Atlassian).
 * Scopes are configured at app-registration time in Tempo's UI (not in authorize URL).
 * Refresh token rotation: not documented — we always persist the new refresh_token
 * returned by every refresh response (safe under both rotating and static models).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

// ---------- Config ----------

const TEMPO_TOKEN_URL = 'https://api.tempo.io/oauth/token/';
const TEMPO_REVOKE_URL = 'https://api.tempo.io/oauth/revoke_token/';
// Authorize URL is built per-tenant: {siteUrl}/plugins/servlet/ac/io.tempo.jira/oauth-authorize/

const DEFAULT_REDIRECT_URI = 'http://localhost:5666/timetracker/api/auth/tempo/callback';

// Public OAuth 2.0 client_id — registered in Jira's Tempo plugin by the
// TimeTracker maintainer. Tempo OAuth requires client_secret (no PKCE), so
// secret is injected at build time from env (GitHub Actions secret).
const DEFAULT_CLIENT_ID = 'YNLXgTdx6fvPxSnfWrN61qgOTstp2ILdxpA8kVv0Ak0mtblrzq';
const DEFAULT_SITE_URL = 'https://beecommerce.atlassian.net';

/** Filter .env.example placeholder values so they never override defaults. */
function realValue(v: string | undefined, ...placeholders: string[]): string | undefined {
  if (!v) return undefined;
  const lower = v.toLowerCase();
  for (const p of placeholders) {
    if (lower.includes(p.toLowerCase())) return undefined;
  }
  return v;
}

// ---------- Types ----------

export interface TempoTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: 'Bearer';
  scope?: string;
}

export interface TempoOAuthEnv {
  clientId?: string;
  clientSecret?: string;
  siteUrl?: string; // Jira tenant URL where Tempo plugin is installed
  redirectUri: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes?: string;
}

// ---------- Env file IO ----------
// Mirrors getEnvFilePath() in app/api/settings/route.ts.

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

const TEMPO_ENV_SECTION = '# Tempo OAuth 2.0';

function writeTempoEnv(updates: Record<string, string | null>): void {
  const envPath = getEnvFilePath();
  const envDir = dirname(envPath);
  if (!existsSync(envDir)) mkdirSync(envDir, { recursive: true });

  let content = '';
  try {
    content = readFileSync(envPath, 'utf-8');
  } catch {
    /* may not exist */
  }

  const lines = content.split('\n');
  const existing = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([A-Z_]+)=/);
    if (m) existing.set(m[1], i);
  }

  for (const [key, value] of Object.entries(updates)) {
    if (value === null) {
      const idx = existing.get(key);
      if (idx !== undefined) lines[idx] = '';
      delete process.env[key];
      continue;
    }

    const idx = existing.get(key);
    if (idx !== undefined) {
      lines[idx] = `${key}=${value}`;
    } else {
      let sectionIdx = lines.findIndex((l) => l === TEMPO_ENV_SECTION);
      if (sectionIdx < 0) {
        if (lines[lines.length - 1] !== '') lines.push('');
        lines.push(TEMPO_ENV_SECTION);
        sectionIdx = lines.length - 1;
      }
      let insertAt = sectionIdx + 1;
      while (insertAt < lines.length && lines[insertAt].match(/^[A-Z_]+=/)) insertAt++;
      lines.splice(insertAt, 0, `${key}=${value}`);
      existing.set(key, insertAt);
    }
    process.env[key] = value;
  }

  const collapsed: string[] = [];
  for (const l of lines) {
    if (l === '' && collapsed[collapsed.length - 1] === '') continue;
    collapsed.push(l);
  }
  writeFileSync(envPath, collapsed.join('\n'));
}

// ---------- Public env accessors ----------

export function loadTempoOAuthEnv(): TempoOAuthEnv {
  return {
    clientId: realValue(process.env.TEMPO_OAUTH_CLIENT_ID, 'your-', 'placeholder') || DEFAULT_CLIENT_ID,
    clientSecret: realValue(process.env.TEMPO_OAUTH_CLIENT_SECRET, 'your-', 'placeholder'),
    siteUrl:
      realValue(process.env.TEMPO_OAUTH_SITE_URL, 'your-company', 'your-tenant', 'example.atlassian') ||
      realValue(process.env.ATLASSIAN_OAUTH_SITE_URL, 'your-company', 'your-tenant', 'example.atlassian') ||
      DEFAULT_SITE_URL,
    redirectUri: process.env.TEMPO_OAUTH_REDIRECT_URI || DEFAULT_REDIRECT_URI,
    accessToken: process.env.TEMPO_OAUTH_ACCESS_TOKEN || undefined,
    refreshToken: process.env.TEMPO_OAUTH_REFRESH_TOKEN || undefined,
    expiresAt: process.env.TEMPO_OAUTH_EXPIRES_AT || undefined,
    scopes: process.env.TEMPO_OAUTH_SCOPES || undefined,
  };
}

export function saveTempoOAuthTokens(payload: {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scopes?: string;
}): void {
  const updates: Record<string, string | null> = {
    TEMPO_OAUTH_ACCESS_TOKEN: payload.accessToken,
    TEMPO_OAUTH_REFRESH_TOKEN: payload.refreshToken,
    TEMPO_OAUTH_EXPIRES_AT: payload.expiresAt,
  };
  if (payload.scopes !== undefined) updates.TEMPO_OAUTH_SCOPES = payload.scopes;
  writeTempoEnv(updates);
}

export function clearTempoOAuthTokens(): void {
  writeTempoEnv({
    TEMPO_OAUTH_ACCESS_TOKEN: null,
    TEMPO_OAUTH_REFRESH_TOKEN: null,
    TEMPO_OAUTH_EXPIRES_AT: null,
    TEMPO_OAUTH_SCOPES: null,
  });
}

export function isTempoOAuthConfigured(): boolean {
  const e = loadTempoOAuthEnv();
  return !!(e.accessToken && e.refreshToken);
}

export function isTempoOAuthRegistered(): boolean {
  const e = loadTempoOAuthEnv();
  return !!(e.clientId && e.clientSecret && e.siteUrl);
}

// ---------- OAuth flow ----------

export function buildTempoAuthorizationUrl(state: string): string {
  const env = loadTempoOAuthEnv();
  if (!env.clientId || !env.siteUrl) {
    throw new Error('TEMPO_OAUTH_CLIENT_ID lub TEMPO_OAUTH_SITE_URL nie ustawione');
  }
  const siteUrl = env.siteUrl.replace(/\/+$/, '');
  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: env.redirectUri,
    access_type: 'tenant_user',
    state,
    response_type: 'code',
  });
  return `${siteUrl}/plugins/servlet/ac/io.tempo.jira/oauth-authorize/?${params.toString()}`;
}

async function postTokenForm(body: Record<string, string>): Promise<TempoTokenResponse> {
  const formBody = new URLSearchParams(body).toString();
  const res = await fetch(TEMPO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: formBody,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Tempo token endpoint: ${res.status} ${text.slice(0, 300)}`);
  }
  return res.json();
}

export async function exchangeTempoCodeForTokens(code: string): Promise<TempoTokenResponse> {
  const env = loadTempoOAuthEnv();
  if (!env.clientId || !env.clientSecret) {
    throw new Error('Tempo OAuth client_id/secret nie skonfigurowane');
  }
  return postTokenForm({
    grant_type: 'authorization_code',
    client_id: env.clientId,
    client_secret: env.clientSecret,
    redirect_uri: env.redirectUri,
    code,
  });
}

async function refreshTempoAccessTokenRaw(refreshToken: string): Promise<TempoTokenResponse> {
  const env = loadTempoOAuthEnv();
  if (!env.clientId || !env.clientSecret) {
    throw new Error('Tempo OAuth client_id/secret nie skonfigurowane');
  }
  return postTokenForm({
    grant_type: 'refresh_token',
    client_id: env.clientId,
    client_secret: env.clientSecret,
    refresh_token: refreshToken,
  });
}

export async function revokeTempoToken(refreshToken: string): Promise<void> {
  const env = loadTempoOAuthEnv();
  if (!env.clientId || !env.clientSecret) return;
  await fetch(TEMPO_REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      token: refreshToken,
    }).toString(),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {
    /* best-effort */
  });
}

// ---------- Refresh mutex ----------

let tempoRefreshPromise: Promise<string> | null = null;

export async function getValidTempoAccessToken(): Promise<string> {
  const env = loadTempoOAuthEnv();
  if (!env.accessToken || !env.refreshToken || !env.expiresAt) {
    throw new Error('Tempo OAuth nie podłączone — przejdź flow w Settings');
  }
  const expiresAtMs = Date.parse(env.expiresAt);
  if (Number.isFinite(expiresAtMs) && Date.now() < expiresAtMs - 60_000) {
    return env.accessToken;
  }
  if (tempoRefreshPromise) return tempoRefreshPromise;

  tempoRefreshPromise = (async () => {
    try {
      const next = await refreshTempoAccessTokenRaw(env.refreshToken!);
      const nextExpiresAt = new Date(Date.now() + next.expires_in * 1000).toISOString();
      saveTempoOAuthTokens({
        accessToken: next.access_token,
        refreshToken: next.refresh_token,
        expiresAt: nextExpiresAt,
        scopes: next.scope,
      });
      return next.access_token;
    } finally {
      tempoRefreshPromise = null;
    }
  })();

  return tempoRefreshPromise;
}
