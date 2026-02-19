// Slack Bot Client — outgoing notifications
// Uses Bot Token (xoxb-) for sending DMs and interactive messages
// Separate from slack.ts which uses User Token (xoxp-) for reading

const SLACK_API_BASE = 'https://slack.com/api';

function getBotHeaders(): HeadersInit {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new Error('SLACK_BOT_TOKEN not set');
  }
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export function isSlackBotConfigured(): boolean {
  return !!process.env.SLACK_BOT_TOKEN;
}

// Get bot's own user ID (for opening DMs)
let cachedBotUserId: string | null = null;

async function getBotUserId(): Promise<string> {
  if (cachedBotUserId) return cachedBotUserId;

  const res = await fetch(`${SLACK_API_BASE}/auth.test`, {
    method: 'POST',
    headers: getBotHeaders(),
    signal: AbortSignal.timeout(5000),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack auth.test failed: ${data.error}`);
  cachedBotUserId = data.user_id;
  return data.user_id;
}

// Open a DM channel with a user
async function openDM(userId: string): Promise<string> {
  const res = await fetch(`${SLACK_API_BASE}/conversations.open`, {
    method: 'POST',
    headers: getBotHeaders(),
    body: JSON.stringify({ users: userId }),
    signal: AbortSignal.timeout(5000),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack conversations.open failed: ${data.error}`);
  return data.channel.id;
}

// Get the configured notification target (user ID or channel ID)
export function getNotificationTarget(): string | null {
  return process.env.SLACK_NOTIFY_CHANNEL || process.env.SLACK_NOTIFY_USER_ID || null;
}

// ========================================
// BLOCK KIT MESSAGE BUILDERS
// ========================================

interface LogEntry {
  issueKey: string;
  description: string;
  durationMinutes: number;
  startTime: string;
  endTime: string;
  confidence?: number;
}

// Build daily log proposal message with interactive buttons
export function buildDailyLogMessage(
  date: string,
  entries: LogEntry[],
  totalMinutes: number,
  alreadyLoggedMinutes: number
): { text: string; blocks: unknown[] } {
  const totalHours = Math.floor(totalMinutes / 60);
  const totalMins = totalMinutes % 60;
  const loggedH = Math.floor(alreadyLoggedMinutes / 60);
  const loggedM = alreadyLoggedMinutes % 60;

  const headerText = `*Propozycja logow na ${date}*`;
  const summaryText = alreadyLoggedMinutes > 0
    ? `Propozycja: *${totalHours}h ${totalMins}m* | Juz zalogowane: ${loggedH}h ${loggedM}m`
    : `Propozycja: *${totalHours}h ${totalMins}m*`;

  const entryLines = entries.map((e, i) => {
    const conf = e.confidence !== undefined ? ` (${Math.round(e.confidence * 100)}%)` : '';
    return `${i + 1}. \`${e.startTime}-${e.endTime}\` *${e.durationMinutes}m* → \`${e.issueKey}\`${conf}\n   _${e.description}_`;
  });

  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `TimeTracker — ${date}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `${headerText}\n${summaryText}` },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: entryLines.join('\n\n') },
    },
    { type: 'divider' },
    {
      type: 'actions',
      block_id: `timetracker_approve_${date}`,
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Approve All' },
          style: 'primary',
          action_id: 'approve_all',
          value: JSON.stringify({ date, entries }),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Otworz panel' },
          action_id: 'open_panel',
          url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/timetracker/my-issues`,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Odrzuc' },
          style: 'danger',
          action_id: 'reject_all',
          value: date,
        },
      ],
    },
  ];

  const text = `TimeTracker: Propozycja logow na ${date} — ${totalHours}h ${totalMins}m (${entries.length} wpisow)`;

  return { text, blocks };
}

