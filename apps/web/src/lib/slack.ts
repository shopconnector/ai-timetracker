// Slack API Client
// User Token (xoxp-) based — sees DMs, channels, huddles

import type { GroupedActivity, ActivityCategory } from './activitywatch';

const SLACK_API_BASE = 'https://slack.com/api';

// ========================================
// AUTH
// ========================================

function getSlackHeaders(): HeadersInit {
  const token = process.env.SLACK_USER_TOKEN;
  if (!token) {
    throw new Error('SLACK_USER_TOKEN not set');
  }
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export function isSlackConfigured(): boolean {
  return !!process.env.SLACK_USER_TOKEN;
}

// ========================================
// RATE LIMITER — max 50 req/min
// ========================================

class RateLimiter {
  private queue: Array<() => void> = [];
  private running = 0;
  private readonly maxPerMinute: number;
  private readonly intervalMs: number;

  constructor(maxPerMinute = 50) {
    this.maxPerMinute = maxPerMinute;
    this.intervalMs = Math.ceil(60000 / maxPerMinute); // ~1200ms between requests
  }

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      const tryRun = () => {
        if (this.running < this.maxPerMinute) {
          this.running++;
          setTimeout(() => {
            this.running--;
            if (this.queue.length > 0) {
              const next = this.queue.shift();
              next?.();
            }
          }, this.intervalMs);
          resolve();
        } else {
          this.queue.push(tryRun);
        }
      };
      tryRun();
    });
  }
}

const rateLimiter = new RateLimiter(50);

// ========================================
// USER CACHE — in-memory, per request cycle
// ========================================

const userCache = new Map<string, string>();

