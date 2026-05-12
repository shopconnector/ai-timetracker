'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { X, Download, ExternalLink, RefreshCw } from 'lucide-react';
import { apiUrl } from '@/lib/api';

interface VersionInfo {
  current: string;
  latest: string;
  hasUpdate: boolean;
  downloadUrl: string | null;
  releaseUrl: string;
  releaseNotes: string;
  publishedAt: string;
  platform: string;
}

interface DownloadState {
  status: 'idle' | 'downloading' | 'ready' | 'error' | 'applying';
  progress: number;
  error: string | null;
}

interface SelfUpdateState {
  status: 'idle' | 'running' | 'done' | 'error';
  step: string;
  steps: { name: string; status: 'pending' | 'running' | 'done' | 'error' }[];
  error: string | null;
}

const DISMISS_KEY = 'timetracker-update-dismissed';
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export function UpdateBanner() {
  const t = useTranslations('updateBanner');
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadState>({ status: 'idle', progress: 0, error: null });
  const [selfUpdate, setSelfUpdate] = useState<SelfUpdateState>({ status: 'idle', step: '', steps: [], error: null });
  const [dismissed, setDismissed] = useState(true); // start hidden

  useEffect(() => {
    // Check if dismissed recently
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt && Date.now() - parseInt(dismissedAt, 10) < DISMISS_DURATION_MS) {
      return;
    }

    setDismissed(false);
    checkVersion();
  }, []);

  const checkVersion = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/version'));
      if (!res.ok) return;
      const data: VersionInfo = await res.json();
      setVersionInfo(data);
    } catch {
      // Silently fail — update check is not critical
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  };

  const handleUpdate = async () => {
    if (!versionInfo) return;

    // Non-Windows: selfupdate via git pull + build + pm2 restart
    if (versionInfo.platform !== 'win32') {
      setSelfUpdate({ status: 'running', step: t('startingStep'), steps: [], error: null });
      try {
        await fetch(apiUrl('/api/update?action=selfupdate'), { method: 'POST' });
        pollSelfUpdateStatus();
      } catch {
        setSelfUpdate({ status: 'error', step: '', steps: [], error: t('errors.selfUpdateStart') });
      }
      return;
    }

    // Windows: download then apply
    if (downloadState.status === 'ready') {
      // Apply the update
      setDownloadState({ status: 'applying', progress: 100, error: null });
      try {
        await fetch(apiUrl('/api/update?action=apply'), { method: 'POST' });
      } catch {
        setDownloadState({ status: 'error', progress: 0, error: t('errors.installerStart') });
      }
      return;
    }

    // Start download
    setDownloadState({ status: 'downloading', progress: 0, error: null });
    try {
      await fetch(apiUrl('/api/update?action=download'), { method: 'POST' });
      // Poll for progress
      pollDownloadStatus();
    } catch {
      setDownloadState({ status: 'error', progress: 0, error: t('errors.downloadStart') });
    }
  };

  const pollDownloadStatus = useCallback(async () => {
    const poll = async () => {
      try {
        const res = await fetch(apiUrl('/api/update?action=status'), { method: 'POST' });
        if (!res.ok) return;
        const data = await res.json();
        setDownloadState({ status: data.status, progress: data.progress, error: data.error });

        if (data.status === 'downloading') {
          setTimeout(poll, 500);
        }
      } catch {
        // ignore polling errors
      }
    };
    poll();
  }, []);

  const pollSelfUpdateStatus = useCallback(async () => {
    const poll = async () => {
      try {
        const res = await fetch(apiUrl('/api/update?action=selfupdate-status'), { method: 'POST' });
        if (!res.ok) return;
        const data: SelfUpdateState = await res.json();
        setSelfUpdate(data);

        if (data.status === 'running') {
          setTimeout(poll, 1000);
        } else if (data.status === 'done') {
          // Server is restarting — wait a moment then reload
          setTimeout(() => window.location.reload(), 5000);
        }
      } catch {
        // Server might be restarting — try reload after delay
        setTimeout(() => window.location.reload(), 5000);
      }
    };
    poll();
  }, []);

  if (dismissed || !versionInfo?.hasUpdate) {
    return null;
  }

  const isWindows = versionInfo.platform === 'win32';
  const isSelfUpdating = selfUpdate.status === 'running' || selfUpdate.status === 'done';
  const isUpdating = isSelfUpdating || downloadState.status === 'downloading' || downloadState.status === 'applying';

  return (
    <div className="bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-800 px-4 py-2.5">
      <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-3 min-w-0">
          <RefreshCw className={`h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 ${isSelfUpdating ? 'animate-spin' : ''}`} />
          <span className="text-sm text-amber-800 dark:text-amber-200 truncate">
            {isSelfUpdating
              ? t('updating', { step: selfUpdate.step || t('startingStep') })
              : <>{t('newVersion')} <strong>v{versionInfo.latest}</strong></>
            }
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Self-update step indicators */}
          {selfUpdate.status === 'running' && selfUpdate.steps.length > 0 && (
            <div className="flex items-center gap-1">
              {selfUpdate.steps.map((s, i) => (
                <span
                  key={i}
                  className={`inline-block w-2 h-2 rounded-full ${
                    s.status === 'done' ? 'bg-green-500' :
                    s.status === 'running' ? 'bg-amber-500 animate-pulse' :
                    s.status === 'error' ? 'bg-red-500' :
                    'bg-gray-300 dark:bg-gray-600'
                  }`}
                  title={s.name}
                />
              ))}
            </div>
          )}

          {selfUpdate.status === 'done' && (
            <span className="text-xs text-green-600 dark:text-green-400">
              {t('done')}
            </span>
          )}

          {selfUpdate.status === 'error' && (
            <span className="text-xs text-red-600 dark:text-red-400">
              {selfUpdate.error}
            </span>
          )}

          {downloadState.status === 'downloading' && (
            <div className="flex items-center gap-2">
              <div className="w-24 h-2 bg-amber-200 dark:bg-amber-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-300"
                  style={{ width: `${downloadState.progress}%` }}
                />
              </div>
              <span className="text-xs text-amber-700 dark:text-amber-300 tabular-nums">
                {downloadState.progress}%
              </span>
            </div>
          )}

          {downloadState.status === 'applying' && (
            <span className="text-xs text-amber-700 dark:text-amber-300">
              {t('installing')}
            </span>
          )}

          {downloadState.status === 'error' && (
            <span className="text-xs text-red-600 dark:text-red-400">
              {downloadState.error}
            </span>
          )}

          <a
            href={versionInfo.releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-amber-700 dark:text-amber-300 hover:underline flex items-center gap-1"
          >
            {t('details')}
            <ExternalLink className="h-3 w-3" />
          </a>

          {!isUpdating && downloadState.status !== 'applying' && (
            <button
              onClick={handleUpdate}
              disabled={selfUpdate.status === 'running'}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Download className="h-3 w-3" />
              {downloadState.status === 'ready'
                ? t('install')
                : t('update')}
            </button>
          )}

          <button
            onClick={handleDismiss}
            className="p-1 text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 transition-colors"
            title={t('dismiss')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
