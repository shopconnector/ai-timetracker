import { NextRequest, NextResponse } from 'next/server';
import { getActivitiesForDate, formatDuration } from '@/lib/activitywatch';
import { getWorklogs } from '@/lib/tempo';
import { getCurrentUser, getIssueKeysByIds } from '@/lib/jira';

// Types matching client-side Assignment interface
interface Assignment {
  ticketKey: string;
  confidence: number;
  source: 'history' | 'project_mapping' | 'manual' | 'tempo_match';
}

interface TaskUsage {
  key: string;
  name: string;
  activities: string[];
  projects: string[];
  useCount: number;
}

interface ProjectMapping {
  project: string;
  taskKey: string;
  confidence: number;
}

interface BatchAssignRequest {
  fromDate: string;
  toDate: string;
  taskHistory: TaskUsage[];
  projectMappings: ProjectMapping[];
}

interface DayResult {
  assignments: Record<string, Assignment>;
  activitiesCount: number;
  assignedCount: number;
  tempoMatchCount: number;
}

// Match Tempo worklogs to AW activities by time overlap
function matchTempoToActivities(
  activities: Array<{
    id: string;
    firstSeen?: string;
    lastSeen?: string;
    totalSeconds: number;
    project?: string;
    title: string;
  }>,
  worklogs: Array<{
    issueKey: string;
    startTime: string;
    timeSpentSeconds: number;
    description?: string;
  }>
): Record<string, Assignment> {
  const assignments: Record<string, Assignment> = {};

  for (const worklog of worklogs) {
    // Parse worklog time range
    const wParts = worklog.startTime.split(':');
    const wStartMin = parseInt(wParts[0]) * 60 + parseInt(wParts[1]);
    const wEndMin = wStartMin + Math.ceil(worklog.timeSpentSeconds / 60);

    for (const activity of activities) {
      if (assignments[activity.id]) continue; // Already matched

      if (!activity.firstSeen) continue;

      // Parse activity time
      const aTime = activity.firstSeen.substring(11, 16);
      const aParts = aTime.split(':');
      const aStartMin = parseInt(aParts[0]) * 60 + parseInt(aParts[1]);
      const aEndMin = aStartMin + Math.ceil(activity.totalSeconds / 60);

      // Check time overlap (±30 min tolerance)
      const overlapStart = Math.max(wStartMin - 30, aStartMin);
      const overlapEnd = Math.min(wEndMin + 30, aEndMin);

      if (overlapStart < overlapEnd) {
        assignments[activity.id] = {
          ticketKey: worklog.issueKey,
          confidence: 0.9,
          source: 'tempo_match',
        };
        break; // One worklog matches one activity at most
      }
    }
  }

  return assignments;
}

// Learned pattern from Tempo matches (built dynamically)
interface LearnedPattern {
  keywords: string[];
  app?: string;
  ticketKey: string;
  count: number;
}

// App → most common ticket mapping
interface AppTicketStats {
  app: string;
  ticketKey: string;
  count: number;
}

// Extract meaningful keywords from activity title
function extractKeywords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(
      w => w.length > 2 && !['the', 'and', 'for', 'with', 'from', 'claude', 'chat'].includes(w)
    );
}

