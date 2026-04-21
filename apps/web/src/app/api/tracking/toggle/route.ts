import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { spawn } from 'child_process';

interface TrackingState {
  paused: boolean;
  pausedAt: string | null;
  awPath: string | null;
}

// State file lives next to data/.env.local
function getStateFilePath(): string {
  const candidates = [
    join(process.cwd(), '..', '..', 'data', 'tracking.state.json'),
    join(process.cwd(), 'data', 'tracking.state.json'),
    join(resolve(process.cwd(), '../..'), 'tracking.state.json'),
  ];
  for (const p of candidates) {
    try {
      const dir = p.replace(/[/\\][^/\\]+$/, '');
      if (existsSync(dir)) return p;
    } catch {}
  }
  return join(process.cwd(), 'tracking.state.json');
}

function readState(): TrackingState {
  const stateFile = getStateFilePath();
  try {
    if (existsSync(stateFile)) {
      return JSON.parse(readFileSync(stateFile, 'utf-8'));
    }
  } catch {}
  return { paused: false, pausedAt: null, awPath: null };
}

function writeState(state: TrackingState): void {
  const stateFile = getStateFilePath();
  writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf-8');
}

function findAwQtPath(savedPath?: string | null): string | null {
  const candidates: string[] = [];

  if (savedPath) candidates.push(savedPath);

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    const appDir = process.cwd();
    candidates.push(
      join(appDir, '..', '..', 'activitywatch', 'aw-qt.exe'),
      join(appDir, 'activitywatch', 'aw-qt.exe'),
      join(localAppData, 'activitywatch', 'aw-qt.exe'),
      join(localAppData, 'Programs', 'activitywatch', 'aw-qt.exe'),
      'C:\\Program Files\\ActivityWatch\\aw-qt.exe',
      'C:\\Program Files (x86)\\ActivityWatch\\aw-qt.exe',
    );
  } else {
    // macOS / Linux fallback
    candidates.push(
      '/Applications/ActivityWatch.app/Contents/MacOS/aw-qt',
      '/usr/local/bin/aw-qt',
      '/usr/bin/aw-qt',
    );
  }

  for (const p of candidates) {
    try {
      if (existsSync(p)) return resolve(p);
    } catch {}
  }
  return null;
}

function isAwRunning(): Promise<boolean> {
  return fetch('http://localhost:5600/api/0/info', { signal: AbortSignal.timeout(2000) })
    .then(r => r.ok)
    .catch(() => false);
}

// GET — return current state
export async function GET() {
  const state = readState();
  const awRunning = await isAwRunning();

  return NextResponse.json({
    paused: state.paused,
    pausedAt: state.pausedAt,
    awRunning,
    platform: process.platform,
    supported: process.platform === 'win32' || process.platform === 'darwin' || process.platform === 'linux',
  });
}

// POST — { action: "pause" | "resume" }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const action: string = body.action;

  if (action !== 'pause' && action !== 'resume') {
    return NextResponse.json({ error: 'action must be "pause" or "resume"' }, { status: 400 });
  }

  const state = readState();

  if (action === 'pause') {
    if (state.paused) {
      return NextResponse.json({ success: true, state: 'paused', message: 'Already paused' });
    }

    const awPath = findAwQtPath(state.awPath);

    if (process.platform === 'win32') {
      // Kill aw-qt.exe and all child processes (watchers, aw-server)
      await new Promise<void>(resolve => {
        const kill = spawn('taskkill', ['/F', '/IM', 'aw-qt.exe', '/T'], { shell: false });
        kill.on('close', () => resolve());
        kill.on('error', () => resolve());
      });
      // Also kill aw-server in case it was started independently
      await new Promise<void>(resolve => {
        const kill = spawn('taskkill', ['/F', '/IM', 'aw-server.exe', '/T'], { shell: false });
        kill.on('close', () => resolve());
        kill.on('error', () => resolve());
      });
    } else {
      // macOS / Linux
      await new Promise<void>(resolve => {
        const kill = spawn('pkill', ['-f', 'aw-qt'], { shell: false });
        kill.on('close', () => resolve());
        kill.on('error', () => resolve());
      });
    }

    writeState({ paused: true, pausedAt: new Date().toISOString(), awPath });
    return NextResponse.json({ success: true, state: 'paused' });
  }

  // action === 'resume'
  if (!state.paused) {
    return NextResponse.json({ success: true, state: 'active', message: 'Already active' });
  }

  const awPath = findAwQtPath(state.awPath);
  if (!awPath) {
    return NextResponse.json(
      { error: 'ActivityWatch not found. Please start it manually.', code: 'AW_NOT_FOUND' },
      { status: 404 }
    );
  }

  try {
    const child = spawn(awPath, [], {
      detached: true,
      stdio: 'ignore',
      ...(process.platform === 'win32' ? { shell: false } : {}),
    });
    child.unref();
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to start ActivityWatch: ${err instanceof Error ? err.message : err}` },
      { status: 500 }
    );
  }

  writeState({ paused: false, pausedAt: null, awPath });
  return NextResponse.json({ success: true, state: 'active' });
}
