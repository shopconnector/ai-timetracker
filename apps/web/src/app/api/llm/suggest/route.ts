import { NextRequest, NextResponse } from 'next/server';
import { suggestTicket, suggestTicketsForActivities } from '@/lib/openrouter';
import { COMMON_TICKETS } from '@/lib/tempo';

// POST - suggest ticket for activity
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Single suggestion
    if (body.activityTitle) {
      const { activityTitle, app } = body;
      const availableTickets = body.availableTickets || COMMON_TICKETS;

      const suggestion = await suggestTicket(activityTitle, app || 'Unknown', availableTickets);

      return NextResponse.json(suggestion);
    }

    // Batch suggestions
    if (body.activities && Array.isArray(body.activities)) {
      const { activities } = body;
      const availableTickets = body.availableTickets || COMMON_TICKETS;

      const suggestions = await suggestTicketsForActivities(activities, availableTickets);

      // Convert Map to object for JSON
      const result: Record<string, { ticket: string; confidence: number; reason: string }> = {};
      for (const [id, suggestion] of suggestions) {
        result[id] = suggestion;
      }

      return NextResponse.json({ suggestions: result });
    }

    return NextResponse.json(
      { error: 'activityTitle or activities array required' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error suggesting ticket:', error);
    return NextResponse.json(
      { error: 'Failed to suggest ticket' },
      { status: 500 }
    );
  }
}
