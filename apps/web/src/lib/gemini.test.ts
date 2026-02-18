import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callGemini, extractJSON, testGeminiConnection } from './gemini';

// ========================================
// PURE FUNCTION: extractJSON
// ========================================

describe('extractJSON', () => {
  it('should parse valid JSON directly', () => {
    expect(extractJSON('{"key": "value"}')).toEqual({ key: 'value' });
  });

  it('should parse JSON array directly', () => {
    expect(extractJSON('[1, 2, 3]')).toEqual([1, 2, 3]);
  });

  it('should extract JSON from markdown code block', () => {
    const text = '```json\n{"ticket": "PROJ-123"}\n```';
    expect(extractJSON(text)).toEqual({ ticket: 'PROJ-123' });
  });

  it('should extract JSON from code block without json tag', () => {
    const text = '```\n{"data": true}\n```';
    expect(extractJSON(text)).toEqual({ data: true });
  });

  it('should extract JSON object from surrounding text', () => {
    const text = 'Here is the result: {"answer": 42} hope that helps';
    expect(extractJSON(text)).toEqual({ answer: 42 });
  });

  it('should extract JSON array from surrounding text', () => {
    const text = 'Response: [{"id": 1}, {"id": 2}]';
    expect(extractJSON(text)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('should return null for empty string', () => {
    expect(extractJSON('')).toBeNull();
  });

  it('should return null for non-JSON text', () => {
    expect(extractJSON('This is just plain text with no JSON')).toBeNull();
  });

  it('should return null for invalid JSON in code block', () => {
    const text = '```json\n{invalid json}\n```';
    // Falls through to regex extraction, which also finds {invalid json} but fails to parse
    expect(extractJSON(text)).toBeNull();
  });

  it('should handle nested JSON objects', () => {
    const nested = { outer: { inner: { deep: 'value' } } };
    expect(extractJSON(JSON.stringify(nested))).toEqual(nested);
  });

  it('should handle whitespace around JSON in code block', () => {
    const text = '```json\n  { "spaced": true }  \n```';
    expect(extractJSON(text)).toEqual({ spaced: true });
  });
});

// ========================================
// API FUNCTIONS (mock fetch)
// ========================================

describe('callGemini', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should throw when apiKey is missing', async () => {
    await expect(callGemini('test prompt')).rejects.toThrow('Brak klucza GEMINI_API_KEY');
  });

  it('should call Gemini API with correct URL and body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: '{"result": "ok"}' }] } }],
      }),
    });

    await callGemini('Suggest a ticket', { apiKey: 'test-key-123', model: 'gemini-2.5-flash' });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=test-key-123',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.any(String),
      }),
    );

    // Verify body structure
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.contents[0].parts[0].text).toBe('Suggest a ticket');
    expect(body.generationConfig.temperature).toBe(0.3);
    expect(body.generationConfig.maxOutputTokens).toBe(2000);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.thinkingConfig.thinkingBudget).toBe(0);
  });

  it('should return text from successful response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: 'Hello world' }] } }],
      }),
    });

    const result = await callGemini('test', { apiKey: 'key' });
    expect(result).toBe('Hello world');
  });

  it('should return empty string when response has no candidates', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ candidates: [] }),
    });

    const result = await callGemini('test', { apiKey: 'key' });
    expect(result).toBe('');
  });

  it('should merge custom config with defaults', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
      }),
    });

    await callGemini('test', {
      apiKey: 'key',
      temperature: 0.9,
      maxTokens: 500,
      responseMimeType: 'text/plain',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.generationConfig.temperature).toBe(0.9);
    expect(body.generationConfig.maxOutputTokens).toBe(500);
    expect(body.generationConfig.responseMimeType).toBe('text/plain');
  });

  it('should throw with parsed error message on API failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () => Promise.resolve(JSON.stringify({
        error: { message: 'API key expired' },
      })),
    });

    await expect(callGemini('test', { apiKey: 'bad-key' })).rejects.toThrow('API key expired');
  });

  it('should throw with status code when error body is not JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('<html>Internal Server Error</html>'),
    });

    await expect(callGemini('test', { apiKey: 'key' })).rejects.toThrow('Gemini API error (500)');
  });

  it('should handle missing content parts gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [] } }],
      }),
    });

    const result = await callGemini('test', { apiKey: 'key' });
    expect(result).toBe('');
  });
});

describe('testGeminiConnection', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return success on valid connection', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: 'OK' }] } }],
      }),
    });

    const result = await testGeminiConnection('test-key');
    expect(result.success).toBe(true);
    expect(result.message).toContain('Polaczenie OK');
    expect(result.message).toContain('OK');
    expect(result.responseTime).toBeGreaterThanOrEqual(0);
  });

  it('should return failure on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve(JSON.stringify({
        error: { message: 'Invalid API key' },
      })),
    });

    const result = await testGeminiConnection('bad-key');
    expect(result.success).toBe(false);
    expect(result.message).toBe('Invalid API key');
    expect(result.responseTime).toBeGreaterThanOrEqual(0);
  });

  it('should return failure on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'));

    const result = await testGeminiConnection('key');
    expect(result.success).toBe(false);
    expect(result.message).toBe('fetch failed');
  });

  it('should use custom model when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: 'OK' }] } }],
      }),
    });

    await testGeminiConnection('key', 'gemini-2.0-flash');
    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain('gemini-2.0-flash:generateContent');
  });

  it('should truncate long response in message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: 'A'.repeat(100) }] } }],
      }),
    });

    const result = await testGeminiConnection('key');
    expect(result.success).toBe(true);
    // Message contains truncated response (50 chars max)
    expect(result.message).toContain('A'.repeat(50));
    expect(result.message).not.toContain('A'.repeat(51));
  });
});
