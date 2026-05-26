import { NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { getGithubUser } from '@/lib/github';
import {
  getJiraOAuthBase,
  getValidAccessToken,
  isOAuthConfigured,
  loadOAuthEnv,
} from '@/lib/atlassianOAuth';

/**
 * Detect the correct .env.local path.
 *
 * Priority:
 *   1. TIMETRACKER_DATA_DIR — exported by start-server.js (macOS bundle, Windows bundle).
 *      Guarantees we WRITE to the same file the launcher READS at startup.
 *   2. <cwd>/data/.env.local — Windows standalone bundle convention.
 *   3. Monorepo dev/PM2 mode — cwd's package.json name === '@timetracker/web'
 *      means Next.js is auto-loading <cwd>/.env.local; match it so PUT and READ
 *      hit the SAME file. Covers `pnpm dev` and `pm2 start next start -p 5666`.
 *   4. ~/.timetracker/.env.local — macOS bundle convention (when start-server.js
 *      hasn't run AND we're not in monorepo).
 *   5. <cwd>/.env.local — last-resort fallback.
 *
 * Without this synchronization, tokens saved via the UI "disappear" after the next
 * app restart because the launcher loads from a different file than route.ts wrote to.
 */
function getEnvFilePath(): string {
  const explicitDir = process.env.TIMETRACKER_DATA_DIR;
  if (explicitDir) {
    return join(explicitDir, '.env.local');
  }

  const cwd = process.cwd();
  const dataEnvPath = join(cwd, 'data', '.env.local');
  if (existsSync(dataEnvPath)) {
    return dataEnvPath;
  }

  // Monorepo dev / PM2-with-next-start: cwd is the @timetracker/web package root.
  // Next.js auto-loads <cwd>/.env.local — we MUST write back to the same file.
  const cwdPkg = join(cwd, 'package.json');
  if (existsSync(cwdPkg)) {
    try {
      const pkg = JSON.parse(readFileSync(cwdPkg, 'utf-8')) as { name?: string };
      if (pkg.name === '@timetracker/web') {
        return join(cwd, '.env.local');
      }
    } catch {
      // ignore malformed package.json
    }
  }

  if (process.platform === 'darwin') {
    return join(homedir(), '.timetracker', '.env.local');
  }

  return join(cwd, '.env.local');
}

/** Strip trailing slash and whitespace from a base URL. */
function normalizeBaseUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  return url.trim().replace(/\/+$/, '');
}

/**
 * Build a human-readable error message for a JIRA test failure.
 * Each branch points the user toward the most likely fix.
 */
function jiraErrorMessage(status: number, body: string): string {
  if (status === 401) {
    return (
      'Błąd 401: Email nie pasuje do właściciela tokenu, albo token wygasł/został unieważniony. ' +
      'Sprawdź email na https://id.atlassian.com (musi być DOKŁADNIE ten sam) lub wygeneruj nowy token: ' +
      'https://id.atlassian.com/manage-profile/security/api-tokens'
    );
  }
  if (status === 403) {
    return 'Błąd 403: Token nie ma uprawnień do tego endpointa. Sprawdź konto/scope w Atlassian.';
  }
  if (status === 404) {
    return (
      'Błąd 404: Endpoint /rest/api/3/myself nie istnieje na tym serwerze. ' +
      'Aplikacja wspiera WYŁĄCZNIE Atlassian Cloud (URL kończy się na .atlassian.net). ' +
      'JIRA Server / Data Center nie jest wspierany.'
    );
  }
  const excerpt = body ? ` (${body.slice(0, 120)})` : '';
  return `Błąd HTTP ${status}${excerpt}`;
}

function jiraOAuthErrorMessage(status: number, body: string): string {
  if (status === 401) {
    return (
      'OAuth 401: Access token wygasł i refresh się nie udał. ' +
      'Kliknij "Reconnect" w Settings → Jira API → OAuth.'
    );
  }
  if (status === 403) {
    return (
      'OAuth 403: Brakuje scope\'u w tokenie. ' +
      'Kliknij "Reconnect" i zatwierdź wszystkie uprawnienia w Atlassianie.'
    );
  }
  const excerpt = body ? ` (${body.slice(0, 120)})` : '';
  return `OAuth HTTP ${status}${excerpt}`;
}

