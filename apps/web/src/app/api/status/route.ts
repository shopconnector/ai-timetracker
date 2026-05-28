import { NextResponse } from 'next/server';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { awFetch } from '@/lib/activitywatch';
import { getGithubUser } from '@/lib/github';
import { getJiraOAuthBase, getValidAccessToken, isOAuthConfigured } from '@/lib/atlassianOAuth';
import { getValidTempoAccessToken, isTempoOAuthConfigured } from '@/lib/tempoOAuth';
import { getValidSlackAccessToken, isSlackOAuthConfigured } from '@/lib/slackOAuth';

interface ApiStatus {
  name: string;
  configured: boolean;
  status: 'ok' | 'error' | 'unconfigured';
  message?: string;
}

async function checkActivityWatch(): Promise<ApiStatus> {
  const url = process.env.ACTIVITYWATCH_URL;
  if (!url) {
    return { name: 'ActivityWatch', configured: false, status: 'unconfigured' };
  }

  try {
    const response = await awFetch('/api/0/info');
    if (response.ok) {
      return { name: 'ActivityWatch', configured: true, status: 'ok', message: url };
    }
    return { name: 'ActivityWatch', configured: true, status: 'error', message: 'Not responding' };
  } catch {
    return { name: 'ActivityWatch', configured: true, status: 'error', message: 'Connection failed' };
  }
}

async function checkTempo(): Promise<ApiStatus> {
  // OAuth 2.0 first if connected
  if (isTempoOAuthConfigured()) {
    try {
      const token = await getValidTempoAccessToken();
      const response = await fetch('https://api.tempo.io/4/worklogs?limit=1', {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        return { name: 'Tempo', configured: true, status: 'ok', message: 'Connected [Tempo OAuth]' };
      }
      return { name: 'Tempo', configured: true, status: 'error', message: `Tempo OAuth HTTP ${response.status}` };
    } catch (err) {
      return {
        name: 'Tempo',
        configured: true,
        status: 'error',
        message: `OAuth: ${err instanceof Error ? err.message : 'connection failed'}`,
      };
    }
  }

  const token = process.env.TEMPO_API_TOKEN;
  if (!token) {
    return { name: 'Tempo', configured: false, status: 'unconfigured' };
  }

  try {
    const response = await fetch('https://api.tempo.io/4/worklogs?limit=1', {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(5000)
    });
    if (response.ok) {
      return { name: 'Tempo', configured: true, status: 'ok', message: 'Connected' };
    }
    return { name: 'Tempo', configured: true, status: 'error', message: `HTTP ${response.status}` };
  } catch {
    return { name: 'Tempo', configured: true, status: 'error', message: 'Connection failed' };
  }
}

async function checkJira(): Promise<ApiStatus> {
  // OAuth 2.0 path takes precedence when configured
  if (isOAuthConfigured()) {
    try {
      const token = await getValidAccessToken();
      const response = await fetch(`${getJiraOAuthBase()}/rest/api/3/myself`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const data = await response.json();
        return {
          name: 'Jira',
          configured: true,
          status: 'ok',
          message: `${data.displayName || 'Connected'} [Atlassian OAuth]`,
        };
      }
      return { name: 'Jira', configured: true, status: 'error', message: `Atlassian OAuth HTTP ${response.status}` };
    } catch (err) {
      return {
        name: 'Jira',
        configured: true,
        status: 'error',
        message: `Atlassian OAuth: ${err instanceof Error ? err.message : 'connection failed'}`,
      };
    }
  }

  const email = process.env.JIRA_SERVICE_EMAIL;
  const apiKey = process.env.JIRA_API_KEY;
  const baseUrl = process.env.JIRA_BASE_URL;

  if (!email || !apiKey || !baseUrl) {
    return { name: 'Jira', configured: false, status: 'unconfigured' };
  }

  try {
    const auth = Buffer.from(`${email}:${apiKey}`).toString('base64');
    const response = await fetch(`${baseUrl}/rest/api/3/myself`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(5000)
    });
    if (response.ok) {
      const data = await response.json();
      return { name: 'Jira', configured: true, status: 'ok', message: `${data.displayName || 'Connected'} [API Token]` };
    }
    return { name: 'Jira', configured: true, status: 'error', message: `HTTP ${response.status}` };
  } catch {
    return { name: 'Jira', configured: true, status: 'error', message: 'Connection failed' };
  }
}

