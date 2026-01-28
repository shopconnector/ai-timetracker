import { NextRequest, NextResponse } from 'next/server';
import { getWorklogsForDate } from '@/lib/tempo';
import { getDaySummary } from '@/lib/activitywatch';

const MY_ACCOUNT = process.env.TEMPO_ACCOUNT_ID || '';

interface DayStats {
  date: string;
  dayName: string;
  awSeconds: number;
  awFormatted: string;
  tempoSeconds: number;
  tempoFormatted: string;
  worklogsCount: number;
  status: 'ok' | 'warning' | 'missing';
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function getDayName(date: Date): string {
  const days = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];
  return days[date.getDay()];
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const days = parseInt(searchParams.get('days') || '7');

  const stats: DayStats[] = [];
  const today = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const dayOfWeek = date.getDay();

    // Skip weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;

    try {
      // Get ActivityWatch data
      let awSeconds = 0;
      try {
        const awSummary = await getDaySummary(dateStr);
        awSeconds = awSummary.totalSeconds;
      } catch {
        // AW might not have data
      }

      // Get Tempo data
      const worklogs = await getWorklogsForDate(dateStr);
      const myWorklogs = worklogs.filter(
        (w: { author?: { accountId?: string } }) => w.author?.accountId === MY_ACCOUNT
      );
      const tempoSeconds = myWorklogs.reduce(
        (sum: number, w: { timeSpentSeconds: number }) => sum + w.timeSpentSeconds,
        0
      );

      // Determine status
      let status: 'ok' | 'warning' | 'missing' = 'missing';
      if (tempoSeconds >= 7 * 3600) {
        status = 'ok';
      } else if (tempoSeconds >= 4 * 3600) {
        status = 'warning';
      }

      stats.push({
        date: dateStr,
        dayName: getDayName(date),
        awSeconds,
        awFormatted: formatTime(awSeconds),
        tempoSeconds,
        tempoFormatted: formatTime(tempoSeconds),
        worklogsCount: myWorklogs.length,
        status
      });
    } catch (error) {
      console.error(`Error fetching stats for ${dateStr}:`, error);
    }
  }

  // Calculate totals
  const totalAw = stats.reduce((sum, s) => sum + s.awSeconds, 0);
  const totalTempo = stats.reduce((sum, s) => sum + s.tempoSeconds, 0);
  const avgTempo = stats.length > 0 ? totalTempo / stats.length : 0;
  const okDays = stats.filter(s => s.status === 'ok').length;
  const warningDays = stats.filter(s => s.status === 'warning').length;
  const missingDays = stats.filter(s => s.status === 'missing').length;

  return NextResponse.json({
    days: stats,
    summary: {
      totalAwSeconds: totalAw,
      totalAwFormatted: formatTime(totalAw),
      totalTempoSeconds: totalTempo,
      totalTempoFormatted: formatTime(totalTempo),
      avgTempoSeconds: avgTempo,
      avgTempoFormatted: formatTime(avgTempo),
      daysCount: stats.length,
      okDays,
      warningDays,
      missingDays
    }
  });
}
