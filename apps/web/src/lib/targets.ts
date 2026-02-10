// Time targets and holidays management
// Stored in localStorage for persistence

const TARGETS_KEY = 'timetracker_targets';
const HOLIDAYS_KEY = 'timetracker_holidays';
const TIME_OFF_KEY = 'timetracker_time_off';

// --- Time Targets ---

export interface TimeTargets {
  dailyHours: number;           // Target hours per day (default: 8)
  weeklyHours: number;          // Target hours per week (default: 40)
  workDays: number[];           // Working days (0=Sun, 1=Mon, ..., 6=Sat)
  flexibleHours: boolean;       // Allow overtime to compensate for undertime
  minimumDailyHours: number;    // Minimum hours to count as "worked" day
}

const DEFAULT_TARGETS: TimeTargets = {
  dailyHours: 8,
  weeklyHours: 40,
  workDays: [1, 2, 3, 4, 5],  // Mon-Fri
  flexibleHours: true,
  minimumDailyHours: 4,
};

export function getTimeTargets(): TimeTargets {
  if (typeof window === 'undefined') return DEFAULT_TARGETS;

  try {
    const data = localStorage.getItem(TARGETS_KEY);
    if (!data) return DEFAULT_TARGETS;
    return { ...DEFAULT_TARGETS, ...JSON.parse(data) };
  } catch {
    return DEFAULT_TARGETS;
  }
}

export function setTimeTargets(targets: Partial<TimeTargets>): void {
  if (typeof window === 'undefined') return;

  const current = getTimeTargets();
  const updated = { ...current, ...targets };
  localStorage.setItem(TARGETS_KEY, JSON.stringify(updated));
}

// --- Holidays ---

export interface Holiday {
  date: string;         // YYYY-MM-DD
  name: string;         // Holiday name
  isRecurring: boolean; // Repeats every year (e.g., Christmas)
}

// Polish national holidays (recurring)
const POLISH_HOLIDAYS: Holiday[] = [
  { date: '01-01', name: 'Nowy Rok', isRecurring: true },
  { date: '01-06', name: 'Trzech Króli', isRecurring: true },
  { date: '05-01', name: 'Święto Pracy', isRecurring: true },
  { date: '05-03', name: 'Święto Konstytucji 3 Maja', isRecurring: true },
  { date: '08-15', name: 'Wniebowzięcie NMP', isRecurring: true },
  { date: '11-01', name: 'Wszystkich Świętych', isRecurring: true },
  { date: '11-11', name: 'Święto Niepodległości', isRecurring: true },
  { date: '12-25', name: 'Boże Narodzenie', isRecurring: true },
  { date: '12-26', name: 'Drugi dzień Bożego Narodzenia', isRecurring: true },
];

export function getHolidays(): Holiday[] {
  if (typeof window === 'undefined') return POLISH_HOLIDAYS;

  try {
    const data = localStorage.getItem(HOLIDAYS_KEY);
    if (!data) return POLISH_HOLIDAYS;
    const custom = JSON.parse(data);
    return [...POLISH_HOLIDAYS, ...custom];
  } catch {
    return POLISH_HOLIDAYS;
  }
}

export function addHoliday(holiday: Holiday): void {
  if (typeof window === 'undefined') return;

  const holidays = getHolidays().filter(h =>
    h.date !== holiday.date || h.isRecurring !== holiday.isRecurring
  );
  const custom = holidays.filter(h => !POLISH_HOLIDAYS.some(p => p.date === h.date && p.isRecurring));
  custom.push(holiday);
  localStorage.setItem(HOLIDAYS_KEY, JSON.stringify(custom));
}

export function removeHoliday(date: string): void {
  if (typeof window === 'undefined') return;

  const holidays = getHolidays();
  const custom = holidays.filter(h =>
    h.date !== date && !POLISH_HOLIDAYS.some(p => p.date === h.date)
  );
  localStorage.setItem(HOLIDAYS_KEY, JSON.stringify(custom));
}

