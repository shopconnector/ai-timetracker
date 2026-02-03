// Rules Engine for offline task assignment
// Used as fallback when AI (OpenRouter) is not available

const RULES_STORAGE_KEY = 'timetracker_assignment_rules';

export interface RuleCondition {
  app?: string[]; // Match app names (case-insensitive)
  titleContains?: string[]; // Match if title contains any of these
  titleRegex?: string; // Match title against regex
  projectName?: string[]; // Match project names from VS Code/terminal
  timeRange?: {
    // Match time of day
    from: string; // "09:00"
    to: string; // "09:30"
  };
  dayOfWeek?: number[]; // 0=Sunday, 1=Monday, etc.
  minDuration?: number; // Minimum duration in seconds
  maxDuration?: number; // Maximum duration in seconds
}

export interface AssignmentRule {
  id: string;
  name: string;
  description?: string;
  priority: number; // 1-100, higher = more important
  conditions: RuleCondition;
  action: {
    ticketKey: string;
    ticketName?: string;
    confidence: number; // 0-1
  };
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  matchCount: number; // How many times this rule matched
}

export interface Activity {
  id: string;
  title: string;
  app: string;
  project?: string;
  totalSeconds: number;
  firstSeen?: string;
  lastSeen?: string;
}

export interface RuleMatchResult {
  ticketKey: string;
  ticketName?: string;
  confidence: number;
  source: 'rule';
  ruleName: string;
  ruleId: string;
}

// Default rules for common scenarios
const DEFAULT_RULES: Omit<AssignmentRule, 'id' | 'createdAt' | 'updatedAt' | 'matchCount'>[] = [
  {
    name: 'Daily Standup',
    description: 'Daily standup meetings',
    priority: 90,
    conditions: {
      titleContains: ['daily', 'standup', 'stand-up', 'scrum'],
      timeRange: { from: '08:30', to: '10:30' },
    },
    action: {
      ticketKey: '', // User must configure
      confidence: 0.85,
    },
    enabled: false, // Disabled until configured
  },
  {
    name: 'Slack Communication',
    description: 'Time spent on Slack',
    priority: 70,
    conditions: {
      app: ['slack', 'Slack'],
    },
    action: {
      ticketKey: '',
      confidence: 0.7,
    },
    enabled: false,
  },
  {
    name: 'Teams Meetings',
    description: 'Microsoft Teams meetings',
    priority: 80,
    conditions: {
      app: ['Microsoft Teams', 'teams'],
      titleContains: ['meeting', 'call', 'spotkanie'],
    },
    action: {
      ticketKey: '',
      confidence: 0.8,
    },
    enabled: false,
  },
  {
    name: 'Code Review',
    description: 'Code review activities',
    priority: 75,
    conditions: {
      titleContains: ['pull request', 'PR', 'code review', 'review', 'merge request'],
    },
    action: {
      ticketKey: '',
      confidence: 0.75,
    },
    enabled: false,
  },
  {
    name: 'Documentation',
    description: 'Documentation work',
    priority: 60,
    conditions: {
      titleContains: ['docs', 'documentation', 'readme', 'wiki', 'confluence'],
    },
    action: {
      ticketKey: '',
      confidence: 0.65,
    },
    enabled: false,
  },
];