// Build real-time activity prompt message
export function buildActivityPromptMessage(
  activity: {
    project?: string;
    app: string;
    durationMinutes: number;
    description: string;
  },
  suggestedTicket?: string
): { text: string; blocks: unknown[] } {
  const ticketText = suggestedTicket
    ? `Proponowany ticket: \`${suggestedTicket}\``
    : 'Nie znaleziono pasujacego ticketa';

  const blocks: unknown[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Nowa aktywnosc wykryta* (${activity.durationMinutes}m)\n${activity.app}: _${activity.description}_\n${ticketText}`,
      },
    },
    {
      type: 'actions',
      block_id: 'timetracker_prompt',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Zaloguj' },
          style: 'primary',
          action_id: 'log_activity',
          value: JSON.stringify({ activity, suggestedTicket }),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Pomin' },
          action_id: 'skip_activity',
        },
      ],
    },
  ];

  return {
    text: `TimeTracker: Nowa aktywnosc — ${activity.app} ${activity.durationMinutes}m`,
    blocks,
  };
}

// ========================================
// SEND MESSAGES
// ========================================

export async function sendMessage(
  channel: string,
  text: string,
  blocks?: unknown[]
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const body: Record<string, unknown> = { channel, text };
  if (blocks) body.blocks = blocks;

  const res = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
    method: 'POST',
    headers: getBotHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });

  const data = await res.json();
  return { ok: data.ok, ts: data.ts, error: data.error };
}

// Send a DM to a user (opens DM channel automatically)
export async function sendDM(
  userId: string,
  text: string,
  blocks?: unknown[]
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const channelId = await openDM(userId);
  return sendMessage(channelId, text, blocks);
}

// Update an existing message (for updating approval status)
export async function updateMessage(
  channel: string,
  ts: string,
  text: string,
  blocks?: unknown[]
): Promise<{ ok: boolean; error?: string }> {
  const body: Record<string, unknown> = { channel, ts, text };
  if (blocks) body.blocks = blocks;

  const res = await fetch(`${SLACK_API_BASE}/chat.update`, {
    method: 'POST',
    headers: getBotHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });

  const data = await res.json();
  return { ok: data.ok, error: data.error };
}

// ========================================
// HIGH-LEVEL: Send daily log notification
// ========================================

export async function sendDailyLogNotification(
  date: string,
  entries: LogEntry[],
  totalMinutes: number,
  alreadyLoggedMinutes: number = 0
): Promise<{ ok: boolean; error?: string }> {
  if (!isSlackBotConfigured()) {
    return { ok: false, error: 'SLACK_BOT_TOKEN not configured' };
  }

  const target = getNotificationTarget();
  if (!target) {
    return { ok: false, error: 'No notification target configured (SLACK_NOTIFY_CHANNEL or SLACK_NOTIFY_USER_ID)' };
  }

  const { text, blocks } = buildDailyLogMessage(date, entries, totalMinutes, alreadyLoggedMinutes);

  // If target starts with U (user ID), send DM; otherwise send to channel
  if (target.startsWith('U')) {
    return sendDM(target, text, blocks);
  }
  return sendMessage(target, text, blocks);
}

// Send real-time activity prompt
export async function sendActivityPrompt(
  activity: {
    project?: string;
    app: string;
    durationMinutes: number;
    description: string;
  },
  suggestedTicket?: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSlackBotConfigured()) {
    return { ok: false, error: 'SLACK_BOT_TOKEN not configured' };
  }

  const target = getNotificationTarget();
  if (!target) {
    return { ok: false, error: 'No notification target configured' };
  }

  const { text, blocks } = buildActivityPromptMessage(activity, suggestedTicket);

  if (target.startsWith('U')) {
    return sendDM(target, text, blocks);
  }
  return sendMessage(target, text, blocks);
}

// Test bot connection
export async function testSlackBotConnection(): Promise<{ ok: boolean; bot?: string; error?: string }> {
  if (!isSlackBotConfigured()) {
    return { ok: false, error: 'SLACK_BOT_TOKEN not set' };
  }

  try {
    const res = await fetch(`${SLACK_API_BASE}/auth.test`, {
      method: 'POST',
      headers: getBotHeaders(),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    if (data.ok) {
      return { ok: true, bot: data.user };
    }
    return { ok: false, error: data.error };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Connection failed' };
  }
}
