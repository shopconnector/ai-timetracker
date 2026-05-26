import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import {
  buildAuthorizationUrl,
  generateCodeChallenge,
  generateCodeVerifier,
  loadOAuthEnv,
} from '@/lib/atlassianOAuth';

const STATE_COOKIE = 'atlassian_oauth_state';
const VERIFIER_COOKIE = 'atlassian_oauth_verifier';
const STATE_TTL_SECONDS = 5 * 60;

/**
 * Start the Atlassian OAuth 2.0 (3LO) flow with PKCE.
 * Generates a CSRF state token + PKCE code_verifier, stores both in HttpOnly
 * cookies, and redirects the browser to Atlassian's consent screen with a
 * derived code_challenge.
 */
export async function GET() {
  const env = loadOAuthEnv();
  const missing: string[] = [];
  if (!env.clientId) missing.push('ATLASSIAN_OAUTH_CLIENT_ID');
  if (!env.clientSecret) missing.push('ATLASSIAN_OAUTH_CLIENT_SECRET');

  if (missing.length > 0) {
    const isSecretOnly = missing.length === 1 && missing[0] === 'ATLASSIAN_OAUTH_CLIENT_SECRET';
    return NextResponse.json(
      {
        error: isSecretOnly
          ? 'Brakuje ATLASSIAN_OAUTH_CLIENT_SECRET — dodaj go do apps/web/.env.local (lokalnie) lub do GitHub Actions Secrets jako ATLASSIAN_OAUTH_CLIENT_SECRET (dla build EXE/DMG). Skopiuj wartość z developer.atlassian.com → swoja app → Settings → Authentication details → kliknij View przy Secret.'
          : `Brakuje konfiguracji OAuth: ${missing.join(', ')}.`,
        missing,
      },
      { status: 400 },
    );
  }

  const state = randomBytes(32).toString('hex');
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  let authUrl: string;
  try {
    authUrl = buildAuthorizationUrl(state, codeChallenge);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to build authorization URL' },
      { status: 500 },
    );
  }

  const response = NextResponse.redirect(authUrl);
  const cookieOpts = {
    httpOnly: true,
    secure: false, // dev: localhost is http
    sameSite: 'lax' as const,
    path: '/',
    maxAge: STATE_TTL_SECONDS,
  };
  response.cookies.set(STATE_COOKIE, state, cookieOpts);
  response.cookies.set(VERIFIER_COOKIE, codeVerifier, cookieOpts);
  return response;
}
