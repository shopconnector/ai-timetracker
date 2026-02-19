import { NextRequest, NextResponse } from 'next/server';
import { getActivitiesForDate, type GroupedActivity } from '@/lib/activitywatch';
import { sendActivityPrompt, isSlackBotConfigured } from '@/lib/slackBot';

/**
 * Gap-based real-time prompting (TODO-5 v2)
 *
 * Logic: prompt ONLY when a significant activity is followed by a long enough gap.
 *
 * Example:
 *   - User works 2h on task A
 *   - Takes 10 min coffee break → NO prompt (gap < minGapMinutes)
 *   - Returns, continues task A for 2h
 *   - Takes 45 min lunch → After returning, prompt to log the previous 2h session
 *
 * This avoids:
 *   - Clock-based polling that interrupts deep work
 *   - Fragmenting long tasks with unnecessary prompts
 *   - Prompting during short breaks (coffee, bathroom)
 */

// In-memory: tracks which sessions have been prompted
// Key: "activityId:lastSeen" → unique per completed session
const promptedSessions = new Map<string, number>();

// Cleanup entries older than 24h
function cleanupSessions() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [key, ts] of promptedSessions) {
    if (ts < cutoff) promptedSessions.delete(key);
  }
}

/**
 * Detect completed work sessions that should be prompted.
 *
 * A session is "completed" when:
 *   1. Activity lasted >= minActivityMinutes
 *   2. Gap after activity >= minGapMinutes (break, lunch, context switch)
 *   3. Session hasn't been prompted yet
 *
 * A session is NOT completed when:
 *   - Activity is still ongoing (no gap yet)
 *   - Gap is too short (coffee break — don't fragment)
 *   - Activity is private
 */
function detectCompletedSessions(
  activities: GroupedActivity[],
  minActivityMinutes: number,
  minGapMinutes: number,
): Array<{ activity: GroupedActivity; gapMinutes: number }> {
  cleanupSessions();

  const now = Date.now();
  const minActivityMs = minActivityMinutes * 60 * 1000;
  const minGapMs = minGapMinutes * 60 * 1000;
  const results: Array<{ activity: GroupedActivity; gapMinutes: number }> = [];

  // Sort by lastSeen descending (most recent first)
  const sorted = [...activities]
    .filter(a => !a.isPrivate && a.totalSeconds >= minActivityMinutes * 60)
    .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());

  for (const activity of sorted) {
    const lastSeenMs = new Date(activity.lastSeen).getTime();
    const sessionKey = `${activity.id}:${activity.lastSeen}`;

    // Already prompted this exact session
    if (promptedSessions.has(sessionKey)) continue;

    // Calculate gap: time between activity's lastSeen and now
    // In the future, we could also look at the next activity's firstSeen,
    // but "now - lastSeen" is simpler and works for the return-from-break case.
    const gapMs = now - lastSeenMs;

    // Skip if gap is too short (user is on a short break or still working)
    if (gapMs < minGapMs) continue;

    // Skip if activity is too old (> 4h gap = probably end of day, not a break)
    if (gapMs > 4 * 60 * 60 * 1000) continue;

    // Activity is significant AND gap is long enough → completed session
    results.push({
      activity,
      gapMinutes: Math.round(gapMs / 60000),
    });
  }

  return results;
}

// POST /api/prompt/check — detect completed sessions and optionally notify
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      date,
      minActivityMinutes = 15,
      minGapMinutes = 20,
      sendNotification = false,
    } = body;

    const targetDate = date || new Date().toISOString().split('T')[0];

    // Fetch current activities from ActivityWatch
    const activities = await getActivitiesForDate(targetDate);

    // Detect completed sessions
    const completedSessions = detectCompletedSessions(
      activities,
      minActivityMinutes,
      minGapMinutes,
    );

    if (completedSessions.length === 0) {
      return NextResponse.json({
        found: 0,
        message: 'Brak zakonczonych sesji do zalogowania',
        sessions: [],
      });
    }

    const sessions: Array<{
      id: string;
      title: string;
      durationMinutes: number;
      gapMinutes: number;
      suggestedTicket?: string;
      notificationSent: boolean;
    }> = [];

    for (const { activity, gapMinutes } of completedSessions) {
      const sessionKey = `${activity.id}:${activity.lastSeen}`;
      promptedSessions.set(sessionKey, Date.now());

      const durationMinutes = Math.round(activity.totalSeconds / 60);
      let notificationSent = false;

      // Send Slack notification if requested
      if (sendNotification && isSlackBotConfigured()) {
        const result = await sendActivityPrompt(
          {
            project: activity.project,
            app: activity.app,
            durationMinutes,
            description: `${activity.title} (przerwa ${gapMinutes} min temu)`,
          },
          activity.suggestedTicket
        );
        notificationSent = result.ok;
      }

      sessions.push({
        id: activity.id,
        title: activity.title,
        durationMinutes,
        gapMinutes,
        suggestedTicket: activity.suggestedTicket,
        notificationSent,
      });
    }

    return NextResponse.json({
      found: completedSessions.length,
      message: `Znaleziono ${completedSessions.length} zakonczonych sesji`,
      sessions,
    });
  } catch (error) {
    console.error('[prompt/check] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Blad sprawdzania aktywnosci' },
      { status: 500 }
    );
  }
}

// GET /api/prompt/check — status + config info
export async function GET() {
  cleanupSessions();
  return NextResponse.json({
    mode: 'gap-based',
    trackedSessions: promptedSessions.size,
    description: 'Prompt only after significant activity followed by a long enough break',
  });
}
