import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ========================================
// STATIC IMPORTS (for pure functions that don't depend on module state)
// ========================================

// Set token before static import
vi.stubEnv('SLACK_USER_TOKEN', 'xoxp-test-token-123');

import {
  isSlackConfigured,
  formatDuration,
} from './slack';

describe('isSlackConfigured', () => {
  it('should return true when SLACK_USER_TOKEN is set', () => {
    expect(isSlackConfigured()).toBe(true);
  });

  it('should return false when token is empty', () => {
    const orig = process.env.SLACK_USER_TOKEN;
    process.env.SLACK_USER_TOKEN = '';
    expect(isSlackConfigured()).toBe(false);
    process.env.SLACK_USER_TOKEN = orig;
  });
});

describe('formatDuration', () => {
  it('should format minutes only', () => {
    expect(formatDuration(300)).toBe('5m');
  });

  it('should format hours and minutes', () => {
    expect(formatDuration(3660)).toBe('1h 1m');
  });

  it('should handle 0 seconds', () => {
    expect(formatDuration(0)).toBe('0m');
  });
});

// ========================================
// API FUNCTIONS — each test uses vi.resetModules() for fresh caches
// ========================================

describe('Slack API functions', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    process.env.SLACK_USER_TOKEN = 'xoxp-test-token-123';
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper to get a fresh module instance (clears all caches/singletons)
  async function freshSlack() {
    vi.resetModules();
    return import('./slack');
  }

  describe('testSlackConnection', () => {
    it('should return ok true on successful auth.test', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ ok: true, user: 'testuser' }),
      });

      const { testSlackConnection } = await freshSlack();
      const result = await testSlackConnection();
      expect(result).toEqual({ ok: true, user: 'testuser' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://slack.com/api/auth.test',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer xoxp-test-token-123',
          }),
        }),
      );
    });

    it('should return ok false with error on failed auth', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ ok: false, error: 'invalid_auth' }),
      });

      const { testSlackConnection } = await freshSlack();
      const result = await testSlackConnection();
      expect(result).toEqual({ ok: false, error: 'invalid_auth' });
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      const { testSlackConnection } = await freshSlack();
      const result = await testSlackConnection();
      expect(result).toEqual({ ok: false, error: 'Network timeout' });
    });

    it('should handle non-Error exceptions', async () => {
      mockFetch.mockRejectedValueOnce('unknown failure');

      const { testSlackConnection } = await freshSlack();
      const result = await testSlackConnection();
      expect(result).toEqual({ ok: false, error: 'Connection failed' });
    });
  });

  describe('getSlackActivitiesForDate', () => {
    it('should return empty array when Slack is not configured', async () => {
      process.env.SLACK_USER_TOKEN = '';
      const { getSlackActivitiesForDate } = await freshSlack();

      const result = await getSlackActivitiesForDate('2024-01-15');
      expect(result).toEqual([]);
    });

    it('should fetch conversations and messages for a date', async () => {
      // conversations.list via slackFetch
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          ok: true,
          channels: [
            { id: 'C001', name: 'general', is_channel: true, is_im: false, is_mpim: false, is_group: false },
          ],
          response_metadata: {},
        }),
        headers: new Headers(),
      });

      // conversations.history for C001
      const ts1 = String(new Date('2024-01-15T10:00:00').getTime() / 1000);
      const ts2 = String(new Date('2024-01-15T10:01:00').getTime() / 1000);
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          ok: true,
          messages: [
            { type: 'message', user: 'U001', text: 'Hello', ts: ts1 },
            { type: 'message', user: 'U002', text: 'Hi there', ts: ts2 },
          ],
          response_metadata: {},
        }),
        headers: new Headers(),
      });

      const { getSlackActivitiesForDate } = await freshSlack();
      const result = await getSlackActivitiesForDate('2024-01-15');
      expect(result.length).toBe(1);
      expect(result[0].app).toBe('Slack');
      expect(result[0].title).toBe('#general');
      expect(result[0].isCommunication).toBe(true);
      expect(result[0].category).toBe('communication');
      expect(result[0].events).toBe(2);
      // 2 msgs * 15s + 30s overhead = 60s, min 60s
      expect(result[0].totalSeconds).toBe(60);
    });

    it('should handle DM conversations with user display name', async () => {
      // conversations.list
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          ok: true,
          channels: [
            { id: 'D001', is_im: true, is_mpim: false, is_channel: false, is_group: false, user: 'U100' },
          ],
          response_metadata: {},
        }),
        headers: new Headers(),
      });

      // conversations.history for D001
      const ts1 = String(new Date('2024-01-15T14:00:00').getTime() / 1000);
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          ok: true,
          messages: [
            { type: 'message', user: 'U100', text: 'Check this', ts: ts1 },
          ],
          response_metadata: {},
        }),
        headers: new Headers(),
      });

      // users.info for U100 (via slackFetch)
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          ok: true,
          user: { real_name: 'Jan Kowalski', name: 'jan.kowalski' },
        }),
        headers: new Headers(),
      });

      const { getSlackActivitiesForDate } = await freshSlack();
      const result = await getSlackActivitiesForDate('2024-01-15');
      expect(result.length).toBe(1);
      expect(result[0].title).toBe('Jan Kowalski');
      expect(result[0].channel).toBe('Jan Kowalski');
      expect(result[0].isCommunication).toBe(true);
    });

    it('should detect huddles as meetings', async () => {
      // conversations.list
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          ok: true,
          channels: [
            { id: 'C002', name: 'dev-team', is_channel: true, is_im: false, is_mpim: false, is_group: false },
          ],
          response_metadata: {},
        }),
        headers: new Headers(),
      });

      // conversations.history with huddle messages
      const ts1 = String(new Date('2024-01-15T11:00:00').getTime() / 1000);
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          ok: true,
          messages: [
            { type: 'message', subtype: 'huddle_started', user: 'U001', ts: ts1 },
          ],
          response_metadata: {},
        }),
        headers: new Headers(),
      });

      const { getSlackActivitiesForDate } = await freshSlack();
      const result = await getSlackActivitiesForDate('2024-01-15');
      expect(result.length).toBe(1);
      expect(result[0].isMeeting).toBe(true);
      expect(result[0].meetingPlatform).toBe('Slack Huddle');
      expect(result[0].title).toBe('Huddle: #dev-team');
      expect(result[0].category).toBe('meeting');
      // 1 huddle = 8 min = 480s
      expect(result[0].totalSeconds).toBe(480);
    });

    it('should skip conversations with no messages', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          ok: true,
          channels: [
            { id: 'C001', name: 'active', is_channel: true, is_im: false, is_mpim: false, is_group: false },
            { id: 'C002', name: 'empty', is_channel: true, is_im: false, is_mpim: false, is_group: false },
          ],
          response_metadata: {},
        }),
        headers: new Headers(),
      });

      // C001 has messages
      const ts1 = String(new Date('2024-01-15T10:00:00').getTime() / 1000);
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          ok: true,
          messages: [{ type: 'message', user: 'U001', text: 'msg', ts: ts1 }],
          response_metadata: {},
        }),
        headers: new Headers(),
      });

      // C002 has no messages
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          ok: true,
          messages: [],
          response_metadata: {},
        }),
        headers: new Headers(),
      });

      const { getSlackActivitiesForDate } = await freshSlack();
      const result = await getSlackActivitiesForDate('2024-01-15');
      expect(result.length).toBe(1);
      expect(result[0].title).toBe('#active');
    });

    it('should handle rate limiting with retries in slackFetch', async () => {
      // conversations.list: first attempt rate limited, retry succeeds
      mockFetch
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ ok: false, error: 'ratelimited' }),
          headers: new Headers({ 'Retry-After': '0' }),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            ok: true,
            channels: [],
            response_metadata: {},
          }),
          headers: new Headers(),
        });

      const { getSlackActivitiesForDate } = await freshSlack();
      const result = await getSlackActivitiesForDate('2024-01-15');
      expect(result).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle mpim (multi-person DM) conversations', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          ok: true,
          channels: [
            { id: 'G001', name: 'team-sync', is_mpim: true, is_im: false, is_channel: false, is_group: true },
          ],
          response_metadata: {},
        }),
        headers: new Headers(),
      });

      const ts1 = String(new Date('2024-01-15T09:00:00').getTime() / 1000);
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          ok: true,
          messages: [{ type: 'message', user: 'U001', text: 'sync', ts: ts1 }],
          response_metadata: {},
        }),
        headers: new Headers(),
      });

      const { getSlackActivitiesForDate } = await freshSlack();
      const result = await getSlackActivitiesForDate('2024-01-15');
      expect(result.length).toBe(1);
      expect(result[0].title).toBe('team-sync');
      expect(result[0].isCommunication).toBe(true);
    });

    it('should estimate session time with gaps creating separate sessions', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          ok: true,
          channels: [
            { id: 'C001', name: 'general', is_channel: true, is_im: false, is_mpim: false, is_group: false },
          ],
          response_metadata: {},
        }),
        headers: new Headers(),
      });

      // Two sessions: 3 messages close together, gap > 5 min, then 2 more
      const base = new Date('2024-01-15T10:00:00').getTime() / 1000;
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          ok: true,
          messages: [
            { type: 'message', user: 'U001', text: 'a', ts: String(base) },
            { type: 'message', user: 'U002', text: 'b', ts: String(base + 30) },
            { type: 'message', user: 'U001', text: 'c', ts: String(base + 60) },
            // Gap of 6 minutes (360s) > SESSION_GAP_S (300s)
            { type: 'message', user: 'U002', text: 'd', ts: String(base + 420) },
            { type: 'message', user: 'U001', text: 'e', ts: String(base + 450) },
          ],
          response_metadata: {},
        }),
        headers: new Headers(),
      });

      const { getSlackActivitiesForDate } = await freshSlack();
      const result = await getSlackActivitiesForDate('2024-01-15');
      expect(result.length).toBe(1);
      // Session 1: 3 msgs * 15s + 30s overhead = 75s
      // Session 2: 2 msgs * 15s + 30s overhead = 60s
      // Total: 135s
      expect(result[0].totalSeconds).toBe(135);
    });

    it('should cap session time at 300s', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          ok: true,
          channels: [
            { id: 'C001', name: 'busy', is_channel: true, is_im: false, is_mpim: false, is_group: false },
          ],
          response_metadata: {},
        }),
        headers: new Headers(),
      });

      // 30 messages in one session -> 30*15+30 = 480s -> capped to 300s
      const base = new Date('2024-01-15T10:00:00').getTime() / 1000;
      const messages = Array.from({ length: 30 }, (_, i) => ({
        type: 'message',
        user: 'U001',
        text: `msg${i}`,
        ts: String(base + i * 10), // 10s apart, all within session
      }));

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          ok: true,
          messages,
          response_metadata: {},
        }),
        headers: new Headers(),
      });

      const { getSlackActivitiesForDate } = await freshSlack();
      const result = await getSlackActivitiesForDate('2024-01-15');
      expect(result[0].totalSeconds).toBe(300); // capped at SESSION_MAX
    });

    it('should count distinct huddles separated by 30 min gap', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          ok: true,
          channels: [
            { id: 'C001', name: 'standups', is_channel: true, is_im: false, is_mpim: false, is_group: false },
          ],
          response_metadata: {},
        }),
        headers: new Headers(),
      });

      const base = new Date('2024-01-15T10:00:00').getTime() / 1000;
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          ok: true,
          messages: [
            { type: 'message', subtype: 'huddle_started', user: 'U001', ts: String(base) },
            // 2 hours later — different huddle (gap > 30 min)
            { type: 'message', subtype: 'huddle_started', user: 'U001', ts: String(base + 7200) },
          ],
          response_metadata: {},
        }),
        headers: new Headers(),
      });

      const { getSlackActivitiesForDate } = await freshSlack();
      const result = await getSlackActivitiesForDate('2024-01-15');
      expect(result.length).toBe(1);
      // 2 distinct huddles * 480s each = 960s
      expect(result[0].totalSeconds).toBe(960);
    });

    it('should handle conversation.history errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          ok: true,
          channels: [
            { id: 'C001', name: 'restricted', is_channel: true, is_im: false, is_mpim: false, is_group: false },
          ],
          response_metadata: {},
        }),
        headers: new Headers(),
      });

      // channel_not_found error — slackFetch wraps this in a Response
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ ok: false, error: 'channel_not_found' }),
        headers: new Headers(),
      });

      const { getSlackActivitiesForDate } = await freshSlack();
      const result = await getSlackActivitiesForDate('2024-01-15');
      expect(result).toEqual([]);
    });

    it('should use activity cache for repeated calls', async () => {
      // First call: conversations.list + conversations.history
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          ok: true,
          channels: [
            { id: 'C001', name: 'cached', is_channel: true, is_im: false, is_mpim: false, is_group: false },
          ],
          response_metadata: {},
        }),
        headers: new Headers(),
      });
      const ts1 = String(new Date('2024-01-15T10:00:00').getTime() / 1000);
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          ok: true,
          messages: [{ type: 'message', user: 'U001', text: 'hi', ts: ts1 }],
          response_metadata: {},
        }),
        headers: new Headers(),
      });

      const { getSlackActivitiesForDate } = await freshSlack();
      const result1 = await getSlackActivitiesForDate('2024-01-15');
      expect(result1.length).toBe(1);

      // Second call: should use cache, no additional fetches
      const result2 = await getSlackActivitiesForDate('2024-01-15');
      expect(result2).toEqual(result1);
      expect(mockFetch).toHaveBeenCalledTimes(2); // Only the original 2 calls
    });
  });

  describe('getSlackActivitiesForDateRange', () => {
    it('should return empty map when Slack is not configured', async () => {
      process.env.SLACK_USER_TOKEN = '';
      const { getSlackActivitiesForDateRange } = await freshSlack();

      const result = await getSlackActivitiesForDateRange('2024-01-15', '2024-01-16');
      expect(result.size).toBe(0);
    });
  });
});
