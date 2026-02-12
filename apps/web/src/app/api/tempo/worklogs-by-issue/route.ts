import { NextRequest, NextResponse } from 'next/server';
import { getWorklogs } from '@/lib/tempo';
import { getIssueKeysByIds } from '@/lib/jira';

// Zwraca zsumowany czas per issue ID i key z Tempo
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const to = searchParams.get('to') || new Date().toISOString().split('T')[0];
    const fromDate = new Date(to);
    fromDate.setDate(fromDate.getDate() - 90);
    const from = searchParams.get('from') || fromDate.toISOString().split('T')[0];

    const worklogs = await getWorklogs(from, to);

    console.log(`[worklogs-by-issue] Fetched ${worklogs.length} worklogs from ${from} to ${to}`);

    // Zbierz unikalne issue IDs
    const issueIds = [
      ...new Set(worklogs.map(w => w.issue?.id).filter((id): id is number => id != null)),
    ];

    // Zbierz klucze bezpośrednio z worklogs (Tempo v4 zwraca issue.key)
    const directKeys = new Set(
      worklogs.map(w => w.issue?.key).filter((k): k is string => !!k && !k.startsWith('UNKNOWN'))
    );

    console.log(`[worklogs-by-issue] Unique issue IDs: ${issueIds.length}, direct keys from Tempo: ${directKeys.size}`);

    // Rozwiąż ID na klucze tylko jeśli brakuje kluczy z Tempo
    let keyMap = new Map<string, string>();
    if (issueIds.length > 0 && directKeys.size < issueIds.length) {
      console.log(`[worklogs-by-issue] Resolving ${issueIds.length - directKeys.size} missing keys via Jira API`);
      keyMap = await getIssueKeysByIds(issueIds);
    }

    // Agreguj czas per issue ID i per issue key
    const timeByIssueId: Record<string, number> = {};
    const timeByIssueKey: Record<string, number> = {};

    for (const w of worklogs) {
      const id = w.issue?.id;
      if (!id) continue;

      const seconds = w.timeSpentSeconds;
      const idStr = String(id);
      timeByIssueId[idStr] = (timeByIssueId[idStr] || 0) + seconds;

      // Też agreguj per key — najpierw z Tempo, potem z Jira API
      const key = w.issue?.key || keyMap.get(idStr);
      if (key && !key.startsWith('UNKNOWN')) {
        timeByIssueKey[key] = (timeByIssueKey[key] || 0) + seconds;
      }
    }

    console.log(`[worklogs-by-issue] Result: ${Object.keys(timeByIssueKey).length} issue keys, ${Object.keys(timeByIssueId).length} issue IDs`);
    if (Object.keys(timeByIssueKey).length > 0) {
      console.log(`[worklogs-by-issue] Sample keys:`, Object.entries(timeByIssueKey).slice(0, 5));
    }

    return NextResponse.json({
      timeByIssueId,
      timeByIssueKey,
      from,
      to,
      totalWorklogs: worklogs.length,
    });
  } catch (error) {
    console.error('Error fetching worklogs by issue:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch worklogs' },
      { status: 500 }
    );
  }
}
