import { NextRequest, NextResponse } from 'next/server';
import { fetchLatestRelease, getDownloadUrl, getPlatform, clearVersionCache } from '@/lib/versionCheck';
import { createWriteStream, existsSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { spawn, execSync } from 'child_process';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

let downloadState: {
  status: 'idle' | 'downloading' | 'ready' | 'error';
  progress: number;
  filePath: string | null;
  error: string | null;
  version: string | null;
} = { status: 'idle', progress: 0, filePath: null, error: null, version: null };

let selfUpdateState: {
  status: 'idle' | 'running' | 'done' | 'error';
  step: string;
  steps: { name: string; status: 'pending' | 'running' | 'done' | 'error'; output?: string }[];
  error: string | null;
} = {
  status: 'idle',
  step: '',
  steps: [],
  error: null,
};

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'download') {
    return handleDownload();
  }

  if (action === 'apply') {
    return handleApply();
  }

  if (action === 'selfupdate') {
    return handleSelfUpdate();
  }

  if (action === 'status') {
    return NextResponse.json(downloadState);
  }

  if (action === 'selfupdate-status') {
    return NextResponse.json(selfUpdateState);
  }

  return NextResponse.json({ error: 'Invalid action. Use ?action=download|apply|status|selfupdate|selfupdate-status' }, { status: 400 });
}

async function handleDownload() {
  if (downloadState.status === 'downloading') {
    return NextResponse.json(downloadState);
  }

  const platform = getPlatform();
  if (platform !== 'win32') {
    return NextResponse.json({
      status: 'error',
      error: 'Auto-update is only supported on Windows. Please download from GitHub Releases.',
    }, { status: 400 });
  }

  try {
    const release = await fetchLatestRelease();
    const downloadUrl = getDownloadUrl(release.assets, platform);

    if (!downloadUrl) {
      return NextResponse.json({
        status: 'error',
        error: 'No installer found for this platform',
      }, { status: 404 });
    }

    const version = release.tag_name.replace(/^v/, '');
    const fileName = `TimeTracker-Setup-${version}-x64.exe`;
    const filePath = join(tmpdir(), fileName);

    // Remove old file if exists
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }

    downloadState = { status: 'downloading', progress: 0, filePath, error: null, version };

    // Start async download
    downloadFile(downloadUrl, filePath).catch((err) => {
      downloadState = {
        status: 'error',
        progress: 0,
        filePath: null,
        error: err instanceof Error ? err.message : 'Download failed',
        version,
      };
    });

    return NextResponse.json(downloadState);
  } catch (error) {
    downloadState = {
      status: 'error',
      progress: 0,
      filePath: null,
      error: error instanceof Error ? error.message : 'Failed to start download',
      version: null,
    };
    return NextResponse.json(downloadState, { status: 500 });
  }
}

async function downloadFile(url: string, destPath: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(300000) });

  if (!response.ok || !response.body) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }

  const totalSize = parseInt(response.headers.get('content-length') || '0', 10);
  let downloaded = 0;

  const writeStream = createWriteStream(destPath);
  const reader = response.body.getReader();

  const nodeStream = new Readable({
    async read() {
      const { done, value } = await reader.read();
      if (done) {
        this.push(null);
        return;
      }
      downloaded += value.byteLength;
      if (totalSize > 0) {
        downloadState.progress = Math.round((downloaded / totalSize) * 100);
      }
      this.push(Buffer.from(value));
    },
  });

  await pipeline(nodeStream, writeStream);

  downloadState = {
    status: 'ready',
    progress: 100,
    filePath: destPath,
    error: null,
    version: downloadState.version,
  };
}

function getExtendedPath(): string {
  const sep = process.platform === 'win32' ? ';' : ':';
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const paths = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/usr/bin',
    '/bin',
    `${home}/.local/share/pnpm`,
    `${home}/.nvm/versions/node/${process.version}/bin`,
    process.env.PATH || '',
  ];
  return paths.join(sep);
}

async function handleSelfUpdate() {
  if (selfUpdateState.status === 'running') {
    return NextResponse.json(selfUpdateState);
  }

  const projectDir = resolve(process.cwd());
  const extendedEnv = { ...process.env, PATH: getExtendedPath() };

  const steps = [
    { name: 'git pull', cmd: 'git pull origin main' },
    { name: 'pnpm install', cmd: 'pnpm install --frozen-lockfile' },
    { name: 'pnpm build', cmd: 'pnpm build' },
  ];

  selfUpdateState = {
    status: 'running',
    step: '',
    steps: steps.map((s) => ({ name: s.name, status: 'pending' })),
    error: null,
  };

  // Run pipeline async so we can return immediately
  (async () => {
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      selfUpdateState.step = s.name;
      selfUpdateState.steps[i].status = 'running';

      try {
        const output = execSync(s.cmd, {
          cwd: projectDir,
          encoding: 'utf-8',
          timeout: 300000, // 5 min per step
          stdio: ['pipe', 'pipe', 'pipe'],
          env: extendedEnv,
        });
        selfUpdateState.steps[i].status = 'done';
        selfUpdateState.steps[i].output = output.slice(-500);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        selfUpdateState.steps[i].status = 'error';
        selfUpdateState.steps[i].output = msg.slice(-500);
        selfUpdateState.status = 'error';
        selfUpdateState.error = `${s.name} failed: ${msg.slice(0, 200)}`;
        return;
      }
    }

    // Clear version cache so the new version is picked up immediately
    clearVersionCache();

    selfUpdateState.status = 'done';
    selfUpdateState.step = 'pm2 restart';

    // Restart via pm2 in detached mode — this will kill the current process
    const child = spawn('pm2', ['restart', 'all'], {
      cwd: projectDir,
      detached: true,
      stdio: 'ignore',
      env: extendedEnv,
    });
    child.unref();
  })();

  return NextResponse.json(selfUpdateState);
}

async function handleApply() {
  const platform = getPlatform();
  if (platform !== 'win32') {
    return NextResponse.json({
      status: 'error',
      error: 'Auto-update is only supported on Windows',
    }, { status: 400 });
  }

  if (downloadState.status !== 'ready' || !downloadState.filePath) {
    return NextResponse.json({
      status: 'error',
      error: 'No update downloaded. Call ?action=download first.',
    }, { status: 400 });
  }

  if (!existsSync(downloadState.filePath)) {
    downloadState = { status: 'idle', progress: 0, filePath: null, error: null, version: null };
    return NextResponse.json({
      status: 'error',
      error: 'Downloaded file not found. Please download again.',
    }, { status: 404 });
  }

  try {
    // Launch installer in detached mode — it will kill the running server
    // and install the new version, then the launcher (.bat) will restart
    spawn(downloadState.filePath, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    }).unref();

    // Give the installer a moment to start
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return NextResponse.json({
      status: 'applying',
      message: 'Installer started. The application will restart automatically after the update.',
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Failed to launch installer',
    }, { status: 500 });
  }
}
