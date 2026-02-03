// Types for Compare view (ActivityWatch vs Tempo)

export interface WorklogSummary {
  key: string;
  minutes: number;
  description?: string;
}

export interface ActivitySummary {
  app: string;
  title: string;
  minutes: number;
  category: string;
  isMeeting?: boolean;
}

export interface DayComparison {
  date: string;
  dayName: string;
  isWeekend: boolean;

  aw: {
    totalMinutes: number;
    topApps: { app: string; minutes: number }[];
    activities: ActivitySummary[];
    meetings: { title: string; minutes: number }[];
  };

  tempo: {
    totalMinutes: number;
    worklogs: WorklogSummary[];
  };

  gap: {
    minutes: number;
    status: 'ok' | 'warning' | 'missing';
  };
}

export interface WeekSummary {
  weekNumber: number;
  startDate: string;
  endDate: string;
  awTotalMinutes: number;
  tempoTotalMinutes: number;
  gapMinutes: number;
  days: DayComparison[];
}

export interface CompareRangeResponse {
  fromDate: string;
  toDate: string;
  days: DayComparison[];
  weeks: WeekSummary[];
  summary: {
    totalAwMinutes: number;
    totalTempoMinutes: number;
    totalGapMinutes: number;
    daysWithGaps: number;
    daysOk: number;
  };
}

export type GapStatus = 'ok' | 'warning' | 'missing';

export function getGapStatus(gapMinutes: number): GapStatus {
  if (gapMinutes <= 30) return 'ok';
  if (gapMinutes <= 60) return 'warning';
  return 'missing';
}

export function formatMinutes(minutes: number): string {
  const hours = Math.floor(Math.abs(minutes) / 60);
  const mins = Math.abs(minutes) % 60;
  const sign = minutes < 0 ? '-' : '';

  if (hours === 0) return `${sign}${mins}m`;
  if (mins === 0) return `${sign}${hours}h`;
  return `${sign}${hours}h ${mins}m`;
}
