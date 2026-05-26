import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { buildAuthorizationUrl, isOAuthRegistered } from '@/lib/atlassianOAuth';

const STATE_COOKIE = 'atlassian_oauth_state';
const STATE_TTL_SECONDS = 5 * 60;

/**
 * Start the Atlassian OAuth 2.0 (3LO) flow.
 * Generates a CSRF state token, stores it in an HttpOnly cookie, and redirects
 * the browser to Atlassian's consent screen.
 */
export async function GET() {
  if (!isOAuthRegistered()) {
    return NextResponse.json(
      {
        error:
          'Atlassian OAuth client_id/secret nie są skonfigurowane. Wpisz je w Settings → Jira API → OAuth 2.0.',
      },
      { status: 400 },
    );
  }

  const state = randomBytes(32).toString('hex');
  let authUrl: string;
  try {
    authUrl = buildAuthorizationUrl(state);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to build authorization URL' },
      { status: 500 },
    );
  }

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: false, // dev: localhost is http
    sameSite: 'lax',
    path: '/',
    maxAge: STATE_TTL_SECONDS,
  });
  return response;
}
