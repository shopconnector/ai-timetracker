import { NextRequest, NextResponse } from 'next/server';
import { exchangeSlackCodeForTokens, saveSlackOAuthTokens } from '@/lib/slackOAuth';

const STATE_COOKIE = 'slack_oauth_state';
const VERIFIER_COOKIE = 'slack_oauth_verifier';
const BASE_PATH = '/timetracker';

function redirectToSettings(request: NextRequest, params: Record<string, string>): NextResponse {
  const qs = new URLSearchParams(params).toString();
  const path = `${BASE_PATH}/settings${qs ? `?${qs}` : ''}`;
  const response = NextResponse.redirect(new URL(path, request.url));
  response.cookies.set(STATE_COOKIE, '', { path: '/', maxAge: 0 });
  response.cookies.set(VERIFIER_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}

/**
 * Slack OAuth v2 callback. Reads code + state from query, exchanges with
 * code_verifier (PKCE — no client_secret needed). Stores user-scope token
 * from authed_user.access_token.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return redirectToSettings(request, { slack: 'error', msg: error });
  }

  const cookieState = request.cookies.get(STATE_COOKIE)?.value;
  if (!state || !cookieState || state !== cookieState) {
    return redirectToSettings(request, {
      slack: 'error',
      msg: 'CSRF state mismatch — odśwież Settings i spróbuj ponownie.',
    });
  }

  const codeVerifier = request.cookies.get(VERIFIER_COOKIE)?.value;
  if (!codeVerifier) {
    return redirectToSettings(request, {
      slack: 'error',
      msg: 'Brakuje PKCE code_verifier (cookie wygasł). Spróbuj ponownie.',
    });
  }

  if (!code) {
    return redirectToSettings(request, {
      slack: 'error',
      msg: 'Brak parametru `code` w callback URL.',
    });
  }

  let tokens;
  try {
    tokens = await exchangeSlackCodeForTokens(code, codeVerifier);
  } catch (err) {
    return redirectToSettings(request, {
      slack: 'error',
      msg: err instanceof Error ? err.message : 'Slack token exchange failed',
    });
  }

  // For desktop user-scope flow, the user token lives in authed_user.access_token
  const userToken = tokens.authed_user?.access_token;
  const userId = tokens.authed_user?.id;
  if (!userToken || !userId) {
    return redirectToSettings(request, {
      slack: 'error',
      msg: 'Slack response brak authed_user.access_token — sprawdź czy zarejestrowałeś user_scope (nie bot_scope).',
    });
  }

  const refreshToken = tokens.authed_user?.refresh_token || tokens.refresh_token;
  const expiresIn = tokens.authed_user?.expires_in || tokens.expires_in;
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : undefined;
  const userScopes = tokens.authed_user?.scope || tokens.scope;

  try {
    saveSlackOAuthTokens({
      accessToken: userToken,
      refreshToken,
      expiresAt,
      userId,
      teamId: tokens.team?.id,
      teamName: tokens.team?.name,
      scopes: userScopes,
    });
  } catch (err) {
    return redirectToSettings(request, {
      slack: 'error',
      msg: err instanceof Error ? err.message : 'Failed to persist Slack tokens',
    });
  }

  return redirectToSettings(request, { slack: 'connected' });
}
