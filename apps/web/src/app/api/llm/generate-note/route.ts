import { NextResponse } from 'next/server';
import { getActivitiesForDate, GroupedActivity } from '@/lib/activitywatch';
import { mergeActivities, getSlackActivitiesForDateSafe } from '@/lib/mergeActivities';
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

interface AggregatedSlot {
  startTime: Date;
  endTime: Date;
  totalSeconds: number;
  app: string;
  description: string; // compact description
  project?: string;
  gitBranch?: string;
  isMeeting?: boolean;
  isCommunication?: boolean;
}

function fmt(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Pre-aggregate activities to reduce token count
function aggregateActivities(activities: GroupedActivity[], minDurationSeconds: number = 120): AggregatedSlot[] {
  const sorted = activities
    .filter(a => a.totalSeconds >= minDurationSeconds)
    .sort((a, b) => new Date(a.firstSeen).getTime() - new Date(b.firstSeen).getTime());

  if (sorted.length === 0) return [];

  // Group short communication into one entry
  const commActivities = sorted.filter(a => a.isCommunication);
  const nonCommActivities = sorted.filter(a => !a.isCommunication);
  const totalCommSeconds = commActivities.reduce((s, a) => s + a.totalSeconds, 0);

  const slots: AggregatedSlot[] = [];

  // Merge adjacent non-comm activities with same project or app+category
  for (const a of nonCommActivities) {
    const first = new Date(a.firstSeen);
    const last = new Date(a.lastSeen);
    const prev = slots[slots.length - 1];

    const canMerge = prev && !a.isMeeting && !prev.isMeeting &&
      (first.getTime() - prev.endTime.getTime()) < 15 * 60 * 1000 && // gap < 15min
      ((a.project && a.project === prev.project) ||
       (!a.project && a.app === prev.app));

    if (canMerge) {
      if (last > prev.endTime) prev.endTime = last;
      prev.totalSeconds += a.totalSeconds;
      // Append branch info if new
      if (a.gitBranch && !prev.gitBranch) prev.gitBranch = a.gitBranch;
    } else {
      const desc = a.isMeeting
        ? (a.meetingPlatform || a.app)
        : a.project
          ? a.project
          : a.title.substring(0, 50);

      slots.push({
        startTime: first,
        endTime: last,
        totalSeconds: a.totalSeconds,
        app: a.app,
        description: desc,
        project: a.project,
        gitBranch: a.gitBranch,
        isMeeting: a.isMeeting,
        isCommunication: false,
      });
    }
  }

  // Add single comm entry if total > 0
  if (totalCommSeconds > 0 && commActivities.length > 0) {
    const commApps = [...new Set(commActivities.map(a => a.app))];
    const commFirst = new Date(commActivities[0].firstSeen);
    const commLast = new Date(commActivities[commActivities.length - 1].lastSeen);

    // If total comm < 5 min, collapse to one line
    if (totalCommSeconds < 300) {
      slots.push({
        startTime: commFirst,
        endTime: commLast,
        totalSeconds: totalCommSeconds,
        app: commApps.join('/'),
        description: `${commApps.join('/')} (krotko)`,
        isCommunication: true,
      });
    } else {
      // Add individual comm entries
      for (const a of commActivities) {
        slots.push({
          startTime: new Date(a.firstSeen),
          endTime: new Date(a.lastSeen),
          totalSeconds: a.totalSeconds,
          app: a.app,
          description: a.channel || a.app,
          isCommunication: true,
        });
      }
    }
  }

  // Sort by start time
  slots.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  return slots;
}

// Format aggregated slots as compact text for prompt
function formatCompact(slots: AggregatedSlot[]): string {
  return slots.map(s => {
    const mins = Math.round(s.totalSeconds / 60);
    let line = `${fmt(s.startTime)}-${fmt(s.endTime)} ${mins}m ${s.app}`;
    if (s.description && s.description !== s.app) {
      line += `: ${s.description}`;
    }
    if (s.gitBranch) line += ` (${s.gitBranch})`;
    if (s.isMeeting) line += ' [spotkanie]';
    return line;
  }).join('\n');
}

// Fallback: generate plain text note without AI
function generatePlainTextNote(activities: GroupedActivity[], minDurationSeconds: number = 120): string {
  const sorted = activities
    .filter(a => !a.isPrivate && a.totalSeconds >= minDurationSeconds)
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
    const { date, startHour, endHour, minActivityDurationSeconds } = await request.json();

    if (!date) {
      return NextResponse.json({ error: 'Brak daty' }, { status: 400 });
    }

    const start = startHour || '08:00';
    const end = endHour || '16:00';

    // 1. Fetch activities from ActivityWatch + Slack
    const [awActivities, slackActivities] = await Promise.all([
      getActivitiesForDate(date),
      getSlackActivitiesForDateSafe(date),
    ]);
    const allActivities = slackActivities.length > 0
      ? mergeActivities(awActivities, slackActivities)
      : awActivities;

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

    // 4. Pre-aggregate activities to reduce token count
    // Use configurable min duration (from client) or default 120s (2 min)
    const minDuration = minActivityDurationSeconds || 120;
    let aggregated = aggregateActivities(activities, minDuration);
    const MAX_SLOTS = 30;
    let truncated = false;
    if (aggregated.length > MAX_SLOTS) {
      aggregated = aggregated.slice(0, MAX_SLOTS);
      truncated = true;
    }

    console.log(`[generate-note] ${activities.length} raw activities -> ${aggregated.length} aggregated slots`);

    // Guard: if min-duration filter removed everything, do NOT call the LLM —
    // empty `DANE:` makes Gemini fabricate a full template work day
    // ("08:00-17:00 Spotkanie zespołu / projektem X / Lunch / ...").
    // See: regression introduced in v0.8.0 (commit 22cb8c6).
    if (aggregated.length === 0) {
      return NextResponse.json({
        note: '',
        activitiesCount: activities.length,
        totalMinutes,
        message: `Wszystkie ${activities.length} aktywnosci ponizej progu ${Math.round(minDuration / 60)} min (lacznie ${totalMinutes} min) — brak danych do wygenerowania notatki. Obniz "Min czas aktywnosci" w ustawieniach.`,
      });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;

    const activitiesText = formatCompact(aggregated);

    const prompt = `Przepisz ponizsze aktywnosci jako notatke z dnia pracy.
Format: HH:MM-HH:MM opis (po polsku, krotko).
Polacz nakladajace sie aktywnosci. Tylko linie HH:MM-HH:MM opis, bez naglowkow.

ZASADY (krytyczne):
- NIE WYMYSLAJ aktywnosci, ktorych nie ma w sekcji DANE.
- NIE dodawaj genericznych placeholderow ("Spotkanie zespolu", "projekt X", "Lunch", "Przerwa na kawe", "Planowanie") jesli nie wynikaja z DANE.
- Uzywaj WYLACZNIE godzin i opisow obecnych w DANE.
- Jesli DANE sa puste lub niewystarczajace — zwroc pusty wynik (nic nie pisz).
${truncated ? '(Dane obciete do 30 wpisow)\n' : ''}
DANE:
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
      note = generatePlainTextNote(activities, minDuration);
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
