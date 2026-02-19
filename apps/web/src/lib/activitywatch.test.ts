import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractMeetingInfo,
  extractCommunicationInfo,
  categorizeActivity,
  extractTerminalInfo,
  extractProjectInfo,
  formatDuration,
  groupActivities,
  getBuckets,
  clearBucketCache,
  getWindowEvents,
  getChromeEvents,
  getEditorEvents,
  getAllEvents,
  type AWEvent,
} from './activitywatch';

// ========================================
// PURE FUNCTIONS
// ========================================

describe('extractMeetingInfo', () => {
  it('should detect Google Meet by meet code in title', () => {
    const result = extractMeetingInfo('Meet - abc-defg-hij - Google Chrome', 'Google Chrome');
    expect(result.isMeeting).toBe(true);
    expect(result.platform).toBe('Google Meet');
    expect(result.meetingId).toBe('abc-defg-hij');
  });

  it('should detect Google Meet with Polish title', () => {
    const result = extractMeetingInfo('Spotkanie | Google Meet - Google Chrome', 'Google Chrome');
    expect(result.isMeeting).toBe(true);
    expect(result.platform).toBe('Google Meet');
  });

  it('should detect Zoom meetings by app', () => {
    const result = extractMeetingInfo('Zoom Meeting 123456789', 'zoom.us');
    expect(result.isMeeting).toBe(true);
    expect(result.platform).toBe('Zoom');
    expect(result.meetingId).toBe('123456789');
  });

  it('should detect Zoom meetings by title', () => {
    const result = extractMeetingInfo('Zoom Meeting Discussion', 'SomeApp');
    expect(result.isMeeting).toBe(true);
    expect(result.platform).toBe('Zoom');
  });

  it('should detect Microsoft Teams meetings', () => {
    const result = extractMeetingInfo('Sprint Review Meeting | Microsoft Teams', 'Microsoft Teams');
    expect(result.isMeeting).toBe(true);
    expect(result.platform).toBe('Microsoft Teams');
    expect(result.meetingTitle).toBe('Sprint Review Meeting');
  });

  it('should detect Webex by app', () => {
    const result = extractMeetingInfo('My Webex Meeting', 'Webex Meetings');
    expect(result.isMeeting).toBe(true);
    expect(result.platform).toBe('Webex');
  });

  it('should detect Webex by title keyword', () => {
    const result = extractMeetingInfo('Join Webex session', 'SomeApp');
    expect(result.isMeeting).toBe(true);
    expect(result.platform).toBe('Webex');
  });

  it('should detect Atlassian huddles', () => {
    const result = extractMeetingInfo('Team Huddle', 'Slack');
    expect(result.isMeeting).toBe(true);
    expect(result.platform).toBe('Atlassian');
  });

  it('should detect standup calls', () => {
    const result = extractMeetingInfo('Daily Standup Call', 'AnyApp');
    expect(result.isMeeting).toBe(true);
    expect(result.platform).toBe('Atlassian');
  });

  it('should detect meeting apps directly', () => {
    const result = extractMeetingInfo('Some Call', 'Zoom');
    expect(result.isMeeting).toBe(true);
    expect(result.platform).toBe('Zoom');
  });

  it('should return isMeeting false for non-meeting', () => {
    const result = extractMeetingInfo('package.json — timetracker — Cursor', 'Cursor');
    expect(result.isMeeting).toBe(false);
  });
});

