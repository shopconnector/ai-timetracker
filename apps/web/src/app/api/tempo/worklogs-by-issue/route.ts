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

    // Zbierz unikalne issue IDs
    const issueIds = [
      ...new Set(worklogs.map(w => w.issue?.id).filter((id): id is number => id != null)),
    ];

    // Rozwiąż ID na klucze (np. 38480 -> BCI-394)
    let keyMap = new Map<string, string>();
    if (issueIds.length > 0) {
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

      // Też agreguj per key jeśli mamy mapowanie
      const key = w.issue?.key || keyMap.get(idStr);
      if (key) {
        timeByIssueKey[key] = (timeByIssueKey[key] || 0) + seconds;
      }
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
