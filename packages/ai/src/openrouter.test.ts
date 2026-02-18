import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SuggestRequest } from '@timetracker/shared';
import { suggestTickets, type OpenRouterConfig } from './openrouter';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const defaultConfig: OpenRouterConfig = {
  apiKey: 'test-key-123',
  model: 'anthropic/claude-3.5-haiku',
};

function makeRequest(overrides: Partial<SuggestRequest> = {}): SuggestRequest {
  return {
    activities: [
      { id: 'a1', title: 'index.ts — timetracker — Cursor', app: 'Cursor', duration: 3600 },
    ],
    availableTickets: [
      { key: 'PROJ-101', name: 'Implement time tracking' },
      { key: 'PROJ-102', name: 'Fix dashboard bug' },
    ],
    ...overrides,
  };
}

function mockLLMResponse(ticket: string, confidence: number, reason: string) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({
      choices: [{
        message: {
          content: JSON.stringify({ ticket, confidence, reason }),
        },
      }],
    }),
  });
}

// ========================================
// PROJECT MAPPING (highest priority)
// ========================================

describe('suggestTickets — project mapping', () => {
  it('should use project mapping when confidence >= 0.5', async () => {
    const request = makeRequest({
      activities: [
        { id: 'a1', title: 'file.ts', app: 'Cursor', project: 'timetracker', duration: 3600 },
      ],
      context: {
        projectMappings: [
          { project: 'timetracker', taskKey: 'TT-100', confidence: 0.8 },
        ],
      },
    });

    const result = await suggestTickets(request, defaultConfig);
    expect(result.suggestions['a1']).toEqual({
      ticket: 'TT-100',
      confidence: 0.8,
      reason: 'Projekt "timetracker" zmapowany',
      source: 'project_mapping',
    });
    // No fetch should be called (project mapping skips LLM)
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should ignore mapping with confidence < 0.5', async () => {
    const request = makeRequest({
      activities: [
        { id: 'a1', title: 'file.ts', app: 'Cursor', project: 'timetracker', duration: 3600 },
      ],
      context: {
        projectMappings: [
          { project: 'timetracker', taskKey: 'TT-100', confidence: 0.3 },
        ],
      },
    });

    // LLM will be called since mapping confidence is too low
    mockLLMResponse('PROJ-101', 0.7, 'Best match');

    const result = await suggestTickets(request, defaultConfig);
    expect(result.suggestions['a1'].source).toBe('llm');
    expect(result.suggestions['a1'].ticket).toBe('PROJ-101');
  });

  it('should match project case-insensitively', async () => {
    const request = makeRequest({
      activities: [
        { id: 'a1', title: 'file.ts', app: 'Cursor', project: 'TimeTracker', duration: 3600 },
      ],
      context: {
        projectMappings: [
          { project: 'timetracker', taskKey: 'TT-100', confidence: 0.9 },
        ],
      },
    });

    const result = await suggestTickets(request, defaultConfig);
    expect(result.suggestions['a1'].source).toBe('project_mapping');
  });
});

// ========================================
// LLM SUGGESTION
// ========================================

