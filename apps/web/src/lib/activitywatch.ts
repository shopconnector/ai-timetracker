// ActivityWatch API Client - Cross-platform (macOS, Windows, Linux)

const AW_URL = process.env.ACTIVITYWATCH_URL || 'http://localhost:5600';

// ========================================
// DYNAMIC BUCKET DETECTION
// ========================================

interface BucketCache {
  windowBuckets: string[];    // WSZYSTKIE buckety okien
  browserBuckets: string[];   // WSZYSTKIE buckety przeglądarek
  editorBuckets: string[];    // WSZYSTKIE buckety edytorów (VSCode, Cursor, etc.)
  afkBuckets: string[];       // WSZYSTKIE buckety AFK
  inputBuckets: string[];     // WSZYSTKIE buckety input (keyboard/mouse)
  otherBuckets: string[];     // Inne buckety
  allBuckets: string[];       // WSZYSTKIE buckety razem
  timestamp: number;
}

let cachedBuckets: BucketCache | null = null;
const BUCKET_CACHE_TTL = 60000; // 1 minute cache

export interface AllBuckets {
  windowBuckets: string[];
  browserBuckets: string[];
  editorBuckets: string[];
  afkBuckets: string[];
  inputBuckets: string[];
  otherBuckets: string[];
  allBuckets: string[];
}

async function getAvailableBuckets(): Promise<AllBuckets> {
  // Return from cache if valid
  if (cachedBuckets && Date.now() - cachedBuckets.timestamp < BUCKET_CACHE_TTL) {
    return cachedBuckets;
  }

  try {
    const res = await fetch(`${AW_URL}/api/0/buckets/`, { redirect: 'follow' });
    if (!res.ok) throw new Error('Failed to fetch buckets');
    const buckets = await res.json();
    const allBucketIds = Object.keys(buckets);

    // WSZYSTKIE buckety okien (w tym synced)
    const windowBuckets = allBucketIds.filter(b =>
      b.startsWith('aw-watcher-window_')
    );

    // WSZYSTKIE buckety przeglądarek (Chrome, Firefox, Safari, Edge, Arc, Brave)
    const browserBuckets = allBucketIds.filter(b =>
      b.startsWith('aw-watcher-web-chrome') ||
      b.startsWith('aw-watcher-web-firefox') ||
      b.startsWith('aw-watcher-web-safari') ||
      b.startsWith('aw-watcher-web-edge') ||
      b.startsWith('aw-watcher-web-arc') ||
      b.startsWith('aw-watcher-web-brave') ||
      b.includes('web-browser')
    );

    // WSZYSTKIE buckety edytorów (VSCode, Cursor, Vim, etc.)
    const editorBuckets = allBucketIds.filter(b =>
      b.startsWith('aw-watcher-vscode') ||
      b.startsWith('aw-watcher-cursor') ||
      b.startsWith('aw-watcher-vim') ||
      b.startsWith('aw-watcher-neovim') ||
      b.startsWith('aw-watcher-sublime') ||
      b.startsWith('aw-watcher-jetbrains') ||
      b.startsWith('aw-watcher-idea') ||
      b.startsWith('aw-watcher-pycharm') ||
      b.startsWith('aw-watcher-webstorm')
    );

    // WSZYSTKIE buckety AFK
    const afkBuckets = allBucketIds.filter(b =>
      b.startsWith('aw-watcher-afk_')
    );

    // WSZYSTKIE buckety input (keyboard/mouse)
    const inputBuckets = allBucketIds.filter(b =>
      b.startsWith('aw-watcher-input_')
    );

    // Inne buckety (wszystko co nie pasuje do powyższych)
    const categorized = new Set([
      ...windowBuckets,
      ...browserBuckets,
      ...editorBuckets,
      ...afkBuckets,
      ...inputBuckets
    ]);
    const otherBuckets = allBucketIds.filter(b => !categorized.has(b));

    console.log(`[ActivityWatch] Found buckets:
      - Window: ${windowBuckets.length} (${windowBuckets.join(', ')})
      - Browser: ${browserBuckets.length} (${browserBuckets.join(', ')})
      - Editor: ${editorBuckets.length} (${editorBuckets.join(', ')})
      - AFK: ${afkBuckets.length}
      - Input: ${inputBuckets.length}
      - Other: ${otherBuckets.length} (${otherBuckets.join(', ')})
      - TOTAL: ${allBucketIds.length}
    `);

    cachedBuckets = {
      windowBuckets,
      browserBuckets,
      editorBuckets,
      afkBuckets,
      inputBuckets,
      otherBuckets,
      allBuckets: allBucketIds,
      timestamp: Date.now()
    };

    return cachedBuckets;
  } catch (error) {
    console.error('Error fetching buckets, using fallback:', error);
    // Fallback to common names
    return {
      windowBuckets: ['aw-watcher-window_MacBook-Pro'],
      browserBuckets: [],
      editorBuckets: [],
      afkBuckets: [],
      inputBuckets: [],
      otherBuckets: [],
      allBuckets: []
    };
  }
}

export async function getBuckets() {
  return getAvailableBuckets();
}

// Resetuj cache (do testowania)
export function clearBucketCache() {
  cachedBuckets = null;
}

export interface AWEvent {
  id: number;
  timestamp: string;
  duration: number;
  data: {
    app?: string;
    title?: string;
    url?: string;
    // Browser-specific fields
    audible?: boolean;
    incognito?: boolean;
    tabCount?: number;
  };
  // Internal: source bucket for proper app detection
  _sourceBucket?: string;
}

