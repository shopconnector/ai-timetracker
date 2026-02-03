// Tempo Calendar/Plans API Client
// Fetches planned time allocations from Tempo

const TEMPO_URL = 'https://api.tempo.io/4';

export interface TempoPlan {
  id: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  plannedSecondsPerDay: number;
  includeNonWorkingDays: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
  assignee: {
    accountId: string;
    displayName?: string;
  };
  planItem: {
    id: number;
    type: 'ISSUE' | 'PROJECT';
    self?: string;
  };
  issue?: {
    id: number;
    key: string;
    self?: string;
  };
  project?: {
    id: number;
    key: string;
    name?: string;
  };
  recurrence?: {
    rule: string;
    endDate?: string;
  };
}

export interface TempoPlansResponse {
  self: string;
  metadata: {
    count: number;
    offset: number;
    limit: number;
  };
  results: TempoPlan[];
}

export interface CalendarEvent {
  id: string;
  source: 'tempo-plan' | 'jira-due' | 'jira-sprint' | 'google-calendar';
  title: string;
  description?: string;
  startTime: string; // HH:MM for intra-day events
  endTime: string;
  durationMinutes: number;
  date: string; // YYYY-MM-DD
  issueKey?: string;
  projectKey?: string;
  isAllDay?: boolean;
  color?: string;
  metadata?: Record<string, unknown>;
}

function getAuthHeader(): HeadersInit {
  const token = process.env.TEMPO_API_TOKEN;
  if (!token) {
    throw new Error('TEMPO_API_TOKEN not set');
  }
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// Get current user's Tempo account ID
async function getMyAccountId(): Promise<string> {
  const accountId = process.env.TEMPO_ACCOUNT_ID;
  if (accountId) {
    return accountId;
  }

  // Fallback: try to get from Tempo API
  const response = await fetch(`${TEMPO_URL}/user-schedule`, {
    headers: getAuthHeader(),
  });

  if (response.ok) {
    const data = await response.json();
    return data.accountId || '';
  }

  return '';
}

// Get planned allocations for a date range
export async function getTempoPlans(startDate: string, endDate: string): Promise<TempoPlan[]> {
  try {
    const accountId = await getMyAccountId();
    if (!accountId) {
      console.warn('No TEMPO_ACCOUNT_ID configured, skipping plans fetch');
      return [];
    }

    // Tempo Plans API: GET /plans with query params
    const url = new URL(`${TEMPO_URL}/plans`);
    url.searchParams.set('from', startDate);
    url.searchParams.set('to', endDate);
    url.searchParams.set('assigneeAccountId', accountId);
    url.searchParams.set('limit', '500');

    const response = await fetch(url.toString(), {
      headers: getAuthHeader(),
    });

    if (!response.ok) {
      if (response.status === 404) {
        // Plans API might not be available in all Tempo editions
        console.warn('Tempo Plans API not available (404)');
        return [];
      }
      console.error('Tempo Plans API error:', response.status);
      return [];
    }

    const data = (await response.json()) as TempoPlansResponse;
    return data.results || [];
  } catch (error) {
    console.error('Error fetching Tempo plans:', error);
    return [];
  }
}

// Convert Tempo Plans to Calendar Events
export function plansToCalendarEvents(
  plans: TempoPlan[],
  dateFilter?: string // Optional: filter to specific date
): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const plan of plans) {
    // If filtering by date, check if plan covers that date
    if (dateFilter) {
      if (plan.startDate > dateFilter || plan.endDate < dateFilter) {
        continue;
      }
    }

    // Convert planned seconds to a time block
    // Default to morning start (9:00)
    const plannedMinutes = Math.round(plan.plannedSecondsPerDay / 60);
    const startHour = 9;
    const endMinutes = startHour * 60 + plannedMinutes;
    const endHour = Math.floor(endMinutes / 60);
    const endMin = endMinutes % 60;

    const title = plan.issue?.key
      ? `${plan.issue.key}: ${plan.description || 'Planned work'}`
      : plan.project?.name || plan.description || 'Planned work';

    // Create event for each day in range (or just the filtered date)
    const start = new Date(dateFilter || plan.startDate);
    const end = new Date(dateFilter || plan.endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      // Skip weekends if not included
      if (!plan.includeNonWorkingDays) {
        const dayOfWeek = d.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;
      }

      const dateStr = d.toISOString().split('T')[0];
      if (dateFilter && dateStr !== dateFilter) continue;

      events.push({
        id: `tempo-plan-${plan.id}-${dateStr}`,
        source: 'tempo-plan',
        title,
        description: plan.description,
        startTime: `${startHour.toString().padStart(2, '0')}:00`,
        endTime: `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`,
        durationMinutes: plannedMinutes,
        date: dateStr,
        issueKey: plan.issue?.key,
        projectKey: plan.project?.key,
        color: '#3b82f6', // Blue for tempo plans
        metadata: {
          planId: plan.id,
          plannedSecondsPerDay: plan.plannedSecondsPerDay,
        },
      });
    }
  }

  return events;
}

// Get calendar events for a date range
export async function getTempoCalendarEvents(
  startDate: string,
  endDate: string
): Promise<CalendarEvent[]> {
  const plans = await getTempoPlans(startDate, endDate);
  return plansToCalendarEvents(plans);
}

// Get calendar events for a single date
export async function getTempoCalendarEventsForDate(date: string): Promise<CalendarEvent[]> {
  const plans = await getTempoPlans(date, date);
  return plansToCalendarEvents(plans, date);
}
