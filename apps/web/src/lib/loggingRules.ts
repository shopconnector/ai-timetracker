// Logging rules configuration
// Stored in localStorage for persistence (client-side)
// Used by activitywatch.ts, tempo.ts, and generate-note route

const LOGGING_RULES_KEY = 'timetracker_logging_rules';

// --- Rounding Tiers ---

export interface RoundingTier {
  minMinutes: number;  // inclusive
  maxMinutes: number;  // inclusive
  roundTo: number;     // round to this many minutes
}

export const DEFAULT_ROUNDING_TIERS: RoundingTier[] = [
  { minMinutes: 5, maxMinutes: 9, roundTo: 10 },
  { minMinutes: 10, maxMinutes: 15, roundTo: 15 },
  { minMinutes: 16, maxMinutes: 20, roundTo: 20 },
  { minMinutes: 21, maxMinutes: 30, roundTo: 30 },
  { minMinutes: 31, maxMinutes: 45, roundTo: 45 },
  { minMinutes: 46, maxMinutes: 60, roundTo: 60 },
];

// --- Value Multiplier per Project ---

export interface ProjectValueMultiplier {
  projectKey: string;   // Jira project key (e.g., 'BCI', 'AGRO')
  multiplier: number;   // e.g., 1.5 = 1h work → 1.5h in log
  label?: string;       // Optional display label
}

// --- Logging Rules ---

export interface LoggingRules {
  // TODO-1: Minimum activity duration
  minActivityDurationMinutes: number;  // default: 5 min
  minEventDurationSeconds: number;     // default: 10s (AW event filter)

  // TODO-2: Smart rounding
  smartRoundingEnabled: boolean;       // default: false
  roundingTiers: RoundingTier[];       // default: DEFAULT_ROUNDING_TIERS
  roundingAbove60Interval: number;     // for >60min, round to nearest N minutes (default: 15)

  // TODO-3: Short task aggregation
  aggregateShortTasks: boolean;        // default: true
  aggregationThresholdMinutes: number; // if sum of rejected tasks > this, aggregate (default: 15)

  // TODO-7: Thinking time estimation
  thinkingTimeEnabled: boolean;           // default: false
  thinkingTimeGapMinMin: number;          // min gap between same-project activities (default: 5)
  thinkingTimeGapMaxMin: number;          // max gap to consider as thinking (default: 15)
  thinkingTimeMultiplier: number;         // 0 = off, 0.5 = half, 1.0 = full gap time (default: 1.0)

  // TODO-8: AI agent time tracking
  aiAgentTrackingEnabled: boolean;        // default: false
  aiAgentMultiplier: number;              // multiplier for AI agent time (default: 1.0)

  // TODO-9: Value-based time adjustment
  valueMultipliersEnabled: boolean;       // default: false
  projectValueMultipliers: ProjectValueMultiplier[]; // per-project multipliers

  // TODO-5: Real-time prompting (gap-based, not clock-based)
  promptEnabled: boolean;                 // default: false
  promptMinActivityMinutes: number;       // min activity duration before prompting (default: 15)
  promptMinGapMinutes: number;            // min gap/break after activity to trigger prompt (default: 20)
  promptMethod: 'slack' | 'browser';      // notification channel (default: 'slack')
}

export const DEFAULT_LOGGING_RULES: LoggingRules = {
  minActivityDurationMinutes: 5,
  minEventDurationSeconds: 10,
  smartRoundingEnabled: false,
  roundingTiers: DEFAULT_ROUNDING_TIERS,
  roundingAbove60Interval: 15,
  aggregateShortTasks: true,
  aggregationThresholdMinutes: 15,
  // Thinking time
  thinkingTimeEnabled: false,
  thinkingTimeGapMinMin: 5,
  thinkingTimeGapMaxMin: 15,
  thinkingTimeMultiplier: 1.0,
  // AI agent tracking
  aiAgentTrackingEnabled: false,
  aiAgentMultiplier: 1.0,
  // Value multipliers
  valueMultipliersEnabled: false,
  projectValueMultipliers: [],
  // Real-time prompting
  promptEnabled: false,
  promptMinActivityMinutes: 15,
  promptMinGapMinutes: 20,
  promptMethod: 'slack',
};

export function getLoggingRules(): LoggingRules {
  if (typeof window === 'undefined') return DEFAULT_LOGGING_RULES;

  try {
    const data = localStorage.getItem(LOGGING_RULES_KEY);
    if (!data) return DEFAULT_LOGGING_RULES;
    return { ...DEFAULT_LOGGING_RULES, ...JSON.parse(data) };
  } catch {
    return DEFAULT_LOGGING_RULES;
  }
}

export function setLoggingRules(rules: Partial<LoggingRules>): void {
  if (typeof window === 'undefined') return;

  const current = getLoggingRules();
  const updated = { ...current, ...rules };
  localStorage.setItem(LOGGING_RULES_KEY, JSON.stringify(updated));
}

export function resetLoggingRules(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LOGGING_RULES_KEY);
}

// --- Smart Rounding Function ---

/**
 * Smart round minutes based on configurable tiers.
 * Example tiers: 5→10, 11→15, 16→20, 21→30, 31→45, 45→60, >60 per 15min
 */
export function smartRound(
  minutes: number,
  tiers: RoundingTier[] = DEFAULT_ROUNDING_TIERS,
  above60Interval: number = 15
): number {
  if (minutes <= 0) return 0;

  // Find matching tier
  for (const tier of tiers) {
    if (minutes >= tier.minMinutes && minutes <= tier.maxMinutes) {
      return tier.roundTo;
    }
  }

  // Above max tier: round up to nearest interval
  if (minutes > 60) {
    return Math.ceil(minutes / above60Interval) * above60Interval;
  }

  // Below min tier (< 5 min): return as-is (will be filtered by min duration)
  return minutes;
}

/**
 * Apply smart rounding to seconds value.
 * Returns rounded seconds (always in multiples of 60 for Tempo compatibility).
 */
export function smartRoundSeconds(
  seconds: number,
  tiers: RoundingTier[] = DEFAULT_ROUNDING_TIERS,
  above60Interval: number = 15
): number {
  if (seconds <= 0) return 0;
  const minutes = seconds / 60;
  const roundedMinutes = smartRound(minutes, tiers, above60Interval);
  return roundedMinutes * 60;
}

// --- TODO-9: Value Multiplier ---

/**
 * Apply value multiplier for a given project key.
 * Returns adjusted seconds.
 */
export function applyValueMultiplier(
  seconds: number,
  issueKey: string,
  multipliers: ProjectValueMultiplier[]
): number {
  if (seconds <= 0 || multipliers.length === 0) return seconds;

  const projectKey = issueKey.split('-')[0];
  const match = multipliers.find(m => m.projectKey === projectKey);
  if (!match || match.multiplier === 1.0) return seconds;

  return Math.round(seconds * match.multiplier);
}