export type ActivityCategory = 'coding' | 'terminal' | 'meeting' | 'communication' | 'browser' | 'docs' | 'design' | 'other';

export interface GroupedActivity {
  id: string;
  title: string;
  app: string;
  totalSeconds: number;
  events: number;
  rawEvents?: AWEvent[];  // Surowe eventy do expandowalnej listy
  firstSeen: string;
  lastSeen: string;
  suggestedTicket?: string;
  confidence?: number;
  // Kategoria aktywności
  category?: ActivityCategory;
  // Prywatność
  isPrivate?: boolean;        // Czy to prywatna aktywność
  // Pola dla projektów (edytory kodu)
  project?: string;           // Nazwa projektu (folder)
  fileName?: string;          // Nazwa pliku (jeśli wykryto)
  isCodeEditor?: boolean;     // Czy to edytor kodu
  // Pola dla terminala
  isTerminal?: boolean;       // Czy to terminal
  shell?: string;             // bash, zsh, fish
  workingDir?: string;        // Katalog roboczy (PWD)
  gitBranch?: string;         // Branch git (jeśli wykryto)
  terminalCommand?: string;   // Komenda (jeśli wykryta)
  // Pola dla spotkań i komunikacji
  isMeeting?: boolean;        // Czy to spotkanie
  meetingPlatform?: string;   // Google Meet, Zoom, Teams
  meetingId?: string;         // ID spotkania (jeśli dostępne)
  isCommunication?: boolean;  // Czy to komunikator
  channel?: string;           // Kanał/rozmowa (Slack, Teams)
}

// Informacje wyciągnięte z tytułu terminala
export interface TerminalInfo {
  isTerminal: boolean;
  shell?: string;
  workingDir?: string;
  project?: string;       // Ostatni folder ze ścieżki
  gitBranch?: string;
  command?: string;
}

// ========================================
// CODE EDITORS - Cross-platform
// ========================================
const CODE_EDITORS = [
  // VS Code family
  'Cursor', 'Code', 'Visual Studio Code', 'VSCodium', 'VSCode',
  'code.exe', 'Code.exe', 'VSCodium.exe',

  // JetBrains family
  'WebStorm', 'IntelliJ IDEA', 'PyCharm', 'PhpStorm', 'GoLand',
  'Rider', 'CLion', 'DataGrip', 'RubyMine', 'AppCode', 'Android Studio',
  'webstorm64.exe', 'idea64.exe', 'pycharm64.exe', 'phpstorm64.exe',

  // Modern editors
  'Zed', 'Fleet', 'Nova', 'Lapce', 'Helix',

  // Classic editors
  'Sublime Text', 'Atom', 'Brackets', 'TextMate', 'BBEdit',
  'Notepad++', 'notepad++.exe', 'UltraEdit', 'EditPlus',

  // Full IDEs
  'Visual Studio', 'devenv', 'devenv.exe', // Visual Studio 2022
  'Xcode', 'Eclipse', 'NetBeans', 'CodeBlocks', 'codeblocks.exe',

  // Terminal-based (with GUI wrappers)
  'Neovim', 'nvim', 'vim', 'gvim', 'Emacs',

  // Remote development / Coder
  'Coder', 'code-server', 'OpenVSCode',

  // Online IDEs (in browser, will be detected by title)
  'Replit', 'CodeSandbox', 'StackBlitz', 'Gitpod'
];

// ========================================
// TERMINAL APPS - Cross-platform
// ========================================
const TERMINAL_APPS = [
  // macOS
  'Terminal', 'iTerm', 'iTerm2', 'Warp',

  // Cross-platform
  'Kitty', 'Alacritty', 'Hyper', 'WezTerm', 'Tabby', 'Terminus',

  // Windows
  'cmd', 'cmd.exe', 'Command Prompt',
  'powershell', 'powershell.exe', 'PowerShell',
  'pwsh', 'pwsh.exe',  // PowerShell Core
  'WindowsTerminal', 'Windows Terminal', 'wt.exe',
  'ConEmu', 'ConEmu64', 'ConEmu64.exe', 'cmder', 'Cmder',
  'mintty', 'mintty.exe', 'Git Bash', 'MINGW64', 'MINGW32',

  // Linux
  'gnome-terminal', 'konsole', 'xterm', 'urxvt', 'rxvt',
  'terminator', 'tilix', 'guake', 'yakuake', 'sakura',
  'xfce4-terminal', 'lxterminal', 'mate-terminal',

  // WSL
  'wsl', 'wsl.exe', 'ubuntu', 'debian', 'kali'
];

// ========================================
// SYSTEM APPS TO FILTER OUT - Cross-platform
// ========================================
const SYSTEM_APPS = [
  // macOS
  'loginwindow', 'Spotlight', 'Dock', 'SystemUIServer', 'Finder',
  'Control Center', 'Notification Center',

  // Windows
  'dwm.exe', 'svchost.exe', 'WinLogon', 'csrss.exe', 'explorer.exe',
  'ShellExperienceHost', 'StartMenuExperienceHost',
  'SearchApp', 'SearchUI', 'LockApp', 'ApplicationFrameHost',
  'TextInputHost', 'SystemSettings',

  // Linux
  'gnome-shell', 'kwin', 'plasmashell', 'nautilus', 'mutter'
];

function isSystemApp(app: string): boolean {
  const appLower = app.toLowerCase();
  return SYSTEM_APPS.some(s => appLower === s.toLowerCase() || appLower.includes(s.toLowerCase()));
}

// Aplikacje do spotkań
const MEETING_APPS = ['zoom.us', 'Zoom', 'Microsoft Teams', 'Teams', 'Webex', 'Webex Meetings'];

