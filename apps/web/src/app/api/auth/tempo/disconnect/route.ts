import { NextResponse } from 'next/server';
import { clearTempoOAuthTokens, loadTempoOAuthEnv, revokeTempoToken } from '@/lib/tempoOAuth';

export async function POST() {
  const env = loadTempoOAuthEnv();
  if (env.refreshToken) {
    await revokeTempoToken(env.refreshToken);
  }
  try {
    clearTempoOAuthTokens();
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to clear tokens' },
      { status: 500 },
    );
  }
  return NextResponse.json({ success: true });
}