async function checkConfluence(): Promise<ApiStatus> {
  if (!isOAuthConfigured()) {
    return { name: 'Confluence', configured: false, status: 'unconfigured' };
  }
  try {
    const token = await getValidAccessToken();
    const cloudId = process.env.ATLASSIAN_OAUTH_CLOUD_ID;
    if (!cloudId) {
      return { name: 'Confluence', configured: false, status: 'unconfigured' };
    }
    const response = await fetch(
      `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/api/v2/spaces?limit=1`,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (response.ok) {
      const data = await response.json();
      const count = data?.results?.length ?? 0;
      return {
        name: 'Confluence',
        configured: true,
        status: 'ok',
        message: `${count > 0 ? 'Connected' : 'No spaces visible'} [Atlassian OAuth]`,
      };
    }
    return {
      name: 'Confluence',
      configured: true,
      status: 'error',
      message: `Atlassian OAuth HTTP ${response.status}`,
    };
  } catch (err) {
    return {
      name: 'Confluence',
      configured: true,
      status: 'error',
      message: `Atlassian OAuth: ${err instanceof Error ? err.message : 'connection failed'}`,
    };
  }
}

async function checkSlack(): Promise<ApiStatus> {
  // OAuth 2.0 path takes precedence
  if (isSlackOAuthConfigured()) {
    try {
      const token = await getValidSlackAccessToken();
      const response = await fetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      const data = await response.json();
      if (data.ok) {
        return { name: 'Slack', configured: true, status: 'ok', message: `${data.user} [Slack OAuth]` };
      }
      return { name: 'Slack', configured: true, status: 'error', message: `Slack OAuth: ${data.error}` };
    } catch (err) {
      return {
        name: 'Slack',
        configured: true,
        status: 'error',
        message: `Slack OAuth: ${err instanceof Error ? err.message : 'connection failed'}`,
      };
    }
  }

  const token = process.env.SLACK_USER_TOKEN;
  if (!token) {
    return { name: 'Slack', configured: false, status: 'unconfigured' };
  }

  try {
    const response = await fetch('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    if (data.ok) {
      return { name: 'Slack', configured: true, status: 'ok', message: `${data.user} [User Token]` };
    }
    return { name: 'Slack', configured: true, status: 'error', message: data.error || 'Auth failed' };
  } catch {
    return { name: 'Slack', configured: true, status: 'error', message: 'Connection failed' };
  }
}

/**
 * GitHub status check — two strategies:
 *   1. If GITHUB_TOKEN is set → call GitHub REST API /user (real network check, returns logged-in user)
 *   2. Else → scan local PROJECTS_ROOT for .git subdirectories
 *
 * In both cases: ok / unconfigured / error with actionable message.
 */
async function checkGithub(): Promise<ApiStatus> {
  const token = process.env.GITHUB_TOKEN;

  if (token) {
    const userOrErr = await getGithubUser(token);
    if ('error' in userOrErr) {
      return {
        name: 'GitHub API',
        configured: true,
        status: 'error',
        message: `HTTP ${userOrErr.status || '?'}: ${userOrErr.error.slice(0, 80)}`,
      };
    }
    return {
      name: 'GitHub API',
      configured: true,
      status: 'ok',
      message: `Połączono jako: ${userOrErr.login}${userOrErr.name ? ` (${userOrErr.name})` : ''}`,
    };
  }

  // Local repo scan fallback
  const root = process.env.PROJECTS_ROOT;
  if (!root) {
    return {
      name: 'GitHub (local repos)',
      configured: false,
      status: 'unconfigured',
      message: 'Ustaw GitHub Token lub "Projects root" w Settings → Git / Activity',
    };
  }

  if (!existsSync(root)) {
    return {
      name: 'GitHub (local repos)',
      configured: true,
      status: 'error',
      message: `Katalog "${root}" nie istnieje`,
    };
  }

  let repoCount = 0;
  try {
    const entries = readdirSync(root);
    for (const e of entries) {
      if (e.startsWith('.') || e.startsWith('_')) continue;
      const full = join(root, e);
      try {
        if (statSync(full).isDirectory() && existsSync(join(full, '.git'))) {
          repoCount++;
        }
      } catch {
        // ignore unreadable entries
      }
    }
  } catch {
    return {
      name: 'GitHub (local repos)',
      configured: true,
      status: 'error',
      message: `Błąd odczytu "${root}"`,
    };
  }

  if (repoCount === 0) {
    return {
      name: 'GitHub (local repos)',
      configured: true,
      status: 'error',
      message: `Brak repozytoriów git pod "${root}"`,
    };
  }

  return {
    name: 'GitHub (local repos)',
    configured: true,
    status: 'ok',
    message: `${repoCount} repozytoriów`,
  };
}

async function checkOpenRouter(): Promise<ApiStatus> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    return { name: 'AI/LLM (Gemini)', configured: true, status: 'ok', message: `Model: ${model}` };
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { name: 'AI/LLM', configured: false, status: 'unconfigured' };
  }

  return { name: 'AI/LLM (OpenRouter)', configured: true, status: 'ok', message: 'Configured' };
}

export async function GET() {
  const [activityWatch, tempo, jira, confluence, slack, openRouter, github] = await Promise.all([
    checkActivityWatch(),
    checkTempo(),
    checkJira(),
    checkConfluence(),
    checkSlack(),
    checkOpenRouter(),
    checkGithub(),
  ]);

  return NextResponse.json({
    apis: [activityWatch, tempo, jira, confluence, slack, github, openRouter],
    allOk: [activityWatch, tempo, jira].every(a => a.status === 'ok')
  });
}