async function getUserDisplayName(userId: string): Promise<string> {
  if (userCache.has(userId)) {
    return userCache.get(userId)!;
  }

  try {
    await rateLimiter.acquire();
    const res = await fetch(`${SLACK_API_BASE}/users.info?user=${userId}`, {
      headers: getSlackHeaders(),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return userId;
    }

    const data = await res.json();
    if (data.ok && data.user) {
      const name = data.user.real_name || data.user.name || userId;
      userCache.set(userId, name);
      return name;
    }
  } catch (error) {
    console.error(`[Slack] Error fetching user ${userId}:`, error);
  }

  userCache.set(userId, userId);
  return userId;
}

// ========================================
// API METHODS
// ========================================

export async function testSlackConnection(): Promise<{ ok: boolean; user?: string; error?: string }> {
  try {
    const res = await fetch(`${SLACK_API_BASE}/auth.test`, {
      method: 'POST',
      headers: getSlackHeaders(),
      signal: AbortSignal.timeout(5000),
    });

    const data = await res.json();
    if (data.ok) {
      return { ok: true, user: data.user };
    }
    return { ok: false, error: data.error || 'Unknown error' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Connection failed' };
  }
}

interface SlackConversation {
  id: string;
  name?: string;
  is_im: boolean;
  is_mpim: boolean;
  is_channel: boolean;
  is_group: boolean;
  user?: string; // DM partner user ID
}

interface SlackMessage {
  type: string;
  subtype?: string;
  user?: string;
  text?: string;
  ts: string;
}

async function listConversations(): Promise<SlackConversation[]> {
  const allConversations: SlackConversation[] = [];
  let cursor: string | undefined;

  do {
    await rateLimiter.acquire();
    const params = new URLSearchParams({
      types: 'im,mpim,public_channel,private_channel',
      limit: '200',
      exclude_archived: 'true',
    });
    if (cursor) {
      params.set('cursor', cursor);
    }

    const res = await fetch(`${SLACK_API_BASE}/conversations.list?${params}`, {
      headers: getSlackHeaders(),
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error('[Slack] conversations.list error:', data.error);
      break;
    }

    allConversations.push(...(data.channels || []));
    cursor = data.response_metadata?.next_cursor;
  } while (cursor);

  return allConversations;
}

async function getConversationHistory(
  channelId: string,
  oldest: string,
  latest: string
): Promise<SlackMessage[]> {
  const allMessages: SlackMessage[] = [];
  let cursor: string | undefined;

  do {
    await rateLimiter.acquire();
    const params = new URLSearchParams({
      channel: channelId,
      oldest,
      latest,
      limit: '200',
    });
    if (cursor) {
      params.set('cursor', cursor);
    }

    const res = await fetch(`${SLACK_API_BASE}/conversations.history?${params}`, {
      headers: getSlackHeaders(),
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json();
    if (!data.ok) {
      // channel_not_found, not_in_channel — skip silently
      if (data.error === 'channel_not_found' || data.error === 'not_in_channel') {
        return [];
      }
      console.error(`[Slack] history error for ${channelId}:`, data.error);
      break;
    }

    allMessages.push(...(data.messages || []));
    cursor = data.response_metadata?.next_cursor;
  } while (cursor);

  return allMessages;
}

// ========================================
// ACTIVITY CONVERSION
// ========================================

function isHuddleMessage(message: SlackMessage): boolean {
  return !!(message.subtype && message.subtype.startsWith('huddle'));
}

interface SlackActivityData {
  conversation: SlackConversation;
  messages: SlackMessage[];
  date: string;
  displayName: string;
}

function slackConversationToActivity(data: SlackActivityData): GroupedActivity {
  const { conversation, messages, date, displayName } = data;

  // Sort messages by timestamp
  const sorted = [...messages].sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));
  const firstTs = sorted[0]?.ts;
  const lastTs = sorted[sorted.length - 1]?.ts;

  // Calculate time span
  const firstTime = firstTs ? new Date(parseFloat(firstTs) * 1000) : new Date(`${date}T09:00:00`);
  const lastTime = lastTs ? new Date(parseFloat(lastTs) * 1000) : firstTime;

  // Duration: time between first and last message, minimum 60 seconds per conversation
  const spanSeconds = Math.max(
    Math.round((lastTime.getTime() - firstTime.getTime()) / 1000),
    60
  );
  // Cap at reasonable duration: assume ~1 minute per message exchange for DMs
  const estimatedSeconds = Math.min(spanSeconds, messages.length * 120);
  const totalSeconds = Math.max(estimatedSeconds, 60);

  // Detect huddles
  const huddleMessages = messages.filter(isHuddleMessage);
  const hasHuddle = huddleMessages.length > 0;

  // Determine title and category
  let title: string;
  let category: ActivityCategory;
  let isMeeting = false;
  let meetingPlatform: string | undefined;
  let isCommunication = false;
  let channel: string | undefined;

  if (hasHuddle) {
    isMeeting = true;
    meetingPlatform = 'Slack Huddle';
    category = 'meeting';
    title = conversation.is_im
      ? `Huddle: ${displayName}`
      : `Huddle: #${conversation.name || 'unknown'}`;
  } else if (conversation.is_im) {
    isCommunication = true;
    channel = displayName;
    category = 'communication';
    title = displayName;
  } else if (conversation.is_mpim) {
    isCommunication = true;
    channel = conversation.name || 'group-dm';
    category = 'communication';
    title = conversation.name || 'Group DM';
  } else {
    isCommunication = true;
    channel = `#${conversation.name || 'unknown'}`;
    category = 'communication';
    title = `#${conversation.name || 'unknown'}`;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const formattedDuration = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  return {
    id: `slack-${conversation.id}-${date}`,
    title,
    app: 'Slack',
    totalSeconds,
    events: messages.length,
    firstSeen: firstTime.toISOString(),
    lastSeen: lastTime.toISOString(),
    category,
    isMeeting,
    meetingPlatform,
    isCommunication,
    channel,
  };
}

// ========================================
// MAIN: Get Slack activities for a date
// ========================================

export async function getSlackActivitiesForDate(date: string): Promise<GroupedActivity[]> {
  if (!isSlackConfigured()) {
    return [];
  }

  try {
    // Date boundaries as Unix timestamps
    const dayStart = new Date(`${date}T00:00:00`);
    const dayEnd = new Date(`${date}T23:59:59`);
    const oldest = String(Math.floor(dayStart.getTime() / 1000));
    const latest = String(Math.floor(dayEnd.getTime() / 1000));

    // 1. Get all conversations
    const conversations = await listConversations();
    console.log(`[Slack] Found ${conversations.length} conversations for ${date}`);

    // 2. For each conversation, get messages in the date range
    const activities: GroupedActivity[] = [];

    for (const conv of conversations) {
      const messages = await getConversationHistory(conv.id, oldest, latest);

      if (messages.length === 0) continue;

      // Resolve display name for DMs
      let displayName = conv.name || 'Unknown';
      if (conv.is_im && conv.user) {
        displayName = await getUserDisplayName(conv.user);
      }

      const activity = slackConversationToActivity({
        conversation: conv,
        messages,
        date,
        displayName,
      });

      activities.push(activity);
    }

    // Sort by total time descending
    activities.sort((a, b) => b.totalSeconds - a.totalSeconds);

    console.log(`[Slack] ${date}: ${activities.length} active conversations`);
    return activities;
  } catch (error) {
    console.error('[Slack] Error fetching activities:', error);
    return [];
  }
}

// Format seconds to human readable
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