describe('extractCommunicationInfo', () => {
  it('should detect Slack app with channel', () => {
    const result = extractCommunicationInfo('general - Team Name - Slack', 'Slack');
    expect(result.isCommunication).toBe(true);
    expect(result.platform).toBe('Slack');
    expect(result.channel).toBe('general');
  });

  it('should detect Slack DM', () => {
    const result = extractCommunicationInfo('JohnDoe - Slack', 'Slack');
    expect(result.isCommunication).toBe(true);
    expect(result.platform).toBe('Slack');
    expect(result.isDirectMessage).toBe(true);
  });

  it('should detect Slack in browser', () => {
    const result = extractCommunicationInfo('channel-name | Workspace | Slack', 'Google Chrome');
    expect(result.isCommunication).toBe(true);
    expect(result.platform).toBe('Slack (web)');
    expect(result.channel).toBe('channel-name');
  });

  it('should detect Discord with channel', () => {
    const result = extractCommunicationInfo('#general - My Server - Discord', 'Discord');
    expect(result.isCommunication).toBe(true);
    expect(result.platform).toBe('Discord');
    expect(result.channel).toBe('#general');
  });

  it('should detect Discord DM', () => {
    const result = extractCommunicationInfo('@JohnDoe - Discord', 'Discord');
    expect(result.isCommunication).toBe(true);
    expect(result.isDirectMessage).toBe(true);
  });

  it('should detect Microsoft Teams chat (not meeting)', () => {
    const result = extractCommunicationInfo('Dev Chat | Microsoft Teams', 'Microsoft Teams');
    expect(result.isCommunication).toBe(true);
    expect(result.platform).toBe('Microsoft Teams');
  });

  it('should detect Teams with "meeting" in title via COMMUNICATION_APPS fallback', () => {
    // Even though the Teams-specific branch excludes "meeting" in title,
    // "Microsoft Teams" is in COMMUNICATION_APPS, so it still matches via fallback
    const result = extractCommunicationInfo('Sprint Meeting | Microsoft Teams', 'Microsoft Teams');
    expect(result.isCommunication).toBe(true);
    expect(result.platform).toBe('Microsoft Teams');
  });

  it('should detect Telegram', () => {
    const result = extractCommunicationInfo('Group Chat', 'Telegram');
    expect(result.isCommunication).toBe(true);
    expect(result.platform).toBe('Telegram');
  });

  it('should detect WhatsApp', () => {
    const result = extractCommunicationInfo('Family Group', 'WhatsApp');
    expect(result.isCommunication).toBe(true);
    expect(result.platform).toBe('WhatsApp');
  });

  it('should detect Signal', () => {
    const result = extractCommunicationInfo('Chat', 'Signal');
    expect(result.isCommunication).toBe(true);
    expect(result.platform).toBe('Signal');
  });

  it('should return isCommunication false for non-communication', () => {
    const result = extractCommunicationInfo('index.ts — project — Cursor', 'Cursor');
    expect(result.isCommunication).toBe(false);
  });
});

describe('categorizeActivity', () => {
  it('should return coding for code editors', () => {
    expect(categorizeActivity('Cursor', true)).toBe('coding');
  });

  it('should return terminal for terminal apps', () => {
    expect(categorizeActivity('iTerm2', false, true)).toBe('terminal');
  });

  it('should return meeting for meetings', () => {
    expect(categorizeActivity('Zoom', false, false, true)).toBe('meeting');
  });

  it('should return communication for communicators', () => {
    expect(categorizeActivity('Slack', false, false, false, true)).toBe('communication');
  });

  it('should return browser for browser apps', () => {
    expect(categorizeActivity('Google Chrome')).toBe('browser');
    expect(categorizeActivity('Firefox')).toBe('browser');
    expect(categorizeActivity('Safari')).toBe('browser');
    expect(categorizeActivity('Microsoft Edge')).toBe('browser');
  });

  it('should return design for design apps', () => {
    expect(categorizeActivity('Figma')).toBe('design');
    expect(categorizeActivity('Sketch')).toBe('design');
    expect(categorizeActivity('Adobe Photoshop')).toBe('design');
  });

  it('should return docs for documentation apps', () => {
    expect(categorizeActivity('Notion')).toBe('docs');
    expect(categorizeActivity('Obsidian')).toBe('docs');
    expect(categorizeActivity('Microsoft Word')).toBe('docs');
  });

  it('should return other for unknown apps', () => {
    expect(categorizeActivity('RandomApp')).toBe('other');
  });

  it('should prioritize code editor over browser', () => {
    // isCodeEditor flag takes priority
    expect(categorizeActivity('Google Chrome', true)).toBe('coding');
  });
});

