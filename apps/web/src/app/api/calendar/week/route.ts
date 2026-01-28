import { NextRequest, NextResponse } from 'next/server';
import { getWindowEvents, extractProjectInfo, extractMeetingInfo, extractCommunicationInfo, extractTerminalInfo, categorizeActivity, ActivityCategory } from '@/lib/activitywatch';
import { getWorklogs } from '@/lib/tempo';

const MY_ACCOUNT = process.env.TEMPO_ACCOUNT_ID || '';
const MIN_DURATION_MINUTES = 5; // Activities < 5 min are "other"

// Browser apps that need project context to not be "other"
const BROWSER_APPS = ['Chrome', 'Google Chrome', 'Safari', 'Firefox', 'Edge', 'Arc', 'Brave'];

// System apps filtered out
const SYSTEM_APPS = [
  'loginwindow', 'Spotlight', 'Dock', 'SystemUIServer', 'Finder',
  'dwm.exe', 'explorer.exe', 'ShellExperienceHost', 'SearchApp'
];

export interface TimeBlock {
  id: string;
  source: 'activitywatch' | 'tempo' | 'calendar';
  startTime: string;
  endTime: string;
  durationMinutes: number;
  title: string;
  app?: string;
  description?: string;
  category: ActivityCategory | 'other';
  issueKey?: string;
  tempoWorklogId?: number;
  calendarId?: string;
  isLogged: boolean;
  canLogToTempo: boolean;
  project?: string;
}

export interface DayData {
  date: string;
  dayName: string;
  isWeekend: boolean;
  activities: TimeBlock[];
  worklogs: TimeBlock[];
  calendarEvents: TimeBlock[];
  awTotalMinutes: number;
  tempoTotalMinutes: number;
  targetMinutes: number;
}

export interface WeekData {
  startDate: string;
  endDate: string;
  days: DayData[];
}

function formatTimeFromDate(date: Date): string {
  // Use local time formatting
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function isSystemApp(app: string): boolean {
  const appLower = app.toLowerCase();
  return SYSTEM_APPS.some(s => appLower.includes(s.toLowerCase()));
}

function isBrowserApp(app: string): boolean {
  const appLower = app.toLowerCase();
  return BROWSER_APPS.some(b => appLower.includes(b.toLowerCase()));
}

// Determine if activity should be "other" (not loggable to Tempo)
function shouldBeOther(
  app: string,
  title: string,
  durationMinutes: number,
  category: ActivityCategory,
  hasProject: boolean
): boolean {
  // Short activities < 5 min
  if (durationMinutes < MIN_DURATION_MINUTES) {
    return true;
  }

  // Browsers without recognized project/context
  if (isBrowserApp(app) && !hasProject && category === 'browser') {
    return true;
  }

  // Already categorized as something useful
  if (['coding', 'terminal', 'meeting', 'communication'].includes(category)) {
    return false;
  }

  // Design tools - keep
  if (category === 'design') {
    return false;
  }

  // Docs - keep
  if (category === 'docs') {
    return false;
  }

  // Everything else is "other"
  return true;
}

async function getActivitiesForDate(date: string): Promise<TimeBlock[]> {
  const events = await getWindowEvents(date);

  return events
    .filter(e => {
      const app = e.data.app || '';
      return !isSystemApp(app) && e.duration > 10;
    })
    .map(event => {
      const startTime = new Date(event.timestamp);
      const endTime = new Date(startTime.getTime() + event.duration * 1000);
      const durationMinutes = Math.round(event.duration / 60);

      const title = event.data.title || 'Unknown';
      const app = event.data.app || 'Unknown';

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

      const hasProject = !!(projectInfo.project || terminalInfo.project || meetingInfo.isMeeting || commInfo.isCommunication);

      const isOther = shouldBeOther(app, title, durationMinutes, category, hasProject);

      return {
        id: `aw-${event.id}`,
        source: 'activitywatch' as const,
        startTime: formatTimeFromDate(startTime),
        endTime: formatTimeFromDate(endTime),
        durationMinutes,
        title: projectInfo.project || terminalInfo.project || meetingInfo.meetingTitle || commInfo.channel || title,
        app,
        category: isOther ? 'other' : category,
        isLogged: false,
        canLogToTempo: !isOther,
        project: projectInfo.project || terminalInfo.project
      };
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

async function getWorklogsForDate(date: string): Promise<TimeBlock[]> {
  try {
    const worklogs = await getWorklogs(date, date);
    const myWorklogs = worklogs.filter(
      (w: { author?: { accountId?: string } }) => w.author?.accountId === MY_ACCOUNT
    );

    return myWorklogs.map((w: {
      tempoWorklogId: number;
      issue?: { key?: string };
      timeSpentSeconds: number;
      startTime?: string;
      description?: string;
    }) => {
      const startTimeParts = (w.startTime || '09:00').split(':');
      const startHour = parseInt(startTimeParts[0], 10);
      const startMin = parseInt(startTimeParts[1] || '0', 10);
      const durationMinutes = Math.round(w.timeSpentSeconds / 60);

      const endTotalMinutes = startHour * 60 + startMin + durationMinutes;
      const endHour = Math.floor(endTotalMinutes / 60);
      const endMin = endTotalMinutes % 60;

      return {
        id: `tempo-${w.tempoWorklogId}`,
        source: 'tempo' as const,
        startTime: w.startTime || '09:00',
        endTime: `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`,
        durationMinutes,
        title: w.description || w.issue?.key || 'Worklog',
        issueKey: w.issue?.key,
        tempoWorklogId: w.tempoWorklogId,
        category: 'coding' as ActivityCategory,
        isLogged: true,
        canLogToTempo: false // Already logged
      };
    }).sort((a: TimeBlock, b: TimeBlock) => a.startTime.localeCompare(b.startTime));
  } catch (error) {
    console.error('Error fetching worklogs:', error);
    return [];
  }
}

function getDayName(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const startDate = searchParams.get('start');
  const endDate = searchParams.get('end');

  if (!startDate || !endDate) {
    // Default to current week
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const start = monday.toISOString().split('T')[0];
    const end = sunday.toISOString().split('T')[0];

    return NextResponse.redirect(
      new URL(`/api/calendar/week?start=${start}&end=${end}`, request.url)
    );
  }

  try {
    const days: DayData[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];

      const [activities, worklogs] = await Promise.all([
        getActivitiesForDate(dateStr),
        getWorklogsForDate(dateStr)
      ]);

      const awTotalMinutes = activities
        .filter(a => a.canLogToTempo)
        .reduce((sum, a) => sum + a.durationMinutes, 0);

      const tempoTotalMinutes = worklogs.reduce((sum, w) => sum + w.durationMinutes, 0);

      days.push({
        date: dateStr,
        dayName: getDayName(d),
        isWeekend: isWeekend(d),
        activities,
        worklogs,
        calendarEvents: [], // TODO: Google Calendar integration
        awTotalMinutes,
        tempoTotalMinutes,
        targetMinutes: isWeekend(d) ? 0 : 480 // 8h for weekdays
      });
    }

    const weekData: WeekData = {
      startDate,
      endDate,
      days
    };

    return NextResponse.json(weekData);
  } catch (error) {
    console.error('Calendar week error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch week data' },
      { status: 500 }
    );
  }
}
