import { NextRequest, NextResponse } from 'next/server';
import { checkWorklogOverlap, getWorklogsWithTimeRanges } from '@/lib/tempo';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (!date) {
      return NextResponse.json(
        { error: 'Date parameter is required (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    // Zwróć wszystkie worklogi z zakresami czasowymi
    const worklogs = await getWorklogsWithTimeRanges(date);

    return NextResponse.json({
      date,
      worklogs,
      totalMinutes: worklogs.reduce((sum, w) => sum + w.durationMinutes, 0)
    });
  } catch (error) {
    console.error('Error fetching worklogs:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch worklogs' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, startTime, endTime, excludeWorklogId } = body;

    if (!date || !startTime || !endTime) {
      return NextResponse.json(
        { error: 'date, startTime, and endTime are required' },
        { status: 400 }
      );
    }

    const result = await checkWorklogOverlap(
      date,
      startTime,
      endTime,
      excludeWorklogId
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error checking overlap:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check overlap' },
      { status: 500 }
    );
  }
}
