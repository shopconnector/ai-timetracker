import { NextResponse } from 'next/server';
import {
  getCurrentVersion,
  fetchLatestRelease,
  compareVersions,
  getDownloadUrl,
  getPlatform,
} from '@/lib/versionCheck';

export async function GET() {
  const current = getCurrentVersion();
  const platform = getPlatform();

  try {
    const release = await fetchLatestRelease();
    const latest = release.tag_name.replace(/^v/, '');
    const hasUpdate = compareVersions(current, latest) < 0;
    const downloadUrl = getDownloadUrl(release.assets, platform);

    return NextResponse.json({
      current,
      latest,
      hasUpdate,
      downloadUrl,
      releaseUrl: release.html_url,
      releaseNotes: release.body || '',
      publishedAt: release.published_at,
      platform,
      checkedAt: new Date().toISOString(),
    });
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
    });
  }
}
