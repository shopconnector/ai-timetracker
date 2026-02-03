/**
 * Enhanced worklog matching for activities, especially meetings
 */

import { calculateMeetingSimilarity, SimilarityResult } from './textSimilarity';
import { getSuggestedTicketForMeeting } from './meetingHistory';

// Tempo worklog interface (matching existing codebase)
export interface TempoWorklog {
  tempoWorklogId: number;
  issue: { key: string; id?: number };
  timeSpentSeconds: number;
  startDate: string;
  startTime: string;
  description?: string;
}

export interface MeetingMatchContext {
  meetingTitle: string;
  meetingPlatform?: string;
  meetingId?: string;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  duration: number; // seconds
}

export interface MatchResult {
  worklog: TempoWorklog;
  timeOverlap: number; // 0-1
  contentSimilarity: number; // 0-1
  combinedScore: number; // Weighted combination
  matchType: 'exact' | 'strong' | 'partial' | 'weak' | 'none';
  reason: string;
}

// Weight configuration for different signal types
const MATCH_WEIGHTS = {
  timeOverlap: 0.4, // Time alignment matters
  contentSimilarity: 0.35, // Meeting title vs worklog description
  historicalMatch: 0.25, // Same ticket used before for similar meetings
};

// Score thresholds for match types
const MATCH_THRESHOLDS = {
  exact: 0.85, // Very confident match
  strong: 0.65, // Likely match
  partial: 0.45, // Possible match
  weak: 0.25, // Uncertain
};

/**
 * Parse time string "HH:MM" or "HH:MM:SS" to minutes from midnight
 */
