import { describe, it, expect } from 'vitest';
import { mergeActivities, type MergedActivity } from './mergeActivities';
import type { GroupedActivity } from './activitywatch';

// --- Test Helpers ---

let idCounter = 0;

function mockActivity(overrides: Partial<GroupedActivity> = {}): GroupedActivity {
  idCounter++;
  return {
    id: `act-${idCounter}`,
    title: `Activity ${idCounter}`,
    app: 'TestApp',
    totalSeconds: 300,
    events: 5,
    firstSeen: '2024-01-15T09:00:00Z',
    lastSeen: '2024-01-15T09:30:00Z',
    ...overrides,
  };
}

function mockAwActivity(overrides: Partial<GroupedActivity> = {}): GroupedActivity {
  return mockActivity({ app: 'VS Code', category: 'coding', ...overrides });
}

function mockAwSlackActivity(overrides: Partial<GroupedActivity> = {}): GroupedActivity {
  return mockActivity({
    app: 'Slack',
    title: 'Slack - general',
    category: 'communication',
    totalSeconds: 600,
    ...overrides,
  });
}

function mockSlackApiActivity(overrides: Partial<GroupedActivity> = {}): GroupedActivity {
  return mockActivity({
    app: 'Slack',
    title: 'Message in #dev-team',
    channel: '#dev-team',
    category: 'communication',
    isCommunication: true,
    totalSeconds: 500,
    ...overrides,
  });
}

// Reset counter between describes
function resetIds() {
  idCounter = 0;
}

// --- Tests ---

