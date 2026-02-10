// Audit trail for tracking AI suggestions vs user decisions
// This helps analyze AI accuracy and improve suggestions over time

const AUDIT_KEY = 'timetracker_audit_trail';
const MAX_ENTRIES = 500; // Keep last 500 entries

export interface AuditEntry {
  id: string;
  timestamp: string;
  type: 'suggestion' | 'log' | 'merge' | 'split' | 'feedback';

  // Activity context
  activityTitle: string;
  activityApp: string;
  activityProject?: string;
  activitySeconds: number;

  // AI suggestion details
  suggestedTicket?: string;
  suggestionConfidence?: number;
  suggestionSource?: 'llm' | 'history' | 'project_mapping';
  suggestionReason?: string;

  // User decision
  actualTicket?: string;
  userAction: 'accepted' | 'modified' | 'rejected' | 'manual';

  // Additional context
  metadata?: {
    llmModel?: string;
    responseTime?: number;
    mergedCount?: number;
    splitCount?: number;
  };
}

export interface AuditStats {
  totalEntries: number;
  byAction: {
    accepted: number;
    modified: number;
    rejected: number;
    manual: number;
  };
  bySource: {
    llm: { total: number; accepted: number; accuracy: number };
    history: { total: number; accepted: number; accuracy: number };
    project_mapping: { total: number; accepted: number; accuracy: number };
  };
  topAcceptedTickets: Array<{ ticket: string; count: number }>;
  topRejectedSuggestions: Array<{ suggested: string; actual: string; count: number }>;
  recentTrend: {
    last7days: { total: number; accepted: number; accuracy: number };
    last30days: { total: number; accepted: number; accuracy: number };
  };
}

