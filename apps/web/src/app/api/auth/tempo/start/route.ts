import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { buildTempoAuthorizationUrl, isTempoOAuthRegistered } from '@/lib/tempoOAuth';

const STATE_COOKIE = 'tempo_oauth_state';
const STATE_TTL_SECONDS = 5 * 60;

export async function GET() {
  if (!isTempoOAuthRegistered()) {
    return NextResponse.json(
      {
        error:
          'Tempo OAuth client_id/secret/site_url nie skonfigurowane. Wpisz je w Settings → Tempo OAuth 2.0.',
      },
      { status: 400 },
    );
  }

  const state = randomBytes(32).toString('hex');
  let authUrl: string;
  try {
    authUrl = buildTempoAuthorizationUrl(state);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to build Tempo authorization URL' },
      { status: 500 },
    );
  }

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
    maxAge: STATE_TTL_SECONDS,
  });
  return response;
}
