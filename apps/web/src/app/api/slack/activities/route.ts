import { NextResponse } from 'next/server';
import { getSlackActivitiesForDate, isSlackConfigured } from '@/lib/slack';

// GET /api/slack/activities?date=2026-02-12
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    // Graceful: no token = empty array, no error
    if (!isSlackConfigured()) {
      return NextResponse.json({
        date,
        activities: [],
        count: 0,
        configured: false,
      });
    }

    const activities = await getSlackActivitiesForDate(date);

    return NextResponse.json({
      date,
      activities,
      count: activities.length,
      configured: true,
    });
  } catch (error) {
    console.error('[Slack API] Error:', error);
    return NextResponse.json({
      date: new Date().toISOString().split('T')[0],
      activities: [],
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
