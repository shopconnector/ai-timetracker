import { NextRequest, NextResponse } from 'next/server';
import {
  getWindowEvents,
  getChromeEvents,
  extractProjectInfo,
  extractMeetingInfo,
  extractCommunicationInfo,
  extractTerminalInfo,
  categorizeActivity,
} from '@/lib/activitywatch';
import { getWorklogs } from '@/lib/tempo';
import { getCurrentUser, getIssueKeysByIds } from '@/lib/jira';
import {
  DayComparison,
  WeekSummary,
  CompareRangeResponse,
  getGapStatus,
  ActivitySummary,
  WorklogSummary,
} from '@/types/compare';

const MIN_DURATION_MINUTES = 5;

const MEETING_APPS = ['zoom.us', 'Google Meet', 'Microsoft Teams', 'Slack', 'Discord'];
const SYSTEM_APPS = [
  'loginwindow',
  'Spotlight',
  'Dock',
  'SystemUIServer',
  'Finder',
  'dwm.exe',
  'explorer.exe',
  'ShellExperienceHost',
  'SearchApp',
];

function isSystemApp(app: string): boolean {
  const appLower = app.toLowerCase();
  return SYSTEM_APPS.some(s => appLower.includes(s.toLowerCase()));
}

function isMeetingApp(app: string, title: string): boolean {
  const appLower = app.toLowerCase();
  const titleLower = title.toLowerCase();
  return (
    MEETING_APPS.some(m => appLower.includes(m.toLowerCase())) ||
    titleLower.includes('meeting') ||
    titleLower.includes('standup') ||
    titleLower.includes('call')
  );
}

