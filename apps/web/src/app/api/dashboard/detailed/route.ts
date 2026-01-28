import { NextRequest, NextResponse } from 'next/server';
import { getWorklogsForDate } from '@/lib/tempo';
import { getWindowEvents, groupActivities, AWEvent } from '@/lib/activitywatch';

// System apps to filter out (cross-platform)
const SYSTEM_APPS = [
  'loginwindow', 'Spotlight', 'Dock', 'SystemUIServer', 'Finder',
  'dwm.exe', 'svchost.exe', 'WinLogon', 'csrss.exe', 'explorer.exe',
  'ShellExperienceHost', 'StartMenuExperienceHost', 'SearchApp', 'LockApp',
  'gnome-shell', 'kwin', 'plasmashell'
];

function isSystemApp(app: string): boolean {
  const appLower = app.toLowerCase();
  return SYSTEM_APPS.some(s => appLower === s.toLowerCase() || appLower.includes(s.toLowerCase()));
}

const MY_ACCOUNT = process.env.TEMPO_ACCOUNT_ID || '';

interface HourlyData {
  hour: number;
  hourLabel: string;
  awMinutes: number;
  tempoMinutes: number;
}

interface AppUsage {
  app: string;
  minutes: number;
  percentage: number;
  color: string;
}

interface TopActivity {
  title: string;
  app: string;
  minutes: number;
  events: number;
}

// App colors for charts (cross-platform)
const APP_COLORS: Record<string, string> = {
  // Browsers
  'Google Chrome': '#4285F4',
  'Chrome': '#4285F4',
  'Safari': '#006CFF',
  'Firefox': '#FF7139',
  'Microsoft Edge': '#0078D4',
  'Edge': '#0078D4',
  'Arc': '#FF5C5C',
  'Brave': '#FB542B',

  // Code editors - VS Code family
  'Cursor': '#00D8FF',
  'Code': '#007ACC',
  'Visual Studio Code': '#007ACC',
  'VSCodium': '#2F80ED',
  'VSCode': '#007ACC',

  // Code editors - JetBrains
  'WebStorm': '#00CDD7',
  'IntelliJ IDEA': '#FF318C',
  'PyCharm': '#21D789',
  'PhpStorm': '#B345F1',
  'GoLand': '#00D7B0',
  'Rider': '#C90F5E',
  'CLion': '#22D88F',
  'DataGrip': '#22D88F',
  'RubyMine': '#FC801D',
  'Android Studio': '#3DDC84',

  // Code editors - Other
  'Zed': '#084CFE',
  'Sublime Text': '#FF9800',
  'Atom': '#66595C',
  'Notepad++': '#90E59A',
  'Visual Studio': '#5C2D91',
  'Xcode': '#147EFB',
  'Fleet': '#000000',
  'Nova': '#7B68EE',

  // Terminals - macOS
  'Terminal': '#4D4D4D',
  'iTerm': '#4D4D4D',
  'iTerm2': '#4D4D4D',
  'Warp': '#01A4FF',

  // Terminals - Windows
  'cmd': '#0078D4',
  'Command Prompt': '#0078D4',
  'PowerShell': '#012456',
  'Windows Terminal': '#4D4D4D',
  'WindowsTerminal': '#4D4D4D',

  // Terminals - Cross-platform
  'Kitty': '#E5C07B',
  'Alacritty': '#F46D01',
  'Hyper': '#000000',
  'WezTerm': '#4E49EE',

  // Communication
  'Slack': '#4A154B',
  'Discord': '#5865F2',
  'Microsoft Teams': '#6264A7',
  'Teams': '#6264A7',
  'Telegram': '#0088CC',
  'WhatsApp': '#25D366',
  'Messages': '#34C759',
  'Signal': '#3A76F0',

  // Video/Meetings
  'zoom.us': '#2D8CFF',
  'Zoom': '#2D8CFF',
  'Google Meet': '#00897B',
  'Webex': '#00BCF2',

  // Design
  'Figma': '#F24E1E',
  'Sketch': '#FDAD00',
  'Adobe Photoshop': '#31A8FF',
  'Adobe Illustrator': '#FF9A00',

  // Productivity
  'Notion': '#000000',
  'Obsidian': '#7C3AED',
  'Mail': '#007AFF',

  // System - macOS
  'Finder': '#147EFB',
  'Preview': '#FF9500',
  'System Preferences': '#8E8E93',
  'System Settings': '#8E8E93',

  // System - Windows
  'Explorer': '#F0C14B',
  'File Explorer': '#F0C14B',
  'Settings': '#0078D4',
  'Notepad': '#6B8E23',

  // AI Tools
  'Comet': '#FF6B35',
  'ChatGPT': '#10A37F',

  'default': '#6B7280'
};

function getAppColor(app: string): string {
  return APP_COLORS[app] || APP_COLORS['default'];
}

