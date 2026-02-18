import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getTimeTargets,
  setTimeTargets,
  getHolidays,
  addHoliday,
  removeHoliday,
  isHoliday,
  getTimeOffs,
  addTimeOff,
  removeTimeOff,
  isTimeOff,
  getDayStatus,
  isWorkDay,
  getDailyTarget,
  getWeeklyTarget,
  getMonthlyTarget,
  calculateAchievement,
  exportTargetsData,
  importTargetsData,
} from './targets';

// --- localStorage mock ---

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get _store() { return store; },
  };
})();

beforeEach(() => {
  // Make `typeof window !== 'undefined'` true and provide localStorage
  vi.stubGlobal('window', { localStorage: localStorageMock });
  vi.stubGlobal('localStorage', localStorageMock);
  localStorageMock.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// --- Tests ---

describe('getTimeTargets', () => {
  it('should return defaults when localStorage is empty', () => {
    const targets = getTimeTargets();
    expect(targets.dailyHours).toBe(8);
    expect(targets.weeklyHours).toBe(40);
    expect(targets.workDays).toEqual([1, 2, 3, 4, 5]);
    expect(targets.flexibleHours).toBe(true);
    expect(targets.minimumDailyHours).toBe(4);
  });

  it('should merge stored partial with defaults', () => {
    localStorageMock.setItem('timetracker_targets', JSON.stringify({ dailyHours: 6 }));
    const targets = getTimeTargets();
    expect(targets.dailyHours).toBe(6);
    expect(targets.weeklyHours).toBe(40); // default preserved
  });

  it('should handle corrupted localStorage gracefully', () => {
    localStorageMock.setItem('timetracker_targets', 'not-json');
    const targets = getTimeTargets();
    expect(targets.dailyHours).toBe(8); // falls back to defaults
  });
});

describe('setTimeTargets', () => {
  it('should save merged targets to localStorage', () => {
    setTimeTargets({ dailyHours: 7, weeklyHours: 35 });
    const stored = JSON.parse(localStorageMock._store['timetracker_targets']);
    expect(stored.dailyHours).toBe(7);
    expect(stored.weeklyHours).toBe(35);
    expect(stored.workDays).toEqual([1, 2, 3, 4, 5]); // default merged in
  });

  it('should preserve existing values for unspecified fields', () => {
    setTimeTargets({ dailyHours: 6 });
    setTimeTargets({ weeklyHours: 30 });
    const stored = JSON.parse(localStorageMock._store['timetracker_targets']);
    expect(stored.dailyHours).toBe(6);
    expect(stored.weeklyHours).toBe(30);
  });
});

describe('getHolidays', () => {
  it('should return Polish holidays by default', () => {
    const holidays = getHolidays();
    expect(holidays.length).toBeGreaterThanOrEqual(9);
    expect(holidays.find(h => h.name === 'Nowy Rok')).toBeDefined();
    expect(holidays.find(h => h.name === 'Boże Narodzenie')).toBeDefined();
  });

  it('should include custom holidays alongside Polish defaults', () => {
    const custom = [{ date: '2024-06-15', name: 'Company Day', isRecurring: false }];
    localStorageMock.setItem('timetracker_holidays', JSON.stringify(custom));
    const holidays = getHolidays();
    expect(holidays.find(h => h.name === 'Company Day')).toBeDefined();
    expect(holidays.find(h => h.name === 'Nowy Rok')).toBeDefined();
  });
});

describe('addHoliday', () => {
  it('should add a custom holiday', () => {
    addHoliday({ date: '2024-07-04', name: 'Independence Day', isRecurring: false });
    const stored = JSON.parse(localStorageMock._store['timetracker_holidays']);
    expect(stored.find((h: { name: string }) => h.name === 'Independence Day')).toBeDefined();
  });

  it('should replace existing holiday with same date', () => {
    addHoliday({ date: '2024-07-04', name: 'Old', isRecurring: false });
    addHoliday({ date: '2024-07-04', name: 'New', isRecurring: false });
    const stored = JSON.parse(localStorageMock._store['timetracker_holidays']);
    const matching = stored.filter((h: { date: string }) => h.date === '2024-07-04');
    expect(matching).toHaveLength(1);
    expect(matching[0].name).toBe('New');
  });
});

describe('removeHoliday', () => {
  it('should remove a custom holiday by date', () => {
    addHoliday({ date: '2024-07-04', name: 'Independence Day', isRecurring: false });
    removeHoliday('2024-07-04');
    const stored = JSON.parse(localStorageMock._store['timetracker_holidays']);
    expect(stored.find((h: { date: string }) => h.date === '2024-07-04')).toBeUndefined();
  });
});

describe('isHoliday', () => {
  it('should detect recurring Polish holiday (Christmas)', () => {
    const result = isHoliday('2024-12-25');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Boże Narodzenie');
  });

  it('should detect recurring holiday regardless of year', () => {
    expect(isHoliday('2025-01-01')?.name).toBe('Nowy Rok');
    expect(isHoliday('2030-01-01')?.name).toBe('Nowy Rok');
  });

  it('should detect specific-date custom holiday', () => {
    addHoliday({ date: '2024-06-15', name: 'Team Day', isRecurring: false });
    expect(isHoliday('2024-06-15')?.name).toBe('Team Day');
  });

  it('should return null for non-holiday workday', () => {
    // 2024-01-15 is a Monday, no holiday
    expect(isHoliday('2024-01-15')).toBeNull();
  });

  it('should return null for weekend (not a holiday)', () => {
    // 2024-01-13 is a Saturday, not a holiday
    expect(isHoliday('2024-01-13')).toBeNull();
  });
});

describe('getTimeOffs / addTimeOff / removeTimeOff', () => {
  it('should return empty array by default', () => {
    expect(getTimeOffs()).toEqual([]);
  });

  it('should add time off with auto-generated id', () => {
    addTimeOff({ startDate: '2024-07-01', endDate: '2024-07-14', type: 'vacation', description: 'Summer break' });
    const timeOffs = getTimeOffs();
    expect(timeOffs).toHaveLength(1);
    expect(timeOffs[0].type).toBe('vacation');
    expect(timeOffs[0].id).toBeTruthy();
  });

  it('should remove time off by id', () => {
    addTimeOff({ startDate: '2024-07-01', endDate: '2024-07-14', type: 'vacation' });
    const timeOffs = getTimeOffs();
    removeTimeOff(timeOffs[0].id);
    expect(getTimeOffs()).toHaveLength(0);
  });
});

describe('isTimeOff', () => {
  it('should return time off for date within range', () => {
    addTimeOff({ startDate: '2024-07-01', endDate: '2024-07-14', type: 'vacation' });
    const result = isTimeOff('2024-07-05');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('vacation');
  });

  it('should include start and end dates', () => {
    addTimeOff({ startDate: '2024-07-01', endDate: '2024-07-03', type: 'sick' });
    expect(isTimeOff('2024-07-01')).not.toBeNull();
    expect(isTimeOff('2024-07-03')).not.toBeNull();
  });

  it('should return null for date outside range', () => {
    addTimeOff({ startDate: '2024-07-01', endDate: '2024-07-14', type: 'vacation' });
    expect(isTimeOff('2024-06-30')).toBeNull();
    expect(isTimeOff('2024-07-15')).toBeNull();
  });
});

describe('getDayStatus', () => {
  it('should return "workday" for regular Monday', () => {
    // 2024-01-15 is a Monday
    expect(getDayStatus('2024-01-15')).toBe('workday');
  });

  it('should return "weekend" for Saturday', () => {
    // 2024-01-13 is a Saturday
    expect(getDayStatus('2024-01-13')).toBe('weekend');
  });

  it('should return "weekend" for Sunday', () => {
    // 2024-01-14 is a Sunday
    expect(getDayStatus('2024-01-14')).toBe('weekend');
  });

  it('should return "holiday" for Polish holiday', () => {
    // 2024-12-25 is Christmas (Wednesday)
    expect(getDayStatus('2024-12-25')).toBe('holiday');
  });

  it('should return "vacation" for vacation time off', () => {
    addTimeOff({ startDate: '2024-01-15', endDate: '2024-01-19', type: 'vacation' });
    expect(getDayStatus('2024-01-15')).toBe('vacation');
  });

  it('should return "sick" for sick leave', () => {
    addTimeOff({ startDate: '2024-01-15', endDate: '2024-01-15', type: 'sick' });
    expect(getDayStatus('2024-01-15')).toBe('sick');
  });

  it('should return "remote" for remote work day', () => {
    addTimeOff({ startDate: '2024-01-15', endDate: '2024-01-15', type: 'remote' });
    expect(getDayStatus('2024-01-15')).toBe('remote');
  });

  it('should prioritize time off over holiday', () => {
    addTimeOff({ startDate: '2024-12-25', endDate: '2024-12-25', type: 'sick' });
    expect(getDayStatus('2024-12-25')).toBe('sick');
  });

  it('should return "vacation" for "other" type time off', () => {
    addTimeOff({ startDate: '2024-01-15', endDate: '2024-01-15', type: 'other' });
    expect(getDayStatus('2024-01-15')).toBe('vacation');
  });
});

describe('isWorkDay', () => {
  it('should return true for regular workday', () => {
    expect(isWorkDay('2024-01-15')).toBe(true); // Monday
  });

  it('should return true for remote day', () => {
    addTimeOff({ startDate: '2024-01-15', endDate: '2024-01-15', type: 'remote' });
    expect(isWorkDay('2024-01-15')).toBe(true);
  });

  it('should return false for weekend', () => {
    expect(isWorkDay('2024-01-13')).toBe(false); // Saturday
  });

  it('should return false for holiday', () => {
    expect(isWorkDay('2024-12-25')).toBe(false);
  });

  it('should return false for vacation', () => {
    addTimeOff({ startDate: '2024-01-15', endDate: '2024-01-15', type: 'vacation' });
    expect(isWorkDay('2024-01-15')).toBe(false);
  });
});

describe('getDailyTarget', () => {
  it('should return 8h in seconds for workday', () => {
    expect(getDailyTarget('2024-01-15')).toBe(8 * 3600); // Monday
  });

  it('should return 0 for weekend', () => {
    expect(getDailyTarget('2024-01-13')).toBe(0); // Saturday
  });

  it('should return 0 for holiday', () => {
    expect(getDailyTarget('2024-12-25')).toBe(0);
  });

  it('should return target for remote day', () => {
    addTimeOff({ startDate: '2024-01-15', endDate: '2024-01-15', type: 'remote' });
    expect(getDailyTarget('2024-01-15')).toBe(8 * 3600);
  });

  it('should use custom daily hours', () => {
    setTimeTargets({ dailyHours: 6 });
    expect(getDailyTarget('2024-01-15')).toBe(6 * 3600);
  });
});

describe('getWeeklyTarget', () => {
  it('should return 40h in seconds by default', () => {
    expect(getWeeklyTarget()).toBe(40 * 3600);
  });

  it('should use custom weekly hours', () => {
    setTimeTargets({ weeklyHours: 35 });
    expect(getWeeklyTarget()).toBe(35 * 3600);
  });
});

describe('getMonthlyTarget', () => {
  it('should calculate work days in January 2024', () => {
    // January 2024: 23 work days (Mon-Fri), minus 1 holiday (Jan 1)
    // So 22 work days × 8h × 3600 = 633600
    const target = getMonthlyTarget(2024, 0); // month 0 = January
    // Jan 1 is holiday, Jan 6 (Sat) is already weekend
    // Work days: 2,3,4,5, 8-12, 15-19, 22-26, 29-31 = 22 days
    expect(target).toBe(22 * 8 * 3600);
  });

  it('should account for holidays reducing work days', () => {
    // December 2024: 22 weekdays, minus Dec 25+26 holidays = 20 work days
    const target = getMonthlyTarget(2024, 11); // month 11 = December
    expect(target).toBe(20 * 8 * 3600);
  });
});

describe('calculateAchievement', () => {
  it('should return 100% for exact match', () => {
    const result = calculateAchievement(28800, 28800);
    expect(result.percentage).toBe(100);
    expect(result.status).toBe('over');
  });

  it('should return "over" for >= 100%', () => {
    const result = calculateAchievement(32000, 28800);
    expect(result.status).toBe('over');
    expect(result.percentage).toBeGreaterThan(100);
  });

  it('should return "ok" for 90-99%', () => {
    // 90% of 28800 = 25920
    const result = calculateAchievement(25920, 28800);
    expect(result.percentage).toBe(90);
    expect(result.status).toBe('ok');
  });

  it('should return "warning" for 70-89%', () => {
    // 75% of 28800 = 21600
    const result = calculateAchievement(21600, 28800);
    expect(result.percentage).toBe(75);
    expect(result.status).toBe('warning');
  });

  it('should return "under" for < 70%', () => {
    // 50% of 28800 = 14400
    const result = calculateAchievement(14400, 28800);
    expect(result.percentage).toBe(50);
    expect(result.status).toBe('under');
  });

  it('should return 0% and "ok" for zero target with no logged time', () => {
    const result = calculateAchievement(0, 0);
    expect(result.percentage).toBe(0);
    expect(result.status).toBe('ok');
  });

  it('should return 100% and "ok" for zero target with some logged time', () => {
    const result = calculateAchievement(3600, 0);
    expect(result.percentage).toBe(100);
    expect(result.status).toBe('ok');
  });

  it('should round percentage to nearest integer', () => {
    // 1/3 = 33.33...%
    const result = calculateAchievement(10000, 30000);
    expect(result.percentage).toBe(33);
  });
});

describe('exportTargetsData', () => {
  it('should export JSON with targets, holidays, and time offs', () => {
    setTimeTargets({ dailyHours: 7 });
    addTimeOff({ startDate: '2024-07-01', endDate: '2024-07-14', type: 'vacation' });

    const exported = exportTargetsData();
    const parsed = JSON.parse(exported);

    expect(parsed.targets.dailyHours).toBe(7);
    expect(parsed.timeOffs).toHaveLength(1);
    expect(parsed.exportedAt).toBeTruthy();
  });

  it('should not include built-in Polish holidays in export', () => {
    const exported = exportTargetsData();
    const parsed = JSON.parse(exported);
    // Polish holidays are filtered out from export
    expect(parsed.holidays).toEqual([]);
  });
});

describe('importTargetsData', () => {
  it('should import valid data and return true', () => {
    const data = JSON.stringify({
      targets: { dailyHours: 6, weeklyHours: 30 },
      holidays: [{ date: '2024-06-15', name: 'Custom', isRecurring: false }],
      timeOffs: [{ id: '1', startDate: '2024-07-01', endDate: '2024-07-14', type: 'vacation' }],
    });

    expect(importTargetsData(data)).toBe(true);
    expect(getTimeTargets().dailyHours).toBe(6);
    expect(getTimeOffs()).toHaveLength(1);
  });

  it('should return false for invalid JSON', () => {
    expect(importTargetsData('not-json')).toBe(false);
  });

  it('should handle partial import (targets only)', () => {
    const data = JSON.stringify({ targets: { dailyHours: 5 } });
    expect(importTargetsData(data)).toBe(true);
    expect(getTimeTargets().dailyHours).toBe(5);
  });
});
