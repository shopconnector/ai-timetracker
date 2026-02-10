import { NextRequest, NextResponse } from 'next/server';
import { createWorklog, getWorklogsForDate, roundToMinutes, COMMON_TICKETS, Worklog } from '@/lib/tempo';
import { getIssueId, getCurrentUser, getIssueKeysByIds } from '@/lib/jira';

// GET - fetch worklogs for a date
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const date = searchParams.get('date');

  if (!date) {
    return NextResponse.json(
      { error: 'date parameter required (YYYY-MM-DD)' },
      { status: 400 }
    );
  }

  try {
    // Get current user to filter worklogs
    const currentUser = await getCurrentUser();
    const myAccountId = currentUser.accountId;

    // Get all worklogs for the date
    const allWorklogs = await getWorklogsForDate(date);

    // Filter to only my worklogs
    const myWorklogs = allWorklogs.filter(
      (w) => w.author?.accountId === myAccountId
    );

    // Collect issue IDs that need keys (Tempo returns issue.id but not issue.key)
    const issueIds = myWorklogs
      .map((w) => w.issue?.id)
      .filter((id): id is number => id !== undefined && id !== null);

    // Fetch issue keys from Jira
    const issueKeyMap = issueIds.length > 0
      ? await getIssueKeysByIds(issueIds)
      : new Map<string, string>();

    // Enrich worklogs with issue keys
    const enrichedWorklogs: Worklog[] = myWorklogs.map((w) => {
      const issueId = w.issue?.id;
      const issueKey = issueId
        ? issueKeyMap.get(String(issueId)) || w.issue.key || `UNKNOWN-${issueId}`
        : w.issue.key || 'UNKNOWN';

      return {
        ...w,
        issue: {
          ...w.issue,
          key: issueKey,
        },
      };
    });

    const totalSeconds = enrichedWorklogs.reduce((sum, w) => sum + w.timeSpentSeconds, 0);

    return NextResponse.json({
      date,
      worklogs: enrichedWorklogs,
      totalSeconds,
      totalFormatted: `${Math.floor(totalSeconds / 3600)}h ${Math.floor((totalSeconds % 3600) / 60)}m`,
      availableTickets: COMMON_TICKETS,
      currentUserAccountId: myAccountId
    });
  } catch (error) {
    console.error('Error fetching worklogs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch worklogs from Tempo' },
      { status: 500 }
    );
  }
}

// Validate issueKey format (PROJECT-123)
const ISSUE_KEY_REGEX = /^[A-Z][A-Z0-9]*-\d+$/;

// Validate date format (YYYY-MM-DD)
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Default Billing Account mapping by project prefix
const PROJECT_BILLING_ACCOUNT: Record<string, string> = {
  'BCI': 'BEE-INTERNAL',      // Beecommerce Internal
  'AR': 'BEE-INTERNAL',       // AI Research
  'BSL': 'BEE-INTERNAL',      // Baselinker
  'AGRO': 'AGROSIMEXMARKETING', // Agrosimex
  'WOSH': 'WOSHWMS',          // Wosh WMS
  'SAND': 'SANDOZ',           // Sandoz
  'CEPD': 'CEPDANALYT',       // CEPD Analytics
};

// Get billing account for a project
function getBillingAccountForProject(issueKey: string): string {
  const projectKey = issueKey.split('-')[0];
  return PROJECT_BILLING_ACCOUNT[projectKey] || 'BEE-INTERNAL';
}

