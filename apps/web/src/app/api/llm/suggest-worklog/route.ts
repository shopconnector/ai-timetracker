import { NextRequest, NextResponse } from 'next/server';
import { getRecentDescriptions } from '@/lib/tempo';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const LLM_MODEL = process.env.LLM_MODEL || 'anthropic/claude-3.5-haiku';

interface SuggestWorklogRequest {
  activity: {
    title: string;
    app: string;
    project?: string;
    duration: number; // seconds
    isTerminal?: boolean;
    workingDir?: string;
    gitBranch?: string;
    // Meeting fields
    isMeeting?: boolean;
    meetingPlatform?: string;
    // Communication fields
    isCommunication?: boolean;
    channel?: string;
    // Category
    category?: string;
  };
  availableTickets: Array<{
    key: string;
    name: string;
    project?: string;
  }>;
  tempoActionTypes: Array<{
    value: string;
    name: string;
  }>;
  // Optional history context
  includeHistory?: boolean;
}

interface SuggestWorklogResponse {
  suggestedTicket: string;
  description: string;
  actionType: string;
  confidence: number;
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENROUTER_API_KEY not configured' },
        { status: 500 }
      );
    }

    const body: SuggestWorklogRequest = await request.json();
    const { activity, availableTickets, tempoActionTypes, includeHistory = true } = body;

    // Build ticket list for prompt (max 30)
    const ticketList = availableTickets
      .slice(0, 30)
      .map(t => `- ${t.key}: ${t.name}${t.project ? ` (${t.project})` : ''}`)
      .join('\n');

    // Build action types list
    const actionTypesList = tempoActionTypes
      .map(t => `- ${t.value}: ${t.name}`)
      .join('\n');

    // Fetch recent worklog descriptions for context (if enabled)
    let historyContext = '';
    if (includeHistory) {
      try {
        const recentDescriptions = await getRecentDescriptions(14, 15);
        if (recentDescriptions.length > 0) {
          historyContext = `\n\nOSTATNIO UŻYWANE OPISY WORKLOGÓW (uczę się od nich stylu):
${recentDescriptions.map(d => `- ${d.issueKey}: "${d.description}"`).join('\n')}`;
        }
      } catch (error) {
        console.error('Error fetching worklog history:', error);
        // Continue without history
      }
    }

    // Build context
    let contextInfo = `Tytuł aktywności: "${activity.title}"
Aplikacja: ${activity.app}
Czas trwania: ${Math.round(activity.duration / 60)} minut`;

    if (activity.category) {
      contextInfo += `\nKategoria: ${activity.category}`;
    }
    if (activity.project) {
      contextInfo += `\nProjekt: ${activity.project}`;
    }
    if (activity.isMeeting) {
      contextInfo += `\n[SPOTKANIE]`;
      if (activity.meetingPlatform) {
        contextInfo += `\n  Platforma: ${activity.meetingPlatform}`;
      }
    }
    if (activity.isCommunication) {
      contextInfo += `\n[KOMUNIKACJA]`;
      if (activity.channel) {
        contextInfo += `\n  Kanał/Rozmowa: ${activity.channel}`;
      }
    }
    if (activity.isTerminal) {
      contextInfo += `\n[TERMINAL]`;
      if (activity.workingDir) {
        contextInfo += `\n  Katalog: ${activity.workingDir}`;
      }
      if (activity.gitBranch) {
        contextInfo += `\n  Branch: ${activity.gitBranch}`;
      }
    }

    const prompt = `Jesteś asystentem do logowania czasu pracy w systemie Tempo/Jira.

${contextInfo}

Dostępne tickety Jira:
${ticketList}

Dostępne typy akcji Tempo:
${actionTypesList}${historyContext}

ZASADY:
1. Wybierz NAJLEPSZY ticket pasujący do aktywności
2. Wygeneruj KRÓTKI opis po polsku (max 80 znaków) opisujący co zostało zrobione
3. Ucz się ze stylu poprzednich wpisów - używaj podobnej formy i języka
4. Wybierz odpowiedni typ akcji Tempo
5. Dla pracy z kodem → standarddevelopment lub codereview
6. Dla terminala (git, npm, docker) → standarddevelopment lub infrastruktura
7. Dla Slack/komunikacji → komunikacjawewnetrzna lub komunikacjazewnetrzna
8. Dla spotkań → komunikacjawewnetrzna
9. Dla analizy/research → analizaprzedwdrozeniowa

Odpowiedz TYLKO w formacie JSON:
{
  "suggestedTicket": "KLUCZ-XXX",
  "description": "Krótki opis po polsku",
  "actionType": "klucz_typu_akcji",
  "confidence": 0.0-1.0
}`;

    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3001',
        'X-Title': 'TimeTracker'
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 300
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenRouter error:', error);
      return NextResponse.json(
        { error: 'LLM API error' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parse JSON from response with try-catch
    const jsonMatch = content.match(/\{[\s\S]*?\}/); // Non-greedy to get first JSON object
    if (!jsonMatch) {
      console.warn('LLM did not return valid JSON, content:', content);
      return NextResponse.json({
        suggestedTicket: '',
        description: '',
        actionType: 'standarddevelopment',
        confidence: 0
      });
    }

    let parsed: Partial<SuggestWorklogResponse>;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('JSON parse error:', parseError, 'Content:', jsonMatch[0]);
      return NextResponse.json({
        suggestedTicket: '',
        description: '',
        actionType: 'standarddevelopment',
        confidence: 0
      });
    }

    // Validate ticket exists in availableTickets
    const ticketKeys = availableTickets.map(t => t.key);
    let suggestedTicket = parsed.suggestedTicket || '';
    const confidence = Math.min(1, Math.max(0, parsed.confidence || 0));

    // Check if LLM suggested a valid ticket
    if (suggestedTicket && !ticketKeys.includes(suggestedTicket)) {
      console.warn(`LLM suggested invalid ticket: ${suggestedTicket}, not in available: ${ticketKeys.slice(0, 5).join(', ')}...`);
      suggestedTicket = ''; // Don't assign invalid ticket
    }

    // Confidence threshold - if < 0.6, don't auto-assign ticket
    if (confidence < 0.6) {
      console.log(`Low confidence (${confidence}) for ticket suggestion, not auto-assigning`);
      suggestedTicket = ''; // Let user choose manually
    }

    const result: SuggestWorklogResponse = {
      suggestedTicket,
      description: parsed.description || '',
      actionType: parsed.actionType || 'standarddevelopment',
      confidence
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in suggest-worklog:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to suggest worklog' },
      { status: 500 }
    );
  }
}
