import { NextRequest, NextResponse } from 'next/server';
import {
  getCurrentUser,
  getMyRelevantIssues,
  searchAllIssues,
  formatIssueForDisplay,
  getAllProjectsIssues,
  getFilteredIssues,
  groupIssuesByParent,
  adfToPlainText,
  JIRA_FIELDS_WITH_DESCRIPTION,
  JiraIssue,
  IssueFilter
} from '@/lib/jira';

// Cache for current user (to avoid repeated API calls)
let cachedAccountId: string | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cache for all issues (to avoid repeated heavy queries)
let cachedAllIssues: ReturnType<typeof formatIssue>[] | null = null;
let allIssuesCacheTime = 0;
const ALL_ISSUES_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

function formatIssue(issue: JiraIssue) {
  // Komentarze — konwertuj ADF na plain text
  const comments = (issue.fields.comment?.comments || [])
    .map(c => ({
      author: c.author?.displayName || 'System',
      created: c.created,
      body: adfToPlainText(c.body),
    }))
    .filter(c => c.body.length > 0);

  // Subtaski z pełnymi danymi
  const subtasks = (issue.fields.subtasks || []).map(s => ({
    key: s.key,
    summary: s.fields.summary,
    status: s.fields.status.name,
    type: s.fields.issuetype?.name || 'Sub-task',
  }));

  return {
    ...formatIssueForDisplay(issue),
    id: issue.id,
    assignee: issue.fields.assignee?.displayName,
    assigneeId: issue.fields.assignee?.accountId || null,
    type: issue.fields.issuetype?.name,
    priority: issue.fields.priority?.name,
    updated: issue.fields.updated,
    updatedAt: issue.fields.updated,
    // Project info
    project: issue.fields.project?.key || null,
    projectName: issue.fields.project?.name || null,
    // Hierarchia
    isSubtask: issue.fields.issuetype?.subtask === true,
    parentKey: issue.fields.parent?.key || null,
    parentSummary: issue.fields.parent?.fields?.summary || null,
    subtaskCount: subtasks.length,
    subtasks,
    // Daty
    created: issue.fields.created || null,
    duedate: issue.fields.duedate || null,
    // Czas
    timeoriginalestimate: issue.fields.timeoriginalestimate || null,
    timespent: issue.fields.timespent || null,
    // Etykiety i komponenty
    labels: issue.fields.labels || [],
    components: (issue.fields.components || []).map(c => c.name),
    // Status
    resolution: issue.fields.resolution?.name || null,
    // Opis i komentarze
    description: adfToPlainText(issue.fields.description),
    commentsCount: issue.fields.comment?.total || 0,
    comments,
  };
}

async function getAccountId(): Promise<string> {
  const now = Date.now();
  if (cachedAccountId && (now - cacheTime) < CACHE_TTL) {
    return cachedAccountId;
  }

  const user = await getCurrentUser();
  cachedAccountId = user.accountId;
  cacheTime = now;
  return cachedAccountId;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');
    const type = searchParams.get('type'); // 'assigned' | 'recent' | 'all' | 'projects'
    const filter = searchParams.get('filter') as IssueFilter | null; // 'in_progress' | 'assigned' | 'recent' | 'all'
    const loadAll = searchParams.get('loadAll') === 'true';
    const grouped = searchParams.get('grouped') === 'true'; // Zwróć z hierarchią
    const limit = parseInt(searchParams.get('limit') || '100');

    // Get account ID
    const accountId = await getAccountId();

    let issues: JiraIssue[] = [];

    if (query) {
      // Search mode - search across all issues
      issues = await searchAllIssues(query, Math.min(limit, 50));
    } else if (filter) {
      // Nowy filtr: in_progress, assigned, recent, all, project_all
      const maxLimit = filter === 'project_all' ? 500 : 200;
      issues = await getFilteredIssues(
        accountId,
        filter,
        Math.min(limit, maxLimit),
        JIRA_FIELDS_WITH_DESCRIPTION
      );
    } else if (loadAll || type === 'projects') {
      // Load ALL issues from all accessible projects
      const now = Date.now();
      if (cachedAllIssues && (now - allIssuesCacheTime) < ALL_ISSUES_CACHE_TTL) {
        return NextResponse.json({
          issues: cachedAllIssues,
          total: cachedAllIssues.length,
          accountId,
          cached: true
        });
      }

      // Fetch all issues (this can be slow)
      issues = await getAllProjectsIssues(Math.min(limit, 500));

      const formatted = issues.map(formatIssue);
      cachedAllIssues = formatted;
      allIssuesCacheTime = now;

      return NextResponse.json({
        issues: formatted,
        total: formatted.length,
        accountId,
        cached: false
      });
    } else if (type === 'assigned') {
      const result = await getMyRelevantIssues(accountId);
      issues = result.assigned;
    } else if (type === 'recent') {
      const result = await getMyRelevantIssues(accountId);
      issues = result.recentlyWorked;
    } else {
      // Default: all my issues (assigned + recently worked) - quick query
      const result = await getMyRelevantIssues(accountId);
      issues = result.all;
    }

    // Format for frontend
    const formatted = issues.map(formatIssue);

    // Opcjonalnie zwróć z hierarchią (grupowanie)
    if (grouped) {
      const groups = groupIssuesByParent(issues);
      return NextResponse.json({
        issues: formatted,
        groups: groups.map(g => ({
          parentKey: g.parentKey,
          parentSummary: g.parentSummary,
          parentStatus: g.parentStatus,
          issues: g.issues.map(formatIssue)
        })),
        total: formatted.length,
        accountId
      });
    }

    return NextResponse.json({
      issues: formatted,
      total: formatted.length,
      accountId
    });
  } catch (error) {
    console.error('Error fetching my issues:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch issues' },
      { status: 500 }
    );
  }
}
