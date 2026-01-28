import { NextResponse } from 'next/server';

// GET /api/settings - Get settings from environment variables
export async function GET() {
  try {
    const tempoApiToken = process.env.TEMPO_API_TOKEN;
    const tempoAccountId = process.env.TEMPO_ACCOUNT_ID;
    const jiraBaseUrl = process.env.JIRA_BASE_URL;
    const jiraApiToken = process.env.JIRA_API_KEY;
    const jiraEmail = process.env.JIRA_SERVICE_EMAIL;
    const activityWatchUrl = process.env.ACTIVITYWATCH_URL || 'http://localhost:5600';
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;
    const llmModel = process.env.LLM_MODEL || 'anthropic/claude-3.5-haiku';

    return NextResponse.json({
      // API Config (masked)
      tempoApiToken: tempoApiToken ? '••••••••' : null,
      tempoAccountId,
      jiraBaseUrl,
      jiraApiToken: jiraApiToken ? '••••••••' : null,
      jiraEmail,
      activityWatchUrl,
      openRouterApiKey: openRouterApiKey ? '••••••••' : null,
      llmModel,

      // Status flags
      hasTempoConfig: !!(tempoApiToken && tempoAccountId),
      hasJiraConfig: !!(jiraBaseUrl && jiraApiToken && jiraEmail),
      hasOpenRouterConfig: !!openRouterApiKey,
    });
  } catch (error) {
    console.error('Get settings error:', error);
    return NextResponse.json({ error: 'Failed to get settings' }, { status: 500 });
  }
}

// POST /api/settings/test - Test API connections
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { testType } = body;

    const results: Record<string, { success: boolean; message: string }> = {};

    // Test Tempo API
    if (testType === 'tempo' || testType === 'all') {
      const tempoApiToken = process.env.TEMPO_API_TOKEN;
      const tempoAccountId = process.env.TEMPO_ACCOUNT_ID;

      if (tempoApiToken && tempoAccountId) {
        try {
          const res = await fetch('https://api.tempo.io/4/worklogs?limit=1', {
            headers: {
              'Authorization': `Bearer ${tempoApiToken}`,
              'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(5000),
          });
          results.tempo = {
            success: res.ok,
            message: res.ok ? 'Połączono z Tempo API' : `Błąd: ${res.status}`,
          };
        } catch (e) {
          results.tempo = { success: false, message: `Błąd połączenia: ${e}` };
        }
      } else {
        results.tempo = { success: false, message: 'Brak konfiguracji Tempo' };
      }
    }

    // Test Jira API
    if (testType === 'jira' || testType === 'all') {
      const jiraBaseUrl = process.env.JIRA_BASE_URL;
      const jiraApiToken = process.env.JIRA_API_KEY;
      const jiraEmail = process.env.JIRA_SERVICE_EMAIL;

      if (jiraBaseUrl && jiraApiToken && jiraEmail) {
        try {
          const credentials = Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64');
          const res = await fetch(`${jiraBaseUrl}/rest/api/3/myself`, {
            headers: {
              'Authorization': `Basic ${credentials}`,
              'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) {
            const data = await res.json();
            results.jira = {
              success: true,
              message: `Połączono jako: ${data.displayName}`,
            };
          } else {
            results.jira = { success: false, message: `Błąd: ${res.status}` };
          }
        } catch (e) {
          results.jira = { success: false, message: `Błąd połączenia: ${e}` };
        }
      } else {
        results.jira = { success: false, message: 'Brak konfiguracji Jira' };
      }
    }

    // Test ActivityWatch
    if (testType === 'activitywatch' || testType === 'all') {
      const awUrl = process.env.ACTIVITYWATCH_URL || 'http://localhost:5600';
      try {
        const res = await fetch(`${awUrl}/api/0/info`, {
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = await res.json();
          results.activitywatch = {
            success: true,
            message: `Połączono z ActivityWatch ${data.version || ''}`,
          };
        } else {
          results.activitywatch = { success: false, message: `Błąd: ${res.status}` };
        }
      } catch {
        results.activitywatch = {
          success: false,
          message: 'ActivityWatch nie działa lub niedostępny',
        };
      }
    }

    // Test OpenRouter
    if (testType === 'openrouter' || testType === 'all') {
      const openRouterApiKey = process.env.OPENROUTER_API_KEY;

      if (openRouterApiKey) {
        try {
          const res = await fetch('https://openrouter.ai/api/v1/models', {
            headers: {
              'Authorization': `Bearer ${openRouterApiKey}`,
            },
            signal: AbortSignal.timeout(5000),
          });
          results.openrouter = {
            success: res.ok,
            message: res.ok ? 'Połączono z OpenRouter' : `Błąd: ${res.status}`,
          };
        } catch (e) {
          results.openrouter = { success: false, message: `Błąd połączenia: ${e}` };
        }
      } else {
        results.openrouter = { success: false, message: 'Brak klucza API' };
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Test API error:', error);
    return NextResponse.json({ error: 'Failed to test APIs' }, { status: 500 });
  }
}
