import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import {
  buildAuthorizationUrl,
  generateCodeChallenge,
  generateCodeVerifier,
  isOAuthRegistered,
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
  if (!isOAuthRegistered()) {
    return NextResponse.json(
      {
        error:
          'Atlassian OAuth client_id nie skonfigurowany. Zarejestruj OAuth app w developer.atlassian.com i wpisz Client ID w Settings → Atlassian OAuth.',
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
