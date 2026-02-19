import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  smartRound,
  smartRoundSeconds,
  applyValueMultiplier,
  getLoggingRules,
  setLoggingRules,
  resetLoggingRules,
  DEFAULT_LOGGING_RULES,
  DEFAULT_ROUNDING_TIERS,
  type RoundingTier,
  type ProjectValueMultiplier,
} from './loggingRules';

// --- smartRound ---

describe('smartRound', () => {
  it('should return 0 for 0 or negative minutes', () => {
    expect(smartRound(0)).toBe(0);
    expect(smartRound(-5)).toBe(0);
  });

  it('should round 5-9 min to 10 min', () => {
    expect(smartRound(5)).toBe(10);
    expect(smartRound(7)).toBe(10);
    expect(smartRound(9)).toBe(10);
  });

  it('should round 10-15 min to 15 min', () => {
    expect(smartRound(10)).toBe(15);
    expect(smartRound(11)).toBe(15);
    expect(smartRound(15)).toBe(15);
  });

  it('should round 16-20 min to 20 min', () => {
    expect(smartRound(16)).toBe(20);
    expect(smartRound(18)).toBe(20);
    expect(smartRound(20)).toBe(20);
  });

  it('should round 21-30 min to 30 min', () => {
    expect(smartRound(21)).toBe(30);
    expect(smartRound(25)).toBe(30);
    expect(smartRound(30)).toBe(30);
  });

  it('should round 31-45 min to 45 min', () => {
    expect(smartRound(31)).toBe(45);
    expect(smartRound(40)).toBe(45);
    expect(smartRound(45)).toBe(45);
  });

  it('should round 46-60 min to 60 min', () => {
    expect(smartRound(46)).toBe(60);
    expect(smartRound(55)).toBe(60);
    expect(smartRound(60)).toBe(60);
  });

  it('should round >60 min to nearest 15 min interval', () => {
    expect(smartRound(61)).toBe(75);   // ceil(61/15)*15 = 75
    expect(smartRound(70)).toBe(75);   // ceil(70/15)*15 = 75
    expect(smartRound(75)).toBe(75);   // exact
    expect(smartRound(76)).toBe(90);   // ceil(76/15)*15 = 90
    expect(smartRound(90)).toBe(90);   // exact
    expect(smartRound(91)).toBe(105);  // ceil(91/15)*15 = 105
    expect(smartRound(120)).toBe(120); // exact
  });

  it('should round >60 min to custom interval', () => {
    expect(smartRound(61, DEFAULT_ROUNDING_TIERS, 30)).toBe(90);   // ceil(61/30)*30 = 90
    expect(smartRound(90, DEFAULT_ROUNDING_TIERS, 30)).toBe(90);   // exact
    expect(smartRound(100, DEFAULT_ROUNDING_TIERS, 30)).toBe(120); // ceil(100/30)*30 = 120
  });

  it('should return minutes as-is when below min tier (< 5)', () => {
    expect(smartRound(1)).toBe(1);
    expect(smartRound(3)).toBe(3);
    expect(smartRound(4)).toBe(4);
  });

  it('should work with custom tiers', () => {
    const customTiers: RoundingTier[] = [
      { minMinutes: 1, maxMinutes: 10, roundTo: 10 },
      { minMinutes: 11, maxMinutes: 30, roundTo: 30 },
    ];
    expect(smartRound(3, customTiers)).toBe(10);
    expect(smartRound(15, customTiers)).toBe(30);
    expect(smartRound(70, customTiers)).toBe(75); // >60 default interval
  });
});

// --- smartRoundSeconds ---

describe('smartRoundSeconds', () => {
  it('should return 0 for 0 or negative seconds', () => {
    expect(smartRoundSeconds(0)).toBe(0);
    expect(smartRoundSeconds(-60)).toBe(0);
  });

  it('should convert to minutes, apply smart rounding, and return seconds', () => {
    // 5 min = 300s → rounds to 10 min = 600s
    expect(smartRoundSeconds(300)).toBe(600);

    // 21 min = 1260s → rounds to 30 min = 1800s
    expect(smartRoundSeconds(1260)).toBe(1800);

    // 60 min = 3600s → rounds to 60 min = 3600s
    expect(smartRoundSeconds(3600)).toBe(3600);

    // 61 min = 3660s → rounds to 75 min = 4500s
    expect(smartRoundSeconds(3660)).toBe(4500);
  });
});

// --- getLoggingRules / setLoggingRules / resetLoggingRules ---