function parseTimeToMinutes(time: string): number {
  const parts = time.split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

/**
 * Calculate time overlap between activity and worklog
 * Returns 0-1 where 1 = perfect overlap
 */
export function calculateTimeOverlap(
  activityStart: string,
  activityEnd: string,
  worklogStart: string,
  worklogDurationSeconds: number
): number {
  const actStart = parseTimeToMinutes(activityStart);
  const actEnd = parseTimeToMinutes(activityEnd);
  const wStart = parseTimeToMinutes(worklogStart);
  const wEnd = wStart + Math.ceil(worklogDurationSeconds / 60);

  const actDuration = actEnd - actStart;
  if (actDuration <= 0) return 0;

  // Calculate overlap
  const overlapStart = Math.max(actStart, wStart);
  const overlapEnd = Math.min(actEnd, wEnd);
  const overlapMinutes = Math.max(0, overlapEnd - overlapStart);

  // Overlap percentage relative to activity duration
  const overlapRatio = overlapMinutes / actDuration;

  // Tolerance: meetings often start a few minutes late
  // Give bonus for start times within 15 min tolerance
  const startDiff = Math.abs(actStart - wStart);
  const toleranceBonus = startDiff <= 15 ? 0.1 * (1 - startDiff / 15) : 0;

  return Math.min(1, overlapRatio + toleranceBonus);
}

/**
 * Determine match type from combined score
 */
function getMatchType(score: number): MatchResult['matchType'] {
  if (score >= MATCH_THRESHOLDS.exact) return 'exact';
  if (score >= MATCH_THRESHOLDS.strong) return 'strong';
  if (score >= MATCH_THRESHOLDS.partial) return 'partial';
  if (score >= MATCH_THRESHOLDS.weak) return 'weak';
  return 'none';
}

/**
 * Find the best matching worklog for a meeting
 */
export function findBestWorklogMatch(
  meeting: MeetingMatchContext,
  worklogs: TempoWorklog[],
  historicalTicket?: string // From meeting history
): MatchResult | null {
  if (!worklogs || worklogs.length === 0) return null;

  let bestMatch: MatchResult | null = null;
  let bestScore = 0;

  for (const worklog of worklogs) {
    // Calculate time overlap
    const timeOverlap = calculateTimeOverlap(
      meeting.startTime,
      meeting.endTime,
      worklog.startTime,
      worklog.timeSpentSeconds
    );

    // Skip if no time overlap at all
    if (timeOverlap === 0) continue;

    // Calculate content similarity
    let contentSimilarity: SimilarityResult = { score: 0, matchedTerms: [], reason: '' };
    if (worklog.description && meeting.meetingTitle) {
      contentSimilarity = calculateMeetingSimilarity(meeting.meetingTitle, worklog.description);
    }

    // Historical match bonus
    const historicalBonus =
      historicalTicket && worklog.issue.key === historicalTicket
        ? MATCH_WEIGHTS.historicalMatch
        : 0;

    // Calculate combined score
    const combinedScore =
      timeOverlap * MATCH_WEIGHTS.timeOverlap +
      contentSimilarity.score * MATCH_WEIGHTS.contentSimilarity +
      historicalBonus;

    if (combinedScore > bestScore) {
      bestScore = combinedScore;
      bestMatch = {
        worklog,
        timeOverlap,
        contentSimilarity: contentSimilarity.score,
        combinedScore,
        matchType: getMatchType(combinedScore),
        reason: buildMatchReason(timeOverlap, contentSimilarity, historicalBonus > 0),
      };
    }
  }

  // Only return if meets minimum threshold
  if (bestMatch && bestMatch.combinedScore >= MATCH_THRESHOLDS.weak) {
    return bestMatch;
  }

  return null;
}

/**
 * Build human-readable reason for match
 */
function buildMatchReason(
  timeOverlap: number,
  contentSimilarity: SimilarityResult,
  hasHistoricalMatch: boolean
): string {
  const parts: string[] = [];

  if (timeOverlap >= 0.8) {
    parts.push('Time matches');
  } else if (timeOverlap >= 0.5) {
    parts.push(`${Math.round(timeOverlap * 100)}% time overlap`);
  }

  if (contentSimilarity.score >= 0.5) {
    parts.push(contentSimilarity.reason);
  }

  if (hasHistoricalMatch) {
    parts.push('Previously used ticket');
  }

  return parts.length > 0 ? parts.join(', ') : 'Weak match';
}

/**
 * Find all potential matches for a meeting (not just the best one)
 */
export function findAllWorklogMatches(
  meeting: MeetingMatchContext,
  worklogs: TempoWorklog[],
  minScore: number = MATCH_THRESHOLDS.weak
): MatchResult[] {
  const matches: MatchResult[] = [];

  for (const worklog of worklogs) {
    const timeOverlap = calculateTimeOverlap(
      meeting.startTime,
      meeting.endTime,
      worklog.startTime,
      worklog.timeSpentSeconds
    );

    if (timeOverlap === 0) continue;

    let contentSimilarity: SimilarityResult = { score: 0, matchedTerms: [], reason: '' };
    if (worklog.description && meeting.meetingTitle) {
      contentSimilarity = calculateMeetingSimilarity(meeting.meetingTitle, worklog.description);
    }

    const combinedScore =
      timeOverlap * MATCH_WEIGHTS.timeOverlap +
      contentSimilarity.score * MATCH_WEIGHTS.contentSimilarity;

    if (combinedScore >= minScore) {
      matches.push({
        worklog,
        timeOverlap,
        contentSimilarity: contentSimilarity.score,
        combinedScore,
        matchType: getMatchType(combinedScore),
        reason: buildMatchReason(timeOverlap, contentSimilarity, false),
      });
    }
  }

  // Sort by combined score descending
  return matches.sort((a, b) => b.combinedScore - a.combinedScore);
}

/**
 * Get suggested ticket for a meeting based on history and worklogs
 */
export function getSuggestedTicketForActivity(
  meeting: MeetingMatchContext,
  worklogs: TempoWorklog[]
): { ticketKey: string; confidence: number; reason: string } | null {
  // First check meeting history
  const historicalSuggestion = getSuggestedTicketForMeeting(
    meeting.meetingTitle,
    meeting.meetingPlatform
  );

  // Find best worklog match
  const worklogMatch = findBestWorklogMatch(meeting, worklogs, historicalSuggestion?.ticketKey);

  // Prefer worklog match if strong enough
  if (worklogMatch && worklogMatch.matchType !== 'weak' && worklogMatch.matchType !== 'none') {
    return {
      ticketKey: worklogMatch.worklog.issue.key,
      confidence: worklogMatch.combinedScore,
      reason: worklogMatch.reason,
    };
  }

  // Fall back to historical suggestion
  if (historicalSuggestion) {
    return {
      ticketKey: historicalSuggestion.ticketKey,
      confidence: historicalSuggestion.confidence,
      reason: `Previously logged to ${historicalSuggestion.ticketKey}`,
    };
  }

  return null;
}
