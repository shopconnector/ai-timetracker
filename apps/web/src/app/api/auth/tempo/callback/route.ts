import { NextRequest, NextResponse } from 'next/server';
import { exchangeTempoCodeForTokens, saveTempoOAuthTokens } from '@/lib/tempoOAuth';

const STATE_COOKIE = 'tempo_oauth_state';
const BASE_PATH = '/timetracker';

function redirectToSettings(request: NextRequest, params: Record<string, string>): NextResponse {
  const qs = new URLSearchParams(params).toString();
  const path = `${BASE_PATH}/settings${qs ? `?${qs}` : ''}`;
  const response = NextResponse.redirect(new URL(path, request.url));
  response.cookies.set(STATE_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  if (error) {
    return redirectToSettings(request, {
      tempo: 'error',
      msg: errorDescription || error,
    });
  }

  const cookieState = request.cookies.get(STATE_COOKIE)?.value;
  if (!state || !cookieState || state !== cookieState) {
    return redirectToSettings(request, {
      tempo: 'error',
      msg: 'CSRF state mismatch — odśwież Settings i spróbuj ponownie.',
    });
  }

  if (!code) {
    return redirectToSettings(request, {
      tempo: 'error',
      msg: 'Brak parametru `code` w callback URL.',
    });
  }

  let tokens;
  try {
    tokens = await exchangeTempoCodeForTokens(code);
  } catch (err) {
    return redirectToSettings(request, {
      tempo: 'error',
      msg: err instanceof Error ? err.message : 'Token exchange failed',
    });
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  try {
    saveTempoOAuthTokens({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      scopes: tokens.scope,
    });
  } catch (err) {
    return redirectToSettings(request, {
      tempo: 'error',
      msg: err instanceof Error ? err.message : 'Failed to persist Tempo tokens',
    });
  }

  return redirectToSettings(request, { tempo: 'connected' });
}
