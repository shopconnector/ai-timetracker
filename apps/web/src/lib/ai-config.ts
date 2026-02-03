// AI Configuration for TimeTracker
// Manages AI settings stored in localStorage with server-side env fallback

const AI_CONFIG_KEY = 'timetracker_ai_config';

export type AIProvider = 'openrouter' | 'openai' | 'anthropic';

export interface AIModelInfo {
  id: string;
  name: string;
  provider: string;
  costPer1kTokens: number;
  speed: 'fast' | 'medium' | 'slow';
  quality: 'high' | 'medium' | 'low';
  description: string;
}

export const AI_MODELS: AIModelInfo[] = [
  {
    id: 'anthropic/claude-3.5-haiku',
    name: 'Claude 3.5 Haiku',
    provider: 'Anthropic',
    costPer1kTokens: 0.25,
    speed: 'fast',
    quality: 'high',
    description: 'Szybki i tani, dobra jakość',
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    costPer1kTokens: 3.0,
    speed: 'medium',
    quality: 'high',
    description: 'Najwyższa jakość, droższy',
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'OpenAI',
    costPer1kTokens: 0.15,
    speed: 'fast',
    quality: 'medium',
    description: 'Najtańszy od OpenAI',
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    costPer1kTokens: 5.0,
    speed: 'medium',
    quality: 'high',
    description: 'Premium OpenAI',
  },
  {
    id: 'google/gemini-flash-1.5',
    name: 'Gemini Flash 1.5',
    provider: 'Google',
    costPer1kTokens: 0.075,
    speed: 'fast',
    quality: 'medium',
    description: 'Najtańszy w zestawieniu',
  },
  {
    id: 'meta-llama/llama-3.1-70b-instruct',
    name: 'Llama 3.1 70B',
    provider: 'Meta',
    costPer1kTokens: 0.59,
    speed: 'medium',
    quality: 'medium',
    description: 'Open source, dobra jakość',
  },
  {
    id: 'qwen/qwen-2.5-72b-instruct',
    name: 'Qwen 2.5 72B',
    provider: 'Alibaba',
    costPer1kTokens: 0.35,
    speed: 'medium',
    quality: 'medium',
    description: 'Open source chiński model',
  },
];

export interface AIConfig {
  enabled: boolean;
  provider: AIProvider;
  apiKey: string; // Stored only in localStorage (client-side)
  model: string;
  temperature: number;
  maxTokens: number;
  autoFallback: boolean; // Automatically try other models if primary fails
  lastTested: string | null;
  lastTestSuccess: boolean;
  lastTestMessage: string;
  usageStats: {
    totalCalls: number;
    successfulCalls: number;
    totalTokens: number;
    totalCost: number;
  };
}

const DEFAULT_CONFIG: AIConfig = {
  enabled: true,
  provider: 'openrouter',
  apiKey: '',
  model: 'anthropic/claude-3.5-haiku',
  temperature: 0.3,
  maxTokens: 200,
  autoFallback: true,
  lastTested: null,
  lastTestSuccess: false,
  lastTestMessage: '',
  usageStats: {
    totalCalls: 0,
    successfulCalls: 0,
    totalTokens: 0,
    totalCost: 0,
  },
};

// Get AI config from localStorage
export function getAIConfig(): AIConfig {
  if (typeof window === 'undefined') {
    return DEFAULT_CONFIG;
  }

  const stored = localStorage.getItem(AI_CONFIG_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_CONFIG, ...parsed };
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  return DEFAULT_CONFIG;
}

// Save AI config to localStorage
export function saveAIConfig(config: Partial<AIConfig>): AIConfig {
  if (typeof window === 'undefined') {
    return DEFAULT_CONFIG;
  }

  const current = getAIConfig();
  const updated = { ...current, ...config };
  localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(updated));
  return updated;
}

// Check if AI is properly configured and enabled
export function isAIEnabled(): boolean {
  const config = getAIConfig();
  return config.enabled && !!config.apiKey;
}