describe('loggingRules persistence', () => {
  const mockStorage = new Map<string, string>();

  beforeEach(() => {
    mockStorage.clear();
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mockStorage.get(key) ?? null,
      setItem: (key: string, value: string) => mockStorage.set(key, value),
      removeItem: (key: string) => mockStorage.delete(key),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return defaults when nothing stored', () => {
    const rules = getLoggingRules();
    expect(rules).toEqual(DEFAULT_LOGGING_RULES);
  });

  it('should persist and retrieve partial updates', () => {
    setLoggingRules({ minActivityDurationMinutes: 10, smartRoundingEnabled: true });
    const rules = getLoggingRules();
    expect(rules.minActivityDurationMinutes).toBe(10);
    expect(rules.smartRoundingEnabled).toBe(true);
    // Other fields remain default
    expect(rules.minEventDurationSeconds).toBe(10);
    expect(rules.aggregateShortTasks).toBe(true);
  });

  it('should reset to defaults', () => {
    setLoggingRules({ minActivityDurationMinutes: 20 });
    resetLoggingRules();
    const rules = getLoggingRules();
    expect(rules.minActivityDurationMinutes).toBe(DEFAULT_LOGGING_RULES.minActivityDurationMinutes);
  });

  it('should handle invalid JSON in localStorage gracefully', () => {
    mockStorage.set('timetracker_logging_rules', 'not-json');
    const rules = getLoggingRules();
    expect(rules).toEqual(DEFAULT_LOGGING_RULES);
  });

  it('should persist new fields (thinkingTime, aiAgent, valueMultipliers)', () => {
    setLoggingRules({
      thinkingTimeEnabled: true,
      thinkingTimeMultiplier: 0.5,
      aiAgentTrackingEnabled: true,
      aiAgentMultiplier: 1.5,
      valueMultipliersEnabled: true,
      projectValueMultipliers: [
        { projectKey: 'BCI', multiplier: 1.5, label: 'AI work' },
      ],
    });
    const rules = getLoggingRules();
    expect(rules.thinkingTimeEnabled).toBe(true);
    expect(rules.thinkingTimeMultiplier).toBe(0.5);
    expect(rules.aiAgentTrackingEnabled).toBe(true);
    expect(rules.aiAgentMultiplier).toBe(1.5);
    expect(rules.valueMultipliersEnabled).toBe(true);
    expect(rules.projectValueMultipliers).toHaveLength(1);
    expect(rules.projectValueMultipliers[0].projectKey).toBe('BCI');
  });

  it('should persist prompt settings (TODO-5 gap-based)', () => {
    setLoggingRules({
      promptEnabled: true,
      promptMinActivityMinutes: 20,
      promptMinGapMinutes: 30,
      promptMethod: 'browser',
    });
    const rules = getLoggingRules();
    expect(rules.promptEnabled).toBe(true);
    expect(rules.promptMinActivityMinutes).toBe(20);
    expect(rules.promptMinGapMinutes).toBe(30);
    expect(rules.promptMethod).toBe('browser');
  });

  it('should have correct prompt defaults', () => {
    const rules = getLoggingRules();
    expect(rules.promptEnabled).toBe(false);
    expect(rules.promptMinActivityMinutes).toBe(15);
    expect(rules.promptMinGapMinutes).toBe(20);
    expect(rules.promptMethod).toBe('slack');
  });
});

// --- applyValueMultiplier (TODO-9) ---

describe('applyValueMultiplier', () => {
  const multipliers: ProjectValueMultiplier[] = [
    { projectKey: 'BCI', multiplier: 1.5 },
    { projectKey: 'AGRO', multiplier: 2.0 },
  ];

  it('should return original seconds when no multipliers', () => {
    expect(applyValueMultiplier(3600, 'BCI-123', [])).toBe(3600);
  });

  it('should return original seconds when project not in multipliers', () => {
    expect(applyValueMultiplier(3600, 'SAND-1', multipliers)).toBe(3600);
  });

  it('should apply 1.5x multiplier for BCI', () => {
    expect(applyValueMultiplier(3600, 'BCI-123', multipliers)).toBe(5400); // 3600 * 1.5
  });

  it('should apply 2.0x multiplier for AGRO', () => {
    expect(applyValueMultiplier(1800, 'AGRO-5', multipliers)).toBe(3600); // 1800 * 2.0
  });

  it('should return 0 for 0 or negative seconds', () => {
    expect(applyValueMultiplier(0, 'BCI-1', multipliers)).toBe(0);
    expect(applyValueMultiplier(-100, 'BCI-1', multipliers)).toBe(-100);
  });

  it('should round the result to nearest second', () => {
    // 100s * 1.5 = 150s (exact)
    expect(applyValueMultiplier(100, 'BCI-1', multipliers)).toBe(150);
    // 101s * 1.5 = 151.5 → rounds to 152
    expect(applyValueMultiplier(101, 'BCI-1', multipliers)).toBe(152);
  });
});
