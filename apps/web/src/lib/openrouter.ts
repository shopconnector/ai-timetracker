// OpenRouter LLM Client for ticket suggestions

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const LLM_MODEL = process.env.LLM_MODEL || 'anthropic/claude-3.5-haiku';
const LLM_TEMPERATURE = parseFloat(process.env.LLM_TEMPERATURE || '0.3');

// Model configurations with specific settings
export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  temperature: number;
  maxTokens: number;
  costPer1kTokens: number;
  speed: 'fast' | 'medium' | 'slow';
  quality: 'high' | 'medium' | 'low';
}

export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'anthropic/claude-3.5-haiku': {
    id: 'anthropic/claude-3.5-haiku',
    name: 'Claude 3.5 Haiku',
    provider: 'Anthropic',
    temperature: 0.3,
    maxTokens: 200,
    costPer1kTokens: 0.25,
    speed: 'fast',
    quality: 'high',
  },
  'anthropic/claude-3.5-sonnet': {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    temperature: 0.2,
    maxTokens: 300,
    costPer1kTokens: 3.0,
    speed: 'medium',
    quality: 'high',
  },
  'openai/gpt-4o-mini': {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'OpenAI',
    temperature: 0.3,
    maxTokens: 200,
    costPer1kTokens: 0.15,
    speed: 'fast',
    quality: 'medium',
  },
  'openai/gpt-4o': {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    temperature: 0.2,
    maxTokens: 300,
    costPer1kTokens: 5.0,
    speed: 'medium',
    quality: 'high',
  },
  'google/gemini-flash-1.5': {
    id: 'google/gemini-flash-1.5',
    name: 'Gemini Flash 1.5',
    provider: 'Google',
    temperature: 0.3,
    maxTokens: 200,
    costPer1kTokens: 0.075,
    speed: 'fast',
    quality: 'medium',
  },
  'meta-llama/llama-3.1-70b-instruct': {
    id: 'meta-llama/llama-3.1-70b-instruct',
    name: 'Llama 3.1 70B',
    provider: 'Meta',
    temperature: 0.3,
    maxTokens: 200,
    costPer1kTokens: 0.59,
    speed: 'medium',
    quality: 'medium',
  },
  'qwen/qwen-2.5-72b-instruct': {
    id: 'qwen/qwen-2.5-72b-instruct',
    name: 'Qwen 2.5 72B',
    provider: 'Alibaba',
    temperature: 0.3,
    maxTokens: 200,
    costPer1kTokens: 0.35,
    speed: 'medium',
    quality: 'medium',
  },
};

// Fallback model order (if primary fails)
const FALLBACK_MODELS = [
  'anthropic/claude-3.5-haiku',
  'openai/gpt-4o-mini',
  'google/gemini-flash-1.5',
];

export function getModelConfig(modelId: string): ModelConfig {
  return MODEL_CONFIGS[modelId] || MODEL_CONFIGS['anthropic/claude-3.5-haiku'];
}

export function getAllModels(): ModelConfig[] {
  return Object.values(MODEL_CONFIGS);
}

export interface TicketSuggestion {
  ticket: string;
  confidence: number;
  reason: string;
  source?: 'llm' | 'project_mapping' | 'history' | 'keyword';
}

export interface AvailableTicket {
  key: string;
  name: string;
  project?: string;
}

// Kontekst dla inteligentnych sugestii
export interface SuggestionContext {
  activity: {
    title: string;
    app: string;
    project?: string;      // Nazwa projektu z VS Code lub terminala
    duration?: number;     // Czas trwania w sekundach
    // Terminal-specific fields
    isTerminal?: boolean;
    shell?: string;        // bash, zsh, fish
    workingDir?: string;   // Katalog roboczy (PWD)
    gitBranch?: string;    // Branch git
    terminalCommand?: string; // Komenda
  };
  history?: {
    recentTasks?: Array<{ key: string; name: string; useCount: number }>;
    projectMappings?: Array<{ project: string; taskKey: string; taskName: string; confidence: number }>;
    activityMatches?: Array<{ key: string; name: string; matchedActivities: string[] }>;
  };
  availableTickets: AvailableTicket[];
}

// Get API key
function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error('OPENROUTER_API_KEY not set');
  }
  return key;
}

// Suggest a ticket based on activity title (basic version for backward compatibility)
export async function suggestTicket(
  activityTitle: string,
  app: string,
  availableTickets: AvailableTicket[]
): Promise<TicketSuggestion> {
  return suggestTicketWithContext({
    activity: { title: activityTitle, app },
    availableTickets
  });
}

