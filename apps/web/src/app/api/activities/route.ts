import { NextRequest, NextResponse } from 'next/server';
import { getActivitiesForDate, getDaySummary, formatDuration } from '@/lib/activitywatch';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const date = searchParams.get('date');

  if (!date) {
    return NextResponse.json(
      { error: 'date parameter required (YYYY-MM-DD)' },
      { status: 400 }
    );
  }

  try {
    const activities = await getActivitiesForDate(date);
    const summary = await getDaySummary(date);

    // Add formatted duration to each activity
    const activitiesWithFormat = activities.map(a => ({
      ...a,
      formattedDuration: formatDuration(a.totalSeconds)
    }));

    return NextResponse.json({
      date,
      summary,
      activities: activitiesWithFormat
    });
  } catch (error) {
    console.error('Error fetching activities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activities from ActivityWatch' },
      { status: 500 }
    );
  }
}