describe('extractTerminalInfo', () => {
  it('should return isTerminal false for non-terminal apps', () => {
    const result = extractTerminalInfo('Some Title', 'Cursor');
    expect(result.isTerminal).toBe(false);
  });

  it('should detect iTerm2 as terminal (macTerminalPattern matches first)', () => {
    // "bash — /Users/.../myapp — 120x40" matches macTerminalPattern first:
    // [\w.-]+ = "bash", (.+?) = "/Users/gaca/projects/myapp", (\w+) = "120x40"
    const result = extractTerminalInfo('bash — /Users/gaca/projects/myapp — 120x40', 'iTerm2');
    expect(result.isTerminal).toBe(true);
    expect(result.project).toBe('/Users/gaca/projects/myapp');
    // (\w+) captures "120x4", then .+? takes "0" (needs at least 1 char)
    expect(result.command).toBe('120x4');
  });

  it('should parse zsh dash pattern (macTerminalPattern matches first)', () => {
    // Same issue: "zsh — ~/projects/timetracker — 80x24" is caught by macTerminalPattern
    const result = extractTerminalInfo('zsh — ~/projects/timetracker — 80x24', 'Terminal');
    expect(result.isTerminal).toBe(true);
    expect(result.project).toBe('~/projects/timetracker');
    expect(result.command).toBe('80x2');
  });

  it('should parse colon pattern with git branch', () => {
    const result = extractTerminalInfo('zsh:~/projects/timetracker (main)', 'Terminal');
    expect(result.isTerminal).toBe(true);
    expect(result.shell).toBe('zsh');
    expect(result.workingDir).toBe('~/projects/timetracker');
    expect(result.gitBranch).toBe('main');
    expect(result.project).toBe('timetracker');
  });

  it('should parse colon pattern without git branch', () => {
    const result = extractTerminalInfo('bash:~/dev/app', 'Terminal');
    expect(result.isTerminal).toBe(true);
    expect(result.shell).toBe('bash');
    expect(result.workingDir).toBe('~/dev/app');
  });

  it('should parse SSH pattern', () => {
    const result = extractTerminalInfo('user@server:~/deploy/app', 'Terminal');
    expect(result.isTerminal).toBe(true);
    expect(result.workingDir).toBe('~/deploy/app');
    expect(result.project).toBe('app');
  });

  it('should detect Windows PowerShell', () => {
    const result = extractTerminalInfo('Administrator: Windows PowerShell', 'PowerShell');
    expect(result.isTerminal).toBe(true);
    expect(result.shell).toBe('powershell');
  });

  it('should parse Windows cmd path via colon pattern', () => {
    // "C:\Users\dev\project" matches colonPattern: (\w+) = "C", then ":", ([^\s(]+) = "\Users\dev\project"
    const result = extractTerminalInfo('C:\\Users\\dev\\project', 'cmd.exe');
    expect(result.isTerminal).toBe(true);
    expect(result.shell).toBe('c');
    expect(result.workingDir).toBe('\\Users\\dev\\project');
    expect(result.project).toBe('project');
  });

  it('should detect command pattern (npm/git/etc)', () => {
    const result = extractTerminalInfo('npm run build', 'Terminal');
    expect(result.isTerminal).toBe(true);
    expect(result.command).toBe('npm run build');
  });

  it('should parse Warp/iTerm git branch pattern', () => {
    const result = extractTerminalInfo('~/projects/app main', 'Warp');
    expect(result.isTerminal).toBe(true);
    expect(result.workingDir).toBe('~/projects/app');
    expect(result.gitBranch).toBe('main');
    expect(result.project).toBe('app');
  });

  it('should parse macOS Terminal.app with Claude Code format', () => {
    const result = extractTerminalInfo(
      'gaca — ★ Timesheet Task Mapping — claude ◂ claude-code TERM_PROGRAM=Apple_Terminal SHELL=/bin/bash — 121×43',
      'Terminal'
    );
    expect(result.isTerminal).toBe(true);
    expect(result.project).toBe('Timesheet Task Mapping');
    expect(result.command).toBe('claude');
    expect(result.shell).toBe('bash');
  });

  it('should detect Alacritty as terminal', () => {
    const result = extractTerminalInfo('zsh — ~/code — 80x24', 'Alacritty');
    expect(result.isTerminal).toBe(true);
  });

  it('should detect Kitty as terminal', () => {
    const result = extractTerminalInfo('bash:~/project', 'Kitty');
    expect(result.isTerminal).toBe(true);
  });

  it('should parse Windows powershell dash pattern (macTerminalPattern matches)', () => {
    // macTerminalPattern matches: [\w.-]+ = "powershell", (.+?) = "C:\Users\dev\project", (\w+) = "120x40"
    const result = extractTerminalInfo('powershell — C:\\Users\\dev\\project — 120x40', 'Windows Terminal');
    expect(result.isTerminal).toBe(true);
    expect(result.project).toBe('C:\\Users\\dev\\project');
    expect(result.command).toBe('120x4');
  });
});