function getDayName(date: Date): string {
  return date.toLocaleDateString('pl-PL', { weekday: 'short' });
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

async function getActivitiesForDate(date: string): Promise<ActivitySummary[]> {
  try {
    // Pobierz eventy z WSZYSTKICH bucketów równolegle (window + browser)
    const [windowEvents, browserEvents] = await Promise.all([
      getWindowEvents(date),
      getChromeEvents(date),
    ]);

    // Połącz wszystkie eventy
    const events = [...windowEvents, ...browserEvents];

    const appTotals = new Map<
      string,
      { minutes: number; title: string; category: string; isMeeting: boolean }
    >();

    for (const event of events) {
      // Dla browser events - wykryj app z bucket source
      let app = event.data.app || 'Unknown';
      if (app === 'Unknown' && event._sourceBucket) {
        if (event._sourceBucket.includes('chrome')) app = 'Chrome';
        else if (event._sourceBucket.includes('firefox')) app = 'Firefox';
        else if (event._sourceBucket.includes('safari')) app = 'Safari';
        else if (event._sourceBucket.includes('edge')) app = 'Edge';
      }
      const title = event.data.title || event.data.url || '';
      const durationMinutes = event.duration / 60; // Nie zaokrąglaj jeszcze, sumuj dokładnie

      // Filtruj tylko system apps - NIE filtruj po czasie pojedynczego eventu
      // (bo eventy Chrome mają krótkie czasy, ale sumują się do dużych wartości)
      if (isSystemApp(app)) continue;

      const projectInfo = extractProjectInfo(title, app);
      const meetingInfo = extractMeetingInfo(title, app);
      const commInfo = extractCommunicationInfo(title, app);
      const terminalInfo = extractTerminalInfo(title, app);

      const category = categorizeActivity(
        app,
        projectInfo.isCodeEditor,
        terminalInfo.isTerminal,
        meetingInfo.isMeeting,
        commInfo.isCommunication
      );

      const existing = appTotals.get(app);
      if (existing) {
        existing.minutes += durationMinutes;
      } else {
        appTotals.set(app, {
          minutes: durationMinutes,
          title: projectInfo.project || terminalInfo.project || title.substring(0, 50),
          category,
          isMeeting: meetingInfo.isMeeting || isMeetingApp(app, title),
        });
      }
    }

    return (
      Array.from(appTotals.entries())
        .map(([app, data]) => ({
          app,
          title: data.title,
          minutes: Math.round(data.minutes), // Zaokrąglij po agregacji
          category: data.category,
          isMeeting: data.isMeeting,
        }))
        // Filtruj po agregacji - tylko aktywności >= MIN_DURATION_MINUTES łącznie
        .filter(activity => activity.minutes >= MIN_DURATION_MINUTES)
        .sort((a, b) => b.minutes - a.minutes)
    );
  } catch (error) {
    console.error(`Error fetching activities for ${date}:`, error);
    return [];
  }
}

async function getWorklogsForDate(date: string, myAccountId: string): Promise<WorklogSummary[]> {
  try {
    const worklogs = await getWorklogs(date, date);
    const myWorklogs = worklogs.filter(
      (w: { author?: { accountId?: string } }) => w.author?.accountId === myAccountId
    );

    // Get issue keys from Jira (Tempo returns only issue.id)
    const issueIds = myWorklogs
      .map((w: { issue?: { id?: number } }) => w.issue?.id)
      .filter((id): id is number => id !== undefined && id !== null);

    const issueKeyMap =
      issueIds.length > 0 ? await getIssueKeysByIds(issueIds) : new Map<string, string>();

    return myWorklogs.map(
      (w: {
        issue?: { key?: string; id?: number };
        timeSpentSeconds: number;
        description?: string;
      }) => {
        const issueId = w.issue?.id?.toString() || '';
        const issueKey = w.issue?.key || issueKeyMap.get(issueId) || 'Unknown';
        return {
          key: issueKey,
          minutes: Math.round(w.timeSpentSeconds / 60),
          description: w.description,
        };
      }
    );
  } catch (error) {
    console.error(`Error fetching worklogs for ${date}:`, error);
    return [];
  }
}

async function getDayComparison(dateStr: string, myAccountId: string): Promise<DayComparison> {
  const date = new Date(dateStr);

  const [activities, worklogs] = await Promise.all([
    getActivitiesForDate(dateStr),
    getWorklogsForDate(dateStr, myAccountId),
  ]);

  const awTotalMinutes = activities.reduce((sum, a) => sum + a.minutes, 0);
  const tempoTotalMinutes = worklogs.reduce((sum, w) => sum + w.minutes, 0);
  const gapMinutes = awTotalMinutes - tempoTotalMinutes;

  const meetings = activities
    .filter(a => a.isMeeting)
    .map(a => ({ title: a.title, minutes: a.minutes }));

  const topApps = activities.slice(0, 5).map(a => ({ app: a.app, minutes: a.minutes }));

  return {
    date: dateStr,
    dayName: getDayName(date),
    isWeekend: isWeekend(date),
    aw: {
      totalMinutes: awTotalMinutes,
      topApps,
      activities,
      meetings,
    },
    tempo: {
      totalMinutes: tempoTotalMinutes,
      worklogs,
    },
    gap: {
      minutes: gapMinutes,
      status: getGapStatus(gapMinutes),
    },
  };
}

function groupDaysIntoWeeks(days: DayComparison[]): WeekSummary[] {
  const weekMap = new Map<number, DayComparison[]>();

  for (const day of days) {
    const date = new Date(day.date);
    const weekNum = getWeekNumber(date);
    const existing = weekMap.get(weekNum) || [];
    existing.push(day);
    weekMap.set(weekNum, existing);
  }

  return Array.from(weekMap.entries())
    .map(([weekNumber, weekDays]) => {
      const sortedDays = weekDays.sort((a, b) => a.date.localeCompare(b.date));
      const awTotalMinutes = sortedDays.reduce((sum, d) => sum + d.aw.totalMinutes, 0);
      const tempoTotalMinutes = sortedDays.reduce((sum, d) => sum + d.tempo.totalMinutes, 0);

      return {
        weekNumber,
        startDate: sortedDays[0].date,
        endDate: sortedDays[sortedDays.length - 1].date,
        awTotalMinutes,
        tempoTotalMinutes,
        gapMinutes: awTotalMinutes - tempoTotalMinutes,
        days: sortedDays,
      };
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const fromDate = searchParams.get('from') || '2026-01-12';
  const toDate = searchParams.get('to') || new Date().toISOString().split('T')[0];

  try {
    // Get current user's accountId for filtering worklogs
    const currentUser = await getCurrentUser();
    const myAccountId = currentUser.accountId;

    const days: DayComparison[] = [];
    const start = new Date(fromDate);
    const end = new Date(toDate);

    // Fetch all days in parallel (batch of 7)
    const dateStrings: string[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dateStrings.push(d.toISOString().split('T')[0]);
    }

    // Process in batches of 7 days
    const batchSize = 7;
    for (let i = 0; i < dateStrings.length; i += batchSize) {
      const batch = dateStrings.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(date => getDayComparison(date, myAccountId))
      );
      days.push(...batchResults);
    }

    const weeks = groupDaysIntoWeeks(days);

    const totalAwMinutes = days.reduce((sum, d) => sum + d.aw.totalMinutes, 0);
    const totalTempoMinutes = days.reduce((sum, d) => sum + d.tempo.totalMinutes, 0);
    const daysWithGaps = days.filter(d => d.gap.status !== 'ok').length;
    const daysOk = days.filter(d => d.gap.status === 'ok').length;

    const response: CompareRangeResponse = {
      fromDate,
      toDate,
      days,
      weeks,
      summary: {
        totalAwMinutes,
        totalTempoMinutes,
        totalGapMinutes: totalAwMinutes - totalTempoMinutes,
        daysWithGaps,
        daysOk,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Compare range error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch comparison data' },
      { status: 500 }
    );
  }
}
