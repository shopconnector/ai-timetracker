import { NextRequest, NextResponse } from 'next/server';
import { getActivitiesForDate } from '@/lib/activitywatch';

// GET - Export tasks as CSV
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');
    const format = searchParams.get('format') || 'csv';

    if (!fromDate || !toDate) {
      return NextResponse.json({ error: 'from and to dates are required' }, { status: 400 });
    }

    // Generate date range
    const dates: string[] = [];
    const start = new Date(fromDate);
    const end = new Date(toDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split('T')[0]);
    }

    // Fetch activities for all dates
    const allActivities: Array<{
      id: string;
      date: string;
      title: string;
      app: string;
      project?: string;
      totalSeconds: number;
      firstSeen?: string;
    }> = [];

    for (const date of dates) {
      try {
        const activities = await getActivitiesForDate(date);
        for (const activity of activities) {
          allActivities.push({
            id: activity.id,
            date,
            title: activity.title,
            app: activity.app,
            project: activity.project,
            totalSeconds: activity.totalSeconds,
            firstSeen: activity.firstSeen,
          });
        }
      } catch (error) {
        console.error(`Error fetching activities for ${date}:`, error);
      }
    }

    if (format === 'json') {
      return NextResponse.json({
        activities: allActivities,
        summary: {
          totalActivities: allActivities.length,
          totalMinutes: Math.round(allActivities.reduce((sum, a) => sum + a.totalSeconds, 0) / 60),
          dateRange: { from: fromDate, to: toDate },
        },
      });
    }

    // CSV format
    const headers = ['Data', 'Godzina', 'Tytul', 'Aplikacja', 'Projekt', 'Czas (min)', 'ID'];

    const rows = allActivities.map(a => [
      a.date,
      a.firstSeen ? a.firstSeen.substring(11, 16) : '',
      `"${a.title.replace(/"/g, '""')}"`,
      a.app,
      a.project || '',
      Math.round(a.totalSeconds / 60),
      a.id,
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    // Return CSV file
    return new NextResponse('\ufeff' + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="timetracker-export-${fromDate}-${toDate}.csv"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Export failed' },
      { status: 500 }
    );
  }
}