function tempoErrorMessage(status: number, body: string): string {
  if (status === 401) {
    return (
      'Błąd 401: Token Tempo wygasł lub jest nieprawidłowy. ' +
      'Wygeneruj nowy: Jira → Apps → Tempo → Settings → API Integration → New Token. ' +
      'Pamiętaj zaznaczyć scope: Worklogs (View, Create, Edit).'
    );
  }
  if (status === 403) {
    return (
      'Błąd 403: Token Tempo nie ma scope `Worklogs: View`. ' +
      'Wygeneruj nowy token z odpowiednim scope (View + Create + Edit).'
    );
  }
  if (status === 404) {
    return 'Błąd 404: Endpoint Tempo nie istnieje. Sprawdź czy używasz Tempo Cloud (api.tempo.io).';
  }
  const excerpt = body ? ` (${body.slice(0, 120)})` : '';
  return `Błąd HTTP ${status}${excerpt}`;
}

interface TestCredentials {
  jiraBaseUrl?: string;
  jiraEmail?: string;
  jiraApiToken?: string;
  tempoApiToken?: string;
  tempoAccountId?: string;
  slackUserToken?: string;
  geminiApiKey?: string;
  openRouterApiKey?: string;
  activityWatchUrl?: string;
  githubToken?: string;
}

/** Pick a credential value from request body if not masked, otherwise fall back to env. */
function pickCred(fromBody: string | undefined, fromEnv: string | undefined): string | undefined {
  if (typeof fromBody === 'string' && fromBody.length > 0 && !fromBody.includes('••')) {
    return fromBody;
  }
  return fromEnv;
}

// GET /api/settings - Get settings from environment variables
export async function GET() {
  try {
    const tempoApiToken = process.env.TEMPO_API_TOKEN;
    const tempoAccountId = process.env.TEMPO_ACCOUNT_ID;
    const jiraBaseUrl = normalizeBaseUrl(process.env.JIRA_BASE_URL);
    const jiraApiToken = process.env.JIRA_API_KEY;
    const jiraEmail = process.env.JIRA_SERVICE_EMAIL;
    const activityWatchUrl = process.env.ACTIVITYWATCH_URL || 'http://localhost:5600';
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const llmModel = process.env.LLM_MODEL || 'gemini-2.5-flash';
    const slackUserToken = process.env.SLACK_USER_TOKEN;
    const projectsRoot = process.env.PROJECTS_ROOT;
    const gitAuthorFilter = process.env.GIT_AUTHOR_FILTER;
    const githubToken = process.env.GITHUB_TOKEN;
    const oauth = loadOAuthEnv();

    return NextResponse.json({
      // API Config (masked)
      tempoApiToken: tempoApiToken ? '••••••••' : null,
      tempoAccountId,
      jiraBaseUrl,
      jiraApiToken: jiraApiToken ? '••••••••' : null,
      jiraEmail,
      activityWatchUrl,
      openRouterApiKey: openRouterApiKey ? '••••••••' : null,
      geminiApiKey: geminiApiKey ? '••••••••' : null,
      llmModel,
      slackUserToken: slackUserToken ? '••••••••' : null,
      projectsRoot,
      gitAuthorFilter,
      githubToken: githubToken ? '••••••••' : null,
      aiProvider: geminiApiKey ? 'gemini' : 'openrouter',

      // Status flags
      hasTempoConfig: !!(tempoApiToken && tempoAccountId),
      hasJiraConfig: !!(jiraBaseUrl && jiraApiToken && jiraEmail),
      hasOpenRouterConfig: !!openRouterApiKey,
      hasGeminiConfig: !!geminiApiKey,
      hasSlackConfig: !!slackUserToken,
      hasGitConfig: !!projectsRoot,
      hasGithubApiConfig: !!githubToken,

      // Atlassian OAuth 2.0 (3LO + PKCE) — alternative to JIRA_API_KEY Basic Auth
      atlassianClientId: oauth.clientId || null,
      atlassianSiteUrl: oauth.siteUrl,
      atlassianRedirectUri: oauth.redirectUri,
      oauthConnected: isOAuthConfigured(),
      oauthUserEmail: oauth.userEmail || null,
      oauthUserName: oauth.userName || null,
      oauthExpiresAt: oauth.expiresAt || null,
      oauthCloudId: oauth.cloudId || null,
      oauthScopes: oauth.scopes || null,

      // Diagnostics — helps users see WHERE we're reading/writing
      envFilePath: getEnvFilePath(),
      dataDir: process.env.TIMETRACKER_DATA_DIR || null,
    });
  } catch (error) {
    console.error('Get settings error:', error);
    return NextResponse.json({ error: 'Failed to get settings' }, { status: 500 });
  }
}

