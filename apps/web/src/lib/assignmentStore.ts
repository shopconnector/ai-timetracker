// Assignment Store - localStorage persistence for ticket assignments
// Survives page refresh, keyed by date + activityId

const STORAGE_KEY = 'timetracker_assignments';
const MAX_DAYS = 60; // Auto-cleanup older than 60 days

export interface Assignment {
  ticketKey: string;
  confidence: number;
  source: 'history' | 'project_mapping' | 'manual' | 'tempo_match';
}

export type DayAssignments = Record<string, Assignment>; // activityId → Assignment
type AllAssignments = Record<string, DayAssignments>; // date → DayAssignments

function loadAll(): AllAssignments {
  if (typeof window === 'undefined') return {};
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return {};
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function saveAll(assignments: AllAssignments): void {
  if (typeof window === 'undefined') return;

  // Cleanup: keep only last MAX_DAYS days
  const dates = Object.keys(assignments).sort();
  if (dates.length > MAX_DAYS) {
    const toRemove = dates.slice(0, dates.length - MAX_DAYS);
    for (const date of toRemove) {
      delete assignments[date];
    }
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
}

// Get assignments for a specific date
export function getAssignments(date: string): DayAssignments {
  const all = loadAll();
  return all[date] || {};
}

// Set a single assignment
export function setAssignment(date: string, activityId: string, assignment: Assignment): void {
  const all = loadAll();
  if (!all[date]) all[date] = {};
  all[date][activityId] = assignment;
  saveAll(all);
}

// Remove a single assignment
export function removeAssignment(date: string, activityId: string): void {
  const all = loadAll();
  if (all[date]) {
    delete all[date][activityId];
    if (Object.keys(all[date]).length === 0) {
      delete all[date];
    }
    saveAll(all);
  }
}

// Get all assignments (all dates)
export function getAllAssignments(): AllAssignments {
  return loadAll();
}

// Set all assignments for a day (batch)
export function setDayAssignments(date: string, assignments: DayAssignments): void {
  const all = loadAll();
  all[date] = assignments;
  saveAll(all);
}

// Merge assignments for a day (don't overwrite existing manual assignments)
export function mergeDayAssignments(date: string, newAssignments: DayAssignments): void {
  const all = loadAll();
  const existing = all[date] || {};

  for (const [activityId, assignment] of Object.entries(newAssignments)) {
    // Don't overwrite manual assignments
    if (existing[activityId]?.source === 'manual') continue;
    // Don't overwrite tempo_match with lower confidence
    if (existing[activityId]?.source === 'tempo_match' && assignment.source !== 'tempo_match')
      continue;
    existing[activityId] = assignment;
  }

  all[date] = existing;
  saveAll(all);
}

// Get stats about stored assignments
export function getAssignmentStats(): {
  totalDays: number;
  totalAssignments: number;
  bySource: Record<string, number>;
} {
  const all = loadAll();
  const bySource: Record<string, number> = {};
  let totalAssignments = 0;

  for (const dayAssignments of Object.values(all)) {
    for (const assignment of Object.values(dayAssignments)) {
      totalAssignments++;
      bySource[assignment.source] = (bySource[assignment.source] || 0) + 1;
    }
  }

  return {
    totalDays: Object.keys(all).length,
    totalAssignments,
    bySource,
  };
}
