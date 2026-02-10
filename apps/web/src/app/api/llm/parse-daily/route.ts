import { NextRequest, NextResponse } from 'next/server';
import { callGemini, extractJSON } from '@/lib/gemini';

interface ParseDailyRequest {
  rawNotes: string;
  date: string;
  availableTickets: Array<{
    key: string;
    name: string;
    project: string;
  }>;
}

interface ParsedEntry {
  startTime: string;
  endTime: string;
  durationMinutes: number;
  description: string;
  suggestedTicket: string;
  ticketConfidence: number;
  category: string;
}

interface ParseDailyResponse {
  entries: ParsedEntry[];
  summary: {
    totalMinutes: number;
    entriesCount: number;
    unmatchedCount: number;
  };
}

// ---- Regex fallback parser (no AI) ----

function parseWithRegex(
  rawNotes: string,
  availableTickets: Array<{ key: string; name: string; project: string }>
): ParseDailyResponse {
  const lines = rawNotes.split('\n').filter(l => l.trim());
  const entries: ParsedEntry[] = [];

  // Pattern: HH:MM - HH:MM or HH:MM-HH:MM
  const timeRangeRegex = /(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const timeMatch = line.match(timeRangeRegex);
    let startTime = '';
    let endTime = '';
    let description = line;

    if (timeMatch) {
      startTime = timeMatch[1].padStart(5, '0');
      endTime = timeMatch[2].padStart(5, '0');
      description = line.replace(timeRangeRegex, '').trim();
      // Clean up leading/trailing separators
      description = description
        .replace(/^[\s\-–:,]+/, '')
        .replace(/[\s\-–:,]+$/, '')
        .trim();
    } else {
      // Try single time HH:MM
      const singleTimeMatch = line.match(/^(\d{1,2}:\d{2})\s*/);
      if (singleTimeMatch) {
        startTime = singleTimeMatch[1].padStart(5, '0');
        description = line.replace(singleTimeMatch[0], '').trim();

        // Try to get end time from next line
        if (i + 1 < lines.length) {
          const nextTimeMatch = lines[i + 1].match(/^(\d{1,2}:\d{2})/);
          if (nextTimeMatch) {
            endTime = nextTimeMatch[1].padStart(5, '0');
          }
        }
      } else {
        // No time found, skip
        continue;
      }
    }

    if (!endTime && startTime) {
      // Default: 1 hour
      const [h, m] = startTime.split(':').map(Number);
      const endH = h + 1;
      endTime = `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    // Calculate duration
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const durationMinutes = eh * 60 + em - (sh * 60 + sm);

    // Try to match ticket by keywords
    const descLower = description.toLowerCase();
    let suggestedTicket = '';
    let ticketConfidence = 0;

    // Check if description directly references a ticket key
    const ticketKeyMatch = description.match(/\b([A-Z]{2,}-\d+)\b/);
    if (ticketKeyMatch && availableTickets.some(t => t.key === ticketKeyMatch[1])) {
      suggestedTicket = ticketKeyMatch[1];
      ticketConfidence = 1.0;
    }

    if (!suggestedTicket) {
      // Keyword matching
      const words = descLower.split(/\s+/).filter(w => w.length > 2);
      let bestScore = 0;

      for (const ticket of availableTickets) {
        const ticketText = `${ticket.name} ${ticket.key}`.toLowerCase();
        let score = 0;
        for (const word of words) {
          if (ticketText.includes(word)) score++;
        }
        if (score > bestScore) {
          bestScore = score;
          suggestedTicket = ticket.key;
          ticketConfidence = Math.min(score / Math.max(words.length, 1), 0.8);
        }
      }

      if (ticketConfidence < 0.2) {
        suggestedTicket = '';
        ticketConfidence = 0;
      }
    }

    // Determine category
    let category = 'development';
    if (/call|spotkanie|meeting|standup|daily|z\s+\w+iem|z\s+\w+ą/i.test(description)) {
      category = 'meeting';
    } else if (/research|szukanie|analiza|przeglad/i.test(description)) {
      category = 'research';
    } else if (/slack|mail|email|wiadomosc|chat/i.test(description)) {
      category = 'communication';
    } else if (/deploy|infra|server|k8s|docker|ci|cd|pipeline/i.test(description)) {
      category = 'infrastructure';
    }

    entries.push({
      startTime,
      endTime,
      durationMinutes: Math.max(durationMinutes, 0),
      description: description || line,
      suggestedTicket,
      ticketConfidence,
      category,
    });
  }

  const totalMinutes = entries.reduce((s, e) => s + e.durationMinutes, 0);
  const unmatchedCount = entries.filter(e => !e.suggestedTicket).length;

  return {
    entries,
    summary: {
      totalMinutes,
      entriesCount: entries.length,
      unmatchedCount,
    },
  };
}

// ---- AI parser using Gemini or OpenRouter ----

function buildPrompt(
  rawNotes: string,
  availableTickets: Array<{ key: string; name: string; project: string }>
): string {
  const ticketList = availableTickets
    .slice(0, 50)
    .map(t => `- ${t.key}: ${t.name} (${t.project})`)
    .join('\n');

  return `Jestes asystentem do parsowania notatek z dnia pracy.

NOTATKI UZYTKOWNIKA:
${rawNotes}

DOSTEPNE TICKETY JIRA:
${ticketList}

TWOJE ZADANIE:
1. Wyodrebnij kazda aktywnosc z czasem (poczatek, koniec)
2. Oblicz czas trwania w minutach
3. Oczysc opis (krotki, po polsku)
4. Dopasuj do najlepszego ticketa Jira
5. Przypisz kategorie

ZASADY:
- Jesli notatka ma zakres np. "09:30-10:30" uzyj go
- Jesli brak godziny koncowej, estymuj na podstawie nastepnej aktywnosci
- Jesli tekst mowi o spotkaniu (call, z Piotkiem) -> category: meeting
- Jesli tekst mowi o kodowaniu/setup -> category: development
- Jesli tekst mowi o research/szukanie -> category: research
- Dopasuj ticket po slowach kluczowych w nazwie ticketa
- Jesli nie jestes pewny dopasowania, ustaw ticketConfidence < 0.5 i suggestedTicket na ""

FORMAT JSON:
{
  "entries": [
    {
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "durationMinutes": 60,
      "description": "krotki opis po polsku",
      "suggestedTicket": "BCI-395",
      "ticketConfidence": 0.9,
      "category": "development"
    }
  ],
  "summary": {
    "totalMinutes": 480,
    "entriesCount": 8,
    "unmatchedCount": 1
  }
}`;
}

export async function POST(request: NextRequest) {
  try {
    const body: ParseDailyRequest = await request.json();
    const { rawNotes, availableTickets } = body;

    if (!rawNotes || !rawNotes.trim()) {
      return NextResponse.json({ error: 'rawNotes is required' }, { status: 400 });
    }

    const prompt = buildPrompt(rawNotes, availableTickets || []);

    // 1. Try Gemini API first
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      try {
        const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
        const response = await callGemini(prompt, {
          apiKey: geminiKey,
          model: geminiModel,
          temperature: 0.3,
          maxTokens: 4000,
        });

        const parsed = extractJSON<ParseDailyResponse>(response);
        if (parsed && parsed.entries && Array.isArray(parsed.entries)) {
          // Validate ticket keys exist in available tickets
          const validKeys = new Set(availableTickets.map(t => t.key));
          for (const entry of parsed.entries) {
            if (entry.suggestedTicket && !validKeys.has(entry.suggestedTicket)) {
              entry.suggestedTicket = '';
              entry.ticketConfidence = 0;
            }
          }
          return NextResponse.json(parsed);
        }
        console.warn('Gemini returned invalid JSON structure, falling back');
      } catch (error) {
        console.error('Gemini API error, falling back:', error);
      }
    }

    // 2. Try OpenRouter fallback
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (openRouterKey) {
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
            max_tokens: 4000,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || '';
          const parsed = extractJSON<ParseDailyResponse>(content);
          if (parsed && parsed.entries && Array.isArray(parsed.entries)) {
            const validKeys = new Set(availableTickets.map(t => t.key));
            for (const entry of parsed.entries) {
              if (entry.suggestedTicket && !validKeys.has(entry.suggestedTicket)) {
                entry.suggestedTicket = '';
                entry.ticketConfidence = 0;
              }
            }
            return NextResponse.json(parsed);
          }
        }
        console.warn('OpenRouter failed or invalid response, falling back to regex');
      } catch (error) {
        console.error('OpenRouter API error, falling back to regex:', error);
      }
    }

    // 3. Regex fallback
    console.log('Using regex fallback parser (no AI keys configured)');
    const regexResult = parseWithRegex(rawNotes, availableTickets || []);
    return NextResponse.json(regexResult);
  } catch (error) {
    console.error('Error in parse-daily:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse daily notes' },
      { status: 500 }
    );
  }
}
