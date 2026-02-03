// Unified Suggestion Service for TimeTracker
// Combines: AI (OpenRouter) -> Rules Engine -> History Learning -> Manual

import { getAIConfig, isAIEnabled, updateUsageStats } from './ai-config';
import { matchRule, type Activity, type RuleMatchResult } from './rules-engine';
import {
  getProjectMappings,
  getTaskHistory,
  recordSuggestionFeedback as recordFeedback,
  type ProjectMapping,
  type TaskUsage,
} from './taskHistory';

export type SuggestionSource =
  | 'ai'
  | 'rule'
  | 'history'
  | 'project_mapping'
  | 'pattern'
  | 'manual_required';

export interface TicketSuggestion {
  ticketKey: string;
  ticketName?: string;
  confidence: number; // 0-1
  reason: string; // Human-readable explanation
  source: SuggestionSource;
  metadata?: {
    ruleName?: string;
    ruleId?: string;
    model?: string;
    responseTime?: number;
    patternMatch?: string;
  };
}

export interface SuggestionOptions {
  availableTickets?: Array<{ key: string; name: string; project?: string }>;
  skipAI?: boolean; // Force skip AI even if configured
  skipRules?: boolean; // Force skip rules engine
  skipHistory?: boolean; // Force skip history-based suggestions
  minConfidence?: number; // Minimum confidence to return (default: 0)
}

// Keywords for category detection
const CATEGORY_KEYWORDS = {
  communication: ['slack', 'teams', 'discord', 'whatsapp', 'telegram', 'email', 'outlook', 'mail'],
  meeting: ['zoom', 'meet', 'meeting', 'call', 'spotkanie', 'daily', 'standup'],
  coding: ['code', 'cursor', 'vscode', 'webstorm', 'intellij', 'vim', 'terminal', 'iterm'],
  documentation: ['confluence', 'notion', 'docs', 'wiki', 'readme', 'dokumentacja'],
  design: ['figma', 'sketch', 'adobe', 'photoshop', 'illustrator'],
  browser: ['chrome', 'firefox', 'safari', 'edge', 'brave'],
  ai: ['claude', 'chatgpt', 'gpt', 'copilot', 'comet', 'openai', 'anthropic'],
};

// Detect activity category based on app and title
function detectCategory(app: string, title: string): string {
  const combined = `${app} ${title}`.toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(k => combined.includes(k))) {
      return category;
    }
  }

  return 'other';
}

// Get category hint for manual selection
function getCategoryHint(app: string, title: string, project?: string): string {
  const category = detectCategory(app, title);

  const hints: Record<string, string> = {
    communication: 'Komunikacja - wybierz ticket',
    meeting: 'Spotkanie - wybierz ticket',
    coding: project
      ? `Programowanie (${project}) - wybierz ticket`
      : 'Programowanie - wybierz ticket',
    documentation: 'Dokumentacja - wybierz ticket',
    design: 'Design - wybierz ticket',
    browser: 'Przegladarka - wybierz ticket',
    ai: 'Praca z AI - wybierz ticket',
    other: 'Wybierz ticket recznie',
  };

  return hints[category] || hints.other;
}

// Extract keywords from title for pattern matching
function extractKeywords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(
      w => w.length > 2 && !['the', 'and', 'for', 'with', 'from', 'this', 'that'].includes(w)
    );
}

// Match activity against task history
function matchFromHistory(
  activity: Activity,
  taskHistory: TaskUsage[],
  projectMappings: ProjectMapping[]
): TicketSuggestion | null {
  // 1. Check project mappings first
  if (activity.project) {
    const mapping = projectMappings.find(
      m => m.project.toLowerCase() === activity.project?.toLowerCase() && m.confidence > 0.3
    );
    if (mapping) {
      return {
        ticketKey: mapping.taskKey,
        ticketName: mapping.taskName,
        confidence: mapping.confidence,
        reason: `Projekt "${activity.project}" zmapowany`,
        source: 'project_mapping',
      };
    }
  }

  // 2. Match against historical activities
  const activityKeywords = extractKeywords(activity.title);
  if (activityKeywords.length === 0) return null;

  let bestMatch: { task: TaskUsage; score: number } | null = null;

  for (const task of taskHistory) {
    // Check activities in history
    for (const historyActivity of task.activities) {
      const histKeywords = extractKeywords(historyActivity);
      const matchingWords = activityKeywords.filter(w => histKeywords.includes(w));
      const score = matchingWords.length / Math.max(activityKeywords.length, 1);

      if (score > 0.3 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { task, score };
      }
    }

    // Check project matches
    if (activity.project && task.projects.includes(activity.project)) {
      const projectScore = 0.5 + task.useCount * 0.02;
      if (!bestMatch || projectScore > bestMatch.score) {
        bestMatch = { task, score: projectScore };
      }
    }
  }

  if (bestMatch && bestMatch.score > 0.3) {
    return {
      ticketKey: bestMatch.task.key,
      ticketName: bestMatch.task.name,
      confidence: Math.min(bestMatch.score, 0.8),
      reason: 'Dopasowanie z historii',
      source: 'history',
      metadata: {
        patternMatch: `Score: ${Math.round(bestMatch.score * 100)}%`,
      },
    };
  }

  return null;
}

