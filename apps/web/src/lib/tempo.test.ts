import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  roundToMinutes,
  calculateEndTime,
  createWorklog,
  getWorklogs,
  getWorklogsForDate,
  getLoggedTimeForDate,
  getWorkAttributes,
  getRecentDescriptions,
  checkWorklogOverlap,
  getWorklogsWithTimeRanges,
  type Worklog,
  type WorklogCreate,
} from './tempo';

// --- Mock factories ---

function mockWorklog(overrides: Partial<Worklog> = {}): Worklog {
  return {
    tempoWorklogId: 1001,
    issue: { key: 'BCI-123', id: 10001 },
    author: { accountId: 'user-123' },
    timeSpentSeconds: 3600,
    startDate: '2024-01-15',
    startTime: '09:00:00',
    description: 'Working on feature',
    createdAt: '2024-01-15T09:00:00Z',
    ...overrides,
  };
}

function mockWorklogCreate(overrides: Partial<WorklogCreate> = {}): WorklogCreate {
  return {
    issueKey: 'BCI-123',
    issueId: 10001,
    timeSpentSeconds: 3600,
    startDate: '2024-01-15',
    startTime: '09:00:00',
    description: 'Test worklog',
    ...overrides,
  };
}

// --- Pure function tests ---

describe('roundToMinutes', () => {
  it('should round up to nearest minute', () => {
    expect(roundToMinutes(30)).toBe(60);   // 30s → 1min
    expect(roundToMinutes(61)).toBe(120);  // 61s → 2min
    expect(roundToMinutes(1)).toBe(60);    // 1s → 1min
  });

  it('should keep exact minutes unchanged', () => {
    expect(roundToMinutes(60)).toBe(60);
    expect(roundToMinutes(120)).toBe(120);
    expect(roundToMinutes(3600)).toBe(3600);
  });

  it('should return 0 for zero, negative, or NaN', () => {
    expect(roundToMinutes(0)).toBe(0);
    expect(roundToMinutes(-100)).toBe(0);
    expect(roundToMinutes(NaN)).toBe(0);
  });

  it('should never round down (ceil behavior)', () => {
    // 90s = 1.5min → should round to 2min = 120s
    expect(roundToMinutes(90)).toBe(120);
    // 59s → should round to 1min = 60s, not 0
    expect(roundToMinutes(59)).toBe(60);
  });
});

describe('calculateEndTime', () => {
  it('should calculate end time from start + duration', () => {
    expect(calculateEndTime('09:00', 3600)).toBe('10:00');  // 1 hour
    expect(calculateEndTime('09:00', 1800)).toBe('09:30');  // 30 min
    expect(calculateEndTime('14:30', 5400)).toBe('16:00');  // 1.5 hours
  });

  it('should handle midnight crossing', () => {
    // 23:00 + 2h = 25:00 (represented as 25:00, no date wrapping)
    expect(calculateEndTime('23:00', 7200)).toBe('25:00');
  });

  it('should handle HH:MM:SS format', () => {
    expect(calculateEndTime('09:00:00', 3600)).toBe('10:00');
  });

  it('should handle zero duration', () => {
    expect(calculateEndTime('09:00', 0)).toBe('09:00');
  });
});

// --- API function tests (mocked fetch) ---

