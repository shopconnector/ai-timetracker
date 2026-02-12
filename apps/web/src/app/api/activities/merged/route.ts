import { NextRequest, NextResponse } from 'next/server';
import { getActivitiesForDate, formatDuration } from '@/lib/activitywatch';
import { mergeActivities, getSlackActivitiesForDateSafe, MergedActivity } from '@/lib/mergeActivities';

function buildSummary(activities: MergedActivity[], date: string) {
  const totalSeconds = activities.reduce((sum, a) => sum + a.totalSeconds, 0);

  const byApp = new Map<string, number>();
  for (const a of activities) {
    byApp.set(a.app, (byApp.get(a.app) || 0) + a.totalSeconds);
  }

  return {
    date,
    totalSeconds,
    totalFormatted: formatDuration(totalSeconds),
    activitiesCount: activities.length,
    topApps: Array.from(byApp.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([app, seconds]) => ({ app, seconds, formatted: formatDuration(seconds) })),
  };
}

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date');

  if (!date) {
    return NextResponse.json(
      { error: 'date parameter required (YYYY-MM-DD)' },
      { status: 400 }
    );
  }

  try {
    const [awActivities, slackActivities] = await Promise.all([
      getActivitiesForDate(date),
      getSlackActivitiesForDateSafe(date),
    ]);

    const merged = mergeActivities(awActivities, slackActivities);

    // Add formatted duration
    const activitiesWithFormat = merged.map(a => ({
      ...a,
      formattedDuration: formatDuration(a.totalSeconds),
    }));

    const summary = buildSummary(merged, date);

    const stats = {
      awCount: awActivities.length,
      slackCount: slackActivities.length,
      mergedCount: merged.filter(a => a.source === 'merged').length,
    };

    return NextResponse.json({
      date,
      summary,
      activities: activitiesWithFormat,
      stats,
    });
  } catch (error) {
    console.error('Error fetching merged activities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch merged activities' },
      { status: 500 }
    );
  }
}