// Aplikacje do komunikacji
const COMMUNICATION_APPS = ['Slack', 'Discord', 'Microsoft Teams', 'Telegram', 'WhatsApp', 'Messages', 'Signal'];

// Informacje o spotkaniu wyciągnięte z tytułu
export interface MeetingInfo {
  isMeeting: boolean;
  platform?: string;
  meetingId?: string;
  meetingTitle?: string;
}

// Informacje o komunikacji
export interface CommunicationInfo {
  isCommunication: boolean;
  platform?: string;
  channel?: string;
  isDirectMessage?: boolean;
}

// Wykrywa spotkania (Google Meet, Zoom, Teams itp.)
export function extractMeetingInfo(title: string, app: string): MeetingInfo {
  const appLower = app.toLowerCase();
  const titleLower = title.toLowerCase();

  // Google Meet w przeglądarce
  // Pattern: "Meet - xxx-xxxx-xxx - Google Chrome" lub "Spotkanie | Google Meet - Google Chrome"
  if (titleLower.includes('meet') && (titleLower.includes('google') || title.match(/[a-z]{3}-[a-z]{4}-[a-z]{3}/))) {
    const meetIdMatch = title.match(/([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
    return {
      isMeeting: true,
      platform: 'Google Meet',
      meetingId: meetIdMatch?.[1],
      meetingTitle: title.replace(/ - Google Chrome.*$/, '').replace(/\|.*Google Meet.*$/, '').trim()
    };
  }

  // Zoom
  if (appLower.includes('zoom') || titleLower.includes('zoom meeting')) {
    const zoomIdMatch = title.match(/(\d{9,11})/);
    return {
      isMeeting: true,
      platform: 'Zoom',
      meetingId: zoomIdMatch?.[1],
      meetingTitle: title.replace(/Zoom Meeting/i, '').trim()
    };
  }

  // Microsoft Teams
  if (appLower.includes('teams') && (titleLower.includes('meeting') || titleLower.includes('call'))) {
    return {
      isMeeting: true,
      platform: 'Microsoft Teams',
      meetingTitle: title.replace(/ \| Microsoft Teams.*$/, '').trim()
    };
  }

  // Webex
  if (appLower.includes('webex') || titleLower.includes('webex')) {
    return {
      isMeeting: true,
      platform: 'Webex',
      meetingTitle: title
    };
  }

  // Jira/Confluence call (Atlassian)
  if (titleLower.includes('huddle') || titleLower.includes('standup call')) {
    return {
      isMeeting: true,
      platform: 'Atlassian',
      meetingTitle: title
    };
  }

  // Check for meeting apps directly
  if (MEETING_APPS.some(m => appLower.includes(m.toLowerCase()))) {
    return {
      isMeeting: true,
      platform: app,
      meetingTitle: title
    };
  }

  return { isMeeting: false };
}

// Wykrywa komunikatory (Slack, Discord, Teams chat itp.)
export function extractCommunicationInfo(title: string, app: string): CommunicationInfo {
  const appLower = app.toLowerCase();
  const titleLower = title.toLowerCase();

  // Slack
  if (appLower.includes('slack')) {
    // Pattern: "channel-name - Team Name - Slack" lub "Person Name - Slack"
    const slackMatch = title.match(/^(.+?)\s*(?:-\s*.+?)?\s*-\s*Slack$/i);
    const channel = slackMatch?.[1]?.trim();
    const isDM = channel ? (!channel.startsWith('#') && !channel.includes('-')) : false;

    return {
      isCommunication: true,
      platform: 'Slack',
      channel: channel,
      isDirectMessage: isDM
    };
  }

  // Slack w przeglądarce
  if (titleLower.includes('slack') && (appLower.includes('chrome') || appLower.includes('firefox') || appLower.includes('safari'))) {
    const slackMatch = title.match(/^(.+?)\s*\|\s*(.+?)\s*\|\s*Slack/i);
    return {
      isCommunication: true,
      platform: 'Slack (web)',
      channel: slackMatch?.[1]?.trim()
    };
  }

  // Discord
  if (appLower.includes('discord')) {
    // Pattern: "#channel - Server - Discord" lub "@User - Discord"
    const discordMatch = title.match(/^([@#]?.+?)\s*(?:-\s*.+?)?\s*-\s*Discord$/i);
    return {
      isCommunication: true,
      platform: 'Discord',
      channel: discordMatch?.[1]?.trim(),
      isDirectMessage: title.startsWith('@')
    };
  }

  // Microsoft Teams (chat, nie meeting)
  if (appLower.includes('teams') && !titleLower.includes('meeting') && !titleLower.includes('call')) {
    return {
      isCommunication: true,
      platform: 'Microsoft Teams',
      channel: title.replace(/ \| Microsoft Teams.*$/, '').trim()
    };
  }

  // Telegram
  if (appLower.includes('telegram')) {
    return {
      isCommunication: true,
      platform: 'Telegram',
      channel: title
    };
  }

  // WhatsApp
  if (appLower.includes('whatsapp')) {
    return {
      isCommunication: true,
      platform: 'WhatsApp',
      channel: title
    };
  }

  // Signal
  if (appLower.includes('signal')) {
    return {
      isCommunication: true,
      platform: 'Signal',
      channel: title
    };
  }

  // Check for communication apps directly
  if (COMMUNICATION_APPS.some(c => appLower.includes(c.toLowerCase()))) {
    return {
      isCommunication: true,
      platform: app,
      channel: title
    };
  }

  return { isCommunication: false };
}

// Określa kategorię aktywności
export function categorizeActivity(
  app: string,
  isCodeEditor?: boolean,
  isTerminal?: boolean,
  isMeeting?: boolean,
  isCommunication?: boolean
): ActivityCategory {
  if (isCodeEditor) return 'coding';
  if (isTerminal) return 'terminal';
  if (isMeeting) return 'meeting';
  if (isCommunication) return 'communication';

  const appLower = app.toLowerCase();
  if (appLower.includes('chrome') || appLower.includes('firefox') || appLower.includes('safari') || appLower.includes('edge')) {
    return 'browser';
  }
  if (appLower.includes('figma') || appLower.includes('sketch') || appLower.includes('photoshop') || appLower.includes('illustrator')) {
    return 'design';
  }
  if (appLower.includes('notion') || appLower.includes('obsidian') || appLower.includes('word') || appLower.includes('pages') || appLower.includes('docs')) {
    return 'docs';
  }

  return 'other';
}

// Wyciąga informacje z tytułu okna terminala (cross-platform)
export function extractTerminalInfo(title: string, app: string): TerminalInfo {
  const appLower = app.toLowerCase();
  const isTerminal = TERMINAL_APPS.some(t => appLower.includes(t.toLowerCase()));

  if (!isTerminal) {
    return { isTerminal: false };
  }

  const result: TerminalInfo = { isTerminal: true };

  // Pattern 0: macOS Terminal.app with Claude Code / complex format
  // "gaca — ★ Timesheet Task Mapping — claude ◂ claude-code TERM_PROGRAM=Apple_Terminal SHELL=/bin/bash — 121×43"
  // "gaca — ★ Project Name — git ◂ context — 80×24"
  const macTerminalPattern = /^[\w.-]+\s*—\s*[★✳]?\s*(.+?)\s*—\s*(\w+)\s*[◂▸]?\s*.+?(?:\s*—\s*\d+[x×]\d+)?$/;
  const macTerminalMatch = title.match(macTerminalPattern);

  if (macTerminalMatch) {
    result.project = macTerminalMatch[1].trim();
    result.command = macTerminalMatch[2].trim();
    // Try to extract shell from SHELL= in title
    const shellMatch = title.match(/SHELL=\/bin\/(\w+)/);
    if (shellMatch) {
      result.shell = shellMatch[1];
    }
    return result;
  }

  // Pattern 1: "bash — /Users/gaca/projects/myapp — 120x40"
  // Pattern 2: "zsh — ~/projects/timetracker — 80x24"
  // Pattern 3 (Windows): "powershell — C:\Users\dev\project — 120x40"
  const dashPattern = /^(\w+)\s*—\s*([^—]+?)(?:\s*—\s*\d+[x×]\d+)?$/;
  const dashMatch = title.match(dashPattern);

  if (dashMatch) {
    result.shell = dashMatch[1].toLowerCase();
    result.workingDir = dashMatch[2].trim();
    result.project = extractProjectFromPath(result.workingDir);
    return result;
  }

  // Pattern 4: "zsh:~/projects/timetracker (main)"
  // Pattern 5: "bash:~/dev/app"
  // Pattern 6 (Windows): "powershell:C:\dev\project"
  const colonPattern = /^(\w+):([^\s(]+)(?:\s*\(([^)]+)\))?$/;
  const colonMatch = title.match(colonPattern);

  if (colonMatch) {
    result.shell = colonMatch[1].toLowerCase();
    result.workingDir = colonMatch[2].trim();
    result.project = extractProjectFromPath(result.workingDir);
    if (colonMatch[3]) {
      result.gitBranch = colonMatch[3].trim();
    }
    return result;
  }

  // Pattern 7: "user@hostname:~/path" (SSH)
  const sshPattern = /^[\w@.-]+:([^\s]+)$/;
  const sshMatch = title.match(sshPattern);

  if (sshMatch) {
    result.workingDir = sshMatch[1].trim();
    result.project = extractProjectFromPath(result.workingDir);
    return result;
  }

  // Pattern 8: Windows PowerShell specific
  // "Administrator: Windows PowerShell" or "Windows PowerShell"
  const windowsPsPattern = /^(?:Administrator:\s*)?(Windows PowerShell|PowerShell)/i;
  if (windowsPsPattern.test(title)) {
    result.shell = 'powershell';
    return result;
  }

  // Pattern 9: Windows cmd path in title
  // "C:\Windows\system32\cmd.exe" or "Administrator: C:\..."
  const windowsCmdPattern = /(?:Administrator:\s*)?([A-Za-z]:[\/\\][^\s]+)/;
  const cmdPathMatch = title.match(windowsCmdPattern);
  if (cmdPathMatch) {
    result.workingDir = cmdPathMatch[1];
    result.project = extractProjectFromPath(result.workingDir);
    if (appLower.includes('powershell')) {
      result.shell = 'powershell';
    } else if (appLower.includes('cmd')) {
      result.shell = 'cmd';
    }
    return result;
  }

  // Pattern 10: Command in title (cross-platform)
  const commandPattern = /^(npm|node|yarn|pnpm|python|pip|git|docker|make|cargo|go|dotnet|mvn|gradle)\s+(.+)$/i;
  const cmdMatch = title.match(commandPattern);

  if (cmdMatch) {
    result.command = `${cmdMatch[1]} ${cmdMatch[2]}`;
    return result;
  }

  // Pattern 11: Warp/iTerm with git branch - "~/projects/app main" or "C:\dev\app main"
  const warpPattern = /^([~\/\\][^\s]+|[A-Za-z]:[\/\\][^\s]+)\s+(\w+[-\w]*)$/;
  const warpMatch = title.match(warpPattern);

  if (warpMatch) {
    result.workingDir = warpMatch[1].trim();
    result.project = extractProjectFromPath(result.workingDir);
    result.gitBranch = warpMatch[2].trim();
    return result;
  }

  // Fallback - try to extract path from middle of title (cross-platform)
  const pathMatch = title.match(CROSS_PLATFORM_PATH_REGEX);
  if (pathMatch) {
    result.workingDir = pathMatch[0].trim();
    result.project = extractProjectFromPath(result.workingDir);
  }

  return result;
}

// ========================================
// CROSS-PLATFORM PATH UTILITIES
// ========================================

// Split path on both / and \ (Windows + Unix)
function splitPath(path: string): string[] {
  return path.split(/[\/\\]+/).filter(Boolean);
}

// Extract project name from path (cross-platform)
function extractProjectFromPath(path: string): string | undefined {
  if (!path) return undefined;

  // Handle Windows drive letters (C:\, D:\) and trailing slashes
  const cleaned = path
    .replace(/^[A-Za-z]:/, '')  // Remove drive letter
    .replace(/[\/\\]+$/, '');    // Remove trailing slashes

  const parts = splitPath(cleaned);

  // Take last non-empty segment (skip ~ on Unix)
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i] && parts[i] !== '~') {
      return parts[i];
    }
  }

  return undefined;
}

// Cross-platform path regex patterns
const CROSS_PLATFORM_PATH_REGEX = /([~\/\\]|[A-Za-z]:[\/\\])[^\s—:]+/;

// Wyciąga informacje o projekcie z tytułu okna edytora (cross-platform)
export function extractProjectInfo(title: string, app: string): { project?: string; fileName?: string; isCodeEditor: boolean } {
  const isCodeEditor = CODE_EDITORS.some(editor =>
    app.toLowerCase().includes(editor.toLowerCase())
  );

  if (!isCodeEditor) {
    return { isCodeEditor: false };
  }

  // Editor name patterns (all supported editors)
  const editorPattern = /(?:Cursor|Code|Visual Studio Code|VSCodium|VSCode|WebStorm|IntelliJ IDEA|PyCharm|PhpStorm|GoLand|Rider|CLion|DataGrip|RubyMine|Android Studio|Sublime Text|Atom|Zed|Fleet|Nova|Notepad\+\+|Visual Studio|Xcode|Eclipse|NetBeans)$/i;

  // Format VS Code/Cursor: "filename.ext — projectname — Editor"
  // Also: "filename.ext — folder/subfolder — Editor"
  // Also: "● filename.ext — projectname — Editor" (modified)
  const match = title.match(/^●?\s*(.+?)\s+—\s+([^—]+)\s+—\s+/);
  if (match && editorPattern.test(title)) {
    const fileName = match[1].trim();
    const projectPath = match[2].trim();
    // Take last segment (cross-platform)
    const project = splitPath(projectPath).pop() || projectPath;

    return {
      fileName,
      project,
      isCodeEditor: true
    };
  }

  // JetBrains format: "ProjectName – filename.ext"
  const jetbrainsMatch = title.match(/^(.+?)\s+[–-]\s+(.+?)(?:\s+[–-]\s+.+)?$/);
  if (jetbrainsMatch && app.match(/WebStorm|IntelliJ|PyCharm|PhpStorm|GoLand|Rider|CLion|DataGrip|RubyMine|Android Studio/i)) {
    return {
      project: jetbrainsMatch[1].trim(),
      fileName: jetbrainsMatch[2].trim(),
      isCodeEditor: true
    };
  }

  // Visual Studio format: "ProjectName - Microsoft Visual Studio"
  const vsMatch = title.match(/^(.+?)\s+-\s+Microsoft Visual Studio$/i);
  if (vsMatch) {
    return {
      project: vsMatch[1].trim(),
      isCodeEditor: true
    };
  }

  // Sublime Text format: "filename.ext • ProjectName - Sublime Text"
  const sublimeMatch = title.match(/^(.+?)\s+[•·]\s+(.+?)\s+-\s+Sublime Text$/i);
  if (sublimeMatch) {
    return {
      fileName: sublimeMatch[1].trim(),
      project: sublimeMatch[2].trim(),
      isCodeEditor: true
    };
  }

  // Zed format: "filename.ext — ProjectName — Zed"
  const zedMatch = title.match(/^(.+?)\s+—\s+(.+?)\s+—\s+Zed$/i);
  if (zedMatch) {
    return {
      fileName: zedMatch[1].trim(),
      project: zedMatch[2].trim(),
      isCodeEditor: true
    };
  }

  // Simple format: "projectname — Editor" (no file)
  const simpleMatch = title.match(/^([^—–-]+)\s+[—–-]\s+/);
  if (simpleMatch && editorPattern.test(title)) {
    return {
      project: simpleMatch[1].trim(),
      isCodeEditor: true
    };
  }

  // Format with [Extension]: "[Extension: Name] file — project — Editor"
  const extMatch = title.match(/^\[.+?\]\s*(.+?)\s+—\s+([^—]+)\s+—\s+/);
  if (extMatch && editorPattern.test(title)) {
    return {
      fileName: extMatch[1].trim(),
      project: splitPath(extMatch[2].trim()).pop() || extMatch[2].trim(),
      isCodeEditor: true
    };
  }

  return { isCodeEditor: true };
}

// Fetch events from ActivityWatch bucket
async function fetchBucketEvents(bucket: string, start: string, end: string): Promise<AWEvent[]> {
  // Note: /events does NOT need trailing slash, but /buckets/ does
  const url = `${AW_URL}/api/0/buckets/${bucket}/events?start=${start}&end=${end}&limit=20000`;
  try {
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) return [];
    const events: AWEvent[] = await response.json();
    // Mark events with source bucket for proper app detection
    return events.map(e => ({ ...e, _sourceBucket: bucket }));
  } catch (error) {
    console.error(`Error fetching ${bucket}:`, error);
    return [];
  }
}

// Get window events for a date (from ALL window buckets)
export async function getWindowEvents(date: string): Promise<AWEvent[]> {
  // Convert to ISO format with timezone for proper ActivityWatch query
  const startDate = new Date(`${date}T00:00:00`);
  const endDate = new Date(`${date}T23:59:59`);
  const start = startDate.toISOString();
  const end = endDate.toISOString();

  const { windowBuckets } = await getAvailableBuckets();
  if (windowBuckets.length === 0) {
    console.warn('No window buckets found');
    return [];
  }

  // Fetch from ALL window buckets in parallel
  const allEvents: AWEvent[] = [];
  const results = await Promise.all(
    windowBuckets.map(bucket => fetchBucketEvents(bucket, start, end))
  );

  for (const events of results) {
    allEvents.push(...events);
  }

  // Deduplicate by timestamp+app (in case same event in multiple buckets)
  const seen = new Set<string>();
  const unique: AWEvent[] = [];
  for (const e of allEvents) {
    const key = `${e.timestamp}:${e.data.app}:${e.data.title}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(e);
    }
  }

  return unique;
}

// Get browser events for a date (from ALL browser buckets)
export async function getChromeEvents(date: string): Promise<AWEvent[]> {
  // Convert to ISO format with timezone for proper ActivityWatch query
  const startDate = new Date(`${date}T00:00:00`);
  const endDate = new Date(`${date}T23:59:59`);
  const start = startDate.toISOString();
  const end = endDate.toISOString();

  const { browserBuckets } = await getAvailableBuckets();
  if (browserBuckets.length === 0) {
    return [];
  }

  // Fetch from ALL browser buckets in parallel
  const results = await Promise.all(
    browserBuckets.map(bucket => fetchBucketEvents(bucket, start, end))
  );

  const allEvents: AWEvent[] = [];
  for (const events of results) {
    allEvents.push(...events);
  }

  // Deduplicate by timestamp+url (in case same event in multiple buckets)
  const seen = new Set<string>();
  const unique: AWEvent[] = [];
  for (const e of allEvents) {
    const key = `${e.timestamp}:${e.data.url}:${e.data.title}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(e);
    }
  }

  return unique;
}

// Get editor events for a date (from ALL editor buckets like VSCode, Cursor)
export async function getEditorEvents(date: string): Promise<AWEvent[]> {
  const startDate = new Date(`${date}T00:00:00`);
  const endDate = new Date(`${date}T23:59:59`);
  const start = startDate.toISOString();
  const end = endDate.toISOString();

  const { editorBuckets } = await getAvailableBuckets();
  if (editorBuckets.length === 0) {
    return [];
  }

  // Fetch from ALL editor buckets in parallel
  const results = await Promise.all(
    editorBuckets.map(bucket => fetchBucketEvents(bucket, start, end))
  );

  const allEvents: AWEvent[] = [];
  for (const events of results) {
    allEvents.push(...events);
  }

  // Deduplicate
  const seen = new Set<string>();
  const unique: AWEvent[] = [];
  for (const e of allEvents) {
    const key = `${e.timestamp}:${e.data.app}:${e.data.title}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(e);
    }
  }

  return unique;
}

// Normalize title for grouping (bez usuwania ścieżek terminala)
function normalizeTitle(title: string, isTerminal: boolean = false): string {
  // Dla terminali nie usuwaj ścieżek - będą parsowane osobno
  if (isTerminal) {
    return title.trim();
  }

  // Remove common suffixes and clean up
  return title
    .replace(/ - Google Chrome.*$/, '')
    .replace(/ - Comet.*$/, '')
    .replace(/ - High memory usage.*$/, '')
    .replace(/ - Microphone recording.*$/, '')
    .trim();
}

// Generate unique ID for activity
function generateActivityId(title: string, app: string, sessionIndex?: number): string {
  const normalized = normalizeTitle(title);
  const sessionSuffix = sessionIndex !== undefined ? `:s${sessionIndex}` : '';
  const hash = Buffer.from(`${app}:${normalized}${sessionSuffix}`).toString('base64').slice(0, 16);
  return hash;
}

// Constants for session-based grouping
const SESSION_GAP_MINUTES = 30; // Gap > 30 min = new session
const MAX_SESSION_SPAN_HOURS = 4; // Max 4h span for single activity

// Private activity detection
const PRIVATE_APPS = ['Telegram', 'WhatsApp', 'Signal', 'Messages', 'FaceTime', 'iMessage'];
const PRIVATE_KEYWORDS = ['personal', 'private', 'prywatne', 'gmail.com', 'facebook', 'twitter', 'instagram'];

function isPrivateActivity(
  app: string,
  title: string,
  category?: ActivityCategory,
  project?: string
): boolean {
  const appLower = app.toLowerCase();
  const titleLower = title.toLowerCase();

  // 1. Known private apps
  if (PRIVATE_APPS.some(a => appLower.includes(a.toLowerCase()))) return true;

  // 2. Category "other" without project
  if (category === 'other' && !project) return true;

  // 3. Title contains private keywords
  if (PRIVATE_KEYWORDS.some(k => titleLower.includes(k))) return true;

  return false;
}

// Split events into sessions based on time gaps
function splitIntoSessions(events: AWEvent[]): AWEvent[][] {
  if (events.length === 0) return [];

  // Sort by timestamp
  const sorted = [...events].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const sessions: AWEvent[][] = [];
  let currentSession: AWEvent[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prevEvent = sorted[i - 1];
    const currEvent = sorted[i];

    const prevEnd = new Date(prevEvent.timestamp).getTime() + prevEvent.duration * 1000;
    const currStart = new Date(currEvent.timestamp).getTime();
    const gapMinutes = (currStart - prevEnd) / 60000;

    if (gapMinutes > SESSION_GAP_MINUTES) {
      // Start new session
      sessions.push(currentSession);
      currentSession = [currEvent];
    } else {
      currentSession.push(currEvent);
    }
  }

  // Don't forget last session
  if (currentSession.length > 0) {
    sessions.push(currentSession);
  }

  return sessions;
}

// Check if a session span is too long and needs splitting
function getSessionSpanHours(events: AWEvent[]): number {
  if (events.length === 0) return 0;

  const timestamps = events.map(e => new Date(e.timestamp).getTime());
  const lastEnds = events.map(e => new Date(e.timestamp).getTime() + e.duration * 1000);

  const firstStart = Math.min(...timestamps);
  const lastEnd = Math.max(...lastEnds);

  return (lastEnd - firstStart) / (1000 * 60 * 60);
}

// Group similar activities together
export function groupActivities(events: AWEvent[]): GroupedActivity[] {
  // Filter out system apps and very short events (cross-platform)
  const filtered = events.filter(e => {
    const app = e.data.app || '';
    return !isSystemApp(app) && e.duration > 10;
  });

  // Group by normalized title + app (lub projekt dla edytorów kodu/terminali)
  const groups = new Map<string, {
    title: string;
    app: string;
    totalSeconds: number;
    events: AWEvent[];
    category?: ActivityCategory;
    project?: string;
    fileName?: string;
    isCodeEditor?: boolean;
    // Terminal fields
    isTerminal?: boolean;
    shell?: string;
    workingDir?: string;
    gitBranch?: string;
    terminalCommand?: string;
    // Meeting fields
    isMeeting?: boolean;
    meetingPlatform?: string;
    meetingId?: string;
    // Communication fields
    isCommunication?: boolean;
    channel?: string;
  }>();

  for (const event of filtered) {
    const title = event.data.title || 'Unknown';

    // Detect app name - handle browser events specially
    let app: string;
    if (event.data.app) {
      app = event.data.app;
    } else if (event.data.url || event._sourceBucket?.includes('web-chrome') || event._sourceBucket?.includes('web-firefox')) {
      // Browser event - derive app name from bucket
      if (event._sourceBucket?.includes('firefox')) {
        app = 'Firefox';
      } else if (event._sourceBucket?.includes('chrome')) {
        app = 'Chrome';
      } else if (event._sourceBucket?.includes('safari')) {
        app = 'Safari';
      } else if (event._sourceBucket?.includes('edge')) {
        app = 'Edge';
      } else {
        app = 'Browser';
      }
    } else {
      app = 'Unknown';
    }

    // Sprawdź czy to terminal
    const terminalInfo = extractTerminalInfo(title, app);

    // Sprawdź czy to edytor kodu
    const projectInfo = extractProjectInfo(title, app);

    // Sprawdź czy to spotkanie
    const meetingInfo = extractMeetingInfo(title, app);

    // Sprawdź czy to komunikator
    const commInfo = extractCommunicationInfo(title, app);

    let key: string;
    let groupTitle: string;

    if (meetingInfo.isMeeting) {
      // Dla spotkań - grupuj po platformie i ID (jeśli jest)
      key = `meeting:${meetingInfo.platform}:${meetingInfo.meetingId || 'call'}`;
      groupTitle = meetingInfo.meetingTitle || `${meetingInfo.platform} Meeting`;
    } else if (commInfo.isCommunication) {
      // Dla komunikatorów - grupuj po platformie I kanale
      const channel = commInfo.channel || 'general';
      key = `comm:${commInfo.platform}:${channel}`;
      groupTitle = commInfo.channel ? `${commInfo.platform} #${channel}` : commInfo.platform || app;
    } else if (terminalInfo.isTerminal && terminalInfo.project) {
      // Dla terminali grupuj po projekcie (katalogu roboczym)
      key = `${app}:terminal:${terminalInfo.project}`;
      groupTitle = terminalInfo.project;
    } else if (projectInfo.isCodeEditor && projectInfo.project) {
      // Dla edytorów kodu grupuj po projekcie
      key = `${app}:project:${projectInfo.project}`;
      groupTitle = projectInfo.project;
    } else {
      // Dla innych aplikacji - standardowe grupowanie po tytule
      const normalized = normalizeTitle(title, terminalInfo.isTerminal);
      key = `${app}:${normalized}`;
      groupTitle = normalized;
    }

    const category = categorizeActivity(app, projectInfo.isCodeEditor, terminalInfo.isTerminal, meetingInfo.isMeeting, commInfo.isCommunication);

    if (!groups.has(key)) {
      groups.set(key, {
        title: groupTitle,
        app,
        totalSeconds: 0,
        events: [],
        category,
        project: terminalInfo.project || projectInfo.project,
        fileName: projectInfo.fileName,
        isCodeEditor: projectInfo.isCodeEditor,
        isTerminal: terminalInfo.isTerminal,
        shell: terminalInfo.shell,
        workingDir: terminalInfo.workingDir,
        gitBranch: terminalInfo.gitBranch,
        terminalCommand: terminalInfo.command,
        isMeeting: meetingInfo.isMeeting,
        meetingPlatform: meetingInfo.platform,
        meetingId: meetingInfo.meetingId,
        isCommunication: commInfo.isCommunication,
        channel: commInfo.channel
      });
    }

    const group = groups.get(key)!;
    group.totalSeconds += event.duration;
    group.events.push(event);

    // Aktualizuj fileName na ostatni używany plik
    if (projectInfo.fileName) {
      group.fileName = projectInfo.fileName;
    }

    // Aktualizuj terminal info jeśli nowsze dane są lepsze
    if (terminalInfo.isTerminal) {
      if (terminalInfo.gitBranch && !group.gitBranch) {
        group.gitBranch = terminalInfo.gitBranch;
      }
      if (terminalInfo.command && !group.terminalCommand) {
        group.terminalCommand = terminalInfo.command;
      }
      if (terminalInfo.workingDir && !group.workingDir) {
        group.workingDir = terminalInfo.workingDir;
      }
    }

    // Aktualizuj channel dla komunikatorów
    if (commInfo.isCommunication && commInfo.channel && !group.channel) {
      group.channel = commInfo.channel;
    }
  }

  // Convert to array, split by sessions, and sort by time
  const activities: GroupedActivity[] = [];

  for (const [, group] of groups) {
    if (group.totalSeconds < 10) continue; // Skip < 10 seconds

    // Split group events into sessions (gaps > 30 min = new session)
    const sessions = splitIntoSessions(group.events);

    for (let sessionIdx = 0; sessionIdx < sessions.length; sessionIdx++) {
      const sessionEvents = sessions[sessionIdx];
      const sessionTotalSeconds = sessionEvents.reduce((sum, e) => sum + e.duration, 0);

      if (sessionTotalSeconds < 10) continue; // Skip very short sessions

      const timestamps = sessionEvents.map(e => e.timestamp);
      const firstSeen = timestamps.reduce((a, b) => a < b ? a : b);
      const lastSeen = timestamps.reduce((a, b) => a > b ? a : b);

      // Tytuł zależny od typu aktywności
      let displayTitle: string;
      if (group.isMeeting) {
        // Spotkanie: pokaż platformę i tytuł
        displayTitle = group.meetingId
          ? `📹 ${group.meetingPlatform}: ${group.title}`
          : `📹 ${group.title}`;
      } else if (group.isCommunication) {
        // Komunikator: pokaż platformę i kanał
        displayTitle = group.channel
          ? `💬 ${group.meetingPlatform || group.app}: ${group.channel}`
          : `💬 ${group.meetingPlatform || group.app}`;
      } else if (group.isTerminal && group.project) {
        // Terminal: pokaż projekt + branch
        displayTitle = group.gitBranch
          ? `[${group.project}] (${group.gitBranch})`
          : `[${group.project}]`;
        if (group.terminalCommand) {
          displayTitle += ` ${group.terminalCommand}`;
        }
      } else if (group.isCodeEditor && group.project) {
        displayTitle = `[${group.project}]${group.fileName ? ` ${group.fileName}` : ''}`;
      } else {
        displayTitle = group.title;
      }

      // Check if this is a private activity
      const isPrivate = isPrivateActivity(
        group.app,
        group.title,
        group.category,
        group.project
      );

      activities.push({
        id: generateActivityId(group.title, group.app, sessions.length > 1 ? sessionIdx : undefined),
        title: displayTitle,
        app: group.app,
        totalSeconds: Math.round(sessionTotalSeconds),
        events: sessionEvents.length,
        rawEvents: sessionEvents,  // Surowe eventy dla expand/collapse
        firstSeen,
        lastSeen,
        category: group.category,
        isPrivate,
        project: group.project,
        fileName: group.fileName,
        isCodeEditor: group.isCodeEditor,
        isTerminal: group.isTerminal,
        shell: group.shell,
        workingDir: group.workingDir,
        gitBranch: group.gitBranch,
        terminalCommand: group.terminalCommand,
        isMeeting: group.isMeeting,
        meetingPlatform: group.meetingPlatform,
        meetingId: group.meetingId,
        isCommunication: group.isCommunication,
        channel: group.channel
      });
    }
  }

  // Sort by total time descending
  return activities.sort((a, b) => b.totalSeconds - a.totalSeconds);
}

