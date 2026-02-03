// Jira API Client

const JIRA_BASE_URL = process.env.JIRA_BASE_URL || 'https://beecommerce.atlassian.net';

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: {
      name: string;
    };
    project: {
      key: string;
      name: string;
    };
    assignee?: {
      accountId: string;
      displayName: string;
    };
    issuetype?: {
      name: string;
      iconUrl?: string;
      subtask?: boolean;
    };
    priority?: {
      name: string;
    };
    updated?: string;
    // Hierarchia - parent i subtasks
    parent?: {
      id: string;
      key: string;
      fields: {
        summary: string;
        status: {
          name: string;
        };
      };
    };
    subtasks?: Array<{
      id: string;
      key: string;
      fields: {
        summary: string;
        status: {
          name: string;
        };
        issuetype: {
          name: string;
          subtask: boolean;
        };
      };
    }>;
  };
}

// Typ filtra dla pobierania zadań
export type IssueFilter = 'all' | 'in_progress' | 'assigned' | 'recent';

// Zgrupowane zadania z hierarchią
export interface GroupedIssues {
  parentKey: string | null;
  parentSummary: string | null;
  parentStatus: string | null;
  issues: JiraIssue[];
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey?: string;
  avatarUrls?: {
    '48x48'?: string;
    '24x24'?: string;
  };
}

export interface JiraUser {
  accountId: string;
  emailAddress: string;
  displayName: string;
  active: boolean;
}

export interface JiraSearchResult {
  issues: JiraIssue[];
  total: number;
  maxResults: number;
  startAt?: number;
}

export interface PaginatedSearchResult {
  issues: JiraIssue[];
  total: number;
  startAt: number;
  maxResults: number;
  hasMore: boolean;
  nextPageToken?: string;
}

// Get auth header for Jira API
function getAuthHeader(): HeadersInit {
  const email = process.env.JIRA_SERVICE_EMAIL;
  const apiKey = process.env.JIRA_API_KEY;

  if (!email || !apiKey) {
    throw new Error('JIRA_SERVICE_EMAIL or JIRA_API_KEY not set');
  }

  const auth = Buffer.from(`${email}:${apiKey}`).toString('base64');
  return {
    Authorization: `Basic ${auth}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

// Pola do pobierania z Jira (z hierarchią)
const JIRA_FIELDS = [
  'summary',
  'status',
  'project',
  'assignee',
  'issuetype',
  'priority',
  'updated',
  'parent',
  'subtasks',
];

// Search for issues by JQL (using new POST /search/jql endpoint)
export async function searchIssues(jql: string, maxResults = 50): Promise<JiraSearchResult> {
  const url = `${JIRA_BASE_URL}/rest/api/3/search/jql`;

  const response = await fetch(url, {
    method: 'POST',
    headers: getAuthHeader(),
    body: JSON.stringify({
      jql,
      maxResults,
      fields: JIRA_FIELDS,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Jira API error: ${response.status} - ${error}`);
  }

  return response.json();
}

