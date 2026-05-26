import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeCodeForTokens,
  getAccessibleResources,
  loadOAuthEnv,
  saveOAuthTokens,
} from '@/lib/atlassianOAuth';

const STATE_COOKIE = 'atlassian_oauth_state';
const BASE_PATH = '/timetracker';

function redirectToSettings(request: NextRequest, params: Record<string, string>): NextResponse {
  const qs = new URLSearchParams(params).toString();
  const path = `${BASE_PATH}/settings${qs ? `?${qs}` : ''}`;
  const response = NextResponse.redirect(new URL(path, request.url));
  // Always clear the state cookie after the flow (success or error).
  response.cookies.set(STATE_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}

/**
 * Atlassian redirects here after the user grants consent.
 * Exchanges the auth code for tokens, picks the cloudid matching the configured
 * site URL, fetches the user's display name/email, persists everything to .env.local,
 * and redirects back to Settings.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // 1. Atlassian itself reported an error (user denied consent, etc.)
  if (error) {
    return redirectToSettings(request, {
      atlassian: 'error',
      msg: errorDescription || error,
    });
  }

  // 2. CSRF state validation
  const cookieState = request.cookies.get(STATE_COOKIE)?.value;
  if (!state || !cookieState || state !== cookieState) {
    return redirectToSettings(request, {
      atlassian: 'error',
      msg: 'CSRF state mismatch — odśwież Settings i spróbuj ponownie.',
    });
  }

  if (!code) {
    return redirectToSettings(request, {
      atlassian: 'error',
      msg: 'Brak parametru `code` w callback URL.',
    });
  }

  // 3. Exchange code for tokens
  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (err) {
    return redirectToSettings(request, {
      atlassian: 'error',
      msg: err instanceof Error ? err.message : 'Token exchange failed',
    });
  }

  // 4. Discover cloudid for the configured site URL
  let resources;
  try {
    resources = await getAccessibleResources(tokens.access_token);
  } catch (err) {
    return redirectToSettings(request, {
      atlassian: 'error',
      msg: err instanceof Error ? err.message : 'accessible-resources failed',
    });
  }

  const env = loadOAuthEnv();
  const targetUrl = env.siteUrl.replace(/\/+$/, '');
  const match = resources.find((r) => r.url.replace(/\/+$/, '') === targetUrl);
  if (!match) {
    const available = resources.map((r) => r.url).join(', ') || '(none)';
    return redirectToSettings(request, {
      atlassian: 'error',
      msg: `Twoje konto Atlassian nie ma dostępu do ${targetUrl}. Dostępne: ${available}`,
    });
  }

  // 5. Fetch display info from /myself (best-effort — store cloudid even if this fails)
  let userEmail: string | undefined;
  let userName: string | undefined;
  try {
    const meRes = await fetch(`https://api.atlassian.com/ex/jira/${match.id}/rest/api/3/myself`, {
      headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (meRes.ok) {
      const me = await meRes.json();
      userEmail = me.emailAddress;
      userName = me.displayName;
    }
  } catch {
    /* non-fatal */
  }

  // 6. Persist
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  try {
    saveOAuthTokens({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      cloudId: match.id,
      userEmail,
      userName,
      scopes: tokens.scope,
    });
  } catch (err) {
    return redirectToSettings(request, {
      atlassian: 'error',
      msg: err instanceof Error ? err.message : 'Failed to persist tokens',
    });
  }

  return redirectToSettings(request, { atlassian: 'connected' });
}