describe('suggestTickets — LLM', () => {
  it('should call OpenRouter API with correct headers and body', async () => {
    mockLLMResponse('PROJ-101', 0.8, 'Time tracking match');

    const request = makeRequest();
    await suggestTickets(request, defaultConfig);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key-123',
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://timetracker.team',
          'X-Title': 'TimeTracker Team',
        }),
      }),
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('anthropic/claude-3.5-haiku');
    expect(body.temperature).toBe(0.3);
    expect(body.max_tokens).toBe(200);
    expect(body.messages[0].role).toBe('user');
    expect(body.messages[0].content).toContain('index.ts — timetracker — Cursor');
    expect(body.messages[0].content).toContain('PROJ-101');
  });

  it('should parse LLM JSON response', async () => {
    mockLLMResponse('PROJ-102', 0.85, 'Bug fix match');

    const request = makeRequest();
    const result = await suggestTickets(request, defaultConfig);

    expect(result.suggestions['a1']).toEqual({
      ticket: 'PROJ-102',
      confidence: 0.85,
      reason: 'Bug fix match',
      source: 'llm',
    });
  });

  it('should clamp confidence to [0, 1]', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{
          message: {
            content: JSON.stringify({ ticket: 'T-1', confidence: 1.5, reason: 'high' }),
          },
        }],
      }),
    });

    const request = makeRequest();
    const result = await suggestTickets(request, defaultConfig);
    expect(result.suggestions['a1'].confidence).toBe(1);
  });

  it('should default confidence to 0.5 when missing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{
          message: {
            content: JSON.stringify({ ticket: 'T-1', reason: 'test' }),
          },
        }],
      }),
    });

    const request = makeRequest();
    const result = await suggestTickets(request, defaultConfig);
    expect(result.suggestions['a1'].confidence).toBe(0.5);
  });

  it('should default reason when missing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{
          message: {
            content: JSON.stringify({ ticket: 'T-1', confidence: 0.7 }),
          },
        }],
      }),
    });

    const request = makeRequest();
    const result = await suggestTickets(request, defaultConfig);
    expect(result.suggestions['a1'].reason).toBe('Sugestia LLM');
  });

  it('should fall back to keyword on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });

    const request = makeRequest();
    const result = await suggestTickets(request, defaultConfig);
    // Cursor → keyword → DEV
    expect(result.suggestions['a1'].source).toBe('keyword');
    expect(result.suggestions['a1'].ticket).toBe('DEV');
  });

  it('should fall back to keyword when LLM returns no JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{
          message: { content: 'I cannot determine the ticket.' },
        }],
      }),
    });

    const request = makeRequest();
    const result = await suggestTickets(request, defaultConfig);
    expect(result.suggestions['a1'].source).toBe('keyword');
  });

  it('should use custom model and temperature from config', async () => {
    mockLLMResponse('T-1', 0.7, 'match');

    const customConfig: OpenRouterConfig = {
      apiKey: 'key',
      model: 'google/gemini-pro',
      temperature: 0.8,
      maxTokens: 500,
    };

    await suggestTickets(makeRequest(), customConfig);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('google/gemini-pro');
    expect(body.temperature).toBe(0.8);
    expect(body.max_tokens).toBe(500);
  });

  it('should include context in prompt', async () => {
    mockLLMResponse('PROJ-101', 0.9, 'match');

    const request = makeRequest({
      activities: [
        { id: 'a1', title: 'code review', app: 'Chrome', project: 'myapp', duration: 1800 },
      ],
      context: {
        recentTasks: [
          { key: 'PROJ-101', name: 'Task A', useCount: 5 },
        ],
        projectMappings: [
          { project: 'myapp', taskKey: 'PROJ-99', confidence: 0.3 }, // below threshold
        ],
      },
    });

    await suggestTickets(request, defaultConfig);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const prompt = body.messages[0].content;
    expect(prompt).toContain('Projekt (z edytora kodu): myapp');
    expect(prompt).toContain('PROJ-101 (użyty 5x)');
    expect(prompt).toContain('Historyczne mapowanie: PROJ-99');
    expect(prompt).toContain('30 minut'); // 1800/60
  });
});

// ========================================
// KEYWORD FALLBACK
// ========================================