// Enhanced suggestion with full context
export async function suggestTicketWithContext(
  context: SuggestionContext
): Promise<TicketSuggestion> {
  const { activity, history, availableTickets } = context;

  // 1. Check project mapping first (highest priority)
  if (activity.project && history?.projectMappings) {
    const mapping = history.projectMappings.find(
      m => m.project.toLowerCase() === activity.project?.toLowerCase() && m.confidence >= 0.5
    );
    if (mapping) {
      return {
        ticket: mapping.taskKey,
        confidence: mapping.confidence,
        reason: `Projekt "${activity.project}" jest zmapowany do tego taska`,
        source: 'project_mapping'
      };
    }
  }

  // 2. Check activity history match
  if (history?.activityMatches && history.activityMatches.length > 0) {
    const bestMatch = history.activityMatches[0];
    if (bestMatch) {
      return {
        ticket: bestMatch.key,
        confidence: 0.75,
        reason: `Podobne aktywności były logowane do tego taska`,
        source: 'history'
      };
    }
  }

  // 3. Try LLM suggestion if available (with automatic fallback)
  try {
    const apiKey = getApiKey();
    if (apiKey) {
      const llmResult = await callLLMWithFallback(context);
      if (llmResult) {
        return { ...llmResult, source: 'llm' };
      }
    }
  } catch {
    // LLM not available, continue to keyword matching
  }

  // 4. Keyword-based fallback
  return { ...getDefaultSuggestion(activity.title, activity.app, activity.project), source: 'keyword' };
}

// Build the suggestion prompt
function buildPrompt(context: SuggestionContext): string {
  const { activity, history, availableTickets } = context;

  const ticketList = availableTickets
    .slice(0, 30) // Limit to 30 tickets to avoid token overflow
    .map(t => `- ${t.key}: ${t.name}${t.project ? ` (projekt: ${t.project})` : ''}`)
    .join('\n');

  // Build context section
  let contextSection = '';

  if (activity.project) {
    contextSection += `\nProjekt: ${activity.project}`;
  }

  // Terminal-specific context - very important for LLM
  if (activity.isTerminal) {
    contextSection += `\n[TERMINAL ACTIVITY]`;
    if (activity.shell) {
      contextSection += `\n  Shell: ${activity.shell}`;
    }
    if (activity.workingDir) {
      contextSection += `\n  Katalog roboczy: ${activity.workingDir}`;
    }
    if (activity.gitBranch) {
      contextSection += `\n  Git branch: ${activity.gitBranch}`;
    }
    if (activity.terminalCommand) {
      contextSection += `\n  Komenda: ${activity.terminalCommand}`;
    }
  }

  if (history?.recentTasks && history.recentTasks.length > 0) {
    const recentList = history.recentTasks
      .slice(0, 5)
      .map(t => `${t.key} (użyty ${t.useCount}x)`)
      .join(', ');
    contextSection += `\nOstatnio używane taski: ${recentList}`;
  }

  if (history?.projectMappings && activity.project) {
    const mapping = history.projectMappings.find(
      m => m.project.toLowerCase() === activity.project?.toLowerCase()
    );
    if (mapping) {
      contextSection += `\nHistoryczne mapowanie dla projektu "${activity.project}": ${mapping.taskKey} (confidence: ${mapping.confidence})`;
    }
  }

  return `Jesteś asystentem do przypisywania czasu pracy do tasków Jira.

Tytuł aktywności: "${activity.title}"
Aplikacja: ${activity.app}${contextSection}
${activity.duration ? `Czas trwania: ${Math.round(activity.duration / 60)} minut` : ''}

Dostępne tickety:
${ticketList}

Zasady przypisywania:
1. Jeśli podano projekt, priorytetyzuj taski związane z tym projektem
2. Jeśli są historyczne mapowania, weź je pod uwagę
3. Dla pracy z kodem/programowania szukaj tasków development/implementation
4. [TERMINAL] Użyj katalogu roboczego i brancha git do identyfikacji projektu
5. [TERMINAL] Komendy git, npm, docker → development work
6. [TERMINAL] Jeśli katalog zawiera nazwę projektu, użyj jej do mapowania
7. Slack, spotkania → taski meetings/communication
8. Dokumentacja, research → taski research/documentation
9. Jeśli aktywność jest niejasna, wybierz najbezpieczniejszy task z niską confidence

Odpowiedz TYLKO w formacie JSON:
{
  "ticket": "KLUCZ-XXX",
  "confidence": 0.0-1.0,
  "reason": "krótkie uzasadnienie po polsku (max 50 znaków)"
}`;
}

// LLM response with metadata
export interface LLMResponse extends TicketSuggestion {
  model?: string;
  responseTime?: number;
  tokensUsed?: number;
}