// Calculate hourly breakdown from AW events
function calculateHourlyAW(events: AWEvent[]): Map<number, number> {
  const hourly = new Map<number, number>();

  for (let h = 6; h < 24; h++) {
    hourly.set(h, 0);
  }

  for (const event of events) {
    if (!event.data.app || isSystemApp(event.data.app)) continue;

    const startTime = new Date(event.timestamp);
    const hour = startTime.getHours();
    if (hour >= 6 && hour < 24) {
      hourly.set(hour, (hourly.get(hour) || 0) + event.duration);
    }
  }

  return hourly;
}

// Calculate hourly breakdown from Tempo worklogs
function calculateHourlyTempo(worklogs: Array<{
  startTime?: string;
  timeSpentSeconds: number;
  author?: { accountId?: string };
}>): Map<number, number> {
  const hourly = new Map<number, number>();

  for (let h = 6; h < 24; h++) {
    hourly.set(h, 0);
  }

  for (const worklog of worklogs) {
    if (worklog.author?.accountId !== MY_ACCOUNT) continue;
    if (!worklog.startTime) continue;

    const [hourStr] = worklog.startTime.split(':');
    const hour = parseInt(hourStr, 10);

    // Distribute worklog across hours
    let remainingSeconds = worklog.timeSpentSeconds;
    let currentHour = hour;

    while (remainingSeconds > 0 && currentHour < 24) {
      const secondsInThisHour = Math.min(remainingSeconds, 3600);
      hourly.set(currentHour, (hourly.get(currentHour) || 0) + secondsInThisHour);
      remainingSeconds -= secondsInThisHour;
      currentHour++;
    }
  }

  return hourly;
}

// Calculate app usage from events
function calculateAppUsage(events: AWEvent[]): AppUsage[] {
  const appSeconds = new Map<string, number>();

  for (const event of events) {
    const app = event.data.app || 'Unknown';
    if (isSystemApp(app)) continue;
    appSeconds.set(app, (appSeconds.get(app) || 0) + event.duration);
  }

  const total = Array.from(appSeconds.values()).reduce((a, b) => a + b, 0);

  return Array.from(appSeconds.entries())
    .map(([app, seconds]) => ({
      app,
      minutes: Math.round(seconds / 60),
      percentage: total > 0 ? Math.round((seconds / total) * 100) : 0,
      color: getAppColor(app)
    }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 10);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

  try {
    // Fetch ActivityWatch events
    const awEvents = await getWindowEvents(date);
    const activities = groupActivities(awEvents);

    // Fetch Tempo worklogs
    const worklogs = await getWorklogsForDate(date);
    const myWorklogs = worklogs.filter(
      (w: { author?: { accountId?: string } }) => w.author?.accountId === MY_ACCOUNT
    );

    // Calculate hourly data
    const hourlyAW = calculateHourlyAW(awEvents);
    const hourlyTempo = calculateHourlyTempo(worklogs);

    const hourlyData: HourlyData[] = [];
    for (let h = 6; h < 22; h++) {
      hourlyData.push({
        hour: h,
        hourLabel: `${h}:00`,
        awMinutes: Math.round((hourlyAW.get(h) || 0) / 60),
        tempoMinutes: Math.round((hourlyTempo.get(h) || 0) / 60)
      });
    }

    // Calculate app usage
    const appUsage = calculateAppUsage(awEvents);

    // Top activities
    const topActivities: TopActivity[] = activities.slice(0, 10).map(a => ({
      title: a.title.substring(0, 50) + (a.title.length > 50 ? '...' : ''),
      app: a.app,
      minutes: Math.round(a.totalSeconds / 60),
      events: a.events
    }));

    // Totals
    const totalAWSeconds = awEvents
      .filter(e => e.data.app && !isSystemApp(e.data.app))
      .reduce((sum, e) => sum + e.duration, 0);

    const totalTempoSeconds = myWorklogs.reduce(
      (sum: number, w: { timeSpentSeconds: number }) => sum + w.timeSpentSeconds,
      0
    );

    // Tempo worklogs details
    const tempoWorklogs = myWorklogs.map((w) => ({
      id: w.tempoWorklogId,
      description: w.description || 'No description',
      minutes: Math.round(w.timeSpentSeconds / 60),
      startTime: w.startTime || '',
      issueId: w.issue?.id
    }));

    return NextResponse.json({
      date,
      summary: {
        awTotalMinutes: Math.round(totalAWSeconds / 60),
        awTotalFormatted: formatTime(totalAWSeconds),
        tempoTotalMinutes: Math.round(totalTempoSeconds / 60),
        tempoTotalFormatted: formatTime(totalTempoSeconds),
        worklogsCount: myWorklogs.length,
        activitiesCount: activities.length,
        efficiency: totalAWSeconds > 0
          ? Math.round((totalTempoSeconds / totalAWSeconds) * 100)
          : 0
      },
      hourlyData,
      appUsage,
      topActivities,
      tempoWorklogs
    });
  } catch (error) {
    console.error('Dashboard detailed error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch data' },
      { status: 500 }
    );
  }
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}