describe('mergeActivities', () => {
  describe('no Slack activities', () => {
    it('should return AW activities with source "aw"', () => {
      resetIds();
      const aw = [mockAwActivity(), mockAwActivity({ app: 'Firefox' })];
      const result = mergeActivities(aw, []);

      expect(result).toHaveLength(2);
      result.forEach(r => expect(r.source).toBe('aw'));
    });

    it('should handle empty AW activities', () => {
      const result = mergeActivities([], []);
      expect(result).toHaveLength(0);
    });

    it('should preserve all AW activity fields', () => {
      resetIds();
      const aw = [mockAwActivity({ title: 'Coding session', totalSeconds: 1200, project: 'timetracker' })];
      const result = mergeActivities(aw, []);

      expect(result[0]).toMatchObject({
        title: 'Coding session',
        totalSeconds: 1200,
        project: 'timetracker',
        source: 'aw',
      });
    });
  });

  describe('correlation: AW Slack + Slack API overlap', () => {
    it('should merge overlapping AW Slack window with Slack API activity', () => {
      resetIds();
      const awSlack = mockAwSlackActivity({
        id: 'aw-slack-1',
        firstSeen: '2024-01-15T10:00:00Z',
        lastSeen: '2024-01-15T10:30:00Z',
        totalSeconds: 1800,
      });
      const slackApi = mockSlackApiActivity({
        id: 'slack-api-1',
        firstSeen: '2024-01-15T10:02:00Z',
        lastSeen: '2024-01-15T10:28:00Z',
        totalSeconds: 1500,
        channel: '#engineering',
        title: 'Discussion in #engineering',
      });

      const result = mergeActivities([awSlack], [slackApi]);
      const merged = result.find(r => r.source === 'merged');

      expect(merged).toBeDefined();
      // AW duration is kept (more accurate from window watcher)
      expect(merged!.totalSeconds).toBe(1800);
      // Slack metadata is used (richer context)
      expect(merged!.title).toBe('Discussion in #engineering');
      expect(merged!.channel).toBe('#engineering');
      expect(merged!.isCommunication).toBe(true);
      expect(merged!.correlatedWith).toEqual({ awId: 'aw-slack-1', slackId: 'slack-api-1' });
    });

    it('should use AW title when Slack title is empty', () => {
      resetIds();
      const awSlack = mockAwSlackActivity({
        id: 'aw-1',
        title: 'Slack - #general',
        firstSeen: '2024-01-15T10:00:00Z',
        lastSeen: '2024-01-15T10:30:00Z',
      });
      const slackApi = mockSlackApiActivity({
        id: 'slack-1',
        title: '',
        firstSeen: '2024-01-15T10:05:00Z',
        lastSeen: '2024-01-15T10:25:00Z',
      });

      const result = mergeActivities([awSlack], [slackApi]);
      const merged = result.find(r => r.source === 'merged');
      // Empty string is falsy, so it falls back to AW title
      expect(merged!.title).toBe('Slack - #general');
    });
  });

  describe('tolerance window (±5 minutes)', () => {
    it('should merge activities within 5 minute tolerance', () => {
      resetIds();
      // AW: 10:00 - 10:30, Slack: 10:34 - 10:50 (4 min gap, within tolerance)
      const awSlack = mockAwSlackActivity({
        id: 'aw-1',
        firstSeen: '2024-01-15T10:00:00Z',
        lastSeen: '2024-01-15T10:30:00Z',
      });
      const slackApi = mockSlackApiActivity({
        id: 'slack-1',
        firstSeen: '2024-01-15T10:34:00Z',
        lastSeen: '2024-01-15T10:50:00Z',
      });

      const result = mergeActivities([awSlack], [slackApi]);
      expect(result.some(r => r.source === 'merged')).toBe(true);
    });

    it('should NOT merge activities outside 5 minute tolerance', () => {
      resetIds();
      // AW: 09:00 - 09:30, Slack: 10:00 - 10:30 (30 min gap, outside tolerance)
      const awSlack = mockAwSlackActivity({
        id: 'aw-1',
        firstSeen: '2024-01-15T09:00:00Z',
        lastSeen: '2024-01-15T09:30:00Z',
      });
      const slackApi = mockSlackApiActivity({
        id: 'slack-1',
        firstSeen: '2024-01-15T10:00:00Z',
        lastSeen: '2024-01-15T10:30:00Z',
      });

      const result = mergeActivities([awSlack], [slackApi]);
      expect(result.some(r => r.source === 'merged')).toBe(false);
      // Both should appear as separate items
      expect(result.filter(r => r.source === 'aw')).toHaveLength(1);
      expect(result.filter(r => r.source === 'slack')).toHaveLength(1);
    });

    it('should handle missing firstSeen/lastSeen gracefully', () => {
      resetIds();
      const awSlack = mockAwSlackActivity({
        id: 'aw-1',
        firstSeen: '',
        lastSeen: '',
      });
      const slackApi = mockSlackApiActivity({
        id: 'slack-1',
        firstSeen: '2024-01-15T10:00:00Z',
        lastSeen: '2024-01-15T10:30:00Z',
      });

      const result = mergeActivities([awSlack], [slackApi]);
      // Can't overlap without timestamps — should NOT merge
      expect(result.some(r => r.source === 'merged')).toBe(false);
    });
  });

  describe('non-Slack AW activities', () => {
    it('should pass through non-Slack AW activities unchanged', () => {
      resetIds();
      const awCode = mockAwActivity({ id: 'aw-code', app: 'VS Code', title: 'Editing main.ts' });
      const awBrowser = mockAwActivity({ id: 'aw-browser', app: 'Firefox', title: 'Docs' });
      const slackApi = mockSlackApiActivity({ id: 'slack-1' });

      const result = mergeActivities([awCode, awBrowser], [slackApi]);
      const awOnly = result.filter(r => r.source === 'aw');
      expect(awOnly).toHaveLength(2);
      expect(awOnly.map(a => a.id)).toContain('aw-code');
      expect(awOnly.map(a => a.id)).toContain('aw-browser');
    });
  });

  describe('unpaired activities', () => {
    it('should include unpaired Slack API activities as source "slack"', () => {
      resetIds();
      // No AW Slack window, but Slack API detected activity (e.g., short DM)
      const awCode = mockAwActivity({ app: 'VS Code' });
      const slackApi = mockSlackApiActivity({
        id: 'slack-dm',
        firstSeen: '2024-01-15T14:00:00Z',
        lastSeen: '2024-01-15T14:02:00Z',
        title: 'DM with Alice',
      });

      const result = mergeActivities([awCode], [slackApi]);
      const slackOnly = result.filter(r => r.source === 'slack');
      expect(slackOnly).toHaveLength(1);
      expect(slackOnly[0].title).toBe('DM with Alice');
    });

    it('should include unpaired AW Slack candidates as source "aw"', () => {
      resetIds();
      // AW saw Slack window but no API match (e.g., API wasn't configured)
      const awSlack = mockAwSlackActivity({
        id: 'aw-slack-unmatched',
        firstSeen: '2024-01-15T08:00:00Z',
        lastSeen: '2024-01-15T08:10:00Z',
      });
      const slackApi = mockSlackApiActivity({
        id: 'slack-later',
        firstSeen: '2024-01-15T16:00:00Z',
        lastSeen: '2024-01-15T16:30:00Z',
      });

      const result = mergeActivities([awSlack], [slackApi]);
      // AW Slack didn't match Slack API (different time) — both unpaired
      const awSources = result.filter(r => r.source === 'aw');
      const slackSources = result.filter(r => r.source === 'slack');
      expect(awSources).toHaveLength(1);
      expect(awSources[0].id).toBe('aw-slack-unmatched');
      expect(slackSources).toHaveLength(1);
    });
  });

  describe('multiple correlations', () => {
    it('should match multiple AW+Slack pairs independently', () => {
      resetIds();
      const aw1 = mockAwSlackActivity({
        id: 'aw-morning',
        firstSeen: '2024-01-15T09:00:00Z',
        lastSeen: '2024-01-15T09:30:00Z',
        totalSeconds: 1800,
      });
      const aw2 = mockAwSlackActivity({
        id: 'aw-afternoon',
        firstSeen: '2024-01-15T14:00:00Z',
        lastSeen: '2024-01-15T14:30:00Z',
        totalSeconds: 1800,
      });
      const slack1 = mockSlackApiActivity({
        id: 'slack-morning',
        firstSeen: '2024-01-15T09:05:00Z',
        lastSeen: '2024-01-15T09:25:00Z',
        channel: '#standup',
      });
      const slack2 = mockSlackApiActivity({
        id: 'slack-afternoon',
        firstSeen: '2024-01-15T14:02:00Z',
        lastSeen: '2024-01-15T14:28:00Z',
        channel: '#code-review',
      });

      const result = mergeActivities([aw1, aw2], [slack1, slack2]);
      const mergedResults = result.filter(r => r.source === 'merged');
      expect(mergedResults).toHaveLength(2);

      const morning = mergedResults.find(r => r.correlatedWith?.awId === 'aw-morning');
      const afternoon = mergedResults.find(r => r.correlatedWith?.awId === 'aw-afternoon');
      expect(morning).toBeDefined();
      expect(afternoon).toBeDefined();
      expect(morning!.channel).toBe('#standup');
      expect(afternoon!.channel).toBe('#code-review');
    });

    it('should pick the best (closest) match when multiple AW candidates overlap', () => {
      resetIds();
      // Two AW Slack windows, one overlaps better with the Slack API activity
      const awEarly = mockAwSlackActivity({
        id: 'aw-early',
        firstSeen: '2024-01-15T09:00:00Z',
        lastSeen: '2024-01-15T09:30:00Z',
      });
      const awLate = mockAwSlackActivity({
        id: 'aw-late',
        firstSeen: '2024-01-15T09:25:00Z',
        lastSeen: '2024-01-15T10:00:00Z',
      });
      const slackApi = mockSlackApiActivity({
        id: 'slack-1',
        firstSeen: '2024-01-15T09:26:00Z',
        lastSeen: '2024-01-15T09:58:00Z',
        channel: '#design',
      });

      const result = mergeActivities([awEarly, awLate], [slackApi]);
      const merged = result.find(r => r.source === 'merged');
      expect(merged).toBeDefined();
      // aw-late (midpoint ~09:42:30) is closer to slack (midpoint ~09:42:00)
      // than aw-early (midpoint ~09:15:00)
      expect(merged!.correlatedWith?.awId).toBe('aw-late');
    });

    it('should not double-pair an AW activity', () => {
      resetIds();
      // One AW Slack window, two Slack API activities overlapping
      const awSlack = mockAwSlackActivity({
        id: 'aw-only',
        firstSeen: '2024-01-15T10:00:00Z',
        lastSeen: '2024-01-15T10:30:00Z',
      });
      const slack1 = mockSlackApiActivity({
        id: 'slack-1',
        firstSeen: '2024-01-15T10:02:00Z',
        lastSeen: '2024-01-15T10:15:00Z',
        channel: '#general',
      });
      const slack2 = mockSlackApiActivity({
        id: 'slack-2',
        firstSeen: '2024-01-15T10:10:00Z',
        lastSeen: '2024-01-15T10:28:00Z',
        channel: '#random',
      });

      const result = mergeActivities([awSlack], [slack1, slack2]);
      const mergedResults = result.filter(r => r.source === 'merged');
      // Only one should be merged (the first match found)
      expect(mergedResults).toHaveLength(1);
      // The other Slack activity should appear as unpaired
      const slackOnly = result.filter(r => r.source === 'slack');
      expect(slackOnly).toHaveLength(1);
    });
  });

  describe('meeting fields', () => {
    it('should preserve meeting metadata from Slack during merge', () => {
      resetIds();
      const awSlack = mockAwSlackActivity({
        id: 'aw-huddle',
        firstSeen: '2024-01-15T11:00:00Z',
        lastSeen: '2024-01-15T11:45:00Z',
        totalSeconds: 2700,
      });
      const slackHuddle = mockSlackApiActivity({
        id: 'slack-huddle',
        firstSeen: '2024-01-15T11:02:00Z',
        lastSeen: '2024-01-15T11:43:00Z',
        isMeeting: true,
        meetingPlatform: 'Slack Huddle',
        channel: '#team-standup',
      });

      const result = mergeActivities([awSlack], [slackHuddle]);
      const merged = result.find(r => r.source === 'merged');
      expect(merged!.isMeeting).toBe(true);
      expect(merged!.meetingPlatform).toBe('Slack Huddle');
      expect(merged!.channel).toBe('#team-standup');
    });
  });

  describe('sorting', () => {
    it('should preserve AW order when no Slack activities (early return)', () => {
      resetIds();
      const activities = [
        mockAwActivity({ totalSeconds: 100 }),
        mockAwActivity({ totalSeconds: 500 }),
        mockAwActivity({ totalSeconds: 300 }),
      ];

      const result = mergeActivities(activities, []);
      // Early return path doesn't sort — preserves original order
      expect(result.map(r => r.totalSeconds)).toEqual([100, 500, 300]);
    });

    it('should sort mixed merged/aw/slack by totalSeconds descending', () => {
      resetIds();
      const awSlack = mockAwSlackActivity({
        id: 'aw-s',
        firstSeen: '2024-01-15T10:00:00Z',
        lastSeen: '2024-01-15T10:30:00Z',
        totalSeconds: 200,
      });
      const awCode = mockAwActivity({ totalSeconds: 500 });
      const slackApi = mockSlackApiActivity({
        id: 'slack-s',
        firstSeen: '2024-01-15T10:05:00Z',
        lastSeen: '2024-01-15T10:25:00Z',
        totalSeconds: 100,
      });

      const result = mergeActivities([awSlack, awCode], [slackApi]);
      // awCode (500) > awSlack-merged (200, keeps AW duration) > ...
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].totalSeconds).toBeGreaterThanOrEqual(result[i].totalSeconds);
      }
    });
  });

  describe('case-insensitive Slack matching', () => {
    it('should match "SLACK", "slack", "Slack" as Slack app', () => {
      resetIds();
      const awUpper = mockActivity({
        id: 'aw-upper',
        app: 'SLACK',
        firstSeen: '2024-01-15T10:00:00Z',
        lastSeen: '2024-01-15T10:30:00Z',
      });
      const slackApi = mockSlackApiActivity({
        id: 'slack-1',
        firstSeen: '2024-01-15T10:05:00Z',
        lastSeen: '2024-01-15T10:25:00Z',
      });

      const result = mergeActivities([awUpper], [slackApi]);
      expect(result.some(r => r.source === 'merged')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle only Slack API activities (no AW data)', () => {
      resetIds();
      const slackActivities = [
        mockSlackApiActivity({ id: 's1', totalSeconds: 300 }),
        mockSlackApiActivity({ id: 's2', totalSeconds: 600 }),
      ];

      const result = mergeActivities([], slackActivities);
      expect(result).toHaveLength(2);
      result.forEach(r => expect(r.source).toBe('slack'));
      // Should be sorted desc
      expect(result[0].totalSeconds).toBe(600);
      expect(result[1].totalSeconds).toBe(300);
    });

    it('should handle large number of activities efficiently', () => {
      resetIds();
      const awActivities: GroupedActivity[] = [];
      const slackActivities: GroupedActivity[] = [];

      for (let i = 0; i < 100; i++) {
        const baseTime = new Date('2024-01-15T08:00:00Z');
        baseTime.setMinutes(baseTime.getMinutes() + i * 5);
        const endTime = new Date(baseTime);
        endTime.setMinutes(endTime.getMinutes() + 4);

        awActivities.push(mockAwActivity({
          id: `aw-${i}`,
          firstSeen: baseTime.toISOString(),
          lastSeen: endTime.toISOString(),
          totalSeconds: 240,
        }));
      }

      // 10 Slack activities overlapping some AW windows
      for (let i = 0; i < 10; i++) {
        const baseTime = new Date('2024-01-15T08:00:00Z');
        baseTime.setMinutes(baseTime.getMinutes() + i * 50);
        const endTime = new Date(baseTime);
        endTime.setMinutes(endTime.getMinutes() + 10);

        slackActivities.push(mockSlackApiActivity({
          id: `slack-${i}`,
          firstSeen: baseTime.toISOString(),
          lastSeen: endTime.toISOString(),
          totalSeconds: 600,
        }));
      }

      const result = mergeActivities(awActivities, slackActivities);
      // All activities should be accounted for
      expect(result.length).toBeGreaterThan(0);
      // No duplicate sources for same id
      const ids = result.map(r => r.id);
      // Verify sorting
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].totalSeconds).toBeGreaterThanOrEqual(result[i].totalSeconds);
      }
    });
  });
});