// Search with pagination support (using new POST /search/jql endpoint with nextPageToken)
export async function searchIssuesPaginated(
  jql: string,
  startAt = 0,
  maxResults = 50,
  nextPageToken?: string
): Promise<PaginatedSearchResult> {
  const url = `${JIRA_BASE_URL}/rest/api/3/search/jql`;

  const body: Record<string, unknown> = {
    jql,
    maxResults,
    fields: JIRA_FIELDS,
  };

  // Use nextPageToken if available, otherwise use startAt (though new API prefers tokens)
  if (nextPageToken) {
    body.nextPageToken = nextPageToken;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: getAuthHeader(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Jira API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const issues = data.issues || [];
  return {
    issues,
    total: data.total || issues.length,
    startAt: startAt,
    maxResults: maxResults,
    hasMore: !data.isLast && data.nextPageToken,
    nextPageToken: data.nextPageToken,
  };
}

// Get all accessible issues (with pagination, max 500 issues)
export async function getAllAccessibleIssues(
  accountId?: string,
  maxTotal = 500
): Promise<JiraIssue[]> {
  // Query for issues user can access - must have restrictions for new API
  // Using updatedDate restriction to satisfy "bounded query" requirement
  const jql = accountId
    ? `(assignee = "${accountId}" OR worklogAuthor = "${accountId}") AND updatedDate >= -90d AND status != Done ORDER BY updated DESC`
    : `updatedDate >= -90d AND status != Done ORDER BY updated DESC`;

  const allIssues: JiraIssue[] = [];
  let nextPageToken: string | undefined;
  const pageSize = 100;

  while (allIssues.length < maxTotal) {
    const result = await searchIssuesPaginated(jql, 0, pageSize, nextPageToken);
    allIssues.push(...result.issues);

    if (!result.hasMore || result.issues.length === 0) {
      break;
    }

    nextPageToken = result.nextPageToken;
  }

  return allIssues.slice(0, maxTotal);
}

// Get all issues from all accessible projects (broader search)
export async function getAllProjectsIssues(maxTotal = 300): Promise<JiraIssue[]> {
  // First get all projects
  const projects = await getAllProjects();
  const projectKeys = projects.map(p => p.key);

  if (projectKeys.length === 0) {
    return [];
  }

  // Query all projects at once - add date restriction for new API
  const projectsJql = projectKeys
    .slice(0, 20)
    .map(k => `"${k}"`)
    .join(', ');
  const jql = `project IN (${projectsJql}) AND updatedDate >= -180d AND status != Done ORDER BY updated DESC`;

  const allIssues: JiraIssue[] = [];
  let nextPageToken: string | undefined;
  const pageSize = 100;

  while (allIssues.length < maxTotal) {
    const result = await searchIssuesPaginated(jql, 0, pageSize, nextPageToken);
    allIssues.push(...result.issues);

    if (!result.hasMore || result.issues.length === 0) {
      break;
    }

    nextPageToken = result.nextPageToken;
  }

  return allIssues.slice(0, maxTotal);
}

// Get issue by key
export async function getIssue(issueKey: string): Promise<JiraIssue> {
  const url = `${JIRA_BASE_URL}/rest/api/3/issue/${issueKey}`;

  const response = await fetch(url, {
    headers: getAuthHeader(),
  });

  if (!response.ok) {
    throw new Error(`Jira API error: ${response.status}`);
  }

  return response.json();
}

// Get my recent issues (assigned or reported)
export async function getMyIssues(accountId?: string): Promise<JiraIssue[]> {
  const jql = accountId
    ? `assignee = "${accountId}" OR reporter = "${accountId}" ORDER BY updated DESC`
    : 'ORDER BY updated DESC';

  const result = await searchIssues(jql, 20);
  return result.issues;
}

// Get issues by project
export async function getProjectIssues(projectKey: string): Promise<JiraIssue[]> {
  const jql = `project = "${projectKey}" ORDER BY updated DESC`;
  const result = await searchIssues(jql, 50);
  return result.issues;
}

// Search issues by text
export async function searchIssuesByText(text: string): Promise<JiraIssue[]> {
  const jql = `text ~ "${text}" ORDER BY updated DESC`;
  const result = await searchIssues(jql, 20);
  return result.issues;
}

// Get issue ID from key (for Tempo API)
export async function getIssueId(issueKey: string): Promise<number> {
  const issue = await getIssue(issueKey);
  return parseInt(issue.id);
}

// Get issue key by numeric ID
export async function getIssueKeyById(issueId: number | string): Promise<string> {
  const url = `${JIRA_BASE_URL}/rest/api/3/issue/${issueId}?fields=key`;

  const response = await fetch(url, {
    headers: getAuthHeader(),
  });

  if (!response.ok) {
    console.warn(`Could not fetch issue key for ID ${issueId}: ${response.status}`);
    return `UNKNOWN-${issueId}`;
  }

  const data = await response.json();
  return data.key;
}

// Get multiple issue keys by IDs (batch)
export async function getIssueKeysByIds(
  issueIds: (number | string)[]
): Promise<Map<string, string>> {
  const keyMap = new Map<string, string>();

  // Jira doesn't have a bulk endpoint for this, so we fetch in parallel
  const uniqueIds = [...new Set(issueIds.map(id => String(id)))];

  const promises = uniqueIds.map(async id => {
    try {
      const key = await getIssueKeyById(id);
      return { id, key };
    } catch {
      return { id, key: `UNKNOWN-${id}` };
    }
  });

  const results = await Promise.all(promises);
  for (const { id, key } of results) {
    keyMap.set(String(id), key);
  }

  return keyMap;
}

// --- Nowe funkcje ---

// Get current user info
export async function getCurrentUser(): Promise<JiraUser> {
  const url = `${JIRA_BASE_URL}/rest/api/3/myself`;

  const response = await fetch(url, {
    headers: getAuthHeader(),
  });

  if (!response.ok) {
    throw new Error(`Jira API error: ${response.status}`);
  }

  return response.json();
}

// Get all projects accessible to the user
export async function getAllProjects(): Promise<JiraProject[]> {
  const url = `${JIRA_BASE_URL}/rest/api/3/project/search?maxResults=100&orderBy=name`;

  const response = await fetch(url, {
    headers: getAuthHeader(),
  });

  if (!response.ok) {
    throw new Error(`Jira API error: ${response.status}`);
  }

  const data = await response.json();
  return data.values || [];
}

// Get issues assigned to a specific user
export async function getAssignedIssues(accountId: string, maxResults = 50): Promise<JiraIssue[]> {
  const jql = `assignee = "${accountId}" AND status != Done ORDER BY updated DESC`;
  const result = await searchIssues(jql, maxResults);
  return result.issues;
}

// Get recently updated issues from user's projects
export async function getRecentIssuesFromProjects(
  projectKeys: string[],
  maxResults = 50
): Promise<JiraIssue[]> {
  if (projectKeys.length === 0) return [];

  const projectsJql = projectKeys.map(k => `"${k}"`).join(', ');
  const jql = `project IN (${projectsJql}) AND updated >= -30d ORDER BY updated DESC`;
  const result = await searchIssues(jql, maxResults);
  return result.issues;
}

// Get issues where user has recently logged time (last 30 days)
// This requires Tempo API, so we'll use a workaround with worklogAuthor
export async function getIssuesWithMyWorklogs(
  accountId: string,
  maxResults = 30
): Promise<JiraIssue[]> {
  // JQL: issues where I logged work in last 30 days
  const jql = `worklogAuthor = "${accountId}" AND worklogDate >= -30d ORDER BY updated DESC`;

  try {
    const result = await searchIssues(jql, maxResults);
    return result.issues;
  } catch {
    // Fallback if worklogAuthor search fails
    console.warn('worklogAuthor search not supported, falling back to assigned issues');
    return getAssignedIssues(accountId, maxResults);
  }
}

// Combined: Get "my issues" - assigned + recently worked on
export async function getMyRelevantIssues(accountId: string): Promise<{
  assigned: JiraIssue[];
  recentlyWorked: JiraIssue[];
  all: JiraIssue[];
}> {
  const [assigned, recentlyWorked] = await Promise.all([
    getAssignedIssues(accountId, 30),
    getIssuesWithMyWorklogs(accountId, 30),
  ]);

  // Combine and deduplicate
  const allMap = new Map<string, JiraIssue>();
  for (const issue of [...assigned, ...recentlyWorked]) {
    allMap.set(issue.key, issue);
  }

  return {
    assigned,
    recentlyWorked,
    all: Array.from(allMap.values()).sort((a, b) => {
      const aDate = a.fields.updated || '';
      const bDate = b.fields.updated || '';
      return bDate.localeCompare(aDate);
    }),
  };
}

// Search issues across all projects
export async function searchAllIssues(query: string, maxResults = 30): Promise<JiraIssue[]> {
  // Try key match first
  if (/^[A-Z]+-\d+$/i.test(query)) {
    try {
      const issue = await getIssue(query.toUpperCase());
      return [issue];
    } catch {
      // Not found by key, continue with text search
    }
  }

  // Text search across all issues
  const jql = `text ~ "${query}" ORDER BY updated DESC`;
  const result = await searchIssues(jql, maxResults);
  return result.issues;
}

// Format issue for display
export function formatIssueForDisplay(issue: JiraIssue): {
  key: string;
  name: string;
  project: string;
  status: string;
  fullName: string;
} {
  return {
    key: issue.key,
    name: issue.fields.summary,
    project: issue.fields.project.key,
    status: issue.fields.status.name,
    fullName: `[${issue.key}] ${issue.fields.summary}`,
  };
}

// --- Filtry i hierarchia ---

// Pobierz zadania według filtra
export async function getFilteredIssues(
  accountId: string,
  filter: IssueFilter,
  maxResults = 50
): Promise<JiraIssue[]> {
  let jql: string;

  switch (filter) {
    case 'in_progress':
      // Taski In Progress przypisane do użytkownika
      jql = `assignee = "${accountId}" AND status = "In Progress" ORDER BY updated DESC`;
      break;
    case 'assigned':
      // Wszystkie przypisane (nie Done)
      jql = `assignee = "${accountId}" AND status != Done ORDER BY updated DESC`;
      break;
    case 'recent':
      // Ostatnio logowane (7 dni)
      jql = `worklogAuthor = "${accountId}" AND worklogDate >= -7d ORDER BY updated DESC`;
      break;
    case 'all':
    default:
      // Wszystkie dostępne
      jql = `(assignee = "${accountId}" OR worklogAuthor = "${accountId}") AND updatedDate >= -30d ORDER BY updated DESC`;
      break;
  }

  try {
    const result = await searchIssues(jql, maxResults);
    return result.issues;
  } catch (error) {
    console.error(`Error fetching filtered issues (${filter}):`, error);
    // Fallback dla 'recent' jeśli worklogAuthor nie działa
    if (filter === 'recent') {
      return getAssignedIssues(accountId, maxResults);
    }
    throw error;
  }
}

// Grupuj zadania według parent (hierarchia)
export function groupIssuesByParent(issues: JiraIssue[]): GroupedIssues[] {
  const groups = new Map<string, GroupedIssues>();
  const orphans: JiraIssue[] = [];

  for (const issue of issues) {
    const isSubtask = issue.fields.issuetype?.subtask === true;
    const parent = issue.fields.parent;

    if (isSubtask && parent) {
      // To jest subtask - dodaj do grupy rodzica
      const parentKey = parent.key;
      if (!groups.has(parentKey)) {
        groups.set(parentKey, {
          parentKey,
          parentSummary: parent.fields.summary,
          parentStatus: parent.fields.status.name,
          issues: [],
        });
      }
      groups.get(parentKey)!.issues.push(issue);
    } else if (issue.fields.subtasks && issue.fields.subtasks.length > 0) {
      // To jest parent z subtaskami
      if (!groups.has(issue.key)) {
        groups.set(issue.key, {
          parentKey: issue.key,
          parentSummary: issue.fields.summary,
          parentStatus: issue.fields.status.name,
          issues: [],
        });
      }
      // Dodaj parent jako pierwszy element
      const group = groups.get(issue.key)!;
      if (!group.issues.find(i => i.key === issue.key)) {
        group.issues.unshift(issue);
      }
    } else {
      // Zwykłe zadanie bez hierarchii
      orphans.push(issue);
    }
  }

  // Konwertuj na tablicę i dodaj sieroty jako osobne grupy
  const result: GroupedIssues[] = Array.from(groups.values());

  // Dodaj zadania bez rodzica jako pojedyncze grupy
  for (const orphan of orphans) {
    result.push({
      parentKey: null,
      parentSummary: null,
      parentStatus: null,
      issues: [orphan],
    });
  }

  // Sortuj grupy - najpierw z parentem, potem bez
  return result.sort((a, b) => {
    if (a.parentKey && !b.parentKey) return -1;
    if (!a.parentKey && b.parentKey) return 1;
    return 0;
  });
}

// Sprawdź czy issue jest subtaskiem
export function isSubtask(issue: JiraIssue): boolean {
  return issue.fields.issuetype?.subtask === true || !!issue.fields.parent;
}

// === KAGANIEC: Typy issue na które NIE WOLNO logować czasu ===
// Stories, Epics i inne parent tasks nie powinny mieć worklogów - logujemy do subtasków
const BLOCKED_ISSUE_TYPES = ['Story', 'Epic'];

// Sprawdź czy issue jest typu Story/Epic (do którego nie wolno logować)
export function isBlockedIssueType(issue: JiraIssue): boolean {
  const issueTypeName = issue.fields.issuetype?.name || '';
  return BLOCKED_ISSUE_TYPES.includes(issueTypeName);
}

// Sprawdź czy issue ma subtaski (i tym samym nie powinno się do niego logować)
export function hasSubtasks(issue: JiraIssue): boolean {
  return (issue.fields.subtasks?.length || 0) > 0;
}

// KAGANIEC: Sprawdź czy można logować czas do tego issue
export async function canLogTimeToIssue(issueKey: string): Promise<{
  allowed: boolean;
  reason?: string;
  issueType?: string;
  subtasks?: Array<{ key: string; summary: string }>;
}> {
  try {
    const issue = await getIssue(issueKey);
    const issueType = issue.fields.issuetype?.name || 'Unknown';

    // Sprawdź czy to zablokowany typ (Story, Epic)
    if (isBlockedIssueType(issue)) {
      const subtasks =
        issue.fields.subtasks?.map(s => ({
          key: s.key,
          summary: s.fields.summary,
        })) || [];

      return {
        allowed: false,
        reason: `🚫 KAGANIEC: Nie można logować czasu do ${issueType}! Loguj do subtasków.`,
        issueType,
        subtasks,
      };
    }

    // Sprawdź czy ma subtaski (wtedy też blokujemy)
    if (hasSubtasks(issue) && !isSubtask(issue)) {
      const subtasks =
        issue.fields.subtasks?.map(s => ({
          key: s.key,
          summary: s.fields.summary,
        })) || [];

      return {
        allowed: false,
        reason: `🚫 KAGANIEC: Ten ticket ma subtaski - loguj czas do nich, nie do parenta!`,
        issueType,
        subtasks,
      };
    }

    return { allowed: true, issueType };
  } catch (error) {
    // Jeśli nie możemy pobrać issue, pozwalamy (lepiej zalogować niż nie)
    console.warn(`Could not verify issue type for ${issueKey}:`, error);
    return { allowed: true };
  }
}

// --- JIRA Calendar Events ---

export interface JiraCalendarEvent {
  id: string;
  source: 'jira-due' | 'jira-sprint';
  title: string;
  description?: string;
  startTime: string; // HH:MM
  endTime: string;
  durationMinutes: number;
  date: string; // YYYY-MM-DD
  issueKey: string;
  projectKey?: string;
  isAllDay?: boolean;
  color?: string;
  metadata?: Record<string, unknown>;
}

// Extended JiraIssue with duedate field
export interface JiraIssueWithDueDate extends JiraIssue {
  fields: JiraIssue['fields'] & {
    duedate?: string; // YYYY-MM-DD
    timeoriginalestimate?: number; // seconds
    timeestimate?: number; // seconds remaining
  };
}

// Get issues with due dates in a date range
export async function getIssuesWithDueDates(
  startDate: string,
  endDate: string,
  accountId?: string
): Promise<JiraIssueWithDueDate[]> {
  // JQL for issues with due dates in range
  let jql = `duedate >= "${startDate}" AND duedate <= "${endDate}"`;

  // Optionally filter by assignee
  if (accountId) {
    jql = `assignee = "${accountId}" AND ${jql}`;
  }

  jql += ' ORDER BY duedate ASC';

  try {
    // Need to include duedate and time estimate fields
    const url = `${JIRA_BASE_URL}/rest/api/3/search/jql`;
    const response = await fetch(url, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({
        jql,
        maxResults: 100,
        fields: [...JIRA_FIELDS, 'duedate', 'timeoriginalestimate', 'timeestimate'],
      }),
    });

    if (!response.ok) {
      console.error('Error fetching issues with due dates:', response.status);
      return [];
    }

    const data = await response.json();
    return data.issues || [];
  } catch (error) {
    console.error('Error fetching issues with due dates:', error);
    return [];
  }
}

// Get sprint events (if using Scrum board)
export async function getSprintEvents(
  startDate: string,
  endDate: string
): Promise<
  Array<{
    id: number;
    name: string;
    state: 'active' | 'closed' | 'future';
    startDate?: string;
    endDate?: string;
    boardId?: number;
  }>
> {
  // Note: Sprint API requires Jira Software and board access
  // This is a basic implementation - may need adjustment based on your Jira setup
  try {
    // First, try to get boards
    const boardsUrl = `${JIRA_BASE_URL}/rest/agile/1.0/board?type=scrum&maxResults=10`;
    const boardsResponse = await fetch(boardsUrl, {
      headers: getAuthHeader(),
    });

    if (!boardsResponse.ok) {
      console.warn('Could not fetch Scrum boards:', boardsResponse.status);
      return [];
    }

    const boardsData = await boardsResponse.json();
    const boards = boardsData.values || [];

    if (boards.length === 0) {
      return [];
    }

    // Get sprints from first board (simplified)
    const boardId = boards[0].id;
    const sprintsUrl = `${JIRA_BASE_URL}/rest/agile/1.0/board/${boardId}/sprint?state=active,future&maxResults=10`;
    const sprintsResponse = await fetch(sprintsUrl, {
      headers: getAuthHeader(),
    });

    if (!sprintsResponse.ok) {
      console.warn('Could not fetch sprints:', sprintsResponse.status);
      return [];
    }

    const sprintsData = await sprintsResponse.json();
    const sprints = sprintsData.values || [];

    // Filter sprints that overlap with date range
    return sprints
      .filter((sprint: { startDate?: string; endDate?: string }) => {
        if (!sprint.startDate || !sprint.endDate) return false;
        const sprintStart = sprint.startDate.split('T')[0];
        const sprintEnd = sprint.endDate.split('T')[0];
        return !(sprintEnd < startDate || sprintStart > endDate);
      })
      .map(
        (sprint: {
          id: number;
          name: string;
          state: string;
          startDate?: string;
          endDate?: string;
        }) => ({
          id: sprint.id,
          name: sprint.name,
          state: sprint.state as 'active' | 'closed' | 'future',
          startDate: sprint.startDate?.split('T')[0],
          endDate: sprint.endDate?.split('T')[0],
          boardId,
        })
      );
  } catch (error) {
    console.error('Error fetching sprint events:', error);
    return [];
  }
}

// Convert JIRA issues with due dates to calendar events
export function issuesToCalendarEvents(
  issues: JiraIssueWithDueDate[],
  dateFilter?: string
): JiraCalendarEvent[] {
  const events: JiraCalendarEvent[] = [];

  for (const issue of issues) {
    const dueDate = issue.fields.duedate;
    if (!dueDate) continue;

    // If filtering by date, check match
    if (dateFilter && dueDate !== dateFilter) continue;

    // Calculate duration from estimate (default 1h if no estimate)
    const estimateSeconds = issue.fields.timeestimate || issue.fields.timeoriginalestimate || 3600;
    const durationMinutes = Math.round(estimateSeconds / 60);

    // Default time for due date items (end of day deadline)
    const startHour = 17; // 5 PM as deadline visualization
    const endMinutes = startHour * 60 + Math.min(durationMinutes, 60); // Max 1h visualization
    const endHour = Math.floor(endMinutes / 60);
    const endMin = endMinutes % 60;

    events.push({
      id: `jira-due-${issue.key}`,
      source: 'jira-due',
      title: `📅 Due: ${issue.key}`,
      description: issue.fields.summary,
      startTime: `${startHour.toString().padStart(2, '0')}:00`,
      endTime: `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`,
      durationMinutes: Math.min(durationMinutes, 60),
      date: dueDate,
      issueKey: issue.key,
      projectKey: issue.fields.project.key,
      isAllDay: false,
      color: '#ef4444', // Red for due dates
      metadata: {
        status: issue.fields.status.name,
        priority: issue.fields.priority?.name,
        estimateSeconds,
      },
    });
  }

  return events;
}

// Get all JIRA calendar events for a date range
export async function getJiraCalendarEvents(
  startDate: string,
  endDate: string,
  accountId?: string
): Promise<JiraCalendarEvent[]> {
  try {
    const [issuesWithDue, sprints] = await Promise.all([
      getIssuesWithDueDates(startDate, endDate, accountId),
      getSprintEvents(startDate, endDate),
    ]);

    const events: JiraCalendarEvent[] = [];

    // Add due date events
    events.push(...issuesToCalendarEvents(issuesWithDue));

    // Add sprint events (as multi-day events)
    for (const sprint of sprints) {
      if (sprint.startDate && sprint.endDate) {
        // Create an event for sprint start
        events.push({
          id: `jira-sprint-start-${sprint.id}`,
          source: 'jira-sprint',
          title: `🏃 Sprint: ${sprint.name}`,
          description: `Sprint ${sprint.state === 'active' ? '(Active)' : '(Planned)'}`,
          startTime: '09:00',
          endTime: '09:30',
          durationMinutes: 30,
          date: sprint.startDate,
          issueKey: '',
          isAllDay: false,
          color: '#8b5cf6', // Purple for sprints
          metadata: {
            sprintId: sprint.id,
            sprintState: sprint.state,
            sprintEndDate: sprint.endDate,
          },
        });
      }
    }

    return events;
  } catch (error) {
    console.error('Error getting JIRA calendar events:', error);
    return [];
  }
}

// Get JIRA calendar events for a single date
export async function getJiraCalendarEventsForDate(
  date: string,
  accountId?: string
): Promise<JiraCalendarEvent[]> {
  return getJiraCalendarEvents(date, date, accountId);
}
