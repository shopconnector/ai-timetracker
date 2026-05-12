'use client';

import { useEffect, useState, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiUrl } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Github, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';

interface Commit {
  repo: string;
  hash: string;
  shortHash: string;
  date: string;
  time: string;
  author: string;
  subject: string;
  remote?: string;
}

interface CommitsResponse {
  from: string;
  to: string;
  total: number;
  repos: number;
  byDate?: Record<string, Commit[]>;
  byRepo?: Record<string, Commit[]>;
  commits?: Commit[];
  message?: string;
  error?: string;
}

function shiftDate(yyyymmdd: string, deltaDays: number): string {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export default function ActivityPage() {
  const t = useTranslations('activity');
  const locale = useLocale();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(shiftDate(today, -6));
  const [to, setTo] = useState(today);
  const [data, setData] = useState<CommitsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(apiUrl(`/api/github/commits?from=${from}&to=${to}&groupBy=date`));
      setData(await r.json());
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const shiftRange = (days: number) => {
    setFrom(shiftDate(from, days));
    setTo(shiftDate(to, days));
  };

  const dates = data?.byDate ? Object.keys(data.byDate).sort((a, b) => b.localeCompare(a)) : [];
  const dateFmtLocale = locale === 'pl' ? 'pl-PL' : 'en-US';

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Github className="w-5 h-5" />
          <h1 className="text-xl font-bold">{t('title')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => shiftRange(-7)}>
            <ChevronLeft className="w-4 h-4" /> {t('week')}
          </Button>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-2 py-1 text-sm border rounded bg-background"
          />
          <span className="text-sm text-muted-foreground">→</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-2 py-1 text-sm border rounded bg-background"
          />
          <Button variant="outline" size="sm" onClick={() => shiftRange(7)}>
            {t('week')} <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {data?.message && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">{data.message}</CardContent>
        </Card>
      )}
      {data?.error && (
        <Card>
          <CardContent className="p-4 text-sm text-red-500">{t('errorPrefix', { message: data.error })}</CardContent>
        </Card>
      )}

      {data && !data.error && (
        <div className="text-sm text-muted-foreground">
          {t('summary', { total: data.total, repos: data.repos, from: data.from, to: data.to })}
        </div>
      )}

      {dates.map((d) => {
        const commits = data!.byDate![d];
        const byRepo: Record<string, Commit[]> = {};
        for (const c of commits) {
          if (!byRepo[c.repo]) byRepo[c.repo] = [];
          byRepo[c.repo].push(c);
        }
        const dayLabel = new Date(d + 'T12:00:00').toLocaleDateString(dateFmtLocale, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        });
        return (
          <Card key={d}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <span>
                  {d} <span className="text-muted-foreground font-normal text-sm">· {dayLabel}</span>
                </span>
                <span className="text-xs text-muted-foreground font-normal">{t('commitsCount', { count: commits.length })}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(byRepo).map(([repo, list]) => (
                <div key={repo}>
                  <div className="text-xs font-mono text-muted-foreground mb-1">
                    {repo} <span className="opacity-60">· {list.length}</span>
                  </div>
                  <div className="space-y-1 pl-3 border-l-2 border-muted">
                    {list.map((c) => (
                      <div key={c.hash} className="flex items-start gap-2 text-sm">
                        <span className="font-mono text-xs text-muted-foreground tabular-nums w-12 shrink-0">
                          {c.time?.slice(0, 5)}
                        </span>
                        {c.remote ? (
                          <a
                            href={`${c.remote}/commit/${c.hash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-xs text-blue-500 hover:underline w-16 shrink-0"
                          >
                            {c.shortHash}
                          </a>
                        ) : (
                          <span className="font-mono text-xs text-muted-foreground w-16 shrink-0">{c.shortHash}</span>
                        )}
                        <span className="flex-1 break-words">{c.subject}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      {data && dates.length === 0 && !data.error && !data.message && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {t('noCommits')}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