describe('extractProjectInfo', () => {
  it('should return isCodeEditor false for non-editors', () => {
    const result = extractProjectInfo('Some Page - Chrome', 'Google Chrome');
    expect(result.isCodeEditor).toBe(false);
  });

  it('should detect Cursor with file and project', () => {
    const result = extractProjectInfo('package.json — timetracker — Cursor', 'Cursor');
    expect(result.isCodeEditor).toBe(true);
    expect(result.fileName).toBe('package.json');
    expect(result.project).toBe('timetracker');
  });

  it('should detect VS Code with file and project', () => {
    const result = extractProjectInfo('index.ts — my-project — Visual Studio Code', 'Code');
    expect(result.isCodeEditor).toBe(true);
    expect(result.fileName).toBe('index.ts');
    expect(result.project).toBe('my-project');
  });

  it('should detect modified file indicator', () => {
    const result = extractProjectInfo('● app.tsx — dashboard — Cursor', 'Cursor');
    expect(result.isCodeEditor).toBe(true);
    expect(result.fileName).toBe('app.tsx');
    expect(result.project).toBe('dashboard');
  });

  it('should detect JetBrains format', () => {
    const result = extractProjectInfo('MyProject – Main.java', 'WebStorm');
    expect(result.isCodeEditor).toBe(true);
    expect(result.project).toBe('MyProject');
    expect(result.fileName).toBe('Main.java');
  });

  it('should detect Visual Studio format', () => {
    const result = extractProjectInfo('MyApp - Microsoft Visual Studio', 'Visual Studio');
    expect(result.isCodeEditor).toBe(true);
    expect(result.project).toBe('MyApp');
  });

  it('should detect Sublime Text format', () => {
    const result = extractProjectInfo('index.js • MyProject - Sublime Text', 'Sublime Text');
    expect(result.isCodeEditor).toBe(true);
    expect(result.fileName).toBe('index.js');
    expect(result.project).toBe('MyProject');
  });

  it('should detect Zed format', () => {
    const result = extractProjectInfo('main.rs — my-project — Zed', 'Zed');
    expect(result.isCodeEditor).toBe(true);
    expect(result.fileName).toBe('main.rs');
    expect(result.project).toBe('my-project');
  });

  it('should handle simple project-only title', () => {
    const result = extractProjectInfo('timetracker — Cursor', 'Cursor');
    expect(result.isCodeEditor).toBe(true);
    expect(result.project).toBe('timetracker');
  });

  it('should detect Neovim as code editor', () => {
    const result = extractProjectInfo('Some file', 'Neovim');
    expect(result.isCodeEditor).toBe(true);
  });

  it('should detect IntelliJ IDEA', () => {
    const result = extractProjectInfo('MyProject – App.kt – some-module', 'IntelliJ IDEA');
    expect(result.isCodeEditor).toBe(true);
    expect(result.project).toBe('MyProject');
  });
});

describe('formatDuration', () => {
  it('should format seconds to minutes only', () => {
    expect(formatDuration(120)).toBe('2m');
    expect(formatDuration(300)).toBe('5m');
  });

  it('should format with hours and minutes', () => {
    expect(formatDuration(3600)).toBe('1h 0m');
    expect(formatDuration(3660)).toBe('1h 1m');
    expect(formatDuration(7200)).toBe('2h 0m');
    expect(formatDuration(5400)).toBe('1h 30m');
  });

  it('should handle 0 seconds', () => {
    expect(formatDuration(0)).toBe('0m');
  });

  it('should handle seconds less than 60', () => {
    expect(formatDuration(30)).toBe('0m');
    expect(formatDuration(59)).toBe('0m');
  });
});

