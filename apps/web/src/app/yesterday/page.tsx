import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buildYesterdayReport, formatMinutes, type ProjectSection } from '@/lib/morning-summary';
import { previousWorkday } from '@/lib/morning-format';
import { YesterdayHeader } from './yesterday-client';
import {
  Activity,
  GitCommit,
  FileEdit,
  Hash,
  MessageSquare,
  ScrollText,
  Sparkles,
  TimerReset,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ date?: string; summary?: string }>;
}

export default async function YesterdayPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const date = isValidDate(sp.date) ? sp.date! : previousWorkday();
  const withSummary = sp.summary === '1';

  let report;
  try {
    report = await buildYesterdayReport({ date, withSummary });
  } catch (error) {
    return (
      <div className="space-y-4">
        <Card className="border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30">
          <CardHeader>
            <CardTitle className="text-red-900 dark:text-red-200">Błąd generowania raportu</CardTitle>
          </CardHeader>
          <CardContent className="px-6 text-sm text-red-900 dark:text-red-200">
            <div>Data: {date}</div>
            <pre className="mt-2 whitespace-pre-wrap text-xs">
              {error instanceof Error ? error.message : String(error)}
            </pre>
            <div className="mt-3 text-muted-foreground">
              Sprawdź czy ActivityWatch (`localhost:5600`), Slack i Tempo są skonfigurowane
              w <code>/settings</code>. Każde źródło z osobna jest opcjonalne — jeśli któryś
              fetch wybucha tu zbiorczo, zgłoś bug.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <YesterdayHeader date={report.date} totals={report.totals} withSummary={withSummary} />

      {report.warnings.length > 0 && (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
          <CardContent className="px-6 text-sm">
            <div className="font-medium mb-1">Ostrzeżenia źródeł:</div>
            <ul className="list-disc pl-5 space-y-0.5 text-amber-900 dark:text-amber-200">
              {report.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {report.projects.length === 0 ? (
        <Card>
          <CardContent className="px-6 py-10 text-center text-muted-foreground">
            <div className="text-4xl mb-3">🌴</div>
            <div className="font-medium">Brak aktywności BeeCommerce w tym dniu</div>
            <div className="text-sm mt-1">
              Spróbuj innej daty albo sprawdź czy ActivityWatch i Slack są uruchomione.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-1">
          {report.projects.map((p) => (
            <ProjectCard key={p.key} project={p} />
          ))}
        </div>
      )}

      {report.proposalForToday.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-5" /> Propozycja na dziś
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6">
            <ul className="space-y-2 text-sm">
              {report.proposalForToday.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Badge variant="outline" className="shrink-0 mt-0.5">
                    {item.project}
                  </Badge>
                  <span>
                    {item.item}
                    <span className="text-muted-foreground text-xs ml-2">
                      ({item.source === 'plan' ? 'plan Claude' : 'Tempo'})
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="text-xs text-muted-foreground text-center">
        Wygenerowano {new Date(report.generatedAt).toLocaleString('pl-PL')} ·{' '}
        Filtr: <strong>tylko BeeCommerce</strong>
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectSection }) {
  const totalCommits = project.sources.git.reduce((s, r) => s + r.commits.length, 0);
  const totalTempo = project.sources.tempo.reduce((s, t) => s + t.minutes, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Hash className="size-4 text-muted-foreground" />
            {project.label}
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <TimerReset className="size-3.5" /> {formatMinutes(project.minutes)}
            </span>
            {totalCommits > 0 && (
              <span className="inline-flex items-center gap-1">
                <GitCommit className="size-3.5" /> {totalCommits}
              </span>
            )}
            {totalTempo > 0 && (
              <span className="inline-flex items-center gap-1">
                <ScrollText className="size-3.5" /> Tempo {formatMinutes(totalTempo)}
              </span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-6 space-y-3 text-sm">
        {project.summary && (
          <div className="rounded-md bg-muted/50 p-3 text-muted-foreground italic">
            {project.summary}
          </div>
        )}

        {project.sources.aw.length > 0 && (
          <Section icon={<Activity className="size-3.5" />} title="Aktywność (AW)">
            <ul className="space-y-1">
              {project.sources.aw.map((a, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="truncate">
                    <span className="text-muted-foreground">{a.app}</span>{' '}
                    <span>{truncate(a.title, 80)}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatMinutes(a.minutes)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {project.sources.git.length > 0 && (
          <Section icon={<GitCommit className="size-3.5" />} title="Commity">
            {project.sources.git.map((g) => (
              <div key={g.repo} className="space-y-1">
                <div className="text-xs text-muted-foreground">{g.repo}</div>
                <ul className="space-y-1">
                  {g.commits.map((c) => (
                    <li key={c.shortHash} className="font-mono text-xs">
                      <span className="text-muted-foreground">{c.shortHash}</span>{' '}
                      {c.subject}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Section>
        )}

        {project.sources.tempo.length > 0 && (
          <Section icon={<ScrollText className="size-3.5" />} title="Worklogi Tempo">
            <ul className="space-y-1">
              {project.sources.tempo.map((t, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="truncate">
                    <Badge variant="outline" className="mr-2 font-mono text-xs">
                      {t.issueKey}
                    </Badge>
                    {t.description ? truncate(t.description, 80) : '—'}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatMinutes(t.minutes)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {project.sources.slack.length > 0 && (
          <Section icon={<MessageSquare className="size-3.5" />} title="Slack">
            <ul className="space-y-1">
              {project.sources.slack.map((s, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="truncate">{s.channel}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatMinutes(s.minutes)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {project.sources.plans.length > 0 && (
          <Section icon={<ScrollText className="size-3.5" />} title="Plany Claude">
            <ul className="space-y-1">
              {project.sources.plans.map((p, i) => (
                <li key={i} className="text-xs">
                  <span className="text-muted-foreground">
                    {new Date(p.mtime).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                  </span>{' '}
                  {truncate(p.title, 100)}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {project.sources.files.length > 0 && (
          <Section icon={<FileEdit className="size-3.5" />} title={`Zmienione pliki (${project.sources.files.length})`}>
            <ul className="space-y-0.5 text-xs font-mono text-muted-foreground">
              {project.sources.files.slice(0, 8).map((f, i) => (
                <li key={i} className="truncate">{shortenPath(f.path)}</li>
              ))}
              {project.sources.files.length > 8 && (
                <li className="italic">+ {project.sources.files.length - 8} więcej</li>
              )}
            </ul>
          </Section>
        )}
      </CardContent>
    </Card>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function shortenPath(p: string): string {
  return p.replace(/^\/Users\/[^/]+\//, '~/').replace(/^\/home\/[^/]+\//, '~/');
}

function isValidDate(s: string | undefined): boolean {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
