// OpenRouter LLM Client for ticket suggestions
import type { SuggestRequest, SuggestResponse } from '@timetracker/shared';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface OpenRouterConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface TicketSuggestion {
  ticket: string;
  confidence: number;
  reason: string;
  source: 'llm' | 'project_mapping' | 'history' | 'keyword';
}

// Suggest tickets for a batch of activities
export async function suggestTickets(
  request: SuggestRequest,
  config: OpenRouterConfig
): Promise<SuggestResponse> {
  const { activities, availableTickets, context } = request;
  const suggestions: SuggestResponse['suggestions'] = {};

  // Process activities in batches
  const batchSize = 5;
  for (let i = 0; i < activities.length; i += batchSize) {
    const batch = activities.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (activity) => {
        // 1. Check project mapping first (highest priority)
        if (activity.project && context?.projectMappings) {
          const mapping = context.projectMappings.find(
            m => m.project.toLowerCase() === activity.project?.toLowerCase() && m.confidence >= 0.5
          );
          if (mapping) {
            return {
              id: activity.id,
              suggestion: {
                ticket: mapping.taskKey,
                confidence: mapping.confidence,
                reason: `Projekt "${activity.project}" zmapowany`,
                source: 'project_mapping' as const,
              },
            };
          }
        }

        // 2. Try LLM suggestion
        try {
          const llmResult = await callLLM(activity, availableTickets, context, config);
          if (llmResult) {
            return { id: activity.id, suggestion: llmResult };
          }
        } catch {
          // LLM failed, fall back to keyword matching
        }

        // 3. Keyword-based fallback
        const keywordResult = getKeywordSuggestion(activity.title, activity.app, activity.project);
        return { id: activity.id, suggestion: keywordResult };
      })
    );

    for (const { id, suggestion } of batchResults) {
      suggestions[id] = suggestion;
    }
  }

  return { suggestions };
}

// Call LLM API
async function callLLM(
  activity: SuggestRequest['activities'][0],
  availableTickets: SuggestRequest['availableTickets'],
  context: SuggestRequest['context'],
  config: OpenRouterConfig
): Promise<TicketSuggestion | null> {
  const ticketList = availableTickets
    .slice(0, 30)
    .map(t => `- ${t.key}: ${t.name}${t.project ? ` (projekt: ${t.project})` : ''}`)
    .join('\n');

  let contextSection = '';

  if (activity.project) {
    contextSection += `\nProjekt (z edytora kodu): ${activity.project}`;
  }

  if (context?.recentTasks && context.recentTasks.length > 0) {
    const recentList = context.recentTasks
      .slice(0, 5)
      .map(t => `${t.key} (użyty ${t.useCount}x)`)
      .join(', ');
    contextSection += `\nOstatnio używane taski: ${recentList}`;
  }

  if (context?.projectMappings && activity.project) {
    const mapping = context.projectMappings.find(
      m => m.project.toLowerCase() === activity.project?.toLowerCase()
    );
    if (mapping) {
      contextSection += `\nHistoryczne mapowanie: ${mapping.taskKey} (confidence: ${mapping.confidence})`;
    }
  }

  const prompt = `Jesteś asystentem do przypisywania czasu pracy do tasków Jira.

Tytuł aktywności: "${activity.title}"
Aplikacja: ${activity.app}${contextSection}
${activity.duration ? `Czas trwania: ${Math.round(activity.duration / 60)} minut` : ''}

Dostępne tickety:
${ticketList}

Zasady:
1. Priorytetyzuj taski związane z podanym projektem
2. Weź pod uwagę historyczne mapowania
3. Kod/programowanie → development/implementation
4. Slack, spotkania → meetings/communication
5. Dokumentacja → research/documentation

Odpowiedz TYLKO w JSON:
{
  "ticket": "KLUCZ-XXX",
  "confidence": 0.0-1.0,
  "reason": "uzasadnienie (max 50 znaków)"
}`;

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://timetracker.team',
      'X-Title': 'TimeTracker Team',
    },
    body: JSON.stringify({
      model: config.model || 'anthropic/claude-3.5-haiku',
      messages: [{ role: 'user', content: prompt }],
      temperature: config.temperature ?? 0.3,
      max_tokens: config.maxTokens ?? 200,
    }),
  });

  if (!response.ok) {
    console.error('OpenRouter error:', await response.text());
    return null;
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      ticket: parsed.ticket,
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
      reason: parsed.reason || 'Sugestia LLM',
      source: 'llm',
    };
  }

  return null;
}

// Keyword-based fallback suggestion
function getKeywordSuggestion(
  title: string,
  app: string,
  project?: string
): TicketSuggestion {
  const titleLower = title.toLowerCase();
  const appLower = app.toLowerCase();

  // AI/Automation
  if (
    titleLower.includes('claude') ||
    titleLower.includes('chatgpt') ||
    titleLower.includes('comet') ||
    titleLower.includes('automation') ||
    titleLower.includes('n8n') ||
    appLower.includes('terminal')
  ) {
    return {
      ticket: 'AUTO',
      confidence: 0.5,
      reason: 'Praca AI/Automation (keyword)',
      source: 'keyword',
    };
  }

  // Communication
  if (appLower.includes('slack') || appLower.includes('teams') || appLower.includes('whatsapp')) {
    return {
      ticket: 'COMM',
      confidence: 0.5,
      reason: 'Komunikacja (app match)',
      source: 'keyword',
    };
  }

  // Code editor
  if (['cursor', 'code', 'vscode', 'visual studio'].some(e => appLower.includes(e))) {
    return {
      ticket: 'DEV',
      confidence: 0.4,
      reason: project ? `Programowanie: ${project}` : 'Programowanie (editor)',
      source: 'keyword',
    };
  }

  // Default
  return {
    ticket: 'OTHER',
    confidence: 0.3,
    reason: 'Brak dopasowania',
    source: 'keyword',
  };
}
