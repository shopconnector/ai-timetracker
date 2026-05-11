import { NextResponse } from 'next/server';
import {
  getCurrentVersion,
  fetchLatestRelease,
  compareVersions,
  getDownloadUrl,
  getPlatform,
  clearVersionCache,
} from '@/lib/versionCheck';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const debug = searchParams.get('debug') === '1';
  const forceRefresh = searchParams.get('refresh') === '1';

  if (forceRefresh) {
    clearVersionCache();
  }

  const current = getCurrentVersion();
  const platform = getPlatform();

  try {
    const release = await fetchLatestRelease();
    const latest = release.tag_name.replace(/^v/, '');
    const hasUpdate = compareVersions(current, latest) < 0;
    const downloadUrl = getDownloadUrl(release.assets, platform);

    const payload: Record<string, unknown> = {
      current,
      latest,
      hasUpdate,
      downloadUrl,
      releaseUrl: release.html_url,
      releaseNotes: release.body || '',
      publishedAt: release.published_at,
      platform,
      checkedAt: new Date().toISOString(),
    };

    if (debug) {
      payload.debug = {
        nextPublicAppVersion: process.env.NEXT_PUBLIC_APP_VERSION || null,
        timetrackerDataDir: process.env.TIMETRACKER_DATA_DIR || null,
        cwd: process.cwd(),
        nodeVersion: process.version,
        assetNames: release.assets.map((a) => a.name),
      };
    }

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({
      current,
      latest: current,
      hasUpdate: false,
      downloadUrl: null,
      releaseUrl: `https://github.com/shopconnector/ai-timetracker/releases`,
      releaseNotes: '',
      publishedAt: null,
      platform,
      checkedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Failed to check for updates',
      ...(debug && {
        debug: {
          nextPublicAppVersion: process.env.NEXT_PUBLIC_APP_VERSION || null,
          timetrackerDataDir: process.env.TIMETRACKER_DATA_DIR || null,
          cwd: process.cwd(),
          nodeVersion: process.version,
        },
      }),
    });
  }
}
