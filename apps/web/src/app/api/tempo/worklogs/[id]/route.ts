import { NextRequest, NextResponse } from 'next/server';

const TEMPO_URL = 'https://api.tempo.io/4';

function getAuthHeader(): HeadersInit {
  const token = process.env.TEMPO_API_TOKEN;
  if (!token) throw new Error('TEMPO_API_TOKEN not set');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// PUT - update worklog
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const body = await request.json();
    const accountId = process.env.TEMPO_ACCOUNT_ID;

    if (!accountId) {
      return NextResponse.json({ error: 'TEMPO_ACCOUNT_ID not configured' }, { status: 500 });
    }

    // Build Tempo API v4 request body
    const tempoBody: Record<string, unknown> = {
      authorAccountId: accountId,
      timeSpentSeconds: body.timeSpentSeconds,
      startDate: body.startDate,
      startTime: body.startTime,
    };

    // Add issueKey or issueId
    if (body.issueKey) {
      tempoBody.issueKey = body.issueKey;
    }

    // Add optional description
    if (body.description) {
      tempoBody.description = body.description;
    }

    const response = await fetch(`${TEMPO_URL}/worklogs/${id}`, {
      method: 'PUT',
      headers: getAuthHeader(),
      body: JSON.stringify(tempoBody),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Tempo PUT error:', error);
      return NextResponse.json(
        { error: error.errors?.[0]?.message || 'Update failed' },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json({ success: true, worklog: result });
  } catch (error) {
    console.error('PUT worklog error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Update failed' },
      { status: 500 }
    );
  }
}

// DELETE - delete worklog
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const response = await fetch(`${TEMPO_URL}/worklogs/${id}`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { error: error.errors?.[0]?.message || 'Delete failed' },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Delete failed' },
      { status: 500 }
    );
  }
}
