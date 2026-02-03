/**
 * Ticket enrichment utilities
 * Enriches tickets with usage data from localStorage history
 */

import { getTaskHistory, getRecentTasks, getMostUsedTasks, TaskUsage } from './taskHistory';

// Base Ticket interface (matches ActivityCard.tsx)
export interface Ticket {
  key: string;
  name: string;
  id?: string;
  type?: string;
  status?: string;
  isSubtask?: boolean;
  parentKey?: string;
  // Extended fields (from API)
  project?: string;
  projectName?: string;
  priority?: string;
  assignee?: string;
  updatedAt?: string;
  parentSummary?: string;
  epicKey?: string;
  epicName?: string;
}

// Enriched ticket with usage context
export interface EnrichedTicket extends Ticket {
  // Usage context from localStorage
  lastUsedDate?: string;
  usageCount?: number;
  isRecent?: boolean; // Used in last 7 days
  isFrequent?: boolean; // Used more than 3 times
  recentActivities?: string[]; // Last activities logged to this ticket
  // Display grouping
  displayGroup: 'recent' | 'frequent' | 'project' | 'search' | 'other';
  sortScore: number;
}

// Group structure for organized display
export interface TicketGroup {
  name: string;
  icon?: string;
  tickets: EnrichedTicket[];
}

/**
 * Enrich tickets with usage data from localStorage
 */
export function enrichTicketsWithUsage(tickets: Ticket[]): EnrichedTicket[] {
  const taskHistory = getTaskHistory();
  const usageMap = new Map<string, TaskUsage>();

  // Build lookup map
  taskHistory.forEach(t => usageMap.set(t.key, t));

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  return tickets.map(ticket => {
    const usage = usageMap.get(ticket.key);
    const lastUsedTime = usage?.lastUsed ? new Date(usage.lastUsed).getTime() : 0;
    const isRecent = lastUsedTime > sevenDaysAgo;
    const isFrequent = usage ? usage.useCount > 3 : false;

    // Determine display group and sort score
    let displayGroup: EnrichedTicket['displayGroup'] = 'other';
    let sortScore = 0;

    if (isRecent) {
      displayGroup = 'recent';
      // Higher score for more recently used (inverse of hours since use)
      const hoursSinceUse = (now - lastUsedTime) / (1000 * 60 * 60);
      sortScore = 1000 - Math.min(hoursSinceUse, 168); // Max 7 days = 168 hours
    } else if (isFrequent) {
      displayGroup = 'frequent';
      sortScore = 500 + (usage?.useCount || 0);
    } else if (ticket.project) {
      displayGroup = 'project';
      sortScore = 100;
    }

    return {
      ...ticket,
      lastUsedDate: usage?.lastUsed,
      usageCount: usage?.useCount,
      isRecent,
      isFrequent,
      recentActivities: usage?.activities?.slice(0, 3),
      displayGroup,
      sortScore,
    };
  });
}

/**
 * Get recently used tickets from history (not necessarily in the provided list)
 */
export function getRecentTicketsFromHistory(limit: number = 10): EnrichedTicket[] {
  const recentTasks = getRecentTasks(limit);
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  return recentTasks.map(task => {
    const lastUsedTime = new Date(task.lastUsed).getTime();
    const isRecent = lastUsedTime > sevenDaysAgo;

    return {
      key: task.key,
      name: task.name,
      lastUsedDate: task.lastUsed,
      usageCount: task.useCount,
      isRecent,
      isFrequent: task.useCount > 3,
      recentActivities: task.activities?.slice(0, 3),
      displayGroup: 'recent' as const,
      sortScore: 1000 - (now - lastUsedTime) / (1000 * 60 * 60),
    };
  });
}

/**
 * Group tickets by project
 */