// Smart suggestions using learned patterns from Tempo + history + fallbacks
function suggestFromPatterns(
  activity: { title: string; project?: string; app: string },
  learnedPatterns: LearnedPattern[],
  taskHistory: TaskUsage[],
  projectMappings: ProjectMapping[],
  appStats: AppTicketStats[],
  defaultTicket: string | null
): Assignment | null {
  const titleLower = activity.title.toLowerCase();
  const activityKeywords = extractKeywords(activity.title);

  // 1. Try project mapping first (highest confidence)
  if (activity.project) {
    const mapping = projectMappings.find(m => m.project === activity.project);
    if (mapping && mapping.confidence > 0.3) {
      return {
        ticketKey: mapping.taskKey,
        confidence: mapping.confidence,
        source: 'project_mapping',
      };
    }
  }

  // 2. Match against learned patterns from Tempo (most reliable)
  let bestPattern: { pattern: LearnedPattern; score: number } | null = null;

  for (const pattern of learnedPatterns) {
    // App match bonus
    let score = pattern.app === activity.app ? 0.2 : 0;

    // Keyword overlap
    const matchingKeywords = pattern.keywords.filter(
      k => activityKeywords.includes(k) || titleLower.includes(k)
    );

    if (matchingKeywords.length > 0) {
      score += (matchingKeywords.length / Math.max(pattern.keywords.length, 1)) * 0.6;
      score += Math.min(pattern.count * 0.05, 0.2); // Frequency bonus

      if (!bestPattern || score > bestPattern.score) {
        bestPattern = { pattern, score };
      }
    }
  }

  if (bestPattern && bestPattern.score > 0.3) {
    return {
      ticketKey: bestPattern.pattern.ticketKey,
      confidence: Math.min(bestPattern.score, 0.85),
      source: 'history',
    };
  }

  // 3. Try task history (client-provided)
  let bestMatch: { task: TaskUsage; score: number } | null = null;

  if (activityKeywords.length > 0) {
    for (const task of taskHistory) {
      for (const historyActivity of task.activities) {
        const histKeywords = extractKeywords(historyActivity);
        const matchingWords = activityKeywords.filter(w => histKeywords.includes(w));
        const score = matchingWords.length / Math.max(activityKeywords.length, 1);

        if (score > 0.2 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { task, score };
        }
      }

      if (activity.project && task.projects.includes(activity.project)) {
        const projectScore = 0.5 + task.useCount * 0.05;
        if (!bestMatch || projectScore > bestMatch.score) {
          bestMatch = { task, score: projectScore };
        }
      }
    }
  }

  if (bestMatch && bestMatch.score > 0.2) {
    return {
      ticketKey: bestMatch.task.key,
      confidence: Math.min(bestMatch.score, 0.8),
      source: 'history',
    };
  }

  // 4. FALLBACK: App-based assignment (most common ticket for this app)
  const appStat = appStats.find(s => s.app === activity.app);
  if (appStat) {
    return {
      ticketKey: appStat.ticketKey,
      confidence: Math.min(0.3 + appStat.count * 0.02, 0.6),
      source: 'history',
    };
  }

  // 5. FALLBACK: Similar app name matching (Chrome → Google Chrome, etc.)
  const appLower = activity.app.toLowerCase();
  const similarAppStat = appStats.find(
    s =>
      s.app.toLowerCase().includes(appLower) ||
      appLower.includes(s.app.toLowerCase()) ||
      (appLower.includes('chrome') && s.app.toLowerCase().includes('chrome')) ||
      (appLower.includes('terminal') && s.app.toLowerCase().includes('terminal')) ||
      (appLower.includes('code') && s.app.toLowerCase().includes('code'))
  );
  if (similarAppStat) {
    return {
      ticketKey: similarAppStat.ticketKey,
      confidence: 0.35,
      source: 'history',
    };
  }

  // 6. ULTIMATE FALLBACK: Most frequent ticket overall
  if (defaultTicket) {
    return {
      ticketKey: defaultTicket,
      confidence: 0.2,
      source: 'history',
    };
  }

  // 7. If still nothing and we have ANY app stats, use the most common one
  if (appStats.length > 0) {
    return {
      ticketKey: appStats[0].ticketKey,
      confidence: 0.15,
      source: 'history',
    };
  }

  // 8. ABSOLUTE LAST RESORT - hardcoded default (should never reach here if Tempo has data)
  return {
    ticketKey: 'BCI-396', // R&D ticket as ultimate fallback
    confidence: 0.1,
    source: 'history',
  };
}

