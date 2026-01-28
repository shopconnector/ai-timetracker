import { NextResponse } from 'next/server';
import { getWorkAttributes } from '@/lib/tempo';

// Cache attributes for 5 minutes (they rarely change)
let cachedAttributes: Awaited<ReturnType<typeof getWorkAttributes>> | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET() {
  try {
    const now = Date.now();

    // Return cached if valid
    if (cachedAttributes && now - cacheTime < CACHE_TTL) {
      return NextResponse.json({ attributes: cachedAttributes });
    }

    const attributes = await getWorkAttributes();

    // Update cache
    cachedAttributes = attributes;
    cacheTime = now;

    return NextResponse.json({ attributes });
  } catch (error) {
    console.error('Error fetching work attributes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch work attributes', attributes: [] },
      { status: 500 }
    );
  }
}