export function isHoliday(date: string): Holiday | null {
  const holidays = getHolidays();
  const dateObj = new Date(date);
  const monthDay = `${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;

  // Check recurring holidays
  const recurring = holidays.find(h => h.isRecurring && h.date === monthDay);
  if (recurring) return recurring;

  // Check specific date holidays
  return holidays.find(h => !h.isRecurring && h.date === date) || null;
}

// --- Time Off / Vacation ---

export interface TimeOff {
  id: string;
  startDate: string;    // YYYY-MM-DD
  endDate: string;      // YYYY-MM-DD
  type: 'vacation' | 'sick' | 'remote' | 'other';
  description?: string;
}

export function getTimeOffs(): TimeOff[] {
  if (typeof window === 'undefined') return [];

  try {
    const data = localStorage.getItem(TIME_OFF_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function addTimeOff(timeOff: Omit<TimeOff, 'id'>): void {
  if (typeof window === 'undefined') return;

  const timeOffs = getTimeOffs();
  const newTimeOff: TimeOff = {
    ...timeOff,
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  };
  timeOffs.push(newTimeOff);
  localStorage.setItem(TIME_OFF_KEY, JSON.stringify(timeOffs));
}

export function removeTimeOff(id: string): void {
  if (typeof window === 'undefined') return;

  const timeOffs = getTimeOffs().filter(t => t.id !== id);
  localStorage.setItem(TIME_OFF_KEY, JSON.stringify(timeOffs));
}

export function isTimeOff(date: string): TimeOff | null {
  const timeOffs = getTimeOffs();
  const dateObj = new Date(date);

  return timeOffs.find(t => {
    const start = new Date(t.startDate);
    const end = new Date(t.endDate);
    return dateObj >= start && dateObj <= end;
  }) || null;
}

// --- Day Status ---

export type DayStatus = 'workday' | 'weekend' | 'holiday' | 'vacation' | 'sick' | 'remote';

export function getDayStatus(date: string): DayStatus {
  const targets = getTimeTargets();
  const dateObj = new Date(date);
  const dayOfWeek = dateObj.getDay();

  // Check time off first
  const timeOff = isTimeOff(date);
  if (timeOff) {
    return timeOff.type === 'vacation' ? 'vacation' :
           timeOff.type === 'sick' ? 'sick' :
           timeOff.type === 'remote' ? 'remote' : 'vacation';
  }

  // Check holiday
  if (isHoliday(date)) {
    return 'holiday';
  }

  // Check if it's a work day
  if (!targets.workDays.includes(dayOfWeek)) {
    return 'weekend';
  }

  return 'workday';
}

export function isWorkDay(date: string): boolean {
  const status = getDayStatus(date);
  return status === 'workday' || status === 'remote';
}

// --- Target Calculations ---

export function getDailyTarget(date: string): number {
  const targets = getTimeTargets();
  const status = getDayStatus(date);

  if (status === 'workday' || status === 'remote') {
    return targets.dailyHours * 3600; // in seconds
  }

  return 0;
}

export function getWeeklyTarget(): number {
  const targets = getTimeTargets();
  return targets.weeklyHours * 3600; // in seconds
}

export function getMonthlyTarget(year: number, month: number): number {
  const targets = getTimeTargets();

  // Count work days in month
  let workDays = 0;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (isWorkDay(date)) {
      workDays++;
    }
  }

  return workDays * targets.dailyHours * 3600; // in seconds
}

// Calculate target achievement percentage
export function calculateAchievement(
  loggedSeconds: number,
  targetSeconds: number
): { percentage: number; status: 'over' | 'ok' | 'under' | 'warning' } {
  if (targetSeconds === 0) {
    return { percentage: loggedSeconds > 0 ? 100 : 0, status: 'ok' };
  }

  const percentage = Math.round((loggedSeconds / targetSeconds) * 100);

  let status: 'over' | 'ok' | 'under' | 'warning';
  if (percentage >= 100) {
    status = 'over';
  } else if (percentage >= 90) {
    status = 'ok';
  } else if (percentage >= 70) {
    status = 'warning';
  } else {
    status = 'under';
  }

  return { percentage, status };
}

// Export all data
export function exportTargetsData(): string {
  return JSON.stringify({
    targets: getTimeTargets(),
    holidays: getHolidays().filter(h => !POLISH_HOLIDAYS.some(p => p.date === h.date)),
    timeOffs: getTimeOffs(),
    exportedAt: new Date().toISOString()
  }, null, 2);
}

// Import data
export function importTargetsData(data: string): boolean {
  try {
    const parsed = JSON.parse(data);
    if (parsed.targets) {
      setTimeTargets(parsed.targets);
    }
    if (parsed.holidays) {
      localStorage.setItem(HOLIDAYS_KEY, JSON.stringify(parsed.holidays));
    }
    if (parsed.timeOffs) {
      localStorage.setItem(TIME_OFF_KEY, JSON.stringify(parsed.timeOffs));
    }
    return true;
  } catch {
    return false;
  }
}