export function groupTicketsByProject(tickets: EnrichedTicket[]): Map<string, EnrichedTicket[]> {
  const groups = new Map<string, EnrichedTicket[]>();

  for (const ticket of tickets) {
    const projectKey = ticket.project || ticket.key.split('-')[0] || 'Other';
    if (!groups.has(projectKey)) {
      groups.set(projectKey, []);
    }
    groups.get(projectKey)!.push(ticket);
  }

  // Sort tickets within each group by sort score
  for (const [, groupTickets] of groups) {
    groupTickets.sort((a, b) => b.sortScore - a.sortScore);
  }

  return groups;
}

/**
 * Group tickets by type
 */
export function groupTicketsByType(tickets: EnrichedTicket[]): Map<string, EnrichedTicket[]> {
  const groups = new Map<string, EnrichedTicket[]>();

  for (const ticket of tickets) {
    const type = ticket.type || 'Task';
    if (!groups.has(type)) {
      groups.set(type, []);
    }
    groups.get(type)!.push(ticket);
  }

  // Sort tickets within each group
  for (const [, groupTickets] of groups) {
    groupTickets.sort((a, b) => b.sortScore - a.sortScore);
  }

  return groups;
}

/**
 * Sort tickets with recent/frequent first
 */
export function sortTicketsByRelevance(tickets: EnrichedTicket[]): EnrichedTicket[] {
  return [...tickets].sort((a, b) => {
    // Recent first
    if (a.isRecent && !b.isRecent) return -1;
    if (!a.isRecent && b.isRecent) return 1;

    // Then frequent
    if (a.isFrequent && !b.isFrequent) return -1;
    if (!a.isFrequent && b.isFrequent) return 1;

    // Then by sort score
    return b.sortScore - a.sortScore;
  });
}

/**
 * Format relative time for display
 */
export function formatLastUsed(dateStr?: string): string {
  if (!dateStr) return '';

  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

/**
 * Format usage count for display
 */
export function formatUsageCount(count?: number): string {
  if (!count || count === 0) return '';
  if (count === 1) return '1x';
  if (count < 10) return `${count}x`;
  if (count < 100) return `${count}x`;
  return '99+';
}

/**
 * Get organized ticket groups for display
 */
export function getOrganizedTicketGroups(
  tickets: EnrichedTicket[],
  groupBy: 'none' | 'project' | 'type' = 'none'
): TicketGroup[] {
  const enriched = sortTicketsByRelevance(tickets);

  // Extract recent tickets for separate section
  const recentTickets = enriched.filter(t => t.isRecent);
  const otherTickets = enriched.filter(t => !t.isRecent);

  const groups: TicketGroup[] = [];

  // Always show recent first (if any)
  if (recentTickets.length > 0) {
    groups.push({
      name: 'Recently Used',
      icon: 'clock',
      tickets: recentTickets,
    });
  }

  if (groupBy === 'none') {
    // Flat list
    if (otherTickets.length > 0) {
      groups.push({
        name: 'All Tickets',
        tickets: otherTickets,
      });
    }
  } else if (groupBy === 'project') {
    const byProject = groupTicketsByProject(otherTickets);
    for (const [project, projectTickets] of byProject) {
      groups.push({
        name: project,
        icon: 'folder',
        tickets: projectTickets,
      });
    }
  } else if (groupBy === 'type') {
    const byType = groupTicketsByType(otherTickets);
    const typeOrder = ['Story', 'Task', 'Bug', 'Epic', 'Subtask'];

    // Sort groups by type order
    const sortedTypes = [...byType.keys()].sort((a, b) => {
      const aIndex = typeOrder.indexOf(a);
      const bIndex = typeOrder.indexOf(b);
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    });

    for (const type of sortedTypes) {
      const typeTickets = byType.get(type)!;
      groups.push({
        name: type,
        icon: getTypeIcon(type),
        tickets: typeTickets,
      });
    }
  }

  return groups;
}

/**
 * Get icon name for issue type
 */
function getTypeIcon(type: string): string {
  switch (type.toLowerCase()) {
    case 'story':
      return 'book';
    case 'task':
      return 'check-square';
    case 'bug':
      return 'bug';
    case 'epic':
      return 'zap';
    case 'subtask':
      return 'git-branch';
    default:
      return 'circle';
  }
}
