import { NextResponse } from 'next/server';

const AW_URL = process.env.ACTIVITYWATCH_URL || 'http://localhost:5600';

interface BucketInfo {
  id: string;
  name?: string;
  type: string;
  client: string;
  hostname: string;
  created: string;
}

export async function GET() {
  try {
    const res = await fetch(`${AW_URL}/api/0/buckets`);

    if (!res.ok) {
      return NextResponse.json(
        { error: 'ActivityWatch not available', status: res.status },
        { status: 503 }
      );
    }

    const buckets: Record<string, BucketInfo> = await res.json();
    const bucketIds = Object.keys(buckets);

    // Categorize buckets
    const windowBuckets = bucketIds.filter(b => b.startsWith('aw-watcher-window_'));
    const chromeBuckets = bucketIds.filter(b => b.startsWith('aw-watcher-web-chrome'));
    const firefoxBuckets = bucketIds.filter(b => b.startsWith('aw-watcher-web-firefox'));
    const afkBuckets = bucketIds.filter(b => b.startsWith('aw-watcher-afk_'));
    const vscodeBuckets = bucketIds.filter(b => b.startsWith('aw-watcher-vscode'));
    const otherBuckets = bucketIds.filter(b =>
      !windowBuckets.includes(b) &&
      !chromeBuckets.includes(b) &&
      !firefoxBuckets.includes(b) &&
      !afkBuckets.includes(b) &&
      !vscodeBuckets.includes(b)
    );

    // Extract hostname from primary window bucket
    const primaryWindowBucket = windowBuckets[0];
    const hostname = primaryWindowBucket
      ? primaryWindowBucket.replace('aw-watcher-window_', '')
      : 'unknown';

    return NextResponse.json({
      hostname,
      available: bucketIds,
      categorized: {
        window: windowBuckets,
        chrome: chromeBuckets,
        firefox: firefoxBuckets,
        afk: afkBuckets,
        vscode: vscodeBuckets,
        other: otherBuckets
      },
      suggested: {
        window: windowBuckets[0] || null,
        browser: [...chromeBuckets, ...firefoxBuckets]
      },
      details: Object.fromEntries(
        bucketIds.map(id => [id, {
          type: buckets[id].type,
          client: buckets[id].client,
          hostname: buckets[id].hostname,
          created: buckets[id].created
        }])
      )
    });
  } catch (error) {
    console.error('Error fetching AW buckets:', error);
    return NextResponse.json(
      {
        error: 'Failed to connect to ActivityWatch',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 503 }
    );
  }
}
