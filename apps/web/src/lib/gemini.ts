// Native Gemini API client (Google AI Studio)

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface GeminiConfig {
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

const DEFAULT_GEMINI_CONFIG: GeminiConfig = {
  apiKey: '',
  model: 'gemini-2.5-flash',
  temperature: 0.3,
  maxTokens: 2000,
};

/**
 * Call Gemini API with a prompt and return the text response.
 */
export async function callGemini(prompt: string, config?: Partial<GeminiConfig>): Promise<string> {
  const cfg = { ...DEFAULT_GEMINI_CONFIG, ...config };

  if (!cfg.apiKey) {
    throw new Error('Brak klucza GEMINI_API_KEY');
  }

  const url = `${GEMINI_BASE_URL}/${cfg.model}:generateContent?key=${cfg.apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: cfg.temperature ?? 0.3,
        maxOutputTokens: cfg.maxTokens ?? 2000,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Gemini API error (${response.status})`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.error?.message || errorMessage;
    } catch {
      // keep default
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
}

/**
 * Extract JSON from Gemini response text.
 * Gemini sometimes wraps JSON in markdown code blocks.
 */
export function extractJSON<T = unknown>(text: string): T | null {
  if (!text) return null;

  // Try direct parse first
  try {
    return JSON.parse(text) as T;
  } catch {
    // continue to extraction
  }

  // Try extracting from markdown code block ```json ... ```
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1]) as T;
    } catch {
      // continue
    }
  }

  // Try finding first { ... } or [ ... ]
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]) as T;
    } catch {
      // give up
    }
  }

  return null;
}

/**
 * Test Gemini API connection with a simple prompt.
 */
export async function testGeminiConnection(
  apiKey: string,
  model?: string
): Promise<{
  success: boolean;
  message: string;
  responseTime?: number;
}> {
  const startTime = Date.now();
  try {
    const result = await callGemini('Odpowiedz jednym slowem: OK', {
      apiKey,
      model: model || 'gemini-2.5-flash',
      maxTokens: 10,
      temperature: 0.1,
    });
    const responseTime = Date.now() - startTime;
    return {
      success: true,
      message: `Polaczenie OK: "${(result || '').trim().substring(0, 50)}" (${responseTime}ms)`,
      responseTime,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Nieznany blad',
      responseTime,
    };
  }
}
