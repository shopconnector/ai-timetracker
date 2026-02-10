import { NextRequest, NextResponse } from 'next/server';
import { getWorklogsForDate } from '@/lib/tempo';
import { getWindowEvents, groupActivities, AWEvent } from '@/lib/activitywatch';

const MY_ACCOUNT = process.env.TEMPO_ACCOUNT_ID || '';

// Accurate time calculation from AW events
function calculateAccurateAWTime(events: AWEvent[]): number {
  return events
    .filter(e => e.data.app && e.data.app !== 'loginwindow' && e.duration > 0)
    .reduce((sum, e) => sum + e.duration, 0);
}

// Calculate hourly distribution
function calculateHourlyDistribution(events: AWEvent[]): number[] {
  const hours = new Array(24).fill(0);
  for (const event of events) {
    if (!event.data.app || event.data.app === 'loginwindow') continue;
    const hour = new Date(event.timestamp).getHours();
    hours[hour] += event.duration;
  }
  return hours;
}

// Calculate app breakdown
function calculateAppBreakdown(events: AWEvent[]): Record<string, number> {
  const apps: Record<string, number> = {};
  for (const event of events) {
    const app = event.data.app || 'Unknown';
    if (app === 'loginwindow') continue;
    apps[app] = (apps[app] || 0) + event.duration;
  }
  return apps;
}

// Get productivity category for an app
function getProductivityCategory(app: string): 'productive' | 'neutral' | 'distracting' {
  const productive = [
    'Cursor', 'Comet', 'Code', 'Visual Studio', 'Terminal', 'iTerm',
    'Xcode', 'IntelliJ', 'WebStorm', 'PyCharm', 'PhpStorm', 'DataGrip',
    'Figma', 'Sketch', 'Adobe', 'Photoshop', 'Illustrator',
    'Notion', 'Obsidian', 'Bear', 'Notes',
    'Slack', 'zoom.us', 'Microsoft Teams', 'Discord', 'Gather',
    'Google Chrome', 'Safari', 'Firefox', 'Arc', 'Brave', // Browsers - mostly work
    'Mail', 'Outlook', 'Spark',
    'TablePlus', 'Postico', 'DBeaver', 'MongoDB Compass',
    'Postman', 'Insomnia', 'HTTPie',
    'Docker', 'Podman',
    'GitHub Desktop', 'Tower', 'Sourcetree', 'Fork'
  ];
  const distracting = [
    'YouTube', 'Twitter', 'Facebook', 'Instagram', 'TikTok',
    'Netflix', 'Spotify', 'Apple Music', 'Music',
    'Reddit', 'Telegram', 'Messages',
    'Steam', 'Epic Games', 'GOG Galaxy',
    'App Store'
  ];
  const neutralOverride = ['WhatsApp', 'Finder', 'Preview', 'System Preferences', 'System Settings'];

  if (neutralOverride.some(n => app.includes(n))) return 'neutral';
  if (productive.some(p => app.includes(p))) return 'productive';
  if (distracting.some(d => app.includes(d))) return 'distracting';
  return 'neutral';
}

// Format seconds to readable
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Get date range for period
function getDateRange(period: string): { start: Date; end: Date; prevStart: Date; prevEnd: Date } {
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  let start: Date;
  let prevStart: Date;
  let prevEnd: Date;

  switch (period) {
    case '7d':
      start = new Date(end);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      prevEnd = new Date(start);
      prevEnd.setDate(prevEnd.getDate() - 1);
      prevStart = new Date(prevEnd);
      prevStart.setDate(prevStart.getDate() - 6);
      break;
    case '30d':
      start = new Date(end);
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      prevEnd = new Date(start);
      prevEnd.setDate(prevEnd.getDate() - 1);
      prevStart = new Date(prevEnd);
      prevStart.setDate(prevStart.getDate() - 29);
      break;
    case 'mtd': // Month to date
      start = new Date(end.getFullYear(), end.getMonth(), 1);
      prevEnd = new Date(start);
      prevEnd.setDate(prevEnd.getDate() - 1);
      prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);
      break;
    case 'wtd': // Week to date (Monday start)
      start = new Date(end);
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);
      prevEnd = new Date(start);
      prevEnd.setDate(prevEnd.getDate() - 1);
      prevStart = new Date(prevEnd);
      prevStart.setDate(prevStart.getDate() - 6);
      break;
    default: // today
      start = new Date(end);
      start.setHours(0, 0, 0, 0);
      prevEnd = new Date(start);
      prevEnd.setDate(prevEnd.getDate() - 1);
      prevStart = new Date(prevEnd);
      prevStart.setHours(0, 0, 0, 0);
  }

  return { start, end, prevStart, prevEnd };
}

