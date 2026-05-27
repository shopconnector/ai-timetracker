import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import {
  buildSlackAuthorizationUrl,
  generateCodeChallenge,
  generateCodeVerifier,
  isSlackOAuthRegistered,
} from '@/lib/slackOAuth';

const STATE_COOKIE = 'slack_oauth_state';
const VERIFIER_COOKIE = 'slack_oauth_verifier';
const STATE_TTL_SECONDS = 5 * 60;

export async function GET() {
  if (!isSlackOAuthRegistered()) {
    return NextResponse.json(
      {
        error:
          'Slack OAuth client_id nie skonfigurowany. Zarejestruj Slack app w api.slack.com/apps i ustaw SLACK_OAUTH_CLIENT_ID w env.',
      },
      { status: 400 },
    );
  }

  const state = randomBytes(32).toString('hex');
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  let authUrl: string;
  try {
    authUrl = buildSlackAuthorizationUrl(state, codeChallenge);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to build Slack authorization URL' },
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
