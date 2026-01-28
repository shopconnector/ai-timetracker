import { NextRequest, NextResponse } from 'next/server';
import { searchIssues, getIssue, searchIssuesByText } from '@/lib/jira';

// GET - search for issues
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const key = searchParams.get('key');
  const query = searchParams.get('query');
  const jql = searchParams.get('jql');

  try {
    // Get single issue by key
    if (key) {
      const issue = await getIssue(key);
      return NextResponse.json({
        issue: {
          id: issue.id,
          key: issue.key,
          summary: issue.fields.summary,
          status: issue.fields.status.name,
          project: issue.fields.project.key
        }
      });
    }

    // Search by text
    if (query) {
      const issues = await searchIssuesByText(query);
      return NextResponse.json({
        issues: issues.map(i => ({
          id: i.id,
          key: i.key,
          summary: i.fields.summary,
          status: i.fields.status.name,
          project: i.fields.project.key
        }))
      });
    }

    // Search by JQL
    if (jql) {
      const result = await searchIssues(jql);
      return NextResponse.json({
        issues: result.issues.map(i => ({
          id: i.id,
          key: i.key,
          summary: i.fields.summary,
          status: i.fields.status.name,
          project: i.fields.project.key
        })),
        total: result.total
      });
    }

    // Default: get recent BCI issues
    const result = await searchIssues('project = BCI ORDER BY updated DESC', 20);
    return NextResponse.json({
      issues: result.issues.map(i => ({
        id: i.id,
        key: i.key,
        summary: i.fields.summary,
        status: i.fields.status.name,
        project: i.fields.project.key
      })),
      total: result.total
    });
  } catch (error) {
    console.error('Jira API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch issues' },
      { status: 500 }
    );
  }
}