// Get all activities for a date (window + browser + editor combined from ALL buckets)
export async function getActivitiesForDate(date: string): Promise<GroupedActivity[]> {
  // Fetch ALL event types in parallel
  const [windowEvents, browserEvents, editorEvents] = await Promise.all([
    getWindowEvents(date),
    getChromeEvents(date),
    getEditorEvents(date)
  ]);

  // Combine all events
  const allEvents = [...windowEvents, ...browserEvents, ...editorEvents];

  console.log(`[ActivityWatch] Date ${date}: ${windowEvents.length} window, ${browserEvents.length} browser, ${editorEvents.length} editor events = ${allEvents.length} total`);

  return groupActivities(allEvents);
}

// Format seconds to human readable
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// Get summary stats for a date
export async function getDaySummary(date: string) {
  const activities = await getActivitiesForDate(date);
  const totalSeconds = activities.reduce((sum, a) => sum + a.totalSeconds, 0);

  // Group by app
  const byApp = new Map<string, number>();
  for (const activity of activities) {
    byApp.set(activity.app, (byApp.get(activity.app) || 0) + activity.totalSeconds);
  }

  return {
    date,
    totalSeconds,
    totalFormatted: formatDuration(totalSeconds),
    activitiesCount: activities.length,
    topApps: Array.from(byApp.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([app, seconds]) => ({ app, seconds, formatted: formatDuration(seconds) }))
  };
}