// Get all audit entries
export function getAuditTrail(): AuditEntry[] {
  if (typeof window === 'undefined') return [];

  try {
    const data = localStorage.getItem(AUDIT_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Add a new audit entry
export function addAuditEntry(entry: Omit<AuditEntry, 'id' | 'timestamp'>): void {
  if (typeof window === 'undefined') return;

  const entries = getAuditTrail();
  const newEntry: AuditEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
  };

  entries.unshift(newEntry);

  // Keep only last MAX_ENTRIES
  const trimmed = entries.slice(0, MAX_ENTRIES);
  localStorage.setItem(AUDIT_KEY, JSON.stringify(trimmed));
}

// Record when user logs time (tracks suggestion vs actual)
export function recordTimeLog(
  activity: {
    title: string;
    app: string;
    project?: string;
    totalSeconds: number;
    suggestedTicket?: string;
    confidence?: number;
  },
  actualTicket: string,
  suggestionSource?: 'llm' | 'history' | 'project_mapping'
): void {
  let userAction: AuditEntry['userAction'];

  if (!activity.suggestedTicket) {
    userAction = 'manual';
  } else if (activity.suggestedTicket === actualTicket) {
    userAction = 'accepted';
  } else {
    userAction = 'modified';
  }

  addAuditEntry({
    type: 'log',
    activityTitle: activity.title,
    activityApp: activity.app,
    activityProject: activity.project,
    activitySeconds: activity.totalSeconds,
    suggestedTicket: activity.suggestedTicket,
    suggestionConfidence: activity.confidence,
    suggestionSource,
    actualTicket,
    userAction,
  });
}

// Record merge operation
export function recordMerge(
  activities: Array<{ title: string; app: string; totalSeconds: number }>,
  ticketKey: string,
  totalSeconds: number
): void {
  addAuditEntry({
    type: 'merge',
    activityTitle: `Merged ${activities.length} activities`,
    activityApp: activities.map(a => a.app).join(', '),
    activitySeconds: totalSeconds,
    actualTicket: ticketKey,
    userAction: 'manual',
    metadata: {
      mergedCount: activities.length,
    },
  });
}

// Record split operation
export function recordSplit(
  activity: { title: string; app: string; project?: string; totalSeconds: number },
  parts: Array<{ ticketKey: string; seconds: number }>
): void {
  addAuditEntry({
    type: 'split',
    activityTitle: activity.title,
    activityApp: activity.app,
    activityProject: activity.project,
    activitySeconds: activity.totalSeconds,
    actualTicket: parts.map(p => p.ticketKey).join(', '),
    userAction: 'manual',
    metadata: {
      splitCount: parts.length,
    },
  });
}

// Get audit statistics
export function getAuditStats(): AuditStats {
  const entries = getAuditTrail();

  const stats: AuditStats = {
    totalEntries: entries.length,
    byAction: { accepted: 0, modified: 0, rejected: 0, manual: 0 },
    bySource: {
      llm: { total: 0, accepted: 0, accuracy: 0 },
      history: { total: 0, accepted: 0, accuracy: 0 },
      project_mapping: { total: 0, accepted: 0, accuracy: 0 },
    },
    topAcceptedTickets: [],
    topRejectedSuggestions: [],
    recentTrend: {
      last7days: { total: 0, accepted: 0, accuracy: 0 },
      last30days: { total: 0, accepted: 0, accuracy: 0 },
    },
  };

  if (entries.length === 0) return stats;

  // Count by action
  entries.forEach(e => {
    stats.byAction[e.userAction]++;

    // Count by source
    if (e.suggestionSource && e.suggestedTicket) {
      stats.bySource[e.suggestionSource].total++;
      if (e.userAction === 'accepted') {
        stats.bySource[e.suggestionSource].accepted++;
      }
    }
  });

  // Calculate accuracy by source
  (['llm', 'history', 'project_mapping'] as const).forEach(source => {
    const { total, accepted } = stats.bySource[source];
    stats.bySource[source].accuracy = total > 0 ? accepted / total : 0;
  });

  // Top accepted tickets
  const acceptedTickets: Record<string, number> = {};
  entries
    .filter(e => e.userAction === 'accepted' && e.actualTicket)
    .forEach(e => {
      acceptedTickets[e.actualTicket!] = (acceptedTickets[e.actualTicket!] || 0) + 1;
    });
  stats.topAcceptedTickets = Object.entries(acceptedTickets)
    .map(([ticket, count]) => ({ ticket, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Top rejected suggestions (where user chose different ticket)
  const rejectedPairs: Record<string, number> = {};
  entries
    .filter(e => e.userAction === 'modified' && e.suggestedTicket && e.actualTicket)
    .forEach(e => {
      const key = `${e.suggestedTicket}:${e.actualTicket}`;
      rejectedPairs[key] = (rejectedPairs[key] || 0) + 1;
    });
  stats.topRejectedSuggestions = Object.entries(rejectedPairs)
    .map(([pair, count]) => {
      const [suggested, actual] = pair.split(':');
      return { suggested, actual, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Recent trends
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const last7 = entries.filter(e => new Date(e.timestamp) >= sevenDaysAgo);
  const last30 = entries.filter(e => new Date(e.timestamp) >= thirtyDaysAgo);

  stats.recentTrend.last7days = {
    total: last7.length,
    accepted: last7.filter(e => e.userAction === 'accepted').length,
    accuracy: last7.length > 0
      ? last7.filter(e => e.userAction === 'accepted').length / last7.filter(e => e.suggestedTicket).length
      : 0,
  };

  stats.recentTrend.last30days = {
    total: last30.length,
    accepted: last30.filter(e => e.userAction === 'accepted').length,
    accuracy: last30.length > 0
      ? last30.filter(e => e.userAction === 'accepted').length / last30.filter(e => e.suggestedTicket).length
      : 0,
  };

  return stats;
}

// Export audit trail as JSON
export function exportAuditTrail(): string {
  return JSON.stringify({
    entries: getAuditTrail(),
    exportedAt: new Date().toISOString(),
    stats: getAuditStats(),
  }, null, 2);
}

// Clear audit trail
export function clearAuditTrail(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUDIT_KEY);
}
