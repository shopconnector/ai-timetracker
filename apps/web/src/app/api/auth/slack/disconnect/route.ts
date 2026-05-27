import { NextResponse } from 'next/server';
import { clearSlackOAuthTokens, loadSlackOAuthEnv, revokeSlackToken } from '@/lib/slackOAuth';

/**
 * Disconnect Slack OAuth.
 * Best-effort revoke on Slack's side, then clears tokens from local env.
 */
export async function POST() {
  const env = loadSlackOAuthEnv();
  if (env.accessToken) {
    await revokeSlackToken(env.accessToken);
  }
  try {
    clearSlackOAuthTokens();
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to clear tokens' },
      { status: 500 },
    );
  }
  return NextResponse.json({ success: true });
}
