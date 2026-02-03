'use client';

import { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DayComparison, formatMinutes, ActivitySummary } from '@/types/compare';
import { GapBadge } from './GapBadge';
import { LogActivityDialog } from './LogActivityDialog';
import { Ticket } from '@/components/ActivityCard';
import { cn } from '@/lib/utils';
import {
  Monitor,
  Clock,
  Video,
  MessageSquare,
  Code,
  Terminal,
  X,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';

interface CompareDayTableProps {
  day: DayComparison;
  onBack: () => void;
  onRefresh?: () => void;
  onLogActivity?: (activity: { app: string; title: string; minutes: number }) => void;
}

const categoryIcons: Record<string, React.ReactNode> = {
  coding: <Code className="h-4 w-4 text-blue-500" />,
  terminal: <Terminal className="h-4 w-4 text-green-500" />,
  meeting: <Video className="h-4 w-4 text-red-500" />,
  communication: <MessageSquare className="h-4 w-4 text-purple-500" />,
  browser: <Monitor className="h-4 w-4 text-orange-500" />,
};

export function CompareDayTable({ day, onBack, onRefresh, onLogActivity }: CompareDayTableProps) {
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<ActivitySummary | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);

  // Fetch tickets on mount
  useEffect(() => {
    const fetchTickets = async () => {
      try {
        const res = await fetch('/timetracker/api/jira/my-issues');
        if (res.ok) {
          const data = await res.json();
          setTickets(data.issues || []);
        }
      } catch (error) {
        console.error('Error fetching tickets:', error);
      }
    };
    fetchTickets();
  }, []);

  const formattedDate = new Date(day.date).toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Find unlogged activities (in AW but not matching any Tempo worklog)
  const tempoTotalByKey = new Map<string, number>();
  day.tempo.worklogs.forEach(wl => {
    tempoTotalByKey.set(wl.key, (tempoTotalByKey.get(wl.key) || 0) + wl.minutes);
  });

  const handleLogClick = (activity: ActivitySummary) => {
    setSelectedActivity(activity);
    setLogDialogOpen(true);
  };

  const handleLogSuccess = () => {
    onRefresh?.();
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Wróć
            </Button>
            <CardTitle className="text-lg">{formattedDate}</CardTitle>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Monitor className="text-muted-foreground h-4 w-4" />
              <span>
                AW: <strong>{formatMinutes(day.aw.totalMinutes)}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="text-muted-foreground h-4 w-4" />
              <span>
                Tempo: <strong>{formatMinutes(day.tempo.totalMinutes)}</strong>
              </span>
            </div>
            <GapBadge minutes={day.gap.minutes} status={day.gap.status} />
            {onRefresh && (
              <Button variant="outline" size="sm" onClick={onRefresh}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-4">
          {/* ActivityWatch Column */}
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Monitor className="h-4 w-4" />
              ActivityWatch ({day.aw.activities.length} aktywności)
            </h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aplikacja</TableHead>
                  <TableHead>Czas</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {day.aw.activities.map((activity, i) => {
                  const isLogged = day.tempo.worklogs.some(
                    wl =>
                      wl.description?.includes(activity.app) ||
                      wl.description?.includes(activity.title)
                  );

                  return (
                    <TableRow
                      key={`${activity.app}-${i}`}
                      className={cn(isLogged && 'bg-green-50/50 dark:bg-green-950/20')}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {categoryIcons[activity.category] || <Monitor className="h-4 w-4" />}
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{activity.app}</span>
                            <span className="text-muted-foreground max-w-[200px] truncate text-xs">
                              {activity.title}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {formatMinutes(activity.minutes)}
                      </TableCell>
                      <TableCell>
                        {!isLogged && activity.minutes >= 5 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 border-blue-200 bg-blue-50 text-xs hover:bg-blue-100"
                            onClick={() => handleLogClick(activity)}
                          >
                            Log
                          </Button>
                        )}
                        {isLogged && (
                          <Badge
                            variant="outline"
                            className="border-green-500 text-xs text-green-600"
                          >
                            OK
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {day.aw.activities.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground py-8 text-center">
                      Brak aktywności w tym dniu
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Tempo Column */}
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Clock className="h-4 w-4" />
              Tempo ({day.tempo.worklogs.length} worklogów)
            </h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Opis</TableHead>
                  <TableHead className="text-right">Czas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {day.tempo.worklogs.map((worklog, i) => (
                  <TableRow key={`${worklog.key}-${i}`}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">
                        {worklog.key}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate text-sm">
                      {worklog.description || '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatMinutes(worklog.minutes)}
                    </TableCell>
                  </TableRow>
                ))}
                {day.tempo.worklogs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground py-8 text-center">
                      Brak worklogów w tym dniu
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Meetings section */}
        {day.aw.meetings.length > 0 && (
          <div className="mt-4 border-t pt-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Video className="h-4 w-4 text-red-500" />
              Spotkania ({day.aw.meetings.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {day.aw.meetings.map((meeting, i) => (
                <Badge key={i} variant="secondary" className="flex items-center gap-1">
                  <Video className="h-3 w-3" />
                  {meeting.title} ({formatMinutes(meeting.minutes)})
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Gap summary */}
        {day.gap.status !== 'ok' && (
          <div className="mt-4 border-t pt-4">
            <div className="flex items-center justify-between rounded-lg bg-red-50 p-3 dark:bg-red-950/30">
              <div className="flex items-center gap-2">
                <X className="h-5 w-5 text-red-500" />
                <span className="font-medium text-red-700 dark:text-red-400">
                  Brakuje {formatMinutes(day.gap.minutes)} do zalogowania
                </span>
              </div>
              <span className="text-sm text-red-600">
                ({Math.round((day.tempo.totalMinutes / day.aw.totalMinutes) * 100) || 0}%
                zalogowane)
              </span>
            </div>
          </div>
        )}

        {/* Log Activity Dialog */}
        <LogActivityDialog
          open={logDialogOpen}
          onOpenChange={setLogDialogOpen}
          activity={selectedActivity}
          date={day.date}
          tickets={tickets}
          onSuccess={handleLogSuccess}
        />
      </CardContent>
    </Card>
  );
}
