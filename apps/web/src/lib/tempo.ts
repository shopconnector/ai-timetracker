// Tempo API Client

const TEMPO_URL = 'https://api.tempo.io/4';

export interface TempoAttribute {
  key: string;
  value: string;
}

export interface WorklogCreate {
  issueKey: string;
  issueId?: number;  // Tempo API v4 requires issueId (numeric)
  timeSpentSeconds: number;
  startDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM:SS
  description?: string;
  authorAccountId?: string;
  billableSeconds?: number;
  remainingEstimateSeconds?: number;  // Required by some Tempo configurations
  attributes?: TempoAttribute[];
}

export interface WorkAttribute {
  key: string;
  name: string;
  type: 'STATIC_LIST' | 'INPUT' | 'CHECKBOX' | 'ACCOUNT';
  required: boolean;
  values?: Array<{ name: string; value: string }>;
}

export interface Worklog {
  tempoWorklogId: number;
  issue: {
    key: string;
    id?: number;
  };
  author?: {
    accountId?: string;
  };
  timeSpentSeconds: number;
  startDate: string;
  startTime: string;
  description?: string;
  createdAt: string;
}

export interface TempoError {
  errors: Array<{
    message: string;
    errorType: string;
  }>;
}

// Get auth header
function getAuthHeader(): HeadersInit {
  const token = process.env.TEMPO_API_TOKEN;
  if (!token) {
    throw new Error('TEMPO_API_TOKEN not set');
  }
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

// Create a worklog in Tempo
export async function createWorklog(worklog: WorklogCreate): Promise<Worklog> {
  // Tempo API v4 requires issueId (numeric), not issueKey
  if (!worklog.issueId) {
    throw new Error(`issueId is required for Tempo API v4. Got issueKey: ${worklog.issueKey}`);
  }

  const body: Record<string, unknown> = {
    issueId: worklog.issueId,
    timeSpentSeconds: worklog.timeSpentSeconds,
    startDate: worklog.startDate,
    startTime: worklog.startTime,
    description: worklog.description || 'Logged via TimeTracker'
  };

  // Add authorAccountId if provided (required by Tempo API)
  if (worklog.authorAccountId) {
    body.authorAccountId = worklog.authorAccountId;
  }

  // Add billable seconds if provided
  if (worklog.billableSeconds !== undefined) {
    body.billableSeconds = worklog.billableSeconds;
  }

  // Add remaining estimate (required by some Tempo configurations)
  // Default to 0 if not provided
  body.remainingEstimateSeconds = worklog.remainingEstimateSeconds ?? 0;

  // Add attributes if provided
  if (worklog.attributes && worklog.attributes.length > 0) {
    body.attributes = worklog.attributes;
  }

  const response = await fetch(`${TEMPO_URL}/worklogs`, {
    method: 'POST',
    headers: getAuthHeader(),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    // Handle different error types based on status code
    const statusMessages: Record<number, string> = {
      400: 'Nieprawidłowe dane - sprawdź ticket i czas',
      401: 'Token Tempo wygasł - odśwież w ustawieniach',
      403: 'Brak uprawnień do logowania w tym projekcie',
      404: 'Ticket nie istnieje w Jira',
      409: 'Konflikt - czas już zalogowany',
      429: 'Za dużo requestów - poczekaj chwilę'
    };

    // Try to parse JSON response, fallback to text if not JSON
    const contentType = response.headers.get('content-type') || '';
    let errorMessage = statusMessages[response.status] || `Tempo API error: ${response.status}`;

    if (contentType.includes('application/json')) {
      try {
        const error = await response.json() as TempoError;
        errorMessage = error.errors?.[0]?.message || errorMessage;
      } catch {
        // JSON parse failed, use status message
      }
    } else {
      // Non-JSON response (HTML error page, etc.)
      const text = await response.text();
      console.error('Tempo non-JSON response:', text.substring(0, 200));
    }

    throw new Error(errorMessage);
  }

  return response.json();
}

// Get available work attributes from Tempo
export async function getWorkAttributes(): Promise<WorkAttribute[]> {
  const response = await fetch(`${TEMPO_URL}/work-attributes`, {
    headers: getAuthHeader()
  });

  if (!response.ok) {
    console.error('Failed to fetch work attributes:', response.status);
    return [];
  }

  const data = await response.json();
  return data.results || [];
}

// Get worklogs for a date range
export async function getWorklogs(from: string, to: string): Promise<Worklog[]> {
  const response = await fetch(
    `${TEMPO_URL}/worklogs?from=${from}&to=${to}&limit=1000`,
    { headers: getAuthHeader() }
  );

  if (!response.ok) {
    throw new Error(`Tempo API error: ${response.status}`);
  }

  const data = await response.json();
  return data.results || [];
}

// Get worklogs for a specific date
export async function getWorklogsForDate(date: string): Promise<Worklog[]> {
  return getWorklogs(date, date);
}

// Get recent worklogs for a specific issue (for history context)
export async function getRecentWorklogsForIssue(
  issueKey: string,
  limit: number = 10
): Promise<Array<{ date: string; description: string; timeSpent: number }>> {
  // Fetch last 30 days of worklogs
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const from = thirtyDaysAgo.toISOString().split('T')[0];
  const to = today.toISOString().split('T')[0];

  const response = await fetch(
    `${TEMPO_URL}/worklogs/issue/${issueKey}?from=${from}&to=${to}&limit=${limit}`,
    { headers: getAuthHeader() }
  );

  if (!response.ok) {
    // Fallback: try getting all worklogs and filter by issue
    const allWorklogs = await getWorklogs(from, to);
    return allWorklogs
      .filter(w => w.issue.key === issueKey)
      .slice(0, limit)
      .map(w => ({
        date: w.startDate,
        description: w.description || '',
        timeSpent: w.timeSpentSeconds
      }));
  }

  const data = await response.json();
  return (data.results || []).slice(0, limit).map((w: Worklog) => ({
    date: w.startDate,
    description: w.description || '',
    timeSpent: w.timeSpentSeconds
  }));
}

// Get recent descriptions for similar activities (learning from history)
export async function getRecentDescriptions(
  daysBack: number = 14,
  limit: number = 20
): Promise<Array<{ issueKey: string; description: string; date: string }>> {
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - daysBack);

  const from = startDate.toISOString().split('T')[0];
  const to = today.toISOString().split('T')[0];

  const worklogs = await getWorklogs(from, to);

  // Filter only worklogs with descriptions
  return worklogs
    .filter(w => w.description && w.description.trim().length > 5)
    .slice(0, limit)
    .map(w => ({
      issueKey: w.issue.key,
      description: w.description || '',
      date: w.startDate
    }));
}

// Get total logged time for a date
export async function getLoggedTimeForDate(date: string): Promise<number> {
  const worklogs = await getWorklogsForDate(date);
  return worklogs.reduce((sum, w) => sum + w.timeSpentSeconds, 0);
}

// Common Jira issue keys (cache for suggestions)
export const COMMON_TICKETS = [
  { key: 'BCI-395', name: 'AI R&D - Automation Ideas' },
  { key: 'BCI-396', name: 'AI R&D - Consulting Ideas' },
  { key: 'BCI-390', name: 'Onboarding / Discovery / Meetings' },
  { key: 'BCI-394', name: 'AI R&D - Collecting Ideas' },
  { key: 'BCI-1', name: 'Daily Standup' },
];

// Format seconds for Tempo (must be in multiples of 60)
// Using Math.ceil to never lose user time (30 sec → 60 sec, not 0)
export function roundToMinutes(seconds: number): number {
  if (!seconds || seconds <= 0 || isNaN(seconds)) return 0;
  return Math.ceil(seconds / 60) * 60;
}

// --- Walidacja nakładania czasów ---

export interface TimeRange {
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
}

export interface OverlapResult {
  hasOverlap: boolean;
  conflictingWorklogs: Array<{
    issueKey: string;
    startTime: string;
    endTime: string;
    description?: string;
  }>;
}

// Parse time string (HH:MM or HH:MM:SS) to minutes from midnight
function parseTimeToMinutes(time: string): number {
  if (!time) return 0;
  const parts = time.split(':');
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  // Handle HH:MM:SS format - round up if seconds > 30
  const seconds = parts[2] ? parseInt(parts[2], 10) || 0 : 0;
  return hours * 60 + minutes + (seconds >= 30 ? 1 : 0);
}

// Format minutes back to HH:MM
function formatMinutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// Calculate end time from start time and duration
export function calculateEndTime(startTime: string, durationSeconds: number): string {
  const startMinutes = parseTimeToMinutes(startTime);
  const durationMinutes = Math.round(durationSeconds / 60);
  const endMinutes = startMinutes + durationMinutes;
  return formatMinutesToTime(endMinutes);
}

// Check if two time ranges overlap
function doRangesOverlap(
  start1: number, end1: number,
  start2: number, end2: number
): boolean {
  return start1 < end2 && end1 > start2;
}

// Check for overlapping worklogs on a specific date
export async function checkWorklogOverlap(
  date: string,
  newStartTime: string,
  newEndTime: string,
  excludeWorklogId?: number
): Promise<OverlapResult> {
  const existingWorklogs = await getWorklogsForDate(date);

  const newStart = parseTimeToMinutes(newStartTime);
  const newEnd = parseTimeToMinutes(newEndTime);

  const conflicts: OverlapResult['conflictingWorklogs'] = [];

  for (const worklog of existingWorklogs) {
    // Skip the worklog being edited
    if (excludeWorklogId && worklog.tempoWorklogId === excludeWorklogId) {
      continue;
    }

    const existingStart = parseTimeToMinutes(worklog.startTime);
    const existingEnd = existingStart + Math.round(worklog.timeSpentSeconds / 60);

    if (doRangesOverlap(newStart, newEnd, existingStart, existingEnd)) {
      conflicts.push({
        issueKey: worklog.issue.key,
        startTime: worklog.startTime.substring(0, 5),
        endTime: formatMinutesToTime(existingEnd),
        description: worklog.description
      });
    }
  }

  return {
    hasOverlap: conflicts.length > 0,
    conflictingWorklogs: conflicts
  };
}

// Get worklogs for a user on a specific date (with time ranges)
export async function getWorklogsWithTimeRanges(date: string): Promise<Array<{
  tempoWorklogId: number;
  issueKey: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  description?: string;
}>> {
  const worklogs = await getWorklogsForDate(date);

  return worklogs.map(w => {
    const startMinutes = parseTimeToMinutes(w.startTime);
    const durationMinutes = Math.round(w.timeSpentSeconds / 60);
    const endMinutes = startMinutes + durationMinutes;

    return {
      tempoWorklogId: w.tempoWorklogId,
      issueKey: w.issue.key,
      startTime: w.startTime.substring(0, 5),
      endTime: formatMinutesToTime(endMinutes),
      durationMinutes,
      description: w.description
    };
  }).sort((a, b) => a.startTime.localeCompare(b.startTime));
}
