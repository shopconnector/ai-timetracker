/**
 * Slack OAuth 2.0 (v2) client — PKCE flow, no client_secret embed.
 *
 * Slack is the only one of our three OAuth integrations that supports PKCE
 * for public clients (desktop apps). Token exchange uses code_verifier instead
 * of client_secret — only client_id is embedded in the build, no secret.
 *
 * Localhost redirect URIs require PKCE enabled on the Slack app (which it is
 * automatically when registered with `code_challenge_method=S256`).
 *
 * Token rotation is forced for desktop+PKCE installs, so access_token (12h)
 * is refreshed periodically using the rotating refresh_token.
 *
 * Token storage: .env.local (single-tenant, plain-text — same model as
 * Atlassian/Tempo OAuth in this app).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { randomBytes, createHash } from 'crypto';

// ---------- Config ----------

// 9 scopes — same as legacy SLACK_USER_TOKEN (xoxp-) usage:
// reading channels, groups, IMs, mpims (history + read), plus users:read.
// Note: passed as `user_scope=` (NOT `scope=`) since desktop redirects only
// allow user tokens, not bot tokens.
export const SLACK_USER_SCOPES = [
  'channels:history',
  'channels:read',
  'groups:history',
  'groups:read',
  'im:history',
  'im:read',
  'mpim:history',
  'mpim:read',
  'users:read',
];

const AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
const TOKEN_URL = 'https://slack.com/api/oauth.v2.access';
const REVOKE_URL = 'https://slack.com/api/auth.revoke';

const DEFAULT_REDIRECT_URI = 'http://localhost:5666/timetracker/api/auth/slack/callback';

// Public OAuth 2.0 (PKCE) client_id — registered in api.slack.com/apps as
// "TimeTracker" by the maintainer. PKCE flow makes this safe to embed.
// Override via SLACK_OAUTH_CLIENT_ID env if running with a different Slack app.
const DEFAULT_CLIENT_ID = '439317152757.10550598173174';

// ---------- PKCE helpers (RFC 7636) ----------

export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Filter out .env.example placeholder values so they never override defaults.
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

interface SlackAuthedUser {
  id: string;
  scope: string;
  access_token: string;
  token_type: 'Bearer';
  refresh_token?: string;
  expires_in?: number;
}

interface SlackTeam {
  id: string;
  name?: string;
}

export interface SlackTokenResponse {
  ok: boolean;
  error?: string;
  // Bot-level fields (NOT used for desktop user-scope flow):
  access_token?: string;
  token_type?: string;
  scope?: string;
  bot_user_id?: string;
  app_id?: string;
  // Team + authed_user (user-scope token lives in authed_user):
  team?: SlackTeam;
  authed_user?: SlackAuthedUser;
  // Rotation fields when token rotation is enabled (forced for desktop PKCE):
  refresh_token?: string;
  expires_in?: number;
}

export interface SlackOAuthEnv {
  clientId?: string;
  redirectUri: string;
  accessToken?: string; // user-level xoxp- token
  refreshToken?: string;
  expiresAt?: string;
  userId?: string;
  teamId?: string;
  teamName?: string;
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

const SLACK_ENV_SECTION = '# Slack OAuth 2.0';

function writeSlackEnv(updates: Record<string, string | null>): void {
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
      let sectionIdx = lines.findIndex((l) => l === SLACK_ENV_SECTION);
      if (sectionIdx < 0) {
        if (lines[lines.length - 1] !== '') lines.push('');
        lines.push(SLACK_ENV_SECTION);
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

export function loadSlackOAuthEnv(): SlackOAuthEnv {
  return {
    clientId:
      realValue(process.env.SLACK_OAUTH_CLIENT_ID, 'your-', 'placeholder') ||
      (DEFAULT_CLIENT_ID ? DEFAULT_CLIENT_ID : undefined),
    redirectUri: process.env.SLACK_OAUTH_REDIRECT_URI || DEFAULT_REDIRECT_URI,
    accessToken: process.env.SLACK_OAUTH_ACCESS_TOKEN || undefined,
    refreshToken: process.env.SLACK_OAUTH_REFRESH_TOKEN || undefined,
    expiresAt: process.env.SLACK_OAUTH_EXPIRES_AT || undefined,
    userId: process.env.SLACK_OAUTH_USER_ID || undefined,
    teamId: process.env.SLACK_OAUTH_TEAM_ID || undefined,
    teamName: process.env.SLACK_OAUTH_TEAM_NAME || undefined,
    scopes: process.env.SLACK_OAUTH_SCOPES || undefined,
  };
}

export function saveSlackOAuthTokens(payload: {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  userId?: string;
  teamId?: string;
  teamName?: string;
  scopes?: string;
}): void {
  const updates: Record<string, string | null> = {
    SLACK_OAUTH_ACCESS_TOKEN: payload.accessToken,
  };
  if (payload.refreshToken !== undefined) updates.SLACK_OAUTH_REFRESH_TOKEN = payload.refreshToken;
  if (payload.expiresAt !== undefined) updates.SLACK_OAUTH_EXPIRES_AT = payload.expiresAt;
  if (payload.userId !== undefined) updates.SLACK_OAUTH_USER_ID = payload.userId;
  if (payload.teamId !== undefined) updates.SLACK_OAUTH_TEAM_ID = payload.teamId;
  if (payload.teamName !== undefined) updates.SLACK_OAUTH_TEAM_NAME = payload.teamName;
  if (payload.scopes !== undefined) updates.SLACK_OAUTH_SCOPES = payload.scopes;
  writeSlackEnv(updates);
}

export function clearSlackOAuthTokens(): void {
  // Keep client_id so reconnect doesn't require re-typing.
  writeSlackEnv({
    SLACK_OAUTH_ACCESS_TOKEN: null,
    SLACK_OAUTH_REFRESH_TOKEN: null,
    SLACK_OAUTH_EXPIRES_AT: null,
    SLACK_OAUTH_USER_ID: null,
    SLACK_OAUTH_TEAM_ID: null,
    SLACK_OAUTH_TEAM_NAME: null,
    SLACK_OAUTH_SCOPES: null,
  });
}

export function isSlackOAuthConfigured(): boolean {
  const e = loadSlackOAuthEnv();
  return !!(e.accessToken && e.userId);
}

export function isSlackOAuthRegistered(): boolean {
  const e = loadSlackOAuthEnv();
  return !!e.clientId;
}

// ---------- OAuth flow ----------

export function buildSlackAuthorizationUrl(state: string, codeChallenge: string): string {
  const env = loadSlackOAuthEnv();
  if (!env.clientId) {
    throw new Error(
      'SLACK_OAUTH_CLIENT_ID nie skonfigurowany. Zarejestruj Slack app w api.slack.com/apps i ustaw SLACK_OAUTH_CLIENT_ID.',
    );
  }
  const params = new URLSearchParams({
    client_id: env.clientId,
    user_scope: SLACK_USER_SCOPES.join(','),
    redirect_uri: env.redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function postSlackTokenForm(body: Record<string, string>): Promise<SlackTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(10000),
  });
  // Slack always returns 200 OK with {ok: false, error: ...} on failure.
  const data = (await res.json().catch(() => ({ ok: false, error: 'invalid_json' }))) as SlackTokenResponse;
  if (!data.ok) {
    throw new Error(`Slack OAuth: ${data.error || 'unknown_error'} (HTTP ${res.status})`);
  }
  return data;
}

export async function exchangeSlackCodeForTokens(
  code: string,
  codeVerifier: string,
): Promise<SlackTokenResponse> {
  const env = loadSlackOAuthEnv();
  if (!env.clientId) {
    throw new Error('Slack OAuth client_id nie skonfigurowany');
  }
  return postSlackTokenForm({
    client_id: env.clientId,
    code,
    redirect_uri: env.redirectUri,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
  });
}

async function refreshSlackAccessTokenRaw(refreshToken: string): Promise<SlackTokenResponse> {
  const env = loadSlackOAuthEnv();
  if (!env.clientId) {
    throw new Error('Slack OAuth client_id nie skonfigurowany');
  }
  return postSlackTokenForm({
    client_id: env.clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
}

export async function revokeSlackToken(token: string): Promise<void> {
  await fetch(REVOKE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: '',
    signal: AbortSignal.timeout(5000),
  }).catch(() => {
    /* best-effort */
  });
}