// POST /api/settings/test - Test API connections.
// If `credentials` is provided in body, test with those values directly (no save needed).
// Otherwise fall back to current process.env values.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { testType, credentials = {} } = body as {
      testType: string;
      credentials?: TestCredentials;
    };

    const results: Record<string, { success: boolean; message: string }> = {};

    // Test Tempo API
    if (testType === 'tempo' || testType === 'all') {
      const tempoApiToken = pickCred(credentials.tempoApiToken, process.env.TEMPO_API_TOKEN);
      const tempoAccountId = pickCred(credentials.tempoAccountId, process.env.TEMPO_ACCOUNT_ID);

      if (tempoApiToken && tempoAccountId) {
        try {
          const res = await fetch('https://api.tempo.io/4/worklogs?limit=1', {
            headers: {
              'Authorization': `Bearer ${tempoApiToken}`,
              'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) {
            results.tempo = { success: true, message: 'Połączono z Tempo API' };
          } else {
            const bodyText = await res.text().catch(() => '');
            results.tempo = { success: false, message: tempoErrorMessage(res.status, bodyText) };
          }
        } catch (e) {
          results.tempo = { success: false, message: `Błąd sieci: ${e instanceof Error ? e.message : String(e)}` };
        }
      } else {
        results.tempo = {
          success: false,
          message: 'Brak konfiguracji Tempo (wymagane: TEMPO_API_TOKEN i TEMPO_ACCOUNT_ID)',
        };
      }
    }

    // Test Jira API — OAuth 2.0 first if configured, else Basic Auth
    if (testType === 'jira' || testType === 'all') {
      if (isOAuthConfigured()) {
        try {
          const accessToken = await getValidAccessToken();
          const res = await fetch(`${getJiraOAuthBase()}/rest/api/3/myself`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json',
            },
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) {
            const data = await res.json();
            results.jira = {
              success: true,
              message: `Połączono jako: ${data.displayName} (${data.emailAddress}) [OAuth]`,
            };
          } else {
            const bodyText = await res.text().catch(() => '');
            results.jira = { success: false, message: jiraOAuthErrorMessage(res.status, bodyText) };
          }
        } catch (e) {
          results.jira = {
            success: false,
            message: `Błąd OAuth: ${e instanceof Error ? e.message : String(e)}`,
          };
        }
      } else {
        const jiraBaseUrl = normalizeBaseUrl(pickCred(credentials.jiraBaseUrl, process.env.JIRA_BASE_URL));
        const jiraApiToken = pickCred(credentials.jiraApiToken, process.env.JIRA_API_KEY);
        const jiraEmail = pickCred(credentials.jiraEmail, process.env.JIRA_SERVICE_EMAIL);

        if (jiraBaseUrl && jiraApiToken && jiraEmail) {
          try {
            const credentialsB64 = Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64');
            const res = await fetch(`${jiraBaseUrl}/rest/api/3/myself`, {
              headers: {
                'Authorization': `Basic ${credentialsB64}`,
                'Accept': 'application/json',
              },
              signal: AbortSignal.timeout(5000),
            });
            if (res.ok) {
              const data = await res.json();
              results.jira = {
                success: true,
                message: `Połączono jako: ${data.displayName} (${data.emailAddress || jiraEmail}) [API Token]`,
              };
            } else {
              const bodyText = await res.text().catch(() => '');
              results.jira = { success: false, message: jiraErrorMessage(res.status, bodyText) };
            }
          } catch (e) {
            results.jira = { success: false, message: `Błąd sieci: ${e instanceof Error ? e.message : String(e)}` };
          }
        } else {
          const missing = [];
          if (!jiraBaseUrl) missing.push('Base URL');
          if (!jiraEmail) missing.push('Email');
          if (!jiraApiToken) missing.push('API Token');
          results.jira = { success: false, message: `Brak konfiguracji Jira (wymagane: ${missing.join(', ')})` };
        }
      }
    }

    // Test ActivityWatch
    if (testType === 'activitywatch' || testType === 'all') {
      const { awFetch } = await import('@/lib/activitywatch');
      try {
        const res = await awFetch('/api/0/info');
        if (res.ok) {
          const data = await res.json();
          results.activitywatch = {
            success: true,
            message: `Połączono z ActivityWatch ${data.version || ''}`,
          };
        } else {
          results.activitywatch = { success: false, message: `Błąd: ${res.status}` };
        }
      } catch {
        results.activitywatch = {
          success: false,
          message: 'ActivityWatch nie działa lub niedostępny (port 5600)',
        };
      }
    }

    // Test Slack API
    if (testType === 'slack' || testType === 'all') {
      const slackToken = pickCred(credentials.slackUserToken, process.env.SLACK_USER_TOKEN);

      if (slackToken) {
        try {
          const res = await fetch('https://slack.com/api/auth.test', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${slackToken}`,
              'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(5000),
          });
          const data = await res.json();
          if (data.ok) {
            results.slack = {
              success: true,
              message: `Połączono jako: ${data.user}`,
            };
          } else {
            results.slack = { success: false, message: `Błąd Slack: ${data.error}` };
          }
        } catch (e) {
          results.slack = { success: false, message: `Błąd połączenia: ${e instanceof Error ? e.message : String(e)}` };
        }
      } else {
        results.slack = { success: false, message: 'Brak konfiguracji Slack (SLACK_USER_TOKEN)' };
      }
    }

    // Test GitHub API (Personal Access Token)
    if (testType === 'github' || testType === 'all') {
      const githubToken = pickCred(credentials.githubToken, process.env.GITHUB_TOKEN);
      if (githubToken) {
        const userOrErr = await getGithubUser(githubToken);
        if ('error' in userOrErr) {
          let hint = '';
          if (userOrErr.status === 401) {
            hint = ' Token wygasł albo jest niepoprawny — wygeneruj nowy: https://github.com/settings/tokens';
          } else if (userOrErr.status === 403) {
            hint = ' Token nie ma wymaganego scope. Potrzeba: `repo` (private) lub `public_repo`.';
          }
          results.github = {
            success: false,
            message: `GitHub API ${userOrErr.status || ''}: ${userOrErr.error.slice(0, 120)}.${hint}`,
          };
        } else {
          results.github = {
            success: true,
            message: `Połączono jako: ${userOrErr.login}${userOrErr.name ? ` (${userOrErr.name})` : ''}`,
          };
        }
      } else if (testType === 'github') {
        results.github = { success: false, message: 'Brak GITHUB_TOKEN — wpisz Personal Access Token w polu GitHub.' };
      }
      // when testType === 'all' and no token, silently skip — local-repo strategy is used instead
    }

    // Test AI/LLM (Gemini first, then OpenRouter)
    if (testType === 'openrouter' || testType === 'gemini' || testType === 'all') {
      const geminiApiKey = pickCred(credentials.geminiApiKey, process.env.GEMINI_API_KEY);
      const openRouterApiKey = pickCred(credentials.openRouterApiKey, process.env.OPENROUTER_API_KEY);

      if (geminiApiKey) {
        try {
          const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: 'Odpowiedz: OK' }] }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 10 },
              }),
              signal: AbortSignal.timeout(10000),
            }
          );
          results.openrouter = {
            success: res.ok,
            message: res.ok ? `Gemini (${geminiModel}) dziala` : `Gemini error: ${res.status}`,
          };
        } catch (e) {
          results.openrouter = { success: false, message: `Gemini blad: ${e}` };
        }
      } else if (openRouterApiKey) {
        try {
          const res = await fetch('https://openrouter.ai/api/v1/models', {
            headers: {
              Authorization: `Bearer ${openRouterApiKey}`,
            },
            signal: AbortSignal.timeout(5000),
          });
          results.openrouter = {
            success: res.ok,
            message: res.ok ? 'Połączono z OpenRouter' : `Błąd: ${res.status}`,
          };
        } catch (e) {
          results.openrouter = { success: false, message: `Błąd połączenia: ${e}` };
        }
      } else {
        results.openrouter = { success: false, message: 'Brak klucza API (Gemini lub OpenRouter)' };
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Test API error:', error);
    return NextResponse.json({ error: 'Failed to test APIs' }, { status: 500 });
  }
}

// Field name → env var name mapping
const FIELD_TO_ENV: Record<string, string> = {
  tempoApiToken: 'TEMPO_API_TOKEN',
  tempoAccountId: 'TEMPO_ACCOUNT_ID',
  jiraBaseUrl: 'JIRA_BASE_URL',
  jiraApiToken: 'JIRA_API_KEY',
  jiraEmail: 'JIRA_SERVICE_EMAIL',
  activityWatchUrl: 'ACTIVITYWATCH_URL',
  openRouterApiKey: 'OPENROUTER_API_KEY',
  geminiApiKey: 'GEMINI_API_KEY',
  llmModel: 'LLM_MODEL',
  slackUserToken: 'SLACK_USER_TOKEN',
  projectsRoot: 'PROJECTS_ROOT',
  gitAuthorFilter: 'GIT_AUTHOR_FILTER',
  githubToken: 'GITHUB_TOKEN',
  atlassianClientId: 'ATLASSIAN_OAUTH_CLIENT_ID',
  atlassianSiteUrl: 'ATLASSIAN_OAUTH_SITE_URL',
  atlassianRedirectUri: 'ATLASSIAN_OAUTH_REDIRECT_URI',
};

// Section comments for env file organization
const ENV_SECTIONS: Record<string, string> = {
  TEMPO_API_TOKEN: '# Tempo API',
  TEMPO_ACCOUNT_ID: '# Tempo API',
  JIRA_BASE_URL: '# Jira API',
  JIRA_API_KEY: '# Jira API',
  JIRA_SERVICE_EMAIL: '# Jira API',
  ACTIVITYWATCH_URL: '# ActivityWatch',
  OPENROUTER_API_KEY: '# OpenRouter API',
  GEMINI_API_KEY: '# Gemini API (Google AI Studio)',
  LLM_MODEL: '# LLM Model',
  SLACK_USER_TOKEN: '# Slack API',
  PROJECTS_ROOT: '# Git / Activity',
  GIT_AUTHOR_FILTER: '# Git / Activity',
  GITHUB_TOKEN: '# GitHub API (Personal Access Token, scope: repo or public_repo)',
  ATLASSIAN_OAUTH_CLIENT_ID: '# Atlassian OAuth 2.0',
  ATLASSIAN_OAUTH_SITE_URL: '# Atlassian OAuth 2.0',
  ATLASSIAN_OAUTH_REDIRECT_URI: '# Atlassian OAuth 2.0',
};

// PUT /api/settings - Save settings to .env.local
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const envPath = getEnvFilePath();

    const envDir = dirname(envPath);
    if (!existsSync(envDir)) {
      mkdirSync(envDir, { recursive: true });
    }

    let envContent = '';
    try {
      envContent = readFileSync(envPath, 'utf-8');
    } catch {
      // File doesn't exist yet, start fresh
    }

    const envLines = envContent.split('\n');
    const existingVars = new Map<string, { value: string; lineIndex: number }>();
    for (let i = 0; i < envLines.length; i++) {
      const match = envLines[i].match(/^([A-Z_]+)=(.*)/);
      if (match) {
        existingVars.set(match[1], { value: match[2], lineIndex: i });
      }
    }

    const updatedVars = new Set<string>();
    for (const [field, envName] of Object.entries(FIELD_TO_ENV)) {
      let value = body[field];
      if (value === undefined || value === null) continue;
      // Skip masked values — don't overwrite real keys with placeholders
      if (typeof value === 'string' && value.includes('••')) continue;
      // Skip empty strings for token/key fields (don't clear existing keys)
      const isSecretField = ['tempoApiToken', 'jiraApiToken', 'openRouterApiKey', 'geminiApiKey', 'slackUserToken', 'githubToken'].includes(field);
      if (isSecretField && value === '') continue;
      // Skip aiProvider — it's derived, not stored
      if (field === 'aiProvider') continue;

      // Normalize URLs — strip trailing slash so fetch builds clean paths
      if (
        (field === 'jiraBaseUrl' || field === 'atlassianSiteUrl') &&
        typeof value === 'string'
      ) {
        value = normalizeBaseUrl(value) ?? value;
      }

      updatedVars.add(envName);

      if (existingVars.has(envName)) {
        const { lineIndex } = existingVars.get(envName)!;
        envLines[lineIndex] = `${envName}=${value}`;
      } else {
        const section = ENV_SECTIONS[envName] || '';
        const sectionIndex = envLines.findIndex(l => l === section);

        if (sectionIndex >= 0) {
          let insertAt = sectionIndex + 1;
          while (insertAt < envLines.length && envLines[insertAt].match(/^[A-Z_]+=/)) {
            insertAt++;
          }
          envLines.splice(insertAt, 0, `${envName}=${value}`);
        } else {
          if (envLines[envLines.length - 1] !== '') {
            envLines.push('');
          }
          if (section) envLines.push(section);
          envLines.push(`${envName}=${value}`);
        }
      }

      // Update process.env in-memory for immediate effect (Test button uses this)
      process.env[envName] = value;
    }

    writeFileSync(envPath, envLines.join('\n'));

    return NextResponse.json({
      success: true,
      message: 'Konfiguracja zapisana',
      envFilePath: envPath,
      updated: Array.from(updatedVars),
    });
  } catch (error) {
    console.error('Save settings error:', error);
    return NextResponse.json(
      { error: 'Failed to save settings', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
