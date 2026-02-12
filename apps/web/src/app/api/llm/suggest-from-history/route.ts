import { NextRequest, NextResponse } from 'next/server';
import { getRecentDescriptions } from '@/lib/tempo';
import { callGemini, extractJSON } from '@/lib/gemini';

interface SuggestEntry {
  description: string;
  category: string;
  durationMinutes: number;
  startTime?: string;
  endTime?: string;
}

interface AvailableTicket {
  key: string;
  name: string;
  project?: string;
}

interface SuggestFromHistoryRequest {
  entries: SuggestEntry[];
  availableTickets: AvailableTicket[];
}

interface SuggestedEntry {
  index: number;
  suggestedTicket: string;
  ticketConfidence: number;
  matchSource: 'history' | 'ai' | 'none';
}

// Tokenize text into meaningful keywords
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9ąćęłńóśźż\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);
}

// Jaccard similarity between two sets of words
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

// Keyword match: find best ticket from history
function matchFromHistory(
  entry: SuggestEntry,
  history: Array<{ issueKey: string; description: string; date: string }>,
  availableTicketKeys: Set<string>
): { ticket: string; confidence: number } | null {
  const entryWords = tokenize(entry.description);
  if (entryWords.length === 0) return null;

  // Count matches per ticket key
  const ticketScores: Record<string, { totalScore: number; count: number }> = {};

  for (const h of history) {
    if (!availableTicketKeys.has(h.issueKey)) continue;

    const historyWords = tokenize(h.description);
    const similarity = jaccardSimilarity(entryWords, historyWords);

    if (similarity > 0.15) {
      if (!ticketScores[h.issueKey]) {
        ticketScores[h.issueKey] = { totalScore: 0, count: 0 };
      }
      ticketScores[h.issueKey].totalScore += similarity;
      ticketScores[h.issueKey].count++;
    }
  }

  // Find best match
  let bestTicket = '';
  let bestScore = 0;

  for (const [key, data] of Object.entries(ticketScores)) {
    // Score = avg similarity * frequency boost
    const avgScore = data.totalScore / data.count;
    const freqBoost = Math.min(data.count / 3, 1.5); // more matches = more confident
    const score = avgScore * freqBoost;

    if (score > bestScore) {
      bestScore = score;
      bestTicket = key;
    }
  }

  if (bestTicket && bestScore >= 0.2) {
    return {
      ticket: bestTicket,
      confidence: Math.min(bestScore, 0.95),
    };
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body: SuggestFromHistoryRequest = await request.json();
    const { entries, availableTickets } = body;

    if (!entries || entries.length === 0) {
      return NextResponse.json({ error: 'entries are required' }, { status: 400 });
    }

    // Fetch recent worklog history
    const history = await getRecentDescriptions(14, 50);

    const availableTicketKeys = new Set(availableTickets.map(t => t.key));
    const results: SuggestedEntry[] = [];
    const unmatchedEntries: { index: number; entry: SuggestEntry }[] = [];

    // Step A: Keyword matching (fast, no AI)
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const match = matchFromHistory(entry, history, availableTicketKeys);

      if (match && match.confidence >= 0.3) {
        results.push({
          index: i,
          suggestedTicket: match.ticket,
          ticketConfidence: match.confidence,
          matchSource: 'history',
        });
      } else {
        unmatchedEntries.push({ index: i, entry });
        results.push({
          index: i,
          suggestedTicket: '',
          ticketConfidence: 0,
          matchSource: 'none',
        });
      }
    }

    // Step B: AI fallback for unmatched entries
    if (unmatchedEntries.length > 0 && history.length > 0) {
      const geminiKey = process.env.GEMINI_API_KEY;
      const openRouterKey = process.env.OPENROUTER_API_KEY;

      if (geminiKey || openRouterKey) {
        const historyText = history
          .slice(0, 30)
          .map(h => `- ${h.issueKey}: "${h.description}"`)
          .join('\n');

        const ticketList = availableTickets
          .slice(0, 40)
          .map(t => `- ${t.key}: ${t.name}`)
          .join('\n');

        const entriesText = unmatchedEntries
          .map(u => `[${u.index}] "${u.entry.description}" (${u.entry.category}, ${u.entry.durationMinutes}min)`)
          .join('\n');

        const prompt = `Na podstawie historii worklogow uzytkownika, dopasuj wpisy do ticketow Jira.

HISTORIA WORKLOGOW (ostatnie 14 dni):
${historyText}

DOSTEPNE TICKETY:
${ticketList}

WPISY DO DOPASOWANIA:
${entriesText}

ZASADY:
- Dopasuj na podstawie podobienstwa opisu do historii
- Jesli wpis mowi o spotkaniu, szukaj ticketa z meetingami w historii
- Jesli wpis mowi o research, szukaj ticketa R&D w historii
- Ustaw ticketConfidence 0.5-0.8 dla dobrych dopasowan
- Jesli nie jestes pewny, ustaw suggestedTicket na "" i ticketConfidence na 0

FORMAT JSON:
{
  "suggestions": [
    { "index": 0, "suggestedTicket": "BCI-395", "ticketConfidence": 0.7 }
  ]
}`;

        let aiResult: { suggestions?: Array<{ index: number; suggestedTicket: string; ticketConfidence: number }> } | null = null;

        // Try Gemini
        if (geminiKey) {
          try {
            const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
            const response = await callGemini(prompt, {
              apiKey: geminiKey,
              model: geminiModel,
              temperature: 0.3,
              maxTokens: 2000,
            });
            aiResult = extractJSON(response);
          } catch (error) {
            console.error('Gemini error in suggest-from-history:', error);
          }
        }

        // Fallback to OpenRouter
        if (!aiResult && openRouterKey) {
          try {
            const llmModel = process.env.LLM_MODEL || 'anthropic/claude-3.5-haiku';
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${openRouterKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost:3001',
                'X-Title': 'TimeTracker',
              },
              body: JSON.stringify({
                model: llmModel,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 2000,
              }),
            });

            if (response.ok) {
              const data = await response.json();
              const content = data.choices?.[0]?.message?.content || '';
              aiResult = extractJSON(content);
            }
          } catch (error) {
            console.error('OpenRouter error in suggest-from-history:', error);
          }
        }

        // Apply AI suggestions
        if (aiResult?.suggestions) {
          for (const suggestion of aiResult.suggestions) {
            const resultEntry = results.find(r => r.index === suggestion.index);
            if (
              resultEntry &&
              resultEntry.matchSource === 'none' &&
              suggestion.suggestedTicket &&
              availableTicketKeys.has(suggestion.suggestedTicket)
            ) {
              resultEntry.suggestedTicket = suggestion.suggestedTicket;
              resultEntry.ticketConfidence = Math.min(suggestion.ticketConfidence || 0.5, 0.85);
              resultEntry.matchSource = 'ai';
            }
          }
        }
      }
    }

    return NextResponse.json({
      suggestions: results,
      historyCount: history.length,
      matchedCount: results.filter(r => r.suggestedTicket).length,
    });
  } catch (error) {
    console.error('Error in suggest-from-history:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to suggest from history' },
      { status: 500 }
    );
  }
}