// Call AI for suggestion
async function suggestWithAI(
  activity: Activity,
  availableTickets: Array<{ key: string; name: string; project?: string }>
): Promise<TicketSuggestion | null> {
  const config = getAIConfig();

  if (!config.enabled || !config.apiKey) {
    return null;
  }

  try {
    // Build context for AI
    const ticketList = availableTickets
      .slice(0, 30)
      .map(t => `- ${t.key}: ${t.name}${t.project ? ` (${t.project})` : ''}`)
      .join('\n');

    const prompt = `Przypisz aktywnosc do ticketa Jira.

Aktywnosc: "${activity.title}"
Aplikacja: ${activity.app}
${activity.project ? `Projekt: ${activity.project}` : ''}

Dostepne tickety:
${ticketList}

Odpowiedz TYLKO JSON:
{"ticket": "KLUCZ-XXX", "confidence": 0.0-1.0, "reason": "krotkie uzasadnienie"}`;

    const startTime = Date.now();

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer':
          typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5666',
        'X-Title': 'TimeTracker',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: config.temperature,
        max_tokens: config.maxTokens,
      }),
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      updateUsageStats(false, 0, config.model);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const tokensUsed = data.usage?.total_tokens || 0;

    updateUsageStats(true, tokensUsed, config.model);

    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      // Validate ticket exists in available list
      const ticketExists = availableTickets.some(t => t.key === parsed.ticket);
      if (!ticketExists && parsed.ticket) {
        return null; // AI suggested non-existent ticket
      }

      return {
        ticketKey: parsed.ticket,
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
        reason: parsed.reason || 'Sugestia AI',
        source: 'ai',
        metadata: {
          model: config.model,
          responseTime,
        },
      };
    }

    return null;
  } catch (error) {
    console.error('AI suggestion error:', error);
    updateUsageStats(false, 0, config.model);
    return null;
  }
}

// Main suggestion function - tries all sources in order
export async function suggestTicketForActivity(
  activity: Activity,
  options: SuggestionOptions = {}
): Promise<TicketSuggestion> {
  const {
    availableTickets = [],
    skipAI = false,
    skipRules = false,
    skipHistory = false,
    minConfidence = 0,
  } = options;

  // 1. Try AI first (if enabled and not skipped)
  if (!skipAI && isAIEnabled() && availableTickets.length > 0) {
    try {
      const aiResult = await suggestWithAI(activity, availableTickets);
      if (aiResult && aiResult.confidence >= minConfidence && aiResult.ticketKey) {
        return aiResult;
      }
    } catch (error) {
      console.warn('AI suggestion failed, trying fallback:', error);
    }
  }

  // 2. Try Rules Engine
  if (!skipRules) {
    const ruleResult = matchRule(activity);
    if (ruleResult && ruleResult.confidence >= minConfidence) {
      return {
        ticketKey: ruleResult.ticketKey,
        ticketName: ruleResult.ticketName,
        confidence: ruleResult.confidence,
        reason: `Regula: ${ruleResult.ruleName}`,
        source: 'rule',
        metadata: {
          ruleName: ruleResult.ruleName,
          ruleId: ruleResult.ruleId,
        },
      };
    }
  }

  // 3. Try History-based matching
  if (!skipHistory) {
    const projectMappings = getProjectMappings();
    const taskHistory = getTaskHistory();

    const historyResult = matchFromHistory(activity, taskHistory, projectMappings);
    if (historyResult && historyResult.confidence >= minConfidence && historyResult.ticketKey) {
      return historyResult;
    }
  }

  // 4. Return manual required with category hint
  return {
    ticketKey: '',
    confidence: 0,
    reason: getCategoryHint(activity.app, activity.title, activity.project),
    source: 'manual_required',
  };
}

// Batch suggest for multiple activities
export async function suggestTicketsForActivities(
  activities: Activity[],
  options: SuggestionOptions = {}
): Promise<Map<string, TicketSuggestion>> {
  const results = new Map<string, TicketSuggestion>();

  // Process in batches to avoid overwhelming AI
  const batchSize = 5;

  for (let i = 0; i < activities.length; i += batchSize) {
    const batch = activities.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async activity => {
        const suggestion = await suggestTicketForActivity(activity, options);
        return { id: activity.id, suggestion };
      })
    );

    for (const { id, suggestion } of batchResults) {
      results.set(id, suggestion);
    }
  }

  return results;
}

// Record feedback for a suggestion
export function saveSuggestionFeedback(
  activityTitle: string,
  activityApp: string,
  suggestedTicket: string,
  isPositive: boolean,
  source: SuggestionSource,
  project?: string,
  actualTicket?: string
): void {
  recordFeedback(
    activityTitle,
    activityApp,
    suggestedTicket,
    isPositive,
    source as 'llm' | 'history' | 'project_mapping',
    project,
    actualTicket
  );
}

// Get suggestion statistics
export function getSuggestionStats(): {
  aiEnabled: boolean;
  aiConfigured: boolean;
  rulesCount: number;
  rulesEnabled: number;
  historySize: number;
  mappingsCount: number;
} {
  const aiConfig = getAIConfig();
  const projectMappings = getProjectMappings();
  const taskHistory = getTaskHistory();

  // Rules stats would require importing from rules-engine
  // but to avoid circular deps, we'll handle this in the component

  return {
    aiEnabled: aiConfig.enabled,
    aiConfigured: !!aiConfig.apiKey,
    rulesCount: 0, // Set in component
    rulesEnabled: 0,
    historySize: taskHistory.length,
    mappingsCount: projectMappings.length,
  };
}