describe('groupActivities', () => {
  function makeEvent(overrides: Partial<AWEvent> = {}): AWEvent {
    return {
      id: 1,
      timestamp: '2024-01-15T10:00:00.000Z',
      duration: 60,
      data: { app: 'Cursor', title: 'index.ts — myproject — Cursor' },
      ...overrides,
    };
  }

  it('should filter out system apps', () => {
    const events: AWEvent[] = [
      makeEvent({ data: { app: 'loginwindow', title: '' } }),
      makeEvent({ data: { app: 'Spotlight', title: '' } }),
      makeEvent({ data: { app: 'Cursor', title: 'file.ts — proj — Cursor' } }),
    ];
    const result = groupActivities(events);
    // Only Cursor should remain
    expect(result.every(a => a.app === 'Cursor')).toBe(true);
  });

  it('should filter out events shorter than 10 seconds', () => {
    const events: AWEvent[] = [
      makeEvent({ duration: 5, data: { app: 'Cursor', title: 'quick flash' } }),
      makeEvent({ duration: 60, data: { app: 'Cursor', title: 'file.ts — proj — Cursor' } }),
    ];
    const result = groupActivities(events);
    expect(result.length).toBe(1);
  });

  it('should group events by app and project for code editors', () => {
    const events: AWEvent[] = [
      makeEvent({
        timestamp: '2024-01-15T10:00:00Z',
        duration: 120,
        data: { app: 'Cursor', title: 'index.ts — myproject — Cursor' },
      }),
      makeEvent({
        timestamp: '2024-01-15T10:02:00Z',
        duration: 180,
        data: { app: 'Cursor', title: 'app.tsx — myproject — Cursor' },
      }),
    ];
    const result = groupActivities(events);
    expect(result.length).toBe(1);
    expect(result[0].totalSeconds).toBe(300);
    expect(result[0].project).toBe('myproject');
    expect(result[0].isCodeEditor).toBe(true);
  });

  it('should separate different projects', () => {
    const events: AWEvent[] = [
      makeEvent({
        timestamp: '2024-01-15T10:00:00Z',
        duration: 60,
        data: { app: 'Cursor', title: 'a.ts — projectA — Cursor' },
      }),
      makeEvent({
        timestamp: '2024-01-15T10:01:00Z',
        duration: 60,
        data: { app: 'Cursor', title: 'b.ts — projectB — Cursor' },
      }),
    ];
    const result = groupActivities(events);
    expect(result.length).toBe(2);
    const projects = result.map(a => a.project).sort();
    expect(projects).toEqual(['projectA', 'projectB']);
  });

  it('should sort results by totalSeconds descending', () => {
    const events: AWEvent[] = [
      makeEvent({
        timestamp: '2024-01-15T10:00:00Z',
        duration: 30,
        data: { app: 'Chrome', title: 'Short Page - Google Chrome' },
      }),
      makeEvent({
        timestamp: '2024-01-15T10:01:00Z',
        duration: 300,
        data: { app: 'Cursor', title: 'a.ts — proj — Cursor' },
      }),
    ];
    const result = groupActivities(events);
    expect(result.length).toBe(2);
    expect(result[0].totalSeconds).toBeGreaterThanOrEqual(result[1].totalSeconds);
  });

  it('should detect meetings in grouped activities', () => {
    const events: AWEvent[] = [
      makeEvent({
        timestamp: '2024-01-15T10:00:00Z',
        duration: 1800,
        data: { app: 'zoom.us', title: 'Sprint Planning 123456789' },
      }),
    ];
    const result = groupActivities(events);
    expect(result.length).toBe(1);
    expect(result[0].isMeeting).toBe(true);
  });

  it('should group terminal events by project', () => {
    const events: AWEvent[] = [
      makeEvent({
        timestamp: '2024-01-15T10:00:00Z',
        duration: 60,
        data: { app: 'iTerm2', title: 'zsh — ~/projects/myapp — 80x24' },
      }),
      makeEvent({
        timestamp: '2024-01-15T10:01:00Z',
        duration: 60,
        data: { app: 'iTerm2', title: 'zsh — ~/projects/myapp — 80x24' },
      }),
    ];
    const result = groupActivities(events);
    expect(result.length).toBe(1);
    expect(result[0].isTerminal).toBe(true);
    expect(result[0].project).toBe('~/projects/myapp');
    expect(result[0].totalSeconds).toBe(120);
  });

  it('should split sessions with gaps > 30 minutes', () => {
    const events: AWEvent[] = [
      makeEvent({
        timestamp: '2024-01-15T10:00:00Z',
        duration: 60,
        data: { app: 'Cursor', title: 'a.ts — proj — Cursor' },
      }),
      makeEvent({
        // 2 hour gap
        timestamp: '2024-01-15T12:01:00Z',
        duration: 60,
        data: { app: 'Cursor', title: 'b.ts — proj — Cursor' },
      }),
    ];
    const result = groupActivities(events);
    // Should be split into 2 sessions for the same project
    expect(result.length).toBe(2);
  });

  it('should detect browser app from source bucket', () => {
    const events: AWEvent[] = [
      makeEvent({
        timestamp: '2024-01-15T10:00:00Z',
        duration: 120,
        data: { app: '', title: 'GitHub', url: 'https://github.com' },
        _sourceBucket: 'aw-watcher-web-chrome-macbook',
      }),
    ];
    const result = groupActivities(events);
    expect(result.length).toBe(1);
    expect(result[0].app).toBe('Chrome');
  });

  it('should mark private activities', () => {
    const events: AWEvent[] = [
      makeEvent({
        timestamp: '2024-01-15T10:00:00Z',
        duration: 120,
        data: { app: 'Telegram', title: 'Group Chat' },
      }),
    ];
    const result = groupActivities(events);
    expect(result.length).toBe(1);
    expect(result[0].isPrivate).toBe(true);
  });

  it('should handle empty events array', () => {
    expect(groupActivities([])).toEqual([]);
  });

  // --- Configurable thresholds (TODO-1) ---

  it('should respect custom minEventDurationSeconds', () => {
    const events: AWEvent[] = [
      makeEvent({ duration: 25, data: { app: 'Cursor', title: 'short.ts — proj — Cursor' } }),
      makeEvent({ duration: 60, data: { app: 'Cursor', title: 'long.ts — proj — Cursor' } }),
    ];
    // With default (10s), both pass; with 30s, only the 60s one passes
    const result = groupActivities(events, { minEventDurationSeconds: 30 });
    expect(result.length).toBe(1);
    expect(result[0].totalSeconds).toBe(60);
  });

  it('should respect custom minActivityDurationSeconds', () => {
    const events: AWEvent[] = [
      makeEvent({
        timestamp: '2024-01-15T10:00:00Z',
        duration: 120,
        data: { app: 'Cursor', title: 'a.ts — projA — Cursor' },
      }),
      makeEvent({
        timestamp: '2024-01-15T10:05:00Z',
        duration: 20, // This passes event filter but grouped total is 20s
        data: { app: 'Chrome', title: 'Short Page - Google Chrome' },
      }),
    ];
    // With minActivityDurationSeconds=60, the 20s Chrome group is excluded
    const result = groupActivities(events, { minActivityDurationSeconds: 60 });
    expect(result.length).toBe(1);
    expect(result[0].project).toBe('projA');
  });

  // --- Short task aggregation (TODO-3) ---

  it('should aggregate short tasks from same project when sum exceeds threshold', () => {
    // 3 short sessions (each 4 min = 240s) for same project, below 5 min threshold
    // But total = 12 min = 720s
    const events: AWEvent[] = [
      makeEvent({
        timestamp: '2024-01-15T10:00:00Z',
        duration: 240,
        data: { app: 'Cursor', title: 'a.ts — myproject — Cursor' },
      }),
      // 2-hour gap -> new session
      makeEvent({
        timestamp: '2024-01-15T12:00:00Z',
        duration: 240,
        data: { app: 'Cursor', title: 'b.ts — myproject — Cursor' },
      }),
      // 2-hour gap -> new session
      makeEvent({
        timestamp: '2024-01-15T14:00:00Z',
        duration: 240,
        data: { app: 'Cursor', title: 'c.ts — myproject — Cursor' },
      }),
    ];

    // minActivityDurationSeconds=300 (5min) means each 4-min session is rejected
    // aggregationThresholdSeconds=600 (10min), sum=720s > 600s → aggregated
    const result = groupActivities(events, {
      minActivityDurationSeconds: 300,
      aggregateShortTasks: true,
      aggregationThresholdSeconds: 600,
    });

    expect(result.length).toBe(1);
    expect(result[0].title).toContain('mikro-taski');
    expect(result[0].totalSeconds).toBe(720);
  });

  it('should NOT aggregate short tasks when sum is below threshold', () => {
    const events: AWEvent[] = [
      makeEvent({
        timestamp: '2024-01-15T10:00:00Z',
        duration: 120, // 2 min
        data: { app: 'Cursor', title: 'a.ts — smallproj — Cursor' },
      }),
    ];

    // 120s < aggregationThresholdSeconds (900s default) — no aggregation
    const result = groupActivities(events, {
      minActivityDurationSeconds: 300, // 5 min → rejects 2 min activity
      aggregateShortTasks: true,
    });

    expect(result.length).toBe(0); // No aggregation, activity too short
  });

  it('should not aggregate when aggregateShortTasks is disabled', () => {
    const events: AWEvent[] = [
      makeEvent({
        timestamp: '2024-01-15T10:00:00Z',
        duration: 240,
        data: { app: 'Cursor', title: 'a.ts — proj — Cursor' },
      }),
      makeEvent({
        timestamp: '2024-01-15T12:00:00Z',
        duration: 240,
        data: { app: 'Cursor', title: 'b.ts — proj — Cursor' },
      }),
      makeEvent({
        timestamp: '2024-01-15T14:00:00Z',
        duration: 240,
        data: { app: 'Cursor', title: 'c.ts — proj — Cursor' },
      }),
    ];

    const result = groupActivities(events, {
      minActivityDurationSeconds: 300,
      aggregateShortTasks: false,
    });

    // All sessions are < 5 min and aggregation is off
    expect(result.length).toBe(0);
  });
});

