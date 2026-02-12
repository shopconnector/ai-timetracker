import { NextResponse } from 'next/server';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

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
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const llmModel = process.env.LLM_MODEL || 'gemini-2.5-flash';
    const slackUserToken = process.env.SLACK_USER_TOKEN;

    return NextResponse.json({
      // API Config (masked)
      tempoApiToken: tempoApiToken ? '••••••••' : null,
      tempoAccountId,
      jiraBaseUrl,
      jiraApiToken: jiraApiToken ? '••••••••' : null,
      jiraEmail,
      activityWatchUrl,
      openRouterApiKey: openRouterApiKey ? '••••••••' : null,
      geminiApiKey: geminiApiKey ? '••••••••' : null,
      llmModel,
      slackUserToken: slackUserToken ? '••••••••' : null,
      aiProvider: geminiApiKey ? 'gemini' : 'openrouter',

      // Status flags
      hasTempoConfig: !!(tempoApiToken && tempoAccountId),
      hasJiraConfig: !!(jiraBaseUrl && jiraApiToken && jiraEmail),
      hasOpenRouterConfig: !!openRouterApiKey,
      hasGeminiConfig: !!geminiApiKey,
      hasSlackConfig: !!slackUserToken,
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

    // Test Slack API
    if (testType === 'slack' || testType === 'all') {
      const slackToken = process.env.SLACK_USER_TOKEN;

      if (slackToken) {
        try {
          const res = await fetch('https://slack.com/api/auth.test', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${slackToken}`,
              'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(5000),
          });
          const data = await res.json();
          if (data.ok) {
            results.slack = {
              success: true,
              message: `Połączono jako: ${data.user}`,
            };
          } else {
            results.slack = { success: false, message: `Błąd: ${data.error}` };
          }
        } catch (e) {
          results.slack = { success: false, message: `Błąd połączenia: ${e}` };
        }
      } else {
        results.slack = { success: false, message: 'Brak konfiguracji Slack (SLACK_USER_TOKEN)' };
      }
    }

    // Test AI/LLM (Gemini first, then OpenRouter)
    if (testType === 'openrouter' || testType === 'gemini' || testType === 'all') {
      const geminiApiKey = process.env.GEMINI_API_KEY;
      const openRouterApiKey = process.env.OPENROUTER_API_KEY;

      if (geminiApiKey) {
        try {
          const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: 'Odpowiedz: OK' }] }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 10 },
              }),
              signal: AbortSignal.timeout(10000),
            }
          );
          results.openrouter = {
            success: res.ok,
            message: res.ok ? `Gemini (${geminiModel}) dziala` : `Gemini error: ${res.status}`,
          };
        } catch (e) {
          results.openrouter = { success: false, message: `Gemini blad: ${e}` };
        }
      } else if (openRouterApiKey) {
        try {
          const res = await fetch('https://openrouter.ai/api/v1/models', {
            headers: {
              Authorization: `Bearer ${openRouterApiKey}`,
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
        results.openrouter = { success: false, message: 'Brak klucza API (Gemini lub OpenRouter)' };
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Test API error:', error);
    return NextResponse.json({ error: 'Failed to test APIs' }, { status: 500 });
  }
}

// Field name → env var name mapping
const FIELD_TO_ENV: Record<string, string> = {
  tempoApiToken: 'TEMPO_API_TOKEN',
  tempoAccountId: 'TEMPO_ACCOUNT_ID',
  jiraBaseUrl: 'JIRA_BASE_URL',
  jiraApiToken: 'JIRA_API_KEY',
  jiraEmail: 'JIRA_SERVICE_EMAIL',
  activityWatchUrl: 'ACTIVITYWATCH_URL',
  openRouterApiKey: 'OPENROUTER_API_KEY',
  geminiApiKey: 'GEMINI_API_KEY',
  llmModel: 'LLM_MODEL',
  slackUserToken: 'SLACK_USER_TOKEN',
};

// Section comments for env file organization
const ENV_SECTIONS: Record<string, string> = {
  TEMPO_API_TOKEN: '# Tempo API',
  TEMPO_ACCOUNT_ID: '# Tempo API',
  JIRA_BASE_URL: '# Jira API',
  JIRA_API_KEY: '# Jira API',
  JIRA_SERVICE_EMAIL: '# Jira API',
  ACTIVITYWATCH_URL: '# ActivityWatch',
  OPENROUTER_API_KEY: '# OpenRouter API',
  GEMINI_API_KEY: '# Gemini API (Google AI Studio)',
  LLM_MODEL: '# LLM Model',
  SLACK_USER_TOKEN: '# Slack API',
};

// PUT /api/settings - Save settings to .env.local
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const envPath = join(process.cwd(), '.env.local');

    // Read current .env.local
    let envContent = '';
    try {
      envContent = readFileSync(envPath, 'utf-8');
    } catch {
      // File doesn't exist yet, start fresh
    }

    // Parse existing env vars
    const envLines = envContent.split('\n');
    const existingVars = new Map<string, { value: string; lineIndex: number }>();
    for (let i = 0; i < envLines.length; i++) {
      const match = envLines[i].match(/^([A-Z_]+)=(.*)/);
      if (match) {
        existingVars.set(match[1], { value: match[2], lineIndex: i });
      }
    }

    // Update env vars from body
    const updatedVars = new Set<string>();
    for (const [field, envName] of Object.entries(FIELD_TO_ENV)) {
      const value = body[field];
      if (value === undefined || value === null) continue;
      // Skip masked values — don't overwrite real keys with placeholders
      if (typeof value === 'string' && value.includes('••')) continue;
      // Skip empty strings for token/key fields (don't clear existing keys)
      const isSecretField = ['tempoApiToken', 'jiraApiToken', 'openRouterApiKey', 'geminiApiKey', 'slackUserToken'].includes(field);
      if (isSecretField && value === '') continue;
      // Skip aiProvider — it's derived, not stored
      if (field === 'aiProvider') continue;

      updatedVars.add(envName);

      if (existingVars.has(envName)) {
        // Update existing line
        const { lineIndex } = existingVars.get(envName)!;
        envLines[lineIndex] = `${envName}=${value}`;
      } else {
        // Add new var — find or create section
        const section = ENV_SECTIONS[envName] || '';
        const sectionIndex = envLines.findIndex(l => l === section);

        if (sectionIndex >= 0) {
          // Find last var in this section
          let insertAt = sectionIndex + 1;
          while (insertAt < envLines.length && envLines[insertAt].match(/^[A-Z_]+=/) ) {
            insertAt++;
          }
          envLines.splice(insertAt, 0, `${envName}=${value}`);
        } else {
          // Add new section at end
          if (envLines[envLines.length - 1] !== '') {
            envLines.push('');
          }
          if (section) envLines.push(section);
          envLines.push(`${envName}=${value}`);
        }
      }

      // Update process.env in-memory for immediate effect
      process.env[envName] = value;
    }

    // Write back
    writeFileSync(envPath, envLines.join('\n'));

    return NextResponse.json({
      success: true,
      message: 'Konfiguracja zapisana do .env.local',
      updated: Array.from(updatedVars),
    });
  } catch (error) {
    console.error('Save settings error:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
