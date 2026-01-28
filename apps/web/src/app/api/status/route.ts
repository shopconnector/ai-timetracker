import { NextResponse } from 'next/server';

interface ApiStatus {
  name: string;
  configured: boolean;
  status: 'ok' | 'error' | 'unconfigured';
  message?: string;
}

async function checkActivityWatch(): Promise<ApiStatus> {
  const url = process.env.ACTIVITYWATCH_URL;
  if (!url) {
    return { name: 'ActivityWatch', configured: false, status: 'unconfigured' };
  }

  try {
    const response = await fetch(`${url}/api/0/info`, {
      signal: AbortSignal.timeout(5000)
    });
    if (response.ok) {
      return { name: 'ActivityWatch', configured: true, status: 'ok', message: url };
    }
    return { name: 'ActivityWatch', configured: true, status: 'error', message: 'Not responding' };
  } catch {
    return { name: 'ActivityWatch', configured: true, status: 'error', message: 'Connection failed' };
  }
}

async function checkTempo(): Promise<ApiStatus> {
  const token = process.env.TEMPO_API_TOKEN;
  if (!token) {
    return { name: 'Tempo', configured: false, status: 'unconfigured' };
  }

  try {
    const response = await fetch('https://api.tempo.io/4/worklogs?limit=1', {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(5000)
    });
    if (response.ok) {
      return { name: 'Tempo', configured: true, status: 'ok', message: 'Connected' };
    }
    return { name: 'Tempo', configured: true, status: 'error', message: `HTTP ${response.status}` };
  } catch {
    return { name: 'Tempo', configured: true, status: 'error', message: 'Connection failed' };
  }
}

async function checkJira(): Promise<ApiStatus> {
  const email = process.env.JIRA_SERVICE_EMAIL;
  const apiKey = process.env.JIRA_API_KEY;
  const baseUrl = process.env.JIRA_BASE_URL;

  if (!email || !apiKey || !baseUrl) {
    return { name: 'Jira', configured: false, status: 'unconfigured' };
  }

  try {
    const auth = Buffer.from(`${email}:${apiKey}`).toString('base64');
    const response = await fetch(`${baseUrl}/rest/api/3/myself`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(5000)
    });
    if (response.ok) {
      const data = await response.json();
      return { name: 'Jira', configured: true, status: 'ok', message: data.displayName || 'Connected' };
    }
    return { name: 'Jira', configured: true, status: 'error', message: `HTTP ${response.status}` };
  } catch {
    return { name: 'Jira', configured: true, status: 'error', message: 'Connection failed' };
  }
}

async function checkOpenRouter(): Promise<ApiStatus> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { name: 'OpenRouter (LLM)', configured: false, status: 'unconfigured' };
  }

  return { name: 'OpenRouter (LLM)', configured: true, status: 'ok', message: 'Configured' };
}

export async function GET() {
  const [activityWatch, tempo, jira, openRouter] = await Promise.all([
    checkActivityWatch(),
    checkTempo(),
    checkJira(),
    checkOpenRouter()
  ]);

  return NextResponse.json({
    apis: [activityWatch, tempo, jira, openRouter],
    allOk: [activityWatch, tempo, jira].every(a => a.status === 'ok')
  });
}