// ========================================
// ASYNC FUNCTIONS (mock fetch)
// ========================================

describe('ActivityWatch API functions', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    clearBucketCache();
    mockFetch.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockBucketsResponse = {
    'aw-watcher-window_MacBook-Pro': { id: 'aw-watcher-window_MacBook-Pro' },
    'aw-watcher-web-chrome': { id: 'aw-watcher-web-chrome' },
    'aw-watcher-afk_MacBook-Pro': { id: 'aw-watcher-afk_MacBook-Pro' },
    'aw-watcher-vscode': { id: 'aw-watcher-vscode' },
    'aw-watcher-input_MacBook-Pro': { id: 'aw-watcher-input_MacBook-Pro' },
  };

  function setupBucketsMock() {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockBucketsResponse),
    });
  }

  function setupEventsMock(events: AWEvent[] = []) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(events),
    });
  }

  describe('getBuckets', () => {
    it('should fetch and categorize buckets', async () => {
      setupBucketsMock();
      const result = await getBuckets();

      expect(result.windowBuckets).toContain('aw-watcher-window_MacBook-Pro');
      expect(result.browserBuckets).toContain('aw-watcher-web-chrome');
      expect(result.afkBuckets).toContain('aw-watcher-afk_MacBook-Pro');
      expect(result.editorBuckets).toContain('aw-watcher-vscode');
      expect(result.inputBuckets).toContain('aw-watcher-input_MacBook-Pro');
      expect(result.allBuckets).toHaveLength(5);
    });

    it('should cache buckets within TTL', async () => {
      setupBucketsMock();
      await getBuckets();
      const result2 = await getBuckets();

      // Should only call fetch once (cached)
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result2.windowBuckets).toContain('aw-watcher-window_MacBook-Pro');
    });

    it('should return fallback on fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));
      const result = await getBuckets();

      expect(result.windowBuckets).toEqual(['aw-watcher-window_MacBook-Pro']);
      expect(result.browserBuckets).toEqual([]);
    });

    it('should return fallback on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      const result = await getBuckets();

      expect(result.windowBuckets).toEqual(['aw-watcher-window_MacBook-Pro']);
    });

    it('should clear cache with clearBucketCache', async () => {
      setupBucketsMock();
      await getBuckets();

      clearBucketCache();

      setupBucketsMock();
      await getBuckets();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should categorize other buckets correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          'aw-watcher-window_host': {},
          'custom-bucket': {},
        }),
      });

      const result = await getBuckets();
      expect(result.otherBuckets).toContain('custom-bucket');
      expect(result.windowBuckets).toContain('aw-watcher-window_host');
    });
  });

  describe('getWindowEvents', () => {
    it('should fetch events from all window buckets', async () => {
      // First call: getBuckets
      setupBucketsMock();
      // Second call: fetchBucketEvents for the window bucket
      const events: AWEvent[] = [
        { id: 1, timestamp: '2024-01-15T10:00:00Z', duration: 60, data: { app: 'Cursor', title: 'test' } },
      ];
      setupEventsMock(events);

      const result = await getWindowEvents('2024-01-15');
      expect(result).toHaveLength(1);
      expect(result[0].data.app).toBe('Cursor');
      expect(result[0]._sourceBucket).toBe('aw-watcher-window_MacBook-Pro');
    });

    it('should deduplicate events by timestamp+app+title', async () => {
      // Buckets with 2 window buckets
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          'aw-watcher-window_host1': {},
          'aw-watcher-window_host2': {},
        }),
      });
      const dupeEvent = { id: 1, timestamp: '2024-01-15T10:00:00Z', duration: 60, data: { app: 'Cursor', title: 'same' } };
      setupEventsMock([dupeEvent]);
      setupEventsMock([dupeEvent]);

      const result = await getWindowEvents('2024-01-15');
      expect(result).toHaveLength(1);
    });

    it('should return empty if no window buckets found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ 'aw-watcher-afk_host': {} }),
      });

      const result = await getWindowEvents('2024-01-15');
      expect(result).toHaveLength(0);
    });
  });

  describe('getChromeEvents', () => {
    it('should fetch events from all browser buckets', async () => {
      setupBucketsMock();
      const events: AWEvent[] = [
        { id: 1, timestamp: '2024-01-15T10:00:00Z', duration: 60, data: { title: 'GitHub', url: 'https://github.com' } },
      ];
      setupEventsMock(events);

      const result = await getChromeEvents('2024-01-15');
      expect(result).toHaveLength(1);
      expect(result[0]._sourceBucket).toBe('aw-watcher-web-chrome');
    });

    it('should return empty if no browser buckets', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ 'aw-watcher-window_host': {} }),
      });

      const result = await getChromeEvents('2024-01-15');
      expect(result).toHaveLength(0);
    });
  });

  describe('getEditorEvents', () => {
    it('should fetch events from editor buckets', async () => {
      setupBucketsMock();
      const events: AWEvent[] = [
        { id: 1, timestamp: '2024-01-15T10:00:00Z', duration: 60, data: { app: 'Cursor', title: 'file.ts' } },
      ];
      setupEventsMock(events);

      const result = await getEditorEvents('2024-01-15');
      expect(result).toHaveLength(1);
      expect(result[0]._sourceBucket).toBe('aw-watcher-vscode');
    });
  });

  describe('getAllEvents', () => {
    it('should combine events from all bucket types', async () => {
      // getAllEvents calls getWindowEvents, getChromeEvents, getEditorEvents in parallel.
      // Each calls getAvailableBuckets() which might race — 3 concurrent bucket fetches
      // are possible since the cache isn't set until the first one resolves.
      // Set up 3 bucket mocks + 3 event mocks to handle the race.
      setupBucketsMock();
      setupBucketsMock();
      setupBucketsMock();

      // Window events
      setupEventsMock([
        { id: 1, timestamp: '2024-01-15T10:00:00Z', duration: 60, data: { app: 'Cursor', title: 'window' } },
      ]);
      // Browser events
      setupEventsMock([
        { id: 2, timestamp: '2024-01-15T10:01:00Z', duration: 60, data: { title: 'page', url: 'https://example.com' } },
      ]);
      // Editor events
      setupEventsMock([
        { id: 3, timestamp: '2024-01-15T10:02:00Z', duration: 60, data: { app: 'Cursor', title: 'editor' } },
      ]);

      const result = await getAllEvents('2024-01-15');
      expect(result).toHaveLength(3);
    });
  });
});
