import { NextResponse } from 'next/server';
import { clearOAuthTokens, loadOAuthEnv, revokeRefreshToken } from '@/lib/atlassianOAuth';

/**
 * Disconnect Atlassian OAuth.
 * Clears access/refresh tokens and identity fields from .env.local, but keeps
 * client_id/secret/site_url so reconnecting doesn't require re-typing them.
 * Best-effort: revokes the refresh token on Atlassian's side.
 */
export async function POST() {
  const env = loadOAuthEnv();

  if (env.refreshToken) {
    await revokeRefreshToken(env.refreshToken);
  }

  try {
    clearOAuthTokens();
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to clear tokens',
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