// POST - create a new worklog
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      issueKey,
      issueId,  // Tempo API v4 requires numeric issueId
      timeSpentSeconds,
      startDate,
      startTime,
      description,
      billableSeconds,
      attributes,
      authorAccountId
    } = body;

    // Basic required fields check
    if (!issueKey || !timeSpentSeconds || !startDate) {
      return NextResponse.json(
        { error: 'issueKey, timeSpentSeconds, and startDate are required' },
        { status: 400 }
      );
    }

    // Validate issueKey format
    if (!ISSUE_KEY_REGEX.test(issueKey)) {
      return NextResponse.json(
        { error: `Nieprawidłowy format ticketa: ${issueKey}. Oczekiwany format: ABC-123` },
        { status: 400 }
      );
    }

    // Validate timeSpentSeconds is positive number
    if (typeof timeSpentSeconds !== 'number' || timeSpentSeconds <= 0 || isNaN(timeSpentSeconds)) {
      return NextResponse.json(
        { error: 'timeSpentSeconds musi być liczbą większą od 0' },
        { status: 400 }
      );
    }

    // Validate startDate format
    if (!DATE_REGEX.test(startDate)) {
      return NextResponse.json(
        { error: `Nieprawidłowy format daty: ${startDate}. Oczekiwany format: YYYY-MM-DD` },
        { status: 400 }
      );
    }

    // Round to minutes (Tempo requirement)
    const roundedSeconds = roundToMinutes(timeSpentSeconds);

    // Auto-fetch issueId from Jira if not provided
    let resolvedIssueId = issueId;
    if (!resolvedIssueId) {
      try {
        resolvedIssueId = await getIssueId(issueKey);
        console.log(`Auto-fetched issueId ${resolvedIssueId} for ${issueKey}`);
      } catch (error) {
        console.error(`Failed to fetch issueId for ${issueKey}:`, error);
        return NextResponse.json(
          { error: `Nie można pobrać issueId dla ${issueKey}. Sprawdź czy ticket istnieje.` },
          { status: 400 }
        );
      }
    }

    // Auto-fetch authorAccountId from Jira if not provided
    let resolvedAuthorAccountId = authorAccountId;
    if (!resolvedAuthorAccountId) {
      try {
        const currentUser = await getCurrentUser();
        resolvedAuthorAccountId = currentUser.accountId;
        console.log(`Auto-fetched authorAccountId: ${resolvedAuthorAccountId}`);
      } catch (error) {
        console.error('Failed to fetch current user:', error);
        return NextResponse.json(
          { error: 'Nie można pobrać danych użytkownika z Jira.' },
          { status: 500 }
        );
      }
    }

    // Build attributes - use provided or set defaults
    let resolvedAttributes = attributes;
    if (!resolvedAttributes || resolvedAttributes.length === 0) {
      // Default attributes for Tempo with project-based Billing Account
      const billingAccount = getBillingAccountForProject(issueKey);
      resolvedAttributes = [
        { key: '_Actiontype_', value: 'standarddevelopment' },
        { key: '_BillingAccount_', value: billingAccount }
      ];
      console.log(`Using default Billing Account: ${billingAccount} for ${issueKey}`);
    } else {
      // Check if BillingAccount is provided, if not add it
      const hasBillingAccount = resolvedAttributes.some(
        (a: { key: string }) => a.key === '_BillingAccount_'
      );
      if (!hasBillingAccount) {
        const billingAccount = getBillingAccountForProject(issueKey);
        resolvedAttributes = [
          ...resolvedAttributes,
          { key: '_BillingAccount_', value: billingAccount }
        ];
        console.log(`Added default Billing Account: ${billingAccount} for ${issueKey}`);
      }
    }

    const worklog = await createWorklog({
      issueKey,
      issueId: parseInt(String(resolvedIssueId), 10),
      timeSpentSeconds: roundedSeconds,
      startDate,
      startTime: startTime || '09:00:00',
      description,
      authorAccountId: resolvedAuthorAccountId,
      billableSeconds: billableSeconds !== undefined
        ? roundToMinutes(billableSeconds)
        : undefined,
      attributes: resolvedAttributes
    });

    return NextResponse.json({
      success: true,
      worklog,
      message: `Logged ${Math.floor(roundedSeconds / 60)} minutes to ${issueKey}`
    });
  } catch (error) {
    console.error('Error creating worklog:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create worklog' },
      { status: 500 }
    );
  }
}
