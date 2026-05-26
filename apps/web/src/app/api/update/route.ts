import { NextRequest, NextResponse } from 'next/server';
import { fetchLatestRelease, getDownloadUrl, getPlatform, clearVersionCache } from '@/lib/versionCheck';
import { createWriteStream, existsSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
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

  if (action === 'shutdown') {
    return handleShutdown();
  }

  return NextResponse.json({ error: 'Invalid action. Use ?action=download|apply|status|selfupdate|selfupdate-status|shutdown' }, { status: 400 });
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

  // Detect bundled install (.app on macOS, standalone exe on Win) vs dev clone.
  // Bundled apps don't have .git/, can't `git pull`. Tell the user to download
  // the DMG/EXE installer instead.
  const isBundledInstall =
    !existsSync(join(projectDir, '.git')) &&
    !existsSync(join(projectDir, '..', '.git')) &&
    !existsSync(join(projectDir, '..', '..', '.git'));

  if (isBundledInstall) {
    return NextResponse.json(
      {
        status: 'error',
        error:
          'Self-update niedostępny w zainstalowanej wersji. Pobierz najnowszy DMG/EXE z release: https://github.com/shopconnector/ai-timetracker/releases/latest — przeciągnij do Applications (macOS) lub uruchom installer (Windows).',
        bundled: true,
      },
      { status: 400 },
    );
  }

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

/**
 * Get the application root directory (where start-server.js lives).
 * On Windows standalone: process.cwd() is the app root.
 * Fallback: walk up from __dirname looking for start-server.js or data/.
 */
function getAppDir(): string {
  const cwd = process.cwd();
  if (existsSync(join(cwd, 'start-server.js')) || existsSync(join(cwd, 'data'))) {
    return cwd;
  }
  // Fallback: two levels up from the running script
  const fallback = resolve(dirname(process.argv[1] || __dirname), '..', '..');
  if (existsSync(join(fallback, 'start-server.js'))) {
    return fallback;
  }
  return cwd;
}

/**
 * Create update.flag file so the launcher .bat knows an update is in progress.
 */
function createUpdateFlag(version: string, installerPath: string): void {
  const flagPath = join(getAppDir(), 'update.flag');
  const content = [
    `version=${version}`,
    `timestamp=${new Date().toISOString()}`,
    `installer=${installerPath}`,
  ].join('\n');
  writeFileSync(flagPath, content, 'utf-8');
}

/**
 * Shutdown action — called by the installer (via HTTP) for graceful stop.
 * Creates update.flag, responds 200, then exits after 1s to release file locks.
 */
function handleShutdown(): NextResponse {
  const appDir = getAppDir();
  const flagPath = join(appDir, 'update.flag');
  const content = [
    `version=shutdown`,
    `timestamp=${new Date().toISOString()}`,
    `source=installer`,
  ].join('\n');
  writeFileSync(flagPath, content, 'utf-8');

  // Schedule process exit after response is sent
  setTimeout(() => {
    process.exit(0);
  }, 1000);

  return NextResponse.json({
    status: 'shutting_down',
    message: 'Server will exit in 1 second. Update flag created.',
  });
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
    const version = downloadState.version || 'unknown';
    const installerPath = downloadState.filePath;

    // 1. Create update.flag so the launcher .bat waits for the installer
    createUpdateFlag(version, installerPath);

    // 2. Launch installer in detached mode with force-close flags
    spawn(installerPath, [
      '/VERYSILENT',
      '/SUPPRESSMSGBOXES',
      '/NORESTART',
      '/SP-',
      '/CLOSEAPPLICATIONS',
      '/FORCECLOSEAPPLICATIONS',
    ], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    }).unref();

    // 3. Exit process after 2s to release file locks so installer can overwrite files
    setTimeout(() => {
      process.exit(0);
    }, 2000);

    return NextResponse.json({
      status: 'applying',
      message: 'Update flag created, installer started. Server will exit in 2 seconds.',
      version,
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Failed to launch installer',
    }, { status: 500 });
  }
}