// Get model info by ID
export function getModelInfo(modelId: string): AIModelInfo | undefined {
  return AI_MODELS.find(m => m.id === modelId);
}

// Test AI connection
export async function testAIConnection(config?: Partial<AIConfig>): Promise<{
  success: boolean;
  message: string;
  responseTime?: number;
}> {
  const currentConfig = config ? { ...getAIConfig(), ...config } : getAIConfig();

  if (!currentConfig.apiKey) {
    return { success: false, message: 'Brak klucza API' };
  }

  const startTime = Date.now();

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${currentConfig.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer':
          typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5666',
        'X-Title': 'TimeTracker',
      },
      body: JSON.stringify({
        model: currentConfig.model,
        messages: [{ role: 'user', content: 'Odpowiedz jednym slowem: OK' }],
        temperature: 0.1,
        max_tokens: 10,
      }),
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'Blad polaczenia';

      if (response.status === 401) {
        errorMessage = 'Nieprawidlowy klucz API';
      } else if (response.status === 402) {
        errorMessage = 'Brak srodkow na koncie';
      } else if (response.status === 429) {
        errorMessage = 'Przekroczono limit zapytan';
      } else {
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorMessage;
        } catch {
          // Keep default message
        }
      }

      // Save test result
      saveAIConfig({
        lastTested: new Date().toISOString(),
        lastTestSuccess: false,
        lastTestMessage: errorMessage,
      });

      return { success: false, message: errorMessage, responseTime };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Save successful test
    saveAIConfig({
      lastTested: new Date().toISOString(),
      lastTestSuccess: true,
      lastTestMessage: `OK (${responseTime}ms)`,
    });

    return {
      success: true,
      message: `Polaczenie OK: "${content.trim()}" (${responseTime}ms)`,
      responseTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Nieznany blad';

    saveAIConfig({
      lastTested: new Date().toISOString(),
      lastTestSuccess: false,
      lastTestMessage: errorMessage,
    });

    return { success: false, message: errorMessage };
  }
}

// Update usage statistics
export function updateUsageStats(success: boolean, tokensUsed: number = 0, model?: string): void {
  const config = getAIConfig();
  const modelInfo = model ? getModelInfo(model) : getModelInfo(config.model);
  const cost = modelInfo ? (tokensUsed / 1000) * modelInfo.costPer1kTokens : 0;

  saveAIConfig({
    usageStats: {
      totalCalls: config.usageStats.totalCalls + 1,
      successfulCalls: config.usageStats.successfulCalls + (success ? 1 : 0),
      totalTokens: config.usageStats.totalTokens + tokensUsed,
      totalCost: config.usageStats.totalCost + cost,
    },
  });
}

// Reset usage statistics
export function resetUsageStats(): void {
  saveAIConfig({
    usageStats: {
      totalCalls: 0,
      successfulCalls: 0,
      totalTokens: 0,
      totalCost: 0,
    },
  });
}

// Get AI status summary
export function getAIStatus(): {
  enabled: boolean;
  configured: boolean;
  model: string;
  modelName: string;
  lastTest: string | null;
  lastTestOk: boolean;
  stats: AIConfig['usageStats'];
} {
  const config = getAIConfig();
  const modelInfo = getModelInfo(config.model);

  return {
    enabled: config.enabled,
    configured: !!config.apiKey,
    model: config.model,
    modelName: modelInfo?.name || config.model,
    lastTest: config.lastTested,
    lastTestOk: config.lastTestSuccess,
    stats: config.usageStats,
  };
}

// Export config (without sensitive data)
export function exportAIConfigSafe(): Omit<AIConfig, 'apiKey'> {
  const config = getAIConfig();
  const { apiKey, ...safe } = config;
  return safe;
}

// Clear all AI config
export function clearAIConfig(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AI_CONFIG_KEY);
}
