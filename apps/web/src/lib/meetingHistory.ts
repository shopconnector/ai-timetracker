/**
 * Meeting history storage for recurring meeting -> ticket associations
 * Stores patterns in localStorage for suggesting tickets for similar meetings
 */

import { normalizeMeetingTitle } from './textSimilarity';

const STORAGE_KEY = 'timetracker_meeting_history';
const MAX_ENTRIES = 100;

export interface MeetingHistoryEntry {
  meetingPattern: string; // Normalized meeting identifier
  platform?: string; // Google Meet, Zoom, Teams, etc.
  ticketKey: string;
  ticketName?: string;
  lastUsed: string; // ISO date
  useCount: number;
}

interface MeetingHistoryStore {
  entries: MeetingHistoryEntry[];
  version: number;
}

/**
 * Load meeting history from localStorage
 */
function loadHistory(): MeetingHistoryStore {
  if (typeof window === 'undefined') {
    return { entries: [], version: 1 };
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored) as MeetingHistoryStore;
      return data;
    }
  } catch (error) {
    console.error('Failed to load meeting history:', error);
  }

  return { entries: [], version: 1 };
}

/**
 * Save meeting history to localStorage
 */
function saveHistory(store: MeetingHistoryStore): void {
  if (typeof window === 'undefined') return;

  try {
    // Limit entries to prevent localStorage overflow
    if (store.entries.length > MAX_ENTRIES) {
      // Sort by lastUsed descending, keep most recent
      store.entries.sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime());
      store.entries = store.entries.slice(0, MAX_ENTRIES);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    console.error('Failed to save meeting history:', error);
  }
}

/**
 * Create consistent pattern from meeting title and platform
 */
export function createMeetingPattern(title: string, platform?: string): string {
  const normalized = normalizeMeetingTitle(title);

  // Add platform prefix for uniqueness
  const platformPrefix = platform ? `${platform.toLowerCase()}:` : '';

  return `${platformPrefix}${normalized}`;
}

/**
 * Get suggested ticket for a meeting based on history
 */
export function getSuggestedTicketForMeeting(
  meetingTitle: string,
  platform?: string
): { ticketKey: string; ticketName?: string; confidence: number } | null {
  const history = loadHistory();
  const pattern = createMeetingPattern(meetingTitle, platform);

  // First try exact pattern match
  const exactMatch = history.entries.find(e => e.meetingPattern === pattern);
  if (exactMatch) {
    // Confidence based on use count
    const confidence = Math.min(0.95, 0.6 + exactMatch.useCount * 0.05);
    return {
      ticketKey: exactMatch.ticketKey,
      ticketName: exactMatch.ticketName,
      confidence,
    };
  }

  // Try fuzzy match without platform
  const patternWithoutPlatform = createMeetingPattern(meetingTitle);
  const fuzzyMatch = history.entries.find(e => {
    const entryPattern = e.meetingPattern.includes(':')
      ? e.meetingPattern.split(':')[1]
      : e.meetingPattern;
    return entryPattern === patternWithoutPlatform;
  });

  if (fuzzyMatch) {
    const confidence = Math.min(0.8, 0.5 + fuzzyMatch.useCount * 0.05);
    return {
      ticketKey: fuzzyMatch.ticketKey,
      ticketName: fuzzyMatch.ticketName,
      confidence,
    };
  }

  // Try partial keyword match
  const normalizedTitle = normalizeMeetingTitle(meetingTitle);
  const words = normalizedTitle.split(' ').filter(w => w.length > 3);

  if (words.length > 0) {
    // Find entries with most keyword overlap
    let bestMatch: MeetingHistoryEntry | null = null;
    let bestOverlap = 0;

    for (const entry of history.entries) {
      const entryWords = entry.meetingPattern.split(' ');
      const overlap = words.filter(w => entryWords.some(ew => ew.includes(w))).length;
      const overlapRatio = overlap / words.length;

      if (overlapRatio > bestOverlap && overlapRatio >= 0.5) {
        bestOverlap = overlapRatio;
        bestMatch = entry;
      }
    }

    if (bestMatch) {
      const confidence = Math.min(0.7, 0.4 + bestOverlap * 0.3);
      return {
        ticketKey: bestMatch.ticketKey,
        ticketName: bestMatch.ticketName,
        confidence,
      };
    }
  }

  return null;
}

/**
 * Record meeting -> ticket association
 */
export function recordMeetingTicket(
  meetingTitle: string,
  platform: string | undefined,
  ticketKey: string,
  ticketName?: string
): void {
  const history = loadHistory();
  const pattern = createMeetingPattern(meetingTitle, platform);
  const now = new Date().toISOString();

  // Find existing entry
  const existingIndex = history.entries.findIndex(e => e.meetingPattern === pattern);

  if (existingIndex >= 0) {
    // Update existing
    const existing = history.entries[existingIndex];
    if (existing.ticketKey === ticketKey) {
      // Same ticket - increment use count
      existing.useCount++;
      existing.lastUsed = now;
      if (ticketName) existing.ticketName = ticketName;
    } else {
      // Different ticket - replace if used more recently
      existing.ticketKey = ticketKey;
      existing.ticketName = ticketName;
      existing.lastUsed = now;
      // Reset count since ticket changed
      existing.useCount = 1;
    }
  } else {
    // Add new entry
    history.entries.push({
      meetingPattern: pattern,
      platform,
      ticketKey,
      ticketName,
      lastUsed: now,
      useCount: 1,
    });
  }

  saveHistory(history);
}

/**
 * Get all recorded meeting patterns for a ticket
 */
export function getMeetingPatternsForTicket(ticketKey: string): MeetingHistoryEntry[] {
  const history = loadHistory();
  return history.entries.filter(e => e.ticketKey === ticketKey);
}

/**
 * Get recently used meeting patterns
 */
export function getRecentMeetingPatterns(limit: number = 10): MeetingHistoryEntry[] {
  const history = loadHistory();
  return history.entries
    .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime())
    .slice(0, limit);
}

/**
 * Clear all meeting history
 */
export function clearMeetingHistory(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Export meeting history for debugging
 */
export function exportMeetingHistory(): MeetingHistoryStore {
  return loadHistory();
}
