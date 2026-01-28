// ============================================================================
// API Types - Request/Response interfaces
// ============================================================================

// Sync API
export interface SyncActivitiesRequest {
  agentId: string;
  activities: LocalActivity[];
}

export interface SyncActivitiesResponse {
  success: boolean;
  synced: number;
  errors?: string[];
}

// Local activity from agent
export interface LocalActivity {
  localId: string;
  title: string;
  app: string;
  project?: string;
  fileName?: string;
  duration: number;
  startTime: string; // ISO date
  endTime: string;   // ISO date
}

// Worklog
export interface CreateWorklogRequest {
  taskKey: string;
  duration: number;
  date: string;      // YYYY-MM-DD
  startTime?: string; // HH:MM:SS
  description?: string;
  activityIds?: string[];
}

export interface WorklogResponse {
  id: string;
  taskKey: string;
  taskName: string;
  duration: number;
  date: string;
  tempoId?: string;
}

// ============================================================================
// AI Types
// ============================================================================

export interface SuggestRequest {
  activities: Array<{
    id: string;
    title: string;
    app: string;
    project?: string;
    duration: number;
  }>;
  availableTickets: Array<{
    key: string;
    name: string;
    project?: string;
  }>;
  context?: {
    recentTasks?: Array<{ key: string; name: string; useCount: number }>;
    projectMappings?: Array<{ project: string; taskKey: string; confidence: number }>;
  };
}

export interface SuggestResponse {
  suggestions: Record<string, {
    ticket: string;
    confidence: number;
    reason: string;
    source: 'llm' | 'project_mapping' | 'history' | 'keyword';
  }>;
}

// ============================================================================
// Dashboard Types
// ============================================================================

export interface DailySummary {
  date: string;
  totalSeconds: number;
  totalFormatted: string;
  activitiesCount: number;
  loggedSeconds: number;
  unloggedSeconds: number;
  topApps: Array<{
    app: string;
    seconds: number;
    formatted: string;
  }>;
  topProjects: Array<{
    project: string;
    seconds: number;
    formatted: string;
  }>;
}

export interface TeamMemberSummary {
  userId: string;
  name: string;
  email: string;
  totalSeconds: number;
  loggedSeconds: number;
  activitiesCount: number;
  lastSyncAt?: string;
  platform?: string;
}

// ============================================================================
// Utility Types
// ============================================================================

export type Role = 'USER' | 'ADMIN' | 'MANAGER';

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ============================================================================
// Constants
// ============================================================================

export const CODE_EDITORS = [
  'Cursor',
  'Code',
  'Visual Studio Code',
  'VSCodium',
  'WebStorm',
  'IntelliJ IDEA',
  'PyCharm',
  'PhpStorm',
  'Rider',
  'CLion',
  'GoLand',
  'RubyMine',
  'Android Studio',
  'Xcode',
  'Sublime Text',
  'Atom',
  'Vim',
  'Neovim',
  'Emacs',
] as const;

export const PRODUCTIVE_APPS = [
  ...CODE_EDITORS,
  'Terminal',
  'iTerm',
  'Warp',
  'Alacritty',
  'Figma',
  'Sketch',
  'Adobe XD',
  'Postman',
  'Insomnia',
  'TablePlus',
  'DBeaver',
  'DataGrip',
  'Docker',
  'Notion',
  'Obsidian',
] as const;

export const COMMUNICATION_APPS = [
  'Slack',
  'Microsoft Teams',
  'Discord',
  'Zoom',
  'Google Meet',
  'Skype',
  'WhatsApp',
  'Telegram',
  'Messages',
] as const;

export const BROWSER_APPS = [
  'Google Chrome',
  'Chrome',
  'Firefox',
  'Safari',
  'Microsoft Edge',
  'Arc',
  'Brave',
  'Opera',
] as const;

// ============================================================================
// Utility Functions
// ============================================================================

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function isCodeEditor(app: string): boolean {
  return CODE_EDITORS.some(editor =>
    app.toLowerCase().includes(editor.toLowerCase())
  );
}

export function isProductiveApp(app: string): boolean {
  return PRODUCTIVE_APPS.some(productiveApp =>
    app.toLowerCase().includes(productiveApp.toLowerCase())
  );
}

export function isCommunicationApp(app: string): boolean {
  return COMMUNICATION_APPS.some(commApp =>
    app.toLowerCase().includes(commApp.toLowerCase())
  );
}

export function isBrowserApp(app: string): boolean {
  return BROWSER_APPS.some(browser =>
    app.toLowerCase().includes(browser.toLowerCase())
  );
}

// Extract project name from window title (VS Code, Cursor, etc.)
export function extractProjectFromTitle(title: string, app: string): { project?: string; fileName?: string } {
  if (!isCodeEditor(app)) {
    return {};
  }

  // Format: "filename.ext — projectname — Cursor"
  // Format: "filename.ext - projectname - Visual Studio Code"
  const dashMatch = title.match(/^●?\s*(.+?)\s+[—-]\s+([^—-]+)\s+[—-]\s+.+$/);
  if (dashMatch) {
    return {
      fileName: dashMatch[1].trim(),
      project: dashMatch[2].trim().split('/').pop() || dashMatch[2].trim(),
    };
  }

  // Fallback: just filename
  const simpleMatch = title.match(/^●?\s*(.+?)\s+[—-]\s+/);
  if (simpleMatch) {
    return { fileName: simpleMatch[1].trim() };
  }

  return {};
}
