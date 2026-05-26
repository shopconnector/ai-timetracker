import { NextResponse } from 'next/server';
import { listSpaces } from '@/lib/confluence';

/**
 * GET /api/confluence/spaces — list Confluence spaces the OAuth user can access.
 * Used by the Settings UI to populate the "default space for reports" dropdown.
 */
export async function GET() {
  try {
    const spaces = await listSpaces(100);
    return NextResponse.json({ spaces });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Failed to list Confluence spaces',
      },
      { status: 500 },
    );
  }
}
