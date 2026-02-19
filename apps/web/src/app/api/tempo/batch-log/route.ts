import { NextRequest, NextResponse } from 'next/server';
import { createWorklog, roundToMinutes } from '@/lib/tempo';
import { smartRoundSeconds, applyValueMultiplier, type RoundingTier, type ProjectValueMultiplier } from '@/lib/loggingRules';
import { getIssueId, getCurrentUser } from '@/lib/jira';

interface BatchEntry {
  issueKey: string;
  issueId?: number;
  timeSpentSeconds: number;
  startDate: string;
  startTime?: string;
  description?: string;
}

interface BatchResult {
  index: number;
  issueKey: string;
  success: boolean;
  message: string;
  worklogId?: number;
}

// Validate issueKey format (PROJECT-123)
const ISSUE_KEY_REGEX = /^[A-Z][A-Z0-9]*-\d+$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Default Billing Account mapping by project prefix
const PROJECT_BILLING_ACCOUNT: Record<string, string> = {
  'BCI': 'BEE-INTERNAL',
  'AR': 'BEE-INTERNAL',
  'BSL': 'BEE-INTERNAL',
  'AGRO': 'AGROSIMEXMARKETING',
  'WOSH': 'WOSHWMS',
  'SAND': 'SANDOZ',
  'CEPD': 'CEPDANALYT',
};

function getBillingAccountForProject(issueKey: string): string {
  const projectKey = issueKey.split('-')[0];
  return PROJECT_BILLING_ACCOUNT[projectKey] || 'BEE-INTERNAL';
}

// POST - batch log multiple worklogs at once
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      entries,
      smartRounding,
      roundingTiers,
      roundingAbove60Interval,
      valueMultipliersEnabled,
      projectValueMultipliers,
    }: {
      entries: BatchEntry[];
      smartRounding?: boolean;
      roundingTiers?: RoundingTier[];
      roundingAbove60Interval?: number;
      valueMultipliersEnabled?: boolean;
      projectValueMultipliers?: ProjectValueMultiplier[];
    } = body;

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json(
        { error: 'entries array is required and must not be empty' },
        { status: 400 }
      );
    }

    if (entries.length > 50) {
      return NextResponse.json(
        { error: 'Maximum 50 entries per batch' },
        { status: 400 }
      );
    }

    // Pre-validate all entries
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry.issueKey || !ISSUE_KEY_REGEX.test(entry.issueKey)) {
        return NextResponse.json(
          { error: `Entry ${i}: nieprawidlowy format ticketa: ${entry.issueKey}` },
          { status: 400 }
        );
      }
      if (!entry.timeSpentSeconds || entry.timeSpentSeconds <= 0) {
        return NextResponse.json(
          { error: `Entry ${i}: timeSpentSeconds musi byc > 0` },
          { status: 400 }
        );
      }
      if (!entry.startDate || !DATE_REGEX.test(entry.startDate)) {
        return NextResponse.json(
          { error: `Entry ${i}: nieprawidlowy format daty: ${entry.startDate}` },
          { status: 400 }
        );
      }
    }

    // Fetch current user once for all entries
    let authorAccountId: string;
    try {
      const currentUser = await getCurrentUser();
      authorAccountId = currentUser.accountId;
    } catch (error) {
      console.error('Failed to fetch current user:', error);
      return NextResponse.json(
        { error: 'Nie mozna pobrac danych uzytkownika z Jira.' },
        { status: 500 }
      );
    }

    // Pre-resolve all unique issueKeys to issueIds
    const uniqueKeys = [...new Set(entries.filter(e => !e.issueId).map(e => e.issueKey))];
    const issueIdMap = new Map<string, number>();

    await Promise.all(
      uniqueKeys.map(async (key) => {
        try {
          const id = await getIssueId(key);
          issueIdMap.set(key, id);
        } catch (error) {
          console.error(`Failed to resolve issueId for ${key}:`, error);
        }
      })
    );

    // Process all entries
    const results: BatchResult[] = [];
    let successCount = 0;
    let totalLoggedSeconds = 0;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      try {
        // Resolve issueId
        const issueId = entry.issueId || issueIdMap.get(entry.issueKey);
        if (!issueId) {
          results.push({
            index: i,
            issueKey: entry.issueKey,
            success: false,
            message: `Nie mozna pobrac issueId dla ${entry.issueKey}`,
          });
          continue;
        }

        // Apply value multiplier (TODO-9), then rounding
        let adjustedSeconds = entry.timeSpentSeconds;
        if (valueMultipliersEnabled && projectValueMultipliers) {
          adjustedSeconds = applyValueMultiplier(adjustedSeconds, entry.issueKey, projectValueMultipliers);
        }

        let roundedSeconds: number;
        if (smartRounding) {
          roundedSeconds = smartRoundSeconds(
            adjustedSeconds,
            roundingTiers,
            roundingAbove60Interval
          );
          if (roundedSeconds > 0 && roundedSeconds < 60) roundedSeconds = 60;
        } else {
          roundedSeconds = roundToMinutes(adjustedSeconds);
        }

        // Build attributes
        const billingAccount = getBillingAccountForProject(entry.issueKey);
        const attributes = [
          { key: '_Actiontype_', value: 'standarddevelopment' },
          { key: '_BillingAccount_', value: billingAccount },
        ];

        const worklog = await createWorklog({
          issueKey: entry.issueKey,
          issueId,
          timeSpentSeconds: roundedSeconds,
          startDate: entry.startDate,
          startTime: entry.startTime || '09:00:00',
          description: entry.description,
          authorAccountId,
          attributes,
        });

        successCount++;
        totalLoggedSeconds += roundedSeconds;

        results.push({
          index: i,
          issueKey: entry.issueKey,
          success: true,
          message: `${Math.floor(roundedSeconds / 60)}m zalogowano`,
          worklogId: worklog.tempoWorklogId,
        });
      } catch (error) {
        results.push({
          index: i,
          issueKey: entry.issueKey,
          success: false,
          message: error instanceof Error ? error.message : 'Blad logowania',
        });
      }
    }

    console.log(`[batch-log] Logged ${successCount}/${entries.length} entries, total: ${Math.floor(totalLoggedSeconds / 60)}m`);

    return NextResponse.json({
      success: successCount === entries.length,
      results,
      summary: {
        total: entries.length,
        success: successCount,
        failed: entries.length - successCount,
        totalLoggedMinutes: Math.floor(totalLoggedSeconds / 60),
      },
    });
  } catch (error) {
    console.error('[batch-log] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to batch log' },
      { status: 500 }
    );
  }
}
