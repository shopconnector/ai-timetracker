'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WeekSummary, formatMinutes, getGapStatus } from '@/types/compare';
import { GapBadge } from './GapBadge';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Monitor, Clock, TrendingDown } from 'lucide-react';

interface CompareWeekTableProps {
  week: WeekSummary;
  onDayClick: (date: string) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export function CompareWeekTable({
  week,
  onDayClick,
  onPrevWeek,
  onNextWeek,
  hasPrev,
  hasNext,
}: CompareWeekTableProps) {
  // Ensure we have 7 days (fill missing with empty)
  const days = week.days;
  const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));

  // Format date range
  const startDate = new Date(week.startDate);
  const endDate = new Date(week.endDate);
  const dateRange = `${startDate.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })} - ${endDate.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <Card>
      <CardHeader className="py-4">
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={onPrevWeek} disabled={!hasPrev}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            Poprzedni
          </Button>

          <CardTitle className="text-lg font-semibold">
            Tydzień {week.weekNumber} ({dateRange})
          </CardTitle>

          <Button variant="outline" size="sm" onClick={onNextWeek} disabled={!hasNext}>
            Następny
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]"></TableHead>
              {sortedDays.map(day => {
                const date = new Date(day.date);
                const dayNum = date.getDate();
                return (
                  <TableHead
                    key={day.date}
                    className={cn(
                      'hover:bg-muted/50 min-w-[80px] cursor-pointer text-center transition-colors',
                      day.isWeekend && 'bg-muted/30'
                    )}
                    onClick={() => onDayClick(day.date)}
                  >
                    <div className="flex flex-col items-center">
                      <span className="font-medium">{day.dayName}</span>
                      <span className="text-muted-foreground text-xs">{dayNum}</span>
                    </div>
                  </TableHead>
                );
              })}
              <TableHead className="bg-muted/20 min-w-[90px] text-center font-bold">SUMA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* AW Row */}
            <TableRow>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-blue-500" />
                  AW
                </div>
              </TableCell>
              {sortedDays.map(day => (
                <TableCell
                  key={`aw-${day.date}`}
                  className={cn(
                    'hover:bg-muted/50 cursor-pointer text-center transition-colors',
                    day.isWeekend && 'bg-muted/30'
                  )}
                  onClick={() => onDayClick(day.date)}
                >
                  <span
                    className={cn(
                      'font-mono text-sm',
                      day.aw.totalMinutes === 0 && 'text-muted-foreground'
                    )}
                  >
                    {day.aw.totalMinutes > 0 ? formatMinutes(day.aw.totalMinutes) : '-'}
                  </span>
                </TableCell>
              ))}
              <TableCell className="bg-muted/20 text-center font-bold">
                <span className="font-mono">{formatMinutes(week.awTotalMinutes)}</span>
              </TableCell>
            </TableRow>

            {/* Tempo Row */}
            <TableRow>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-green-500" />
                  Tempo
                </div>
              </TableCell>
              {sortedDays.map(day => (
                <TableCell
                  key={`tempo-${day.date}`}
                  className={cn(
                    'hover:bg-muted/50 cursor-pointer text-center transition-colors',
                    day.isWeekend && 'bg-muted/30'
                  )}
                  onClick={() => onDayClick(day.date)}
                >
                  <span
                    className={cn(
                      'font-mono text-sm',
                      day.tempo.totalMinutes === 0 && 'text-muted-foreground'
                    )}
                  >
                    {day.tempo.totalMinutes > 0 ? formatMinutes(day.tempo.totalMinutes) : '-'}
                  </span>
                </TableCell>
              ))}
              <TableCell className="bg-muted/20 text-center font-bold">
                <span className="font-mono">{formatMinutes(week.tempoTotalMinutes)}</span>
              </TableCell>
            </TableRow>

            {/* Delta Row */}
            <TableRow>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-orange-500" />
                  Delta
                </div>
              </TableCell>
              {sortedDays.map(day => {
                const gap = day.gap.minutes;
                const status = day.gap.status;
                const hasData = day.aw.totalMinutes > 0 || day.tempo.totalMinutes > 0;

                return (
                  <TableCell
                    key={`delta-${day.date}`}
                    className={cn(
                      'hover:bg-muted/50 cursor-pointer text-center transition-colors',
                      day.isWeekend && 'bg-muted/30'
                    )}
                    onClick={() => onDayClick(day.date)}
                  >
                    {hasData ? (
                      <GapBadge minutes={gap} status={status} size="sm" showIcon={false} />
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                );
              })}
              <TableCell className="bg-muted/20 text-center font-bold">
                <GapBadge
                  minutes={week.gapMinutes}
                  status={getGapStatus(week.gapMinutes)}
                  size="sm"
                  showIcon={false}
                />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
