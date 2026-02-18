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
// RATE LIMITER — token bucket, ~40 req/min
// ========================================

class TokenBucketLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillIntervalMs: number;
  private lastRefill: number;

  constructor(maxTokens = 40, refillPerMinute = 40) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillIntervalMs = 60000 / refillPerMinute;
    this.lastRefill = Date.now();
  }

  private refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = Math.floor(elapsed / this.refillIntervalMs);
    if (newTokens > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
      this.lastRefill = now;
    }
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens > 0) {
      this.tokens--;
      return;
    }
    // Wait until next token is available
    const waitMs = this.refillIntervalMs - (Date.now() - this.lastRefill);
    await new Promise(resolve => setTimeout(resolve, Math.max(waitMs, 100)));
    this.refill();
    this.tokens = Math.max(0, this.tokens - 1);
  }
}

const rateLimiter = new TokenBucketLimiter(40, 40);

// ========================================
// CACHES — in-memory with TTL
// ========================================

// User cache with TTL
const USER_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const USER_CACHE_MAX_SIZE = 200;
const userCache = new Map<string, { name: string; expiry: number }>();

// Activities cache: date -> { data, expiry }
const ACTIVITIES_CACHE_MAX_SIZE = 30; // ~30 days of data
const activitiesCache = new Map<string, { data: GroupedActivity[]; expiry: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Conversations list cache
let conversationsCache: { data: SlackConversation[]; expiry: number } | null = null;
const CONVERSATIONS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// In-flight dedup: prevent parallel fetches for same date
const inFlight = new Map<string, Promise<GroupedActivity[]>>();

// Evict expired entries from activitiesCache and enforce size cap
function evictActivitiesCache() {
  const now = Date.now();
  for (const [key, entry] of activitiesCache) {
    if (now >= entry.expiry) {
      activitiesCache.delete(key);
    }
  }
  // If still over cap, remove oldest entries (by expiry)
  if (activitiesCache.size > ACTIVITIES_CACHE_MAX_SIZE) {
    const sorted = [...activitiesCache.entries()].sort((a, b) => a[1].expiry - b[1].expiry);
    const toRemove = sorted.length - ACTIVITIES_CACHE_MAX_SIZE;
    for (let i = 0; i < toRemove; i++) {
      activitiesCache.delete(sorted[i][0]);
    }
  }
}

// Evict expired entries from userCache and enforce size cap
function evictUserCache() {
  const now = Date.now();
  for (const [key, entry] of userCache) {
    if (now >= entry.expiry) {
      userCache.delete(key);
    }
  }
  if (userCache.size > USER_CACHE_MAX_SIZE) {
    const sorted = [...userCache.entries()].sort((a, b) => a[1].expiry - b[1].expiry);
    const toRemove = sorted.length - USER_CACHE_MAX_SIZE;
    for (let i = 0; i < toRemove; i++) {
      userCache.delete(sorted[i][0]);
    }
  }
}

// ========================================
// SLACK API WITH RETRY
// ========================================

async function slackFetch(url: string, retries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    await rateLimiter.acquire();
    // Create timeout AFTER rate limiter — otherwise the wait counts against it
    const res = await fetch(url, {
      headers: getSlackHeaders(),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json();

    if (data.ok) {
      // Re-attach parsed JSON so callers don't double-parse
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (data.error === 'ratelimited') {
      const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10);
      console.warn(`[Slack] Rate limited, waiting ${retryAfter}s (attempt ${attempt + 1}/${retries + 1})`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      continue;
    }

    // Return non-ok response for caller to handle
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // All retries exhausted
  return new Response(JSON.stringify({ ok: false, error: 'ratelimited_exhausted' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ========================================
// USER DISPLAY NAME
// ========================================

async function getUserDisplayName(userId: string): Promise<string> {
  evictUserCache();

  const cached = userCache.get(userId);
  if (cached && Date.now() < cached.expiry) {
    return cached.name;
  }

  try {
    const res = await slackFetch(`${SLACK_API_BASE}/users.info?user=${userId}`);
    const data = await res.json();
    if (data.ok && data.user) {
      const name = data.user.real_name || data.user.name || userId;
      userCache.set(userId, { name, expiry: Date.now() + USER_CACHE_TTL_MS });
      return name;
    }
  } catch (error) {
    console.error(`[Slack] Error fetching user ${userId}:`, error);
  }

  userCache.set(userId, { name: userId, expiry: Date.now() + USER_CACHE_TTL_MS });
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
  // Check cache
  if (conversationsCache && Date.now() < conversationsCache.expiry) {
    return conversationsCache.data;
  }

  const allConversations: SlackConversation[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({
      types: 'im,mpim,public_channel,private_channel',
      limit: '200',
      exclude_archived: 'true',
    });
    if (cursor) {
      params.set('cursor', cursor);
    }

    const res = await slackFetch(`${SLACK_API_BASE}/conversations.list?${params}`);
    const data = await res.json();
    if (!data.ok) {
      console.error('[Slack] conversations.list error:', data.error);
      break;
    }

    allConversations.push(...(data.channels || []));
    cursor = data.response_metadata?.next_cursor;
  } while (cursor);

  // Cache the result
  conversationsCache = {
    data: allConversations,
    expiry: Date.now() + CONVERSATIONS_CACHE_TTL_MS,
  };

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
    const params = new URLSearchParams({
      channel: channelId,
      oldest,
      latest,
      limit: '200',
    });
    if (cursor) {
      params.set('cursor', cursor);
    }

    const res = await slackFetch(`${SLACK_API_BASE}/conversations.history?${params}`);
    const data = await res.json();
    if (!data.ok) {
      // channel_not_found, not_in_channel — skip silently
      if (data.error === 'channel_not_found' || data.error === 'not_in_channel') {
        return [];
      }
      // ratelimited_exhausted — skip this channel, don't break all
      if (data.error === 'ratelimited_exhausted') {
        console.warn(`[Slack] Skipping ${channelId} — rate limit exhausted`);
        return allMessages; // return what we have so far
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

/**
 * Session-based time estimation for regular messages.
 * Groups messages into sessions (gap > 5 min = new session).
 * Per session: min(numMsgs * 15s + 30s overhead, 300s cap).
 */
function estimateSessionTime(messages: SlackMessage[]): number {
  if (messages.length === 0) return 0;

  const SECONDS_PER_MESSAGE = 15; // ~15s to read/process a message
  const SESSION_GAP_S = 5 * 60; // 5 min gap = new session
  const SESSION_OVERHEAD = 30; // context switch per session
  const SESSION_MAX = 300; // 5 min cap per session

  const sorted = [...messages].sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

  let totalSeconds = 0;
  let sessionMsgCount = 1;

  for (let i = 1; i < sorted.length; i++) {
    const gap = parseFloat(sorted[i].ts) - parseFloat(sorted[i - 1].ts);
    if (gap > SESSION_GAP_S) {
      totalSeconds += Math.min(sessionMsgCount * SECONDS_PER_MESSAGE + SESSION_OVERHEAD, SESSION_MAX);
      sessionMsgCount = 1;
    } else {
      sessionMsgCount++;
    }
  }
  // Last session
  totalSeconds += Math.min(sessionMsgCount * SECONDS_PER_MESSAGE + SESSION_OVERHEAD, SESSION_MAX);
  return totalSeconds;
}

/**
 * Huddle time estimation: count distinct huddle occurrences.
 * Huddle messages within 30 min = same huddle.
 * Each distinct huddle ≈ 8 minutes.
 */
function estimateHuddleTime(messages: SlackMessage[]): number {
  const HUDDLE_ESTIMATE_S = 8 * 60; // 8 min per huddle (conservative estimate)
  const HUDDLE_GAP_S = 30 * 60; // 30 min gap = separate huddle

  const huddleMessages = messages.filter(isHuddleMessage);
  if (huddleMessages.length === 0) return 0;

  const sorted = [...huddleMessages].sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));
  let huddleCount = 1;

  for (let i = 1; i < sorted.length; i++) {
    const gap = parseFloat(sorted[i].ts) - parseFloat(sorted[i - 1].ts);
    if (gap > HUDDLE_GAP_S) {
      huddleCount++;
    }
  }

  return huddleCount * HUDDLE_ESTIMATE_S;
}

function slackConversationToActivity(data: SlackActivityData): GroupedActivity {
  const { conversation, messages, date, displayName } = data;

  // Sort messages by timestamp
  const sorted = [...messages].sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));
  const firstTs = sorted[0]?.ts;

  // Calculate time span for positioning
  const firstTime = firstTs ? new Date(parseFloat(firstTs) * 1000) : new Date(`${date}T09:00:00`);

  // Detect huddles
  const huddleMessages = messages.filter(isHuddleMessage);
  const regularMessages = messages.filter(m => !isHuddleMessage(m));
  const hasHuddle = huddleMessages.length > 0;

  // Estimate time: session-based for regular msgs, distinct count for huddles
  // Use max (not sum) because huddle time overlaps with DM time in same conversation
  const regularTime = estimateSessionTime(regularMessages);
  const huddleTime = estimateHuddleTime(messages);
  const totalSeconds = Math.max(regularTime, huddleTime, 60);

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

  // lastSeen = firstSeen + estimated duration (NOT last message time)
  // Otherwise calendar shows e.g. 09:38-18:24 for a 22min huddle
  const estimatedEnd = new Date(firstTime.getTime() + totalSeconds * 1000);

  return {
    id: `slack-${conversation.id}-${date}`,
    title,
    app: 'Slack',
    totalSeconds,
    events: messages.length,
    firstSeen: firstTime.toISOString(),
    lastSeen: estimatedEnd.toISOString(),
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

async function fetchSlackActivitiesForDate(date: string): Promise<GroupedActivity[]> {
  // Date boundaries as Unix timestamps
  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(`${date}T23:59:59`);
  const oldest = String(Math.floor(dayStart.getTime() / 1000));
  const latest = String(Math.floor(dayEnd.getTime() / 1000));

  // 1. Get all conversations (cached)
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
}

export async function getSlackActivitiesForDate(date: string): Promise<GroupedActivity[]> {
  if (!isSlackConfigured()) {
    return [];
  }

  // Check cache
  const cached = activitiesCache.get(date);
  if (cached && Date.now() < cached.expiry) {
    return cached.data;
  }

  // Dedup in-flight requests for same date
  const existing = inFlight.get(date);
  if (existing) {
    return existing;
  }

  const promise = fetchSlackActivitiesForDate(date)
    .then(result => {
      // Cache the result (evict stale entries first)
      evictActivitiesCache();
      activitiesCache.set(date, { data: result, expiry: Date.now() + CACHE_TTL_MS });
      inFlight.delete(date);
      return result;
    })
    .catch(error => {
      console.error('[Slack] Error fetching activities:', error);
      inFlight.delete(date);
      return [];
    });

  inFlight.set(date, promise);
  return promise;
}

// ========================================
// BATCH: Get Slack activities for a date range (calendar/analytics)
// Fetches each conversation ONCE for the entire range, then splits by day.
// Reduces API calls from 65*N_days to ~65.
// ========================================

async function fetchSlackActivitiesForRange(
  startDate: string,
  endDate: string
): Promise<Map<string, GroupedActivity[]>> {
  const rangeStart = new Date(`${startDate}T00:00:00`);
  const rangeEnd = new Date(`${endDate}T23:59:59`);
  const oldest = String(Math.floor(rangeStart.getTime() / 1000));
  const latest = String(Math.floor(rangeEnd.getTime() / 1000));

  const conversations = await listConversations();
  console.log(`[Slack] Batch fetch ${startDate}..${endDate}: ${conversations.length} conversations`);

  // Collect all messages per conversation
  const convMessages = new Map<string, { conv: SlackConversation; messages: SlackMessage[] }>();

  for (const conv of conversations) {
    const messages = await getConversationHistory(conv.id, oldest, latest);
    if (messages.length > 0) {
      convMessages.set(conv.id, { conv, messages });
    }
  }

  // Group messages by date
  const dateActivitiesMap = new Map<string, GroupedActivity[]>();

  // Initialize all dates in range
  for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
    dateActivitiesMap.set(d.toISOString().split('T')[0], []);
  }

  // Resolve display names for DM conversations (once per user)
  const displayNames = new Map<string, string>();
  for (const { conv } of convMessages.values()) {
    if (conv.is_im && conv.user && !displayNames.has(conv.user)) {
      displayNames.set(conv.user, await getUserDisplayName(conv.user));
    }
  }

  // Split messages by date and build activities
  for (const { conv, messages } of convMessages.values()) {
    const msgsByDate = new Map<string, SlackMessage[]>();

    for (const msg of messages) {
      const msgDate = new Date(parseFloat(msg.ts) * 1000);
      const dateKey = msgDate.toISOString().split('T')[0];
      if (!msgsByDate.has(dateKey)) {
        msgsByDate.set(dateKey, []);
      }
      msgsByDate.get(dateKey)!.push(msg);
    }

    for (const [dateKey, dayMessages] of msgsByDate) {
      const displayName = (conv.is_im && conv.user)
        ? (displayNames.get(conv.user) || conv.name || 'Unknown')
        : (conv.name || 'Unknown');

      const activity = slackConversationToActivity({
        conversation: conv,
        messages: dayMessages,
        date: dateKey,
        displayName,
      });

      if (!dateActivitiesMap.has(dateKey)) {
        dateActivitiesMap.set(dateKey, []);
      }
      dateActivitiesMap.get(dateKey)!.push(activity);
    }
  }

  // Sort each day's activities by totalSeconds descending
  evictActivitiesCache();
  for (const [dateKey, activities] of dateActivitiesMap) {
    activities.sort((a, b) => b.totalSeconds - a.totalSeconds);
    // Cache each day individually
    activitiesCache.set(dateKey, { data: activities, expiry: Date.now() + CACHE_TTL_MS });
    console.log(`[Slack] ${dateKey}: ${activities.length} active conversations (batch)`);
  }

  return dateActivitiesMap;
}

// In-flight dedup for range fetches
const rangeInFlight = new Map<string, Promise<Map<string, GroupedActivity[]>>>();

export async function getSlackActivitiesForDateRange(
  startDate: string,
  endDate: string
): Promise<Map<string, GroupedActivity[]>> {
  if (!isSlackConfigured()) {
    return new Map();
  }

  // Check if all dates in range are already cached
  const dates: string[] = [];
  const rangeStart = new Date(`${startDate}T00:00:00`);
  const rangeEnd = new Date(`${endDate}T23:59:59`);
  let allCached = true;

  for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    dates.push(dateStr);
    const cached = activitiesCache.get(dateStr);
    if (!cached || Date.now() >= cached.expiry) {
      allCached = false;
    }
  }

  if (allCached) {
    const result = new Map<string, GroupedActivity[]>();
    for (const dateStr of dates) {
      result.set(dateStr, activitiesCache.get(dateStr)!.data);
    }
    return result;
  }

  // Dedup in-flight range requests
  const rangeKey = `${startDate}..${endDate}`;
  const existing = rangeInFlight.get(rangeKey);
  if (existing) {
    return existing;
  }

  const promise = fetchSlackActivitiesForRange(startDate, endDate)
    .then(result => {
      rangeInFlight.delete(rangeKey);
      return result;
    })
    .catch(error => {
      console.error('[Slack] Error fetching range activities:', error);
      rangeInFlight.delete(rangeKey);
      return new Map<string, GroupedActivity[]>();
    });

  rangeInFlight.set(rangeKey, promise);
  return promise;
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