// ---------- Refresh mutex ----------
// Slack rotates refresh_token on every use (forced for desktop PKCE).

let slackRefreshPromise: Promise<string> | null = null;

export async function getValidSlackAccessToken(): Promise<string> {
  const env = loadSlackOAuthEnv();
  if (!env.accessToken) {
    throw new Error('Slack OAuth nie podłączone — kliknij Connect with Slack w Settings');
  }
  // If no expiresAt (token without rotation), assume still valid.
  if (!env.expiresAt) return env.accessToken;
  if (!env.refreshToken) return env.accessToken;

  const expiresAtMs = Date.parse(env.expiresAt);
  if (Number.isFinite(expiresAtMs) && Date.now() < expiresAtMs - 60_000) {
    return env.accessToken;
  }
  if (slackRefreshPromise) return slackRefreshPromise;

  slackRefreshPromise = (async () => {
    try {
      const next = await refreshSlackAccessTokenRaw(env.refreshToken!);
      // Slack v2 refresh returns top-level access_token (not nested in authed_user)
      const newAccess = next.access_token || next.authed_user?.access_token;
      const newRefresh = next.refresh_token || next.authed_user?.refresh_token;
      const newExpiresIn = next.expires_in || next.authed_user?.expires_in;
      if (!newAccess) throw new Error('Slack refresh response missing access_token');
      const nextExpiresAt = newExpiresIn
        ? new Date(Date.now() + newExpiresIn * 1000).toISOString()
        : undefined;
      saveSlackOAuthTokens({
        accessToken: newAccess,
        refreshToken: newRefresh,
        expiresAt: nextExpiresAt,
      });
      return newAccess;
    } finally {
      slackRefreshPromise = null;
    }
  })();
  return slackRefreshPromise;
}
