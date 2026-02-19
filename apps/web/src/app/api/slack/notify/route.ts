import { NextRequest, NextResponse } from 'next/server';
import {
  sendDailyLogNotification,
  sendActivityPrompt,
  isSlackBotConfigured,
  testSlackBotConnection,
} from '@/lib/slackBot';

// POST /api/slack/notify — send notifications via Slack bot
export async function POST(request: NextRequest) {
  try {
    if (!isSlackBotConfigured()) {
      return NextResponse.json(
        { error: 'Slack Bot nie jest skonfigurowany. Dodaj SLACK_BOT_TOKEN w ustawieniach.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { type } = body;

    switch (type) {
      case 'daily_log': {
        // Send daily log proposal
        const { date, entries, totalMinutes, alreadyLoggedMinutes } = body;
        if (!date || !entries || !Array.isArray(entries)) {
          return NextResponse.json(
            { error: 'date and entries[] are required for daily_log' },
            { status: 400 }
          );
        }

        const result = await sendDailyLogNotification(
          date,
          entries,
          totalMinutes || entries.reduce((s: number, e: { durationMinutes: number }) => s + e.durationMinutes, 0),
          alreadyLoggedMinutes || 0
        );

        if (result.ok) {
          return NextResponse.json({ success: true, message: 'Powiadomienie wyslane na Slack' });
        }
        return NextResponse.json({ error: result.error }, { status: 500 });
      }

      case 'activity_prompt': {
        // Send real-time activity prompt
        const { activity, suggestedTicket } = body;
        if (!activity) {
          return NextResponse.json(
            { error: 'activity is required for activity_prompt' },
            { status: 400 }
          );
        }

        const result = await sendActivityPrompt(activity, suggestedTicket);
        if (result.ok) {
          return NextResponse.json({ success: true, message: 'Prompt wyslany' });
        }
        return NextResponse.json({ error: result.error }, { status: 500 });
      }

      case 'test': {
        // Test bot connection
        const result = await testSlackBotConnection();
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json(
          { error: `Nieznany typ powiadomienia: ${type}. Dostepne: daily_log, activity_prompt, test` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[slack/notify] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Blad wysylania powiadomienia' },
      { status: 500 }
    );
  }
}
