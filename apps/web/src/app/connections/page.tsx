'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { apiUrl } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

interface APIStatus {
  name: string;
  status: 'ok' | 'error' | 'unconfigured';
  message?: string;
}

const API_LINKS: Record<string, string> = {
  'Tempo': 'https://tempo.io',
  'Jira': 'https://atlassian.net',
  'ActivityWatch': 'http://localhost:5600',
  'OpenRouter': 'https://openrouter.ai',
  'Slack': 'https://api.slack.com/apps',
  'AI/LLM (Gemini)': 'https://aistudio.google.com/apikey',
  'AI/LLM (OpenRouter)': 'https://openrouter.ai/keys',
  'GitHub (local repos)': 'https://github.com',
};

export default function ConnectionsPage() {
  const t = useTranslations('connections');
  const [apis, setApis] = useState<APIStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/status'));
      const data = await response.json();
      setApis(data.apis || []);
    } catch (error) {
      console.error('Error fetching status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ok':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ok':
        return <Badge className="bg-green-500 text-white">{t('status.connected')}</Badge>;
      case 'error':
        return <Badge variant="destructive">{t('status.error')}</Badge>;
      default:
        return <Badge variant="secondary">{t('status.notConfigured')}</Badge>;
    }
  };

  const connectedCount = apis.filter(a => a.status === 'ok').length;
  const errorCount = apis.filter(a => a.status === 'error').length;

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{t('title')}</h1>
          <p className="text-slate-500 dark:text-slate-400">
            {t('subtitle')}
          </p>
        </div>
        <Button onClick={fetchStatus} disabled={loading} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          {t('checkAll')}
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{connectedCount}</div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('summary.connected')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">{errorCount}</div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('summary.errors')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-slate-600 dark:text-slate-400">
              {apis.length - connectedCount - errorCount}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('summary.notConfigured')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Connections List */}
      <Card>
        <CardHeader>
          <CardTitle>{t('serviceStatus.title')}</CardTitle>
          <CardDescription>
            {t('serviceStatus.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {loading && apis.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
                {t('loading')}
              </div>
            ) : apis.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                {t('noData')}
              </div>
            ) : (
              apis.map((api, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    {getStatusIcon(api.status)}
                    <div>
                      <div className="font-medium text-slate-900 dark:text-white">
                        {api.name}
                      </div>
                      {api.message && (
                        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md truncate">
                          {api.message}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(api.status)}
                    {API_LINKS[api.name] && (
                      <a
                        href={API_LINKS[api.name]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Help */}
      <Card>
        <CardHeader>
          <CardTitle>{t('help.title')}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-500 dark:text-slate-400 space-y-2">
          <p>
            {t('help.notConfiguredText')}{' '}
            <a href="/settings" className="text-blue-500 hover:underline">
              {t('help.settingsLink')}
            </a>{' '}
            {t('help.settingsHint')}
          </p>
          <p>
            {t('help.errorHint')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
