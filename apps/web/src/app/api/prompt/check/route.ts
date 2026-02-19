import { NextRequest, NextResponse } from 'next/server';
import { getActivitiesForDate, type GroupedActivity } from '@/lib/activitywatch';
import { sendActivityPrompt, isSlackBotConfigured } from '@/lib/slackBot';

// In-memory state for tracking prompted activities
// Key: activity ID, Value: timestamp when prompted
const promptedActivities = new Map<string, number>();
const PROMPT_COOLDOWN_MS = 30 * 60 * 1000; // Don't re-prompt same activity within 30 min

// Minimum activity duration to trigger a prompt (seconds)
const MIN_PROMPT_DURATION_SECONDS = 15 * 60; // 15 minutes

// Cleanup old entries (older than 24h)
function cleanupPromptedActivities() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [key, ts] of promptedActivities) {
    if (ts < cutoff) promptedActivities.delete(key);
  }
}

// Find activities that are significant and haven't been prompted yet
function findNewSignificantActivities(
  activities: GroupedActivity[],
  minDurationSeconds: number
): GroupedActivity[] {
  cleanupPromptedActivities();
  const now = Date.now();

  return activities.filter(a => {
    // Must be above minimum duration
    if (a.totalSeconds < minDurationSeconds) return false;

    // Skip private activities
    if (a.isPrivate) return false;

    // Check if already prompted recently
    const lastPrompted = promptedActivities.get(a.id);
    if (lastPrompted && (now - lastPrompted) < PROMPT_COOLDOWN_MS) return false;

    // Check if the activity is "fresh" — lastSeen within the last hour
    const lastSeen = new Date(a.lastSeen).getTime();
    if ((now - lastSeen) > 60 * 60 * 1000) return false;

    return true;
  });
}

// POST /api/prompt/check — check for new activities and optionally send prompts
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      date,
      minDurationSeconds = MIN_PROMPT_DURATION_SECONDS,
      sendNotification = false, // If true, send Slack DM for each new activity
    } = body;

    const targetDate = date || new Date().toISOString().split('T')[0];

    // Fetch current activities
    const activities = await getActivitiesForDate(targetDate);

    // Find new significant activities
    const newActivities = findNewSignificantActivities(activities, minDurationSeconds);

    if (newActivities.length === 0) {
      return NextResponse.json({
        found: 0,
        message: 'Brak nowych znaczacych aktywnosci',
        prompted: [],
      });
    }

    const prompted: Array<{
      id: string;
      title: string;
      durationMinutes: number;
      notificationSent: boolean;
    }> = [];

    for (const activity of newActivities) {
      // Mark as prompted
      promptedActivities.set(activity.id, Date.now());

      const durationMinutes = Math.round(activity.totalSeconds / 60);
      let notificationSent = false;

      // Optionally send Slack notification
      if (sendNotification && isSlackBotConfigured()) {
        const result = await sendActivityPrompt(
          {
            project: activity.project,
            app: activity.app,
            durationMinutes,
            description: activity.title,
          },
          activity.suggestedTicket
        );
        notificationSent = result.ok;
      }

      prompted.push({
        id: activity.id,
        title: activity.title,
        durationMinutes,
        notificationSent,
      });
    }

    return NextResponse.json({
      found: newActivities.length,
      message: `Znaleziono ${newActivities.length} nowych aktywnosci`,
      prompted,
    });
  } catch (error) {
    console.error('[prompt/check] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Blad sprawdzania aktywnosci' },
      { status: 500 }
    );
  }
}

// GET /api/prompt/check — simple status check (how many activities are tracked)
export async function GET() {
  cleanupPromptedActivities();
  return NextResponse.json({
    trackedActivities: promptedActivities.size,
    cooldownMinutes: PROMPT_COOLDOWN_MS / 60000,
    minDurationMinutes: MIN_PROMPT_DURATION_SECONDS / 60,
  });
}
