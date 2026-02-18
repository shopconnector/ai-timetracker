import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { compareVersions, getCurrentVersion, getDownloadUrl, fetchLatestRelease } from './versionCheck';

// --- compareVersions (pure) ---

describe('compareVersions', () => {
  describe('equal versions', () => {
    it('should return 0 for identical versions', () => {
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    });

    it('should return 0 for equal with "v" prefix', () => {
      expect(compareVersions('v1.2.3', '1.2.3')).toBe(0);
    });

    it('should return 0 for both with "v" prefix', () => {
      expect(compareVersions('v2.0.0', 'v2.0.0')).toBe(0);
    });
  });

  describe('v1 < v2 (returns -1)', () => {
    it('should detect major version difference', () => {
      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
    });

    it('should detect minor version difference', () => {
      expect(compareVersions('1.2.0', '1.3.0')).toBe(-1);
    });

    it('should detect patch version difference', () => {
      expect(compareVersions('1.2.3', '1.2.4')).toBe(-1);
    });

    it('should compare with "v" prefix', () => {
      expect(compareVersions('v0.6.0', 'v0.7.0')).toBe(-1);
    });
  });

  describe('v1 > v2 (returns 1)', () => {
    it('should detect major version difference', () => {
      expect(compareVersions('3.0.0', '2.0.0')).toBe(1);
    });

    it('should detect minor version difference', () => {
      expect(compareVersions('1.5.0', '1.4.0')).toBe(1);
    });

    it('should detect patch version difference', () => {
      expect(compareVersions('1.2.5', '1.2.4')).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle different length versions (missing patch)', () => {
      // '1.0' vs '1.0.0' — missing part treated as 0
      expect(compareVersions('1.0', '1.0.0')).toBe(0);
    });

    it('should handle two-part vs three-part', () => {
      expect(compareVersions('1.1', '1.0.9')).toBe(1);
    });

    it('should handle single-part version', () => {
      expect(compareVersions('2', '1.9.9')).toBe(1);
    });

    it('should handle zero versions', () => {
      expect(compareVersions('0.0.0', '0.0.0')).toBe(0);
    });

    it('should handle large version numbers', () => {
      expect(compareVersions('10.20.30', '10.20.29')).toBe(1);
    });
  });
});

// --- getCurrentVersion ---

describe('getCurrentVersion', () => {
  const originalEnv = process.env.NEXT_PUBLIC_APP_VERSION;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.NEXT_PUBLIC_APP_VERSION = originalEnv;
    } else {
      delete process.env.NEXT_PUBLIC_APP_VERSION;
    }
  });

  it('should return env variable when set', () => {
    process.env.NEXT_PUBLIC_APP_VERSION = '0.7.0';
    expect(getCurrentVersion()).toBe('0.7.0');
  });

  it('should return "0.0.0" when env variable is not set', () => {
    delete process.env.NEXT_PUBLIC_APP_VERSION;
    expect(getCurrentVersion()).toBe('0.0.0');
  });
});

// --- getDownloadUrl ---

describe('getDownloadUrl', () => {
  const mockAssets = [
    {
      name: 'TimeTracker-Setup-0.7.0-x64.exe',
      browser_download_url: 'https://github.com/releases/download/v0.7.0/TimeTracker-Setup-0.7.0-x64.exe',
      size: 85000000,
    },
    {
      name: 'RELEASES',
      browser_download_url: 'https://github.com/releases/download/v0.7.0/RELEASES',
      size: 1234,
    },
    {
      name: 'TimeTracker-0.7.0-full.nupkg',
      browser_download_url: 'https://github.com/releases/download/v0.7.0/TimeTracker-0.7.0-full.nupkg',
      size: 80000000,
    },
  ];

  it('should return exe URL for win32', () => {
    const url = getDownloadUrl(mockAssets, 'win32');
    expect(url).toBe('https://github.com/releases/download/v0.7.0/TimeTracker-Setup-0.7.0-x64.exe');
  });

  it('should return null for macOS (darwin)', () => {
    expect(getDownloadUrl(mockAssets, 'darwin')).toBeNull();
  });

  it('should return null for Linux', () => {
    expect(getDownloadUrl(mockAssets, 'linux')).toBeNull();
  });

  it('should return null for win32 when no matching exe asset', () => {
    const noExe = [{ name: 'RELEASES', browser_download_url: 'https://example.com/RELEASES', size: 100 }];
    expect(getDownloadUrl(noExe, 'win32')).toBeNull();
  });

  it('should return null for empty assets', () => {
    expect(getDownloadUrl([], 'win32')).toBeNull();
  });

  it('should match exe case-insensitively', () => {
    const assets = [{
      name: 'timetracker-setup-0.7.0-X64.EXE',
      browser_download_url: 'https://example.com/timetracker.exe',
      size: 85000000,
    }];
    expect(getDownloadUrl(assets, 'win32')).toBe('https://example.com/timetracker.exe');
  });
});

// --- fetchLatestRelease (requires mocked fetch) ---

describe('fetchLatestRelease', () => {
  const mockRelease = {
    tag_name: 'v0.8.0',
    name: 'Release 0.8.0',
    body: '## Changes\n- New feature',
    published_at: '2024-01-20T10:00:00Z',
    html_url: 'https://github.com/shopconnector/ai-timetracker/releases/tag/v0.8.0',
    assets: [],
  };

  // Each test gets a fresh module to reset the cachedRelease singleton
  async function getFreshModule() {
    vi.resetModules();
    return await import('./versionCheck');
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('should fetch from GitHub API and return release', async () => {
    const mod = await getFreshModule();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockRelease),
    } as Response);

    const release = await mod.fetchLatestRelease();
    expect(release.tag_name).toBe('v0.8.0');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('should throw on non-ok response', async () => {
    const mod = await getFreshModule();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
    } as Response);

    await expect(mod.fetchLatestRelease()).rejects.toThrow('GitHub API error: 403');
  });

  it('should use cached release within TTL (6 hours)', async () => {
    const mod = await getFreshModule();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRelease),
    } as Response);

    // First call — fetches
    await mod.fetchLatestRelease();
    expect(fetch).toHaveBeenCalledTimes(1);

    // Advance 5 hours (within 6h TTL)
    vi.advanceTimersByTime(5 * 60 * 60 * 1000);

    // Second call — should use cache
    const release = await mod.fetchLatestRelease();
    expect(release.tag_name).toBe('v0.8.0');
    expect(fetch).toHaveBeenCalledTimes(1); // Still only 1 fetch
  });

  it('should re-fetch after TTL expires', async () => {
    const mod = await getFreshModule();
    const updatedRelease = { ...mockRelease, tag_name: 'v0.9.0' };

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRelease),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(updatedRelease),
      } as Response);

    // First call
    await mod.fetchLatestRelease();
    expect(fetch).toHaveBeenCalledTimes(1);

    // Advance past 6h TTL
    vi.advanceTimersByTime(6 * 60 * 60 * 1000 + 1);

    // Should re-fetch
    const release = await mod.fetchLatestRelease();
    expect(release.tag_name).toBe('v0.9.0');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
