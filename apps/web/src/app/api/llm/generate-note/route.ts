import { NextResponse } from 'next/server';
import { getActivitiesForDate, GroupedActivity } from '@/lib/activitywatch';
import { callGemini } from '@/lib/gemini';

// Filter activities by time range (startHour/endHour like "08:00"/"16:00")
function filterByTimeRange(
  activities: GroupedActivity[],
  startHour: string,
  endHour: string
): GroupedActivity[] {
  const [sh, sm] = startHour.split(':').map(Number);
  const [eh, em] = endHour.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;

  return activities.filter(a => {
    const first = new Date(a.firstSeen);
    const last = new Date(a.lastSeen);
    const firstMin = first.getHours() * 60 + first.getMinutes();
    const lastMin = last.getHours() * 60 + last.getMinutes();

    // Activity overlaps with the time range
    return lastMin >= startMin && firstMin <= endMin;
  });
}

// Format activities for prompt
function formatActivitiesForPrompt(activities: GroupedActivity[]): string {
  return activities
    .sort((a, b) => new Date(a.firstSeen).getTime() - new Date(b.firstSeen).getTime())
    .map(a => {
      const first = new Date(a.firstSeen);
      const last = new Date(a.lastSeen);
      const from = `${String(first.getHours()).padStart(2, '0')}:${String(first.getMinutes()).padStart(2, '0')}`;
      const to = `${String(last.getHours()).padStart(2, '0')}:${String(last.getMinutes()).padStart(2, '0')}`;
      const mins = Math.round(a.totalSeconds / 60);

      const parts = [`${from}-${to} (${mins}min)`, `app: ${a.app}`, `title: ${a.title}`];
      if (a.category) parts.push(`category: ${a.category}`);
      if (a.project) parts.push(`project: ${a.project}`);
      if (a.gitBranch) parts.push(`branch: ${a.gitBranch}`);
      if (a.isMeeting) parts.push(`meeting: ${a.meetingPlatform || 'yes'}`);
      if (a.isCommunication) parts.push(`communication: ${a.channel || a.app}`);

      return parts.join(' | ');
    })
    .join('\n');
}

// Fallback: generate plain text note without AI
function generatePlainTextNote(activities: GroupedActivity[]): string {
  const sorted = activities
    .filter(a => !a.isPrivate && a.totalSeconds >= 120)
    .sort((a, b) => new Date(a.firstSeen).getTime() - new Date(b.firstSeen).getTime());

  if (sorted.length === 0) return '';

  // Group consecutive activities with same app+category
  const grouped: Array<{ start: Date; end: Date; description: string }> = [];

  for (const activity of sorted) {
    const first = new Date(activity.firstSeen);
    const last = new Date(activity.lastSeen);
    const desc = activity.project
      ? `${activity.app}: ${activity.project}`
      : `${activity.app}: ${activity.title.substring(0, 60)}`;

    const prev = grouped[grouped.length - 1];
    if (prev && prev.description === desc) {
      // Extend previous group
      if (last > prev.end) prev.end = last;
    } else {
      grouped.push({ start: first, end: last, description: desc });
    }
  }

  return grouped
    .map(g => {
      const from = `${String(g.start.getHours()).padStart(2, '0')}:${String(g.start.getMinutes()).padStart(2, '0')}`;
      const to = `${String(g.end.getHours()).padStart(2, '0')}:${String(g.end.getMinutes()).padStart(2, '0')}`;
      return `${from}-${to} ${g.description}`;
    })
    .join('\n');
}

export async function POST(request: Request) {
  try {
    const { date, startHour, endHour } = await request.json();

    if (!date) {
      return NextResponse.json({ error: 'Brak daty' }, { status: 400 });
    }

    const start = startHour || '08:00';
    const end = endHour || '16:00';

    // 1. Fetch activities from ActivityWatch
    const allActivities = await getActivitiesForDate(date);

    // 2. Filter by time range
    const filtered = filterByTimeRange(allActivities, start, end);

    // 3. Remove private activities
    const activities = filtered.filter(a => !a.isPrivate);

    if (activities.length === 0) {
      return NextResponse.json({
        note: '',
        activitiesCount: 0,
        totalMinutes: 0,
        message: 'Brak aktywnosci w podanym zakresie czasowym',
      });
    }

    const totalMinutes = Math.round(
      activities.reduce((sum, a) => sum + a.totalSeconds, 0) / 60
    );

    // 4. Try Gemini first
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;

    const activitiesText = formatActivitiesForPrompt(activities);

    const prompt = `Jestes asystentem generujacym notatki z dnia pracy.
Na podstawie danych z ActivityWatch wygeneruj zwiezla notatke.

FORMAT (kazda linia):
HH:MM-HH:MM krotki opis aktywnosci

ZASADY:
- Grupuj podobne aktywnosci (np. 30min w VS Code na tym samym projekcie = jeden wpis)
- Spotkania (Teams/Zoom/Meet) zapisz jako "spotkanie [platforma]"
- Komunikacja (Slack/email) grupuj jesli krotka (<5 min)
- Ignoruj bardzo krotkie aktywnosci (<2 min)
- Pisz krotko, po polsku
- Uzyj nazw projektow/branchy jesli dostepne
- NIE dodawaj zadnych naglowkow ani komentarzy, tylko linie HH:MM-HH:MM opis
- Jesli aktywnosci nakladaja sie czasowo, polacz je w jeden wpis lub wybierz glowna

DANE Z ACTIVITYWATCH:
${activitiesText}`;

    let note = '';

    if (geminiApiKey) {
      try {
        note = await callGemini(prompt, {
          apiKey: geminiApiKey,
          model: process.env.LLM_MODEL || 'gemini-2.5-flash',
          temperature: 0.3,
          maxTokens: 2000,
          responseMimeType: 'text/plain',
        });
      } catch (error) {
        console.error('Gemini error for generate-note, trying fallback:', error);
      }
    }

    // Fallback: OpenRouter
    if (!note && openRouterApiKey) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openRouterApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: process.env.LLM_MODEL || 'anthropic/claude-3.5-haiku',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 2000,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          note = data.choices?.[0]?.message?.content || '';
        }
      } catch (error) {
        console.error('OpenRouter error for generate-note:', error);
      }
    }

    // Fallback: plain text (no AI)
    if (!note) {
      note = generatePlainTextNote(activities);
    }

    return NextResponse.json({
      note: note.trim(),
      activitiesCount: activities.length,
      totalMinutes,
    });
  } catch (error) {
    console.error('Generate note error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Blad generowania notatki' },
      { status: 500 }
    );
  }
}