// Check if date is a workday
function isWorkday(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

// Get workdays in range
function getWorkdaysInRange(start: Date, end: Date): string[] {
  const days: string[] = [];
  const current = new Date(start);
  while (current <= end) {
    if (isWorkday(current)) {
      days.push(current.toISOString().split('T')[0]);
    }
    current.setDate(current.getDate() + 1);
  }
  return days;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const period = searchParams.get('period') || '7d';

  const { start, end, prevStart, prevEnd } = getDateRange(period);
  const workdays = getWorkdaysInRange(start, end);
  const prevWorkdays = getWorkdaysInRange(prevStart, prevEnd);

  // Fetch data for all days
  const dailyData: Array<{
    date: string;
    dayName: string;
    awSeconds: number;
    tempoSeconds: number;
    worklogsCount: number;
    hourlyAW: number[];
    hourlyTempo: number[];
    apps: Record<string, number>;
    productive: number;
    neutral: number;
    distracting: number;
  }> = [];

  let totalAW = 0;
  let totalTempo = 0;
  let totalWorklogs = 0;
  const allApps: Record<string, number> = {};
  const hourlyTotalsAW = new Array(24).fill(0);
  const hourlyTotalsTempo = new Array(24).fill(0);
  let totalProductive = 0;
  let totalNeutral = 0;
  let totalDistracting = 0;

  // Current period data
  for (const dateStr of workdays) {
    try {
      // ActivityWatch
      const awEvents = await getWindowEvents(dateStr);
      const awSeconds = calculateAccurateAWTime(awEvents);
      const hourlyAW = calculateHourlyDistribution(awEvents);
      const apps = calculateAppBreakdown(awEvents);

      // Productivity breakdown
      let productive = 0, neutral = 0, distracting = 0;
      for (const [app, seconds] of Object.entries(apps)) {
        const category = getProductivityCategory(app);
        if (category === 'productive') productive += seconds;
        else if (category === 'distracting') distracting += seconds;
        else neutral += seconds;

        allApps[app] = (allApps[app] || 0) + seconds;
      }

      // Tempo
      const worklogs = await getWorklogsForDate(dateStr);
      const myWorklogs = worklogs.filter(
        (w: { author?: { accountId?: string } }) => w.author?.accountId === MY_ACCOUNT
      );
      const tempoSeconds = myWorklogs.reduce(
        (sum: number, w: { timeSpentSeconds: number }) => sum + w.timeSpentSeconds, 0
      );

      // Hourly tempo distribution
      const hourlyTempo = new Array(24).fill(0);
      for (const worklog of myWorklogs) {
        if (worklog.startTime) {
          const hour = parseInt(worklog.startTime.split(':')[0], 10);
          let remaining = worklog.timeSpentSeconds;
          let h = hour;
          while (remaining > 0 && h < 24) {
            const inHour = Math.min(remaining, 3600);
            hourlyTempo[h] += inHour;
            remaining -= inHour;
            h++;
          }
        }
      }

      const date = new Date(dateStr);
      const dayNames = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];

      dailyData.push({
        date: dateStr,
        dayName: dayNames[date.getDay()],
        awSeconds,
        tempoSeconds,
        worklogsCount: myWorklogs.length,
        hourlyAW,
        hourlyTempo,
        apps,
        productive,
        neutral,
        distracting
      });

      totalAW += awSeconds;
      totalTempo += tempoSeconds;
      totalWorklogs += myWorklogs.length;
      totalProductive += productive;
      totalNeutral += neutral;
      totalDistracting += distracting;

      hourlyAW.forEach((v, i) => hourlyTotalsAW[i] += v);
      hourlyTempo.forEach((v, i) => hourlyTotalsTempo[i] += v);

    } catch (error) {
      console.error(`Error fetching ${dateStr}:`, error);
    }
  }

  // Previous period totals for comparison
  let prevTotalAW = 0;
  let prevTotalTempo = 0;

  for (const dateStr of prevWorkdays) {
    try {
      const awEvents = await getWindowEvents(dateStr);
      prevTotalAW += calculateAccurateAWTime(awEvents);

      const worklogs = await getWorklogsForDate(dateStr);
      const myWorklogs = worklogs.filter(
        (w: { author?: { accountId?: string } }) => w.author?.accountId === MY_ACCOUNT
      );
      prevTotalTempo += myWorklogs.reduce(
        (sum: number, w: { timeSpentSeconds: number }) => sum + w.timeSpentSeconds, 0
      );
    } catch (error) {
      // Skip errors for previous period
    }
  }

  // Calculate trends
  const awTrend = prevTotalAW > 0 ? ((totalAW - prevTotalAW) / prevTotalAW) * 100 : 0;
  const tempoTrend = prevTotalTempo > 0 ? ((totalTempo - prevTotalTempo) / prevTotalTempo) * 100 : 0;

  // KPIs
  const avgDailyAW = workdays.length > 0 ? totalAW / workdays.length : 0;
  const avgDailyTempo = workdays.length > 0 ? totalTempo / workdays.length : 0;
  const targetSeconds = 8 * 3600;
  const targetAchievement = avgDailyTempo / targetSeconds * 100;
  const captureRate = totalAW > 0 ? (totalTempo / totalAW) * 100 : 0;

  // Days meeting target
  const daysOnTarget = dailyData.filter(d => d.tempoSeconds >= 7 * 3600).length;
  const daysWarning = dailyData.filter(d => d.tempoSeconds >= 4 * 3600 && d.tempoSeconds < 7 * 3600).length;
  const daysMissing = dailyData.filter(d => d.tempoSeconds < 4 * 3600).length;

  // Top apps sorted
  const topApps = Object.entries(allApps)
    .map(([app, seconds]) => ({
      app,
      seconds,
      formatted: formatDuration(seconds),
      percentage: totalAW > 0 ? Math.round((seconds / totalAW) * 100) : 0,
      category: getProductivityCategory(app)
    }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 15);

  // Productivity score (0-100)
  const totalCategorized = totalProductive + totalNeutral + totalDistracting;
  const productivityScore = totalCategorized > 0
    ? Math.round((totalProductive / totalCategorized) * 100)
    : 0;

  // Peak hours
  const peakAWHour = hourlyTotalsAW.indexOf(Math.max(...hourlyTotalsAW));
  const peakTempoHour = hourlyTotalsTempo.indexOf(Math.max(...hourlyTotalsTempo));

  // Hourly data for charts
  const hourlyChartData = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    label: `${i}:00`,
    awMinutes: Math.round(hourlyTotalsAW[i] / 60),
    tempoMinutes: Math.round(hourlyTotalsTempo[i] / 60),
    gap: Math.round((hourlyTotalsAW[i] - hourlyTotalsTempo[i]) / 60)
  })).filter(h => h.hour >= 6 && h.hour <= 22);

  // Weekly heatmap data
  const heatmapData = dailyData.map(d => ({
    date: d.date,
    day: d.dayName,
    hours: Array.from({ length: 16 }, (_, i) => ({
      hour: i + 6,
      aw: Math.round(d.hourlyAW[i + 6] / 60),
      tempo: Math.round(d.hourlyTempo[i + 6] / 60)
    }))
  }));

  // Gap analysis
  const dailyGaps = dailyData.map(d => ({
    date: d.date,
    day: d.dayName,
    awHours: Math.round(d.awSeconds / 3600 * 10) / 10,
    tempoHours: Math.round(d.tempoSeconds / 3600 * 10) / 10,
    gapHours: Math.round((d.awSeconds - d.tempoSeconds) / 3600 * 10) / 10,
    gapPercent: d.awSeconds > 0 ? Math.round(((d.awSeconds - d.tempoSeconds) / d.awSeconds) * 100) : 0
  }));

  return NextResponse.json({
    period,
    dateRange: {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
      workdays: workdays.length,
      prevStart: prevStart.toISOString().split('T')[0],
      prevEnd: prevEnd.toISOString().split('T')[0],
      prevWorkdays: prevWorkdays.length
    },
    kpis: {
      totalAW: {
        seconds: totalAW,
        formatted: formatDuration(totalAW),
        trend: Math.round(awTrend),
        prevFormatted: formatDuration(prevTotalAW)
      },
      totalTempo: {
        seconds: totalTempo,
        formatted: formatDuration(totalTempo),
        trend: Math.round(tempoTrend),
        prevFormatted: formatDuration(prevTotalTempo)
      },
      avgDailyAW: {
        seconds: avgDailyAW,
        formatted: formatDuration(avgDailyAW)
      },
      avgDailyTempo: {
        seconds: avgDailyTempo,
        formatted: formatDuration(avgDailyTempo)
      },
      targetAchievement: Math.round(targetAchievement),
      captureRate: Math.round(captureRate),
      productivityScore,
      totalWorklogs,
      peakAWHour: `${peakAWHour}:00`,
      peakTempoHour: `${peakTempoHour}:00`
    },
    daysSummary: {
      total: workdays.length,
      onTarget: daysOnTarget,
      warning: daysWarning,
      missing: daysMissing,
      onTargetPercent: workdays.length > 0 ? Math.round((daysOnTarget / workdays.length) * 100) : 0
    },
    productivity: {
      productive: { seconds: totalProductive, formatted: formatDuration(totalProductive), percent: totalCategorized > 0 ? Math.round((totalProductive / totalCategorized) * 100) : 0 },
      neutral: { seconds: totalNeutral, formatted: formatDuration(totalNeutral), percent: totalCategorized > 0 ? Math.round((totalNeutral / totalCategorized) * 100) : 0 },
      distracting: { seconds: totalDistracting, formatted: formatDuration(totalDistracting), percent: totalCategorized > 0 ? Math.round((totalDistracting / totalCategorized) * 100) : 0 }
    },
    dailyData: dailyData.map(d => ({
      date: d.date,
      dayName: d.dayName,
      awSeconds: d.awSeconds,
      awFormatted: formatDuration(d.awSeconds),
      tempoSeconds: d.tempoSeconds,
      tempoFormatted: formatDuration(d.tempoSeconds),
      worklogsCount: d.worklogsCount,
      status: d.tempoSeconds >= 7 * 3600 ? 'ok' : d.tempoSeconds >= 4 * 3600 ? 'warning' : 'missing'
    })),
    hourlyChartData,
    heatmapData,
    topApps,
    dailyGaps,
    timestamp: new Date().toISOString()
  });
}