describe('Tempo API functions', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.TEMPO_API_TOKEN = 'test-tempo-token';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  describe('createWorklog', () => {
    it('should POST worklog to Tempo API', async () => {
      const created = mockWorklog();
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(created),
      } as Response);

      const result = await createWorklog(mockWorklogCreate());
      expect(result.tempoWorklogId).toBe(1001);
      expect(fetch).toHaveBeenCalledOnce();

      const [url, options] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe('https://api.tempo.io/4/worklogs');
      expect(options?.method).toBe('POST');

      const body = JSON.parse(options?.body as string);
      expect(body.issueId).toBe(10001);
      expect(body.timeSpentSeconds).toBe(3600);
      expect(body.startDate).toBe('2024-01-15');
      expect(body.remainingEstimateSeconds).toBe(0); // default
    });

    it('should throw when issueId is missing', async () => {
      const worklog = mockWorklogCreate({ issueId: undefined });
      await expect(createWorklog(worklog)).rejects.toThrow('issueId is required');
    });

    it('should include authorAccountId when provided', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockWorklog()),
      } as Response);

      await createWorklog(mockWorklogCreate({ authorAccountId: 'author-456' }));
      const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
      expect(body.authorAccountId).toBe('author-456');
    });

    it('should include billableSeconds when provided', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockWorklog()),
      } as Response);

      await createWorklog(mockWorklogCreate({ billableSeconds: 1800 }));
      const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
      expect(body.billableSeconds).toBe(1800);
    });

    it('should include attributes when provided', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockWorklog()),
      } as Response);

      await createWorklog(mockWorklogCreate({
        attributes: [{ key: '_Activity_', value: 'development' }],
      }));
      const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
      expect(body.attributes).toEqual([{ key: '_Activity_', value: 'development' }]);
    });

    it('should throw with status-specific message on 401', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: { get: () => 'text/html' },
        text: () => Promise.resolve('<html>error</html>'),
      } as unknown as Response);

      await expect(createWorklog(mockWorklogCreate())).rejects.toThrow('Token Tempo wygasł');
    });

    it('should parse JSON error message from Tempo', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({
          errors: [{ message: 'Worklog exceeds maximum', errorType: 'VALIDATION' }],
        }),
      } as unknown as Response);

      await expect(createWorklog(mockWorklogCreate())).rejects.toThrow('Worklog exceeds maximum');
    });

    it('should throw with 409 conflict message', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 409,
        headers: { get: () => 'text/plain' },
        text: () => Promise.resolve('conflict'),
      } as unknown as Response);

      await expect(createWorklog(mockWorklogCreate())).rejects.toThrow('Konflikt');
    });
  });

  describe('auth header', () => {
    it('should throw when TEMPO_API_TOKEN is not set', async () => {
      delete process.env.TEMPO_API_TOKEN;
      await expect(createWorklog(mockWorklogCreate())).rejects.toThrow('TEMPO_API_TOKEN not set');
    });

    it('should include Bearer token header', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockWorklog()),
      } as Response);

      await createWorklog(mockWorklogCreate());
      const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer test-tempo-token');
    });
  });

  describe('getWorklogs', () => {
    it('should fetch worklogs for date range', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: [mockWorklog(), mockWorklog({ tempoWorklogId: 1002 })],
        }),
      } as Response);

      const worklogs = await getWorklogs('2024-01-15', '2024-01-19');
      expect(worklogs).toHaveLength(2);

      const url = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(url).toContain('from=2024-01-15');
      expect(url).toContain('to=2024-01-19');
    });

    it('should return empty array when results missing', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response);

      const worklogs = await getWorklogs('2024-01-15', '2024-01-15');
      expect(worklogs).toEqual([]);
    });

    it('should throw on error response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      await expect(getWorklogs('2024-01-15', '2024-01-15')).rejects.toThrow('Tempo API error: 500');
    });
  });

  describe('getWorklogsForDate', () => {
    it('should call getWorklogs with same date for from and to', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      } as Response);

      await getWorklogsForDate('2024-01-15');
      const url = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(url).toContain('from=2024-01-15&to=2024-01-15');
    });
  });

  describe('getLoggedTimeForDate', () => {
    it('should sum timeSpentSeconds for all worklogs', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: [
            mockWorklog({ timeSpentSeconds: 3600 }),
            mockWorklog({ timeSpentSeconds: 1800 }),
            mockWorklog({ timeSpentSeconds: 900 }),
          ],
        }),
      } as Response);

      const total = await getLoggedTimeForDate('2024-01-15');
      expect(total).toBe(6300); // 3600 + 1800 + 900
    });

    it('should return 0 for no worklogs', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      } as Response);

      expect(await getLoggedTimeForDate('2024-01-15')).toBe(0);
    });
  });

  describe('getWorkAttributes', () => {
    it('should return work attributes', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: [
            { key: '_Activity_', name: 'Activity', type: 'STATIC_LIST', required: true },
          ],
        }),
      } as Response);

      const attrs = await getWorkAttributes();
      expect(attrs).toHaveLength(1);
      expect(attrs[0].key).toBe('_Activity_');
    });

    it('should return empty array on error', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 403,
      } as Response);

      expect(await getWorkAttributes()).toEqual([]);
    });
  });

  describe('getRecentDescriptions', () => {
    it('should return worklogs with descriptions longer than 5 chars', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: [
            mockWorklog({ description: 'Detailed work on feature X', issue: { key: 'BCI-1' } }),
            mockWorklog({ description: 'Hi', issue: { key: 'BCI-2' } }),   // too short
            mockWorklog({ description: '', issue: { key: 'BCI-3' } }),      // empty
            mockWorklog({ description: 'Another task description', issue: { key: 'BCI-4' } }),
          ],
        }),
      } as Response);

      const descriptions = await getRecentDescriptions();
      expect(descriptions).toHaveLength(2);
      expect(descriptions[0].issueKey).toBe('BCI-1');
      expect(descriptions[1].issueKey).toBe('BCI-4');
    });
  });

  describe('checkWorklogOverlap', () => {
    it('should detect overlapping worklogs', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: [
            mockWorklog({ startTime: '09:00:00', timeSpentSeconds: 3600, issue: { key: 'BCI-1' } }),
          ],
        }),
      } as Response);

      // New worklog 09:30-10:30 overlaps with existing 09:00-10:00
      const result = await checkWorklogOverlap('2024-01-15', '09:30', '10:30');
      expect(result.hasOverlap).toBe(true);
      expect(result.conflictingWorklogs).toHaveLength(1);
      expect(result.conflictingWorklogs[0].issueKey).toBe('BCI-1');
    });

    it('should return no overlap for non-conflicting times', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: [
            mockWorklog({ startTime: '09:00:00', timeSpentSeconds: 3600 }),
          ],
        }),
      } as Response);

      // New worklog 11:00-12:00, existing 09:00-10:00 — no overlap
      const result = await checkWorklogOverlap('2024-01-15', '11:00', '12:00');
      expect(result.hasOverlap).toBe(false);
      expect(result.conflictingWorklogs).toEqual([]);
    });

    it('should exclude specified worklog from overlap check', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: [
            mockWorklog({ tempoWorklogId: 999, startTime: '09:00:00', timeSpentSeconds: 3600 }),
          ],
        }),
      } as Response);

      // Would overlap, but excluded by ID
      const result = await checkWorklogOverlap('2024-01-15', '09:30', '10:30', 999);
      expect(result.hasOverlap).toBe(false);
    });

    it('should handle adjacent worklogs (no overlap)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: [
            mockWorklog({ startTime: '09:00:00', timeSpentSeconds: 3600 }),
          ],
        }),
      } as Response);

      // Exactly at boundary: existing ends at 10:00, new starts at 10:00
      const result = await checkWorklogOverlap('2024-01-15', '10:00', '11:00');
      expect(result.hasOverlap).toBe(false);
    });
  });

  describe('getWorklogsWithTimeRanges', () => {
    it('should return worklogs with calculated end times, sorted by start', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: [
            mockWorklog({ tempoWorklogId: 2, startTime: '14:00:00', timeSpentSeconds: 1800, issue: { key: 'BCI-2' } }),
            mockWorklog({ tempoWorklogId: 1, startTime: '09:00:00', timeSpentSeconds: 3600, issue: { key: 'BCI-1' } }),
          ],
        }),
      } as Response);

      const ranges = await getWorklogsWithTimeRanges('2024-01-15');
      expect(ranges).toHaveLength(2);
      // Sorted by start time
      expect(ranges[0].issueKey).toBe('BCI-1');
      expect(ranges[0].startTime).toBe('09:00');
      expect(ranges[0].endTime).toBe('10:00');
      expect(ranges[0].durationMinutes).toBe(60);
      expect(ranges[1].issueKey).toBe('BCI-2');
      expect(ranges[1].startTime).toBe('14:00');
      expect(ranges[1].endTime).toBe('14:30');
      expect(ranges[1].durationMinutes).toBe(30);
    });
  });
});