describe('suggestTickets — keyword fallback', () => {
  // All keyword tests: make LLM return empty to trigger fallback
  function mockEmptyLLM() {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: '' } }],
      }),
    });
  }

  it('should suggest AUTO for AI/automation keywords', async () => {
    mockEmptyLLM();
    const request = makeRequest({
      activities: [{ id: 'a1', title: 'claude code review', app: 'Terminal', duration: 600 }],
    });
    const result = await suggestTickets(request, defaultConfig);
    expect(result.suggestions['a1'].ticket).toBe('AUTO');
    expect(result.suggestions['a1'].source).toBe('keyword');
  });

  it('should suggest COMM for Slack/Teams', async () => {
    mockEmptyLLM();
    const request = makeRequest({
      activities: [{ id: 'a1', title: 'team chat', app: 'Slack', duration: 600 }],
    });
    const result = await suggestTickets(request, defaultConfig);
    expect(result.suggestions['a1'].ticket).toBe('COMM');
  });

  it('should suggest DEV for code editors', async () => {
    mockEmptyLLM();
    const request = makeRequest({
      activities: [{ id: 'a1', title: 'editing files', app: 'Cursor', duration: 600 }],
    });
    const result = await suggestTickets(request, defaultConfig);
    expect(result.suggestions['a1'].ticket).toBe('DEV');
  });

  it('should suggest DEV with project name for editors', async () => {
    mockEmptyLLM();
    const request = makeRequest({
      activities: [{ id: 'a1', title: 'editing', app: 'VSCode', project: 'myapp', duration: 600 }],
    });
    const result = await suggestTickets(request, defaultConfig);
    expect(result.suggestions['a1'].ticket).toBe('DEV');
    expect(result.suggestions['a1'].reason).toContain('myapp');
  });

  it('should suggest OTHER as default fallback', async () => {
    mockEmptyLLM();
    const request = makeRequest({
      activities: [{ id: 'a1', title: 'random activity', app: 'UnknownApp', duration: 600 }],
    });
    const result = await suggestTickets(request, defaultConfig);
    expect(result.suggestions['a1'].ticket).toBe('OTHER');
    expect(result.suggestions['a1'].confidence).toBe(0.3);
  });
});

// ========================================
// BATCHING
// ========================================

describe('suggestTickets — batching', () => {
  it('should process multiple activities', async () => {
    // 3 activities, all going to LLM
    mockLLMResponse('T-1', 0.9, 'match 1');
    mockLLMResponse('T-2', 0.8, 'match 2');
    mockLLMResponse('T-3', 0.7, 'match 3');

    const request = makeRequest({
      activities: [
        { id: 'a1', title: 'task 1', app: 'Chrome', duration: 600 },
        { id: 'a2', title: 'task 2', app: 'Chrome', duration: 600 },
        { id: 'a3', title: 'task 3', app: 'Chrome', duration: 600 },
      ],
    });

    const result = await suggestTickets(request, defaultConfig);
    expect(Object.keys(result.suggestions)).toHaveLength(3);
    expect(result.suggestions['a1'].ticket).toBe('T-1');
    expect(result.suggestions['a2'].ticket).toBe('T-2');
    expect(result.suggestions['a3'].ticket).toBe('T-3');
  });

  it('should handle mixed sources (mapping + LLM + keyword)', async () => {
    // a2 goes to LLM (no mapping), a3 goes to LLM but fails → keyword
    mockLLMResponse('PROJ-102', 0.75, 'LLM match');
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Rate limited'),
    });

    const request = makeRequest({
      activities: [
        { id: 'a1', title: 'file.ts', app: 'Cursor', project: 'tracker', duration: 3600 },
        { id: 'a2', title: 'review PR', app: 'Chrome', duration: 1800 },
        { id: 'a3', title: 'deploy script', app: 'Terminal', duration: 600 },
      ],
      context: {
        projectMappings: [
          { project: 'tracker', taskKey: 'TRK-1', confidence: 0.9 },
        ],
      },
    });

    const result = await suggestTickets(request, defaultConfig);
    expect(result.suggestions['a1'].source).toBe('project_mapping');
    expect(result.suggestions['a1'].ticket).toBe('TRK-1');
    expect(result.suggestions['a2'].source).toBe('llm');
    expect(result.suggestions['a2'].ticket).toBe('PROJ-102');
    expect(result.suggestions['a3'].source).toBe('keyword');
    expect(result.suggestions['a3'].ticket).toBe('AUTO'); // Terminal → AUTO
  });
});
