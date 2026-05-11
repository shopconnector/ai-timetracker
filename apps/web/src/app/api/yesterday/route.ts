import { NextRequest, NextResponse } from 'next/server';
import { buildYesterdayReport, previousWorkday } from '@/lib/morning-summary';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const date = isValidDate(sp.get('date')) ? sp.get('date')! : previousWorkday();
  const withSummary = sp.get('summary') === '1';

  try {
    const report = await buildYesterdayReport({ date, withSummary });
    return NextResponse.json(report, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    console.error('[/api/yesterday] error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        date,
      },
      { status: 500 }
    );
  }
}

function isValidDate(s: string | null): boolean {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