// Call LLM API with model config and fallback support
async function callLLM(
  context: SuggestionContext,
  modelOverride?: string
): Promise<LLMResponse | null> {
  const startTime = Date.now();
  const modelId = modelOverride || LLM_MODEL;
  const config = getModelConfig(modelId);
  const prompt = buildPrompt(context);

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3001',
        'X-Title': 'TimeTracker'
      },
      body: JSON.stringify({
        model: config.id,
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: config.temperature,
        max_tokens: config.maxTokens
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OpenRouter error (${config.name}):`, errorText);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const tokensUsed = data.usage?.total_tokens;

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        ticket: parsed.ticket,
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
        reason: parsed.reason || 'Sugestia LLM',
        model: config.name,
        responseTime: Date.now() - startTime,
        tokensUsed,
      };
    }

    return null;
  } catch (error) {
    console.error(`LLM call error (${config.name}):`, error);
    return null;
  }
}

// Call LLM with automatic fallback to other models
async function callLLMWithFallback(context: SuggestionContext): Promise<LLMResponse | null> {
  const primaryModel = LLM_MODEL;

  // Try primary model first
  const result = await callLLM(context, primaryModel);
  if (result) return result;

  // Try fallback models
  for (const fallbackModel of FALLBACK_MODELS) {
    if (fallbackModel === primaryModel) continue;

    console.log(`Primary model failed, trying fallback: ${fallbackModel}`);
    const fallbackResult = await callLLM(context, fallbackModel);
    if (fallbackResult) {
      return { ...fallbackResult, reason: `${fallbackResult.reason} (fallback)` };
    }
  }

  return null;
}

// Test a specific model (for settings/comparison)
export async function testModel(
  modelId: string,
  testActivity: { title: string; app: string },
  availableTickets: AvailableTicket[]
): Promise<{ success: boolean; result?: LLMResponse; error?: string }> {
  try {
    const context: SuggestionContext = {
      activity: testActivity,
      availableTickets,
    };

    const result = await callLLM(context, modelId);
    if (result) {
      return { success: true, result };
    }
    return { success: false, error: 'No response from model' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Compare multiple models on the same activity
export async function compareModels(
  modelIds: string[],
  testActivity: { title: string; app: string },
  availableTickets: AvailableTicket[]
): Promise<Map<string, { success: boolean; result?: LLMResponse; error?: string }>> {
  const results = new Map();

  const comparisons = await Promise.all(
    modelIds.map(async (modelId) => {
      const result = await testModel(modelId, testActivity, availableTickets);
      return { modelId, result };
    })
  );

  for (const { modelId, result } of comparisons) {
    results.set(modelId, result);
  }

  return results;
}

// Default suggestion - NO hardcoded tickets, let user choose
// Instead of returning hardcoded BCI-xxx tickets, return empty ticket
// so user must manually select the right one
function getDefaultSuggestion(title: string, app: string, project?: string): TicketSuggestion {
  const titleLower = title.toLowerCase();
  const appLower = app.toLowerCase();

  // Provide hints based on keywords, but NO automatic ticket assignment
  let reason = 'Wybierz ticket ręcznie';

  // AI/Automation work
  if (
    titleLower.includes('claude') ||
    titleLower.includes('chatgpt') ||
    titleLower.includes('comet') ||
    titleLower.includes('automation') ||
    titleLower.includes('n8n')
  ) {
    reason = 'Praca AI/Automation - wybierz ticket';
  }
  // Daily standup
  else if (titleLower.includes('daily') || titleLower.includes('standup')) {
    reason = 'Daily standup - wybierz ticket';
  }
  // Slack/Communication
  else if (appLower.includes('slack') || appLower.includes('teams') || appLower.includes('discord')) {
    reason = 'Komunikacja - wybierz ticket';
  }
  // Code editor work
  else if (['cursor', 'code', 'visual studio code', 'vscode', 'webstorm'].some(e => appLower.includes(e))) {
    reason = project ? `Projekt: ${project} - wybierz ticket` : 'Praca z kodem - wybierz ticket';
  }
  // Terminal work
  else if (appLower.includes('terminal') || appLower.includes('iterm')) {
    reason = project ? `Terminal: ${project} - wybierz ticket` : 'Terminal - wybierz ticket';
  }

  // Return empty ticket - user must select manually
  return {
    ticket: '',
    confidence: 0,
    reason
  };
}

// Batch suggest tickets for multiple activities
export async function suggestTicketsForActivities(
  activities: Array<{ id: string; title: string; app: string }>,
  availableTickets: AvailableTicket[]
): Promise<Map<string, TicketSuggestion>> {
  const suggestions = new Map<string, TicketSuggestion>();

  // Process in parallel with rate limiting
  const batchSize = 5;
  for (let i = 0; i < activities.length; i += batchSize) {
    const batch = activities.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (activity) => {
        const suggestion = await suggestTicket(activity.title, activity.app, availableTickets);
        return { id: activity.id, suggestion };
      })
    );

    for (const { id, suggestion } of results) {
      suggestions.set(id, suggestion);
    }
  }

  return suggestions;
}