// Generate unique ID
function generateId(): string {
  return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Get all rules from localStorage
export function getRules(): AssignmentRule[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(RULES_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }
  return [];
}

// Save rules to localStorage
export function saveRules(rules: AssignmentRule[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
}

// Initialize with default rules if empty
export function initializeDefaultRules(): AssignmentRule[] {
  const existing = getRules();
  if (existing.length > 0) return existing;

  const now = new Date().toISOString();
  const defaultWithIds: AssignmentRule[] = DEFAULT_RULES.map(rule => ({
    ...rule,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    matchCount: 0,
  }));

  saveRules(defaultWithIds);
  return defaultWithIds;
}

// Add a new rule
export function addRule(
  rule: Omit<AssignmentRule, 'id' | 'createdAt' | 'updatedAt' | 'matchCount'>
): AssignmentRule {
  const rules = getRules();
  const now = new Date().toISOString();

  const newRule: AssignmentRule = {
    ...rule,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    matchCount: 0,
  };

  rules.push(newRule);
  saveRules(rules);
  return newRule;
}

// Update an existing rule
export function updateRule(id: string, updates: Partial<AssignmentRule>): AssignmentRule | null {
  const rules = getRules();
  const index = rules.findIndex(r => r.id === id);

  if (index === -1) return null;

  rules[index] = {
    ...rules[index],
    ...updates,
    id: rules[index].id, // Preserve ID
    createdAt: rules[index].createdAt, // Preserve creation date
    updatedAt: new Date().toISOString(),
  };

  saveRules(rules);
  return rules[index];
}

// Delete a rule
export function deleteRule(id: string): boolean {
  const rules = getRules();
  const filtered = rules.filter(r => r.id !== id);

  if (filtered.length === rules.length) return false;

  saveRules(filtered);
  return true;
}

// Check if a condition matches an activity
function matchCondition(condition: RuleCondition, activity: Activity): boolean {
  // App match (case-insensitive)
  if (condition.app && condition.app.length > 0) {
    const appLower = activity.app.toLowerCase();
    const matched = condition.app.some(
      a => appLower.includes(a.toLowerCase()) || a.toLowerCase().includes(appLower)
    );
    if (!matched) return false;
  }

  // Title contains (case-insensitive)
  if (condition.titleContains && condition.titleContains.length > 0) {
    const titleLower = activity.title.toLowerCase();
    const matched = condition.titleContains.some(t => titleLower.includes(t.toLowerCase()));
    if (!matched) return false;
  }

  // Title regex
  if (condition.titleRegex) {
    try {
      const regex = new RegExp(condition.titleRegex, 'i');
      if (!regex.test(activity.title)) return false;
    } catch {
      // Invalid regex, skip this condition
    }
  }

  // Project name
  if (condition.projectName && condition.projectName.length > 0) {
    if (!activity.project) return false;
    const projectLower = activity.project.toLowerCase();
    const matched = condition.projectName.some(
      p => projectLower.includes(p.toLowerCase()) || p.toLowerCase().includes(projectLower)
    );
    if (!matched) return false;
  }

  // Time range
  if (condition.timeRange && activity.firstSeen) {
    const activityTime = activity.firstSeen.substring(11, 16); // Extract HH:MM
    if (activityTime < condition.timeRange.from || activityTime > condition.timeRange.to) {
      return false;
    }
  }

  // Day of week
  if (condition.dayOfWeek && condition.dayOfWeek.length > 0 && activity.firstSeen) {
    const date = new Date(activity.firstSeen);
    if (!condition.dayOfWeek.includes(date.getDay())) return false;
  }

  // Duration constraints
  if (condition.minDuration && activity.totalSeconds < condition.minDuration) return false;
  if (condition.maxDuration && activity.totalSeconds > condition.maxDuration) return false;

  return true;
}

// Match an activity against all rules
export function matchRule(activity: Activity): RuleMatchResult | null {
  const rules = getRules()
    .filter(r => r.enabled && r.action.ticketKey) // Only enabled rules with ticket
    .sort((a, b) => b.priority - a.priority); // Sort by priority (highest first)

  for (const rule of rules) {
    if (matchCondition(rule.conditions, activity)) {
      // Increment match count
      updateRule(rule.id, { matchCount: rule.matchCount + 1 });

      return {
        ticketKey: rule.action.ticketKey,
        ticketName: rule.action.ticketName,
        confidence: rule.action.confidence,
        source: 'rule',
        ruleName: rule.name,
        ruleId: rule.id,
      };
    }
  }

  return null;
}

// Match multiple activities at once (for batch processing)
export function matchRulesBatch(activities: Activity[]): Map<string, RuleMatchResult> {
  const results = new Map<string, RuleMatchResult>();

  for (const activity of activities) {
    const match = matchRule(activity);
    if (match) {
      results.set(activity.id, match);
    }
  }

  return results;
}

// Get rule statistics
export function getRuleStats(): {
  totalRules: number;
  enabledRules: number;
  totalMatches: number;
  topRules: Array<{ id: string; name: string; matchCount: number }>;
} {
  const rules = getRules();

  return {
    totalRules: rules.length,
    enabledRules: rules.filter(r => r.enabled).length,
    totalMatches: rules.reduce((sum, r) => sum + r.matchCount, 0),
    topRules: rules
      .sort((a, b) => b.matchCount - a.matchCount)
      .slice(0, 5)
      .map(r => ({ id: r.id, name: r.name, matchCount: r.matchCount })),
  };
}

// Export rules to JSON
export function exportRules(): string {
  return JSON.stringify(getRules(), null, 2);
}

// Import rules from JSON
export function importRules(json: string, merge: boolean = false): boolean {
  try {
    const imported = JSON.parse(json) as AssignmentRule[];

    if (!Array.isArray(imported)) return false;

    // Validate structure
    for (const rule of imported) {
      if (!rule.name || !rule.conditions || !rule.action) return false;
    }

    if (merge) {
      const existing = getRules();
      const existingIds = new Set(existing.map(r => r.id));
      const newRules = imported.filter(r => !existingIds.has(r.id));
      saveRules([...existing, ...newRules]);
    } else {
      saveRules(imported);
    }

    return true;
  } catch {
    return false;
  }
}

// Clear all rules
export function clearRules(): void {
  saveRules([]);
}
