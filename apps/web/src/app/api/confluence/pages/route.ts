import { NextRequest, NextResponse } from 'next/server';
import { createPage } from '@/lib/confluence';

/**
 * POST /api/confluence/pages — create a Confluence page (used by report exporters).
 * Body: { spaceId, title, contentStorage, parentId? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { spaceId, title, contentStorage, parentId } = body || {};
    if (!spaceId || !title || !contentStorage) {
      return NextResponse.json(
        { error: 'Wymagane: spaceId, title, contentStorage' },
        { status: 400 },
      );
    }
    const page = await createPage({ spaceId, title, contentStorage, parentId });
    return NextResponse.json({ page }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create page' },
      { status: 500 },
    );
  }
}
