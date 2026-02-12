// Merge ActivityWatch + Slack activities with correlation to avoid double-counting
import type { GroupedActivity } from './activitywatch';

export interface MergedActivity extends GroupedActivity {
  source: 'aw' | 'slack' | 'merged';
  correlatedWith?: { awId?: string; slackId?: string };
}

const OVERLAP_TOLERANCE_MS = 5 * 60 * 1000; // ±5 minutes

function timeOverlaps(a: GroupedActivity, b: GroupedActivity): boolean {
  if (!a.firstSeen || !a.lastSeen || !b.firstSeen || !b.lastSeen) return false;

  const aStart = new Date(a.firstSeen).getTime() - OVERLAP_TOLERANCE_MS;
  const aEnd = new Date(a.lastSeen).getTime() + OVERLAP_TOLERANCE_MS;
  const bStart = new Date(b.firstSeen).getTime();
  const bEnd = new Date(b.lastSeen).getTime();

  return aEnd >= bStart && bEnd >= aStart;
}

/**
 * Merge AW and Slack activities, correlating overlapping entries.
 *
 * AW sees Slack as a window (app="Slack"), and Slack API provides richer data
 * (channel names, huddle detection). When both report the same time period,
 * we keep AW duration (more accurate) but Slack metadata (richer context).
 */
export function mergeActivities(
  awActivities: GroupedActivity[],
  slackActivities: GroupedActivity[]
): MergedActivity[] {
  if (slackActivities.length === 0) {
    return awActivities.map(a => ({ ...a, source: 'aw' as const }));
  }

  // Separate AW activities: Slack window vs non-Slack
  const awSlackCandidates = awActivities.filter(
    a => a.app.toLowerCase() === 'slack'
  );
  const awNonSlack = awActivities.filter(
    a => a.app.toLowerCase() !== 'slack'
  );

  const pairedAwIds = new Set<string>();
  const pairedSlackIds = new Set<string>();
  const merged: MergedActivity[] = [];

  // Try to pair each Slack activity with an AW Slack candidate
  for (const slack of slackActivities) {
    let bestMatch: GroupedActivity | null = null;
    let bestOverlap = 0;

    for (const aw of awSlackCandidates) {
      if (pairedAwIds.has(aw.id)) continue;
      if (!timeOverlaps(aw, slack)) continue;

      // Prefer the AW activity with closest time match
      const awMid = (new Date(aw.firstSeen).getTime() + new Date(aw.lastSeen).getTime()) / 2;
      const slackMid = (new Date(slack.firstSeen).getTime() + new Date(slack.lastSeen).getTime()) / 2;
      const overlap = 1 / (1 + Math.abs(awMid - slackMid));

      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestMatch = aw;
      }
    }

    if (bestMatch) {
      // Merge: AW duration + Slack metadata
      pairedAwIds.add(bestMatch.id);
      pairedSlackIds.add(slack.id);

      merged.push({
        ...bestMatch,
        // Keep AW timing (more accurate from window watcher)
        totalSeconds: bestMatch.totalSeconds,
        // Use Slack metadata (richer context)
        title: slack.title || bestMatch.title,
        channel: slack.channel || bestMatch.channel,
        isMeeting: slack.isMeeting || bestMatch.isMeeting,
        meetingPlatform: slack.meetingPlatform || bestMatch.meetingPlatform,
        isCommunication: true,
        category: slack.category || bestMatch.category,
        source: 'merged',
        correlatedWith: { awId: bestMatch.id, slackId: slack.id },
      });
    }
  }

  // Unpaired Slack activities (Slack-only, e.g. short DMs AW didn't catch)
  for (const slack of slackActivities) {
    if (!pairedSlackIds.has(slack.id)) {
      merged.push({ ...slack, source: 'slack' });
    }
  }

  // Unpaired AW Slack candidates (AW saw Slack window but no API match)
  for (const aw of awSlackCandidates) {
    if (!pairedAwIds.has(aw.id)) {
      merged.push({ ...aw, source: 'aw' });
    }
  }

  // All non-Slack AW activities
  for (const aw of awNonSlack) {
    merged.push({ ...aw, source: 'aw' });
  }

  // Sort by totalSeconds desc
  merged.sort((a, b) => b.totalSeconds - a.totalSeconds);

  return merged;
}

/**
 * Safe wrapper: fetch Slack activities with graceful fallback to empty array.
 */
export async function getSlackActivitiesForDateSafe(date: string): Promise<GroupedActivity[]> {
  try {
    const { getSlackActivitiesForDate, isSlackConfigured } = await import('./slack');
    if (!isSlackConfigured()) return [];
    return await getSlackActivitiesForDate(date);
  } catch (error) {
    console.warn('[mergeActivities] Slack fetch failed, using AW only:', error);
    return [];
  }
}

/**
 * Batch fetch Slack activities for a date range.
 * Much faster than calling getSlackActivitiesForDateSafe per day — fetches each
 * conversation once for the entire range, then splits by day.
 */
export async function getSlackActivitiesForDateRangeSafe(
  startDate: string,
  endDate: string
): Promise<Map<string, GroupedActivity[]>> {
  try {
    const { getSlackActivitiesForDateRange, isSlackConfigured } = await import('./slack');
    if (!isSlackConfigured()) return new Map();
    return await getSlackActivitiesForDateRange(startDate, endDate);
  } catch (error) {
    console.warn('[mergeActivities] Slack range fetch failed:', error);
    return new Map();
  }
}