// Build app → most common ticket stats
function buildAppStats(
  matchedActivities: Array<{ title: string; app: string; ticketKey: string }>
): AppTicketStats[] {
  const appTicketCounts = new Map<string, Map<string, number>>();

  for (const match of matchedActivities) {
    if (!appTicketCounts.has(match.app)) {
      appTicketCounts.set(match.app, new Map());
    }
    const ticketMap = appTicketCounts.get(match.app)!;
    ticketMap.set(match.ticketKey, (ticketMap.get(match.ticketKey) || 0) + 1);
  }

  const stats: AppTicketStats[] = [];
  for (const [app, ticketMap] of appTicketCounts) {
    let maxTicket = '';
    let maxCount = 0;
    for (const [ticket, count] of ticketMap) {
      if (count > maxCount) {
        maxTicket = ticket;
        maxCount = count;
      }
    }
    if (maxTicket) {
      stats.push({ app, ticketKey: maxTicket, count: maxCount });
    }
  }

  return stats.sort((a, b) => b.count - a.count);
}

// Find the most frequently used ticket overall
function findDefaultTicket(
  matchedActivities: Array<{ title: string; app: string; ticketKey: string }>
): string | null {
  const ticketCounts = new Map<string, number>();
  for (const match of matchedActivities) {
    ticketCounts.set(match.ticketKey, (ticketCounts.get(match.ticketKey) || 0) + 1);
  }

  let maxTicket: string | null = null;
  let maxCount = 0;
  for (const [ticket, count] of ticketCounts) {
    if (count > maxCount) {
      maxTicket = ticket;
      maxCount = count;
    }
  }

  return maxTicket;
}

// Build learned patterns from Tempo-matched activities
function buildLearnedPatterns(
  matchedActivities: Array<{ title: string; app: string; ticketKey: string }>
): LearnedPattern[] {
  const patternMap = new Map<string, LearnedPattern>();

  for (const match of matchedActivities) {
    const keywords = extractKeywords(match.title);
    if (keywords.length === 0) continue;

    // Create pattern key from main keywords
    const keywordsKey = keywords.slice(0, 3).sort().join('_');
    const patternKey = `${match.app}:${keywordsKey}:${match.ticketKey}`;

    if (patternMap.has(patternKey)) {
      patternMap.get(patternKey)!.count++;
    } else {
      patternMap.set(patternKey, {
        keywords,
        app: match.app,
        ticketKey: match.ticketKey,
        count: 1,
      });
    }
  }

  return Array.from(patternMap.values()).sort((a, b) => b.count - a.count);
}

