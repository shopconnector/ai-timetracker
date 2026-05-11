'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, RefreshCw, Sparkles } from 'lucide-react';
import { formatMinutes } from '@/lib/morning-format';

interface Totals {
  trackedMinutes: number;
  tempoMinutes: number;
  commitsCount: number;
  projectsCount: number;
}

export function YesterdayHeader({
  date,
  totals,
  withSummary,
}: {
  date: string;
  totals: Totals;
  withSummary: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [isRefreshing, setIsRefreshing] = useState(false);

  function pushDate(next: string) {
    const params = new URLSearchParams(sp.toString());
    params.set('date', next);
    startTransition(() => {
      router.push(`/yesterday?${params.toString()}`);
    });
  }

  function shiftDate(days: number) {
    const [y, m, d] = date.split('-').map(Number);
    const nd = new Date(y, m - 1, d + days);
    const yyyy = nd.getFullYear();
    const mm = String(nd.getMonth() + 1).padStart(2, '0');
    const dd = String(nd.getDate()).padStart(2, '0');
    pushDate(`${yyyy}-${mm}-${dd}`);
  }

  function jumpToYesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    pushDate(toYmd(d));
  }

  function jumpToLastWeekday(targetDow: number) {
    const d = new Date();
    let delta = (d.getDay() - targetDow + 7) % 7;
    if (delta === 0) delta = 7;
    d.setDate(d.getDate() - delta);
    pushDate(toYmd(d));
  }

  function jumpDaysAgo(n: number) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    pushDate(toYmd(d));
  }

  function toggleSummary() {
    const params = new URLSearchParams(sp.toString());
    if (withSummary) params.delete('summary');
    else params.set('summary', '1');
    startTransition(() => {
      router.push(`/yesterday?${params.toString()}`);
    });
  }

  function refresh() {
    setIsRefreshing(true);
    startTransition(() => {
      router.refresh();
      setTimeout(() => setIsRefreshing(false), 800);
    });
  }

  const dayName = formatDayName(date);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={() => shiftDate(-1)}
            disabled={isPending}
            title="Poprzedni dzień"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="text-lg font-semibold tabular-nums">
            {date} <span className="text-muted-foreground font-normal">({dayName})</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => shiftDate(1)}
            disabled={isPending}
            title="Następny dzień"
          >
            <ChevronRight className="size-4" />
          </Button>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              if (e.target.value && /^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) {
                pushDate(e.target.value);
              }
            }}
            disabled={isPending}
            className="ml-2 h-8 rounded-md border border-input bg-background px-2 text-sm tabular-nums"
            aria-label="Wybierz dowolną datę"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={withSummary ? 'default' : 'outline'}
            onClick={toggleSummary}
            disabled={isPending}
            title="Wygeneruj 1-2 zdaniowe streszczenie per projekt (Gemini)"
          >
            <Sparkles className="size-4" />
            {withSummary ? 'Streszczenie ON' : 'Streszczenie'}
          </Button>
          <Button size="sm" variant="outline" onClick={refresh} disabled={isPending || isRefreshing}>
            <RefreshCw className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-wrap text-xs">
        <span className="text-muted-foreground mr-1">Skok:</span>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={jumpToYesterday} disabled={isPending}>
          Wczoraj
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => jumpToLastWeekday(1)} disabled={isPending}>
          Pn
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => jumpToLastWeekday(5)} disabled={isPending}>
          Pt
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => jumpDaysAgo(7)} disabled={isPending}>
          Tydzień temu
        </Button>
      </div>

      <div className="rounded-lg border bg-card px-4 py-3 flex items-center gap-6 text-sm flex-wrap">
        <div className="text-2xl font-bold">🌅</div>
        <Stat label="Czas (AW)" value={formatMinutes(totals.trackedMinutes)} />
        <Stat label="Projekty BC" value={String(totals.projectsCount)} />
        <Stat label="Commity" value={String(totals.commitsCount)} />
        <Stat label="Tempo" value={formatMinutes(totals.tempoMinutes)} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

const POLISH_DAYS = ['niedz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.'];
function formatDayName(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return POLISH_DAYS[new Date(y, m - 1, d).getDay()];
}

function toYmd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
