'use client';

import { useState, useEffect } from 'react';
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
};

export default function ConnectionsPage() {
  const [apis, setApis] = useState<APIStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/status');
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
        return <Badge className="bg-green-500 text-white">Connected</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="secondary">Not Configured</Badge>;
    }
  };

  const connectedCount = apis.filter(a => a.status === 'ok').length;
  const errorCount = apis.filter(a => a.status === 'error').length;

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Connections</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Manage your external service integrations
          </p>
        </div>
        <Button onClick={fetchStatus} disabled={loading} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Check All
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{connectedCount}</div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Connected</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">{errorCount}</div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Errors</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-slate-600 dark:text-slate-400">
              {apis.length - connectedCount - errorCount}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Not Configured</p>
          </CardContent>
        </Card>
      </div>

      {/* Connections List */}
      <Card>
        <CardHeader>
          <CardTitle>Service Status</CardTitle>
          <CardDescription>
            Current connection status for all external services
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {loading && apis.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
                Checking connections...
              </div>
            ) : apis.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                No connection data available
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
          <CardTitle>Need Help?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-500 dark:text-slate-400 space-y-2">
          <p>
            If a service shows as &quot;Not Configured&quot;, go to{' '}
            <a href="/settings" className="text-blue-500 hover:underline">
              Settings
            </a>{' '}
            to add your API keys.
          </p>
          <p>
            If a service shows an error, check that your API keys are valid and the
            service is accessible.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