export async function POST(request: NextRequest) {
  try {
    const body: BatchAssignRequest = await request.json();
    const { fromDate, toDate, taskHistory, projectMappings } = body;

    if (!fromDate || !toDate) {
      return NextResponse.json({ error: 'fromDate and toDate required' }, { status: 400 });
    }

    // Get current user for filtering worklogs
    const currentUser = await getCurrentUser();
    const myAccountId = currentUser.accountId;

    // Generate date range
    const dates: string[] = [];
    const start = new Date(fromDate);
    const end = new Date(toDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      // Skip weekends
      if (d.getDay() !== 0 && d.getDay() !== 6) {
        dates.push(d.toISOString().split('T')[0]);
      }
    }

    // ========== PHASE 1: Collect all data and Tempo matches ==========
    interface DayData {
      date: string;
      activities: Array<{
        id: string;
        title: string;
        app: string;
        totalSeconds: number;
        firstSeen?: string;
        lastSeen?: string;
        project?: string;
      }>;
      tempoAssignments: Record<string, Assignment>;
    }

    const allDaysData: DayData[] = [];
    const allTempoMatches: Array<{ title: string; app: string; ticketKey: string }> = [];

    // Process in batches of 5 days
    const batchSize = 5;
    for (let i = 0; i < dates.length; i += batchSize) {
      const batch = dates.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batch.map(async date => {
          try {
            // Fetch AW activities and Tempo worklogs in parallel
            const [rawActivities, allWorklogs] = await Promise.all([
              getActivitiesForDate(date),
              getWorklogs(date, date),
            ]);

            // Filter worklogs to current user
            const myWorklogs = allWorklogs.filter(w => w.author?.accountId === myAccountId);

            // Resolve issue keys from Tempo
            const issueIds = myWorklogs
              .map(w => w.issue?.id)
              .filter((id): id is number => id !== undefined && id !== null);

            const issueKeyMap =
              issueIds.length > 0 ? await getIssueKeysByIds(issueIds) : new Map<string, string>();

            const worklogsWithKeys = myWorklogs.map(w => {
              const issueId = w.issue?.id?.toString() || '';
              return {
                issueKey: w.issue?.key || issueKeyMap.get(issueId) || 'Unknown',
                startTime: w.startTime || '09:00:00',
                timeSpentSeconds: w.timeSpentSeconds,
                description: w.description,
              };
            });

            // Map and deduplicate activities by ID (keep first occurrence)
            const seenIds = new Set<string>();
            const activities = rawActivities
              .map(a => ({
                id: a.id,
                title: a.title,
                app: a.app,
                totalSeconds: a.totalSeconds,
                firstSeen: a.firstSeen,
                lastSeen: a.lastSeen,
                project: a.project,
              }))
              .filter(a => {
                if (seenIds.has(a.id)) return false;
                seenIds.add(a.id);
                return true;
              });

            // Match Tempo worklogs to activities
            const tempoAssignments = matchTempoToActivities(activities, worklogsWithKeys);

            return { date, activities, tempoAssignments };
          } catch (error) {
            console.error(`Error processing ${date}:`, error);
            return { date, activities: [], tempoAssignments: {} };
          }
        })
      );

      allDaysData.push(...batchResults);
    }

    // Collect all Tempo matches for pattern learning
    for (const dayData of allDaysData) {
      for (const activity of dayData.activities) {
        const assignment = dayData.tempoAssignments[activity.id];
        if (assignment && assignment.source === 'tempo_match') {
          allTempoMatches.push({
            title: activity.title,
            app: activity.app,
            ticketKey: assignment.ticketKey,
          });
        }
      }
    }

    // ========== PHASE 2: Build patterns and assign unmatched ==========
    const learnedPatterns = buildLearnedPatterns(allTempoMatches);
    const appStats = buildAppStats(allTempoMatches);
    const defaultTicket = findDefaultTicket(allTempoMatches);

    console.log(
      `Built ${learnedPatterns.length} patterns, ${appStats.length} app stats, default: ${defaultTicket}`
    );

    const results: Record<string, DayResult> = {};
    let totalAssigned = 0;
    let totalActivities = 0;
    let totalTempoMatches = 0;
    let totalPatternMatches = 0;

    for (const dayData of allDaysData) {
      const allAssignments: Record<string, Assignment> = { ...dayData.tempoAssignments };

      // For unmatched activities, use learned patterns + history + fallbacks
      for (const activity of dayData.activities) {
        if (allAssignments[activity.id]) continue;

        const suggestion = suggestFromPatterns(
          activity,
          learnedPatterns,
          taskHistory || [],
          projectMappings || [],
          appStats,
          defaultTicket
        );

        if (suggestion) {
          allAssignments[activity.id] = suggestion;
          totalPatternMatches++;
        }
      }

      const tempoMatchCount = Object.values(allAssignments).filter(
        a => a.source === 'tempo_match'
      ).length;

      results[dayData.date] = {
        assignments: allAssignments,
        activitiesCount: dayData.activities.length,
        assignedCount: Object.keys(allAssignments).length,
        tempoMatchCount,
      };

      totalAssigned += Object.keys(allAssignments).length;
      totalActivities += dayData.activities.length;
      totalTempoMatches += tempoMatchCount;
    }

    return NextResponse.json({
      results,
      summary: {
        daysProcessed: dates.length,
        totalActivities,
        totalAssigned,
        totalTempoMatches,
        totalPatternMatches,
        learnedPatternsCount: learnedPatterns.length,
      },
    });
  } catch (error) {
    console.error('Batch assign error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Batch assign failed' },
      { status: 500 }
    );
  }
}
