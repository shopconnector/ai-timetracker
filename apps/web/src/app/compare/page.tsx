'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CompareWeekTable } from '@/components/compare/CompareWeekTable';
import { CompareDayTable } from '@/components/compare/CompareDayTable';
import { CompareRangeResponse, DayComparison, formatMinutes } from '@/types/compare';
import { GapBadge } from '@/components/compare/GapBadge';
import { cn } from '@/lib/utils';
import {
  GitCompare,
  CalendarIcon,
  RefreshCw,
  Monitor,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { DayProgressBar } from '@/components/DayProgressBar';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { toast } from 'sonner';

const DEFAULT_FROM_DATE = '2026-01-12';

export default function ComparePage() {
  const [data, setData] = useState<CompareRangeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<DayComparison | null>(null);
  const [currentWeekIndex, setCurrentWeekIndex] = useState(0);
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(DEFAULT_FROM_DATE),
    to: new Date(),
  });
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // Week navigation
  const handlePrevWeek = () => setCurrentWeekIndex(i => Math.max(0, i - 1));
  const handleNextWeek = () =>
    setCurrentWeekIndex(i => Math.min((data?.weeks.length || 1) - 1, i + 1));

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const fromStr = format(dateRange.from, 'yyyy-MM-dd');
      const toStr = format(dateRange.to, 'yyyy-MM-dd');

      const response = await fetch(`/api/compare/range?from=${fromStr}&to=${toStr}`);

      if (!response.ok) {
        throw new Error('Failed to fetch comparison data');
      }

      const result: CompareRangeResponse = await response.json();
      setData(result);

      // Update selected day if we have one (to refresh after logging)
      if (selectedDay) {
        const updatedDay = result.days.find(d => d.date === selectedDay.date);
        if (updatedDay) {
          setSelectedDay(updatedDay);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      toast.error('Błąd podczas pobierania danych');
    } finally {
      setLoading(false);
    }
  }, [dateRange, selectedDay]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDayClick = (date: string) => {
    if (!data) return;
    const day = data.days.find(d => d.date === date);
    if (day) {
      setSelectedDay(day);
    }
  };

  const handleBack = () => {
    setSelectedDay(null);
  };

  return (
    <div className="container space-y-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GitCompare className="text-primary h-8 w-8" />
          <div>
            <h1 className="text-2xl font-bold">Porównanie AW vs Tempo</h1>
            <p className="text-muted-foreground text-sm">
              Weryfikacja zalogowanego czasu od{' '}
              {format(dateRange.from, 'd MMM yyyy', { locale: pl })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Date Range Picker */}
          <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <CalendarIcon className="h-4 w-4" />
                {format(dateRange.from, 'd MMM', { locale: pl })} -{' '}
                {format(dateRange.to, 'd MMM yyyy', { locale: pl })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={{ from: dateRange.from, to: dateRange.to }}
                onSelect={range => {
                  if (range?.from && range?.to) {
                    setDateRange({ from: range.from, to: range.to });
                    setIsCalendarOpen(false);
                  }
                }}
                numberOfMonths={2}
                locale={pl}
              />
            </PopoverContent>
          </Popover>

          <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/30">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      )}

      {/* Summary Cards */}
      {data && !loading && !selectedDay && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
                <Monitor className="h-4 w-4" />
                ActivityWatch
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-bold">{formatMinutes(data.summary.totalAwMinutes)}</div>
              <p className="text-muted-foreground text-xs">{data.days.length} dni śledzonych</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
                <Clock className="h-4 w-4" />
                Tempo
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-bold">
                {formatMinutes(data.summary.totalTempoMinutes)}
              </div>
              <p className="text-muted-foreground text-xs">zalogowanych</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
                <TrendingUp className="h-4 w-4" />
                Efektywność
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-bold">
                {data.summary.totalAwMinutes > 0
                  ? Math.round((data.summary.totalTempoMinutes / data.summary.totalAwMinutes) * 100)
                  : 0}
                %
              </div>
              <p className="text-muted-foreground text-xs">czasu zalogowane</p>
            </CardContent>
          </Card>

          <Card
            className={cn(
              data.summary.totalGapMinutes > 60 && 'border-red-200 bg-red-50/50 dark:bg-red-950/20'
            )}
          >
            <CardHeader className="py-3">
              <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
                {data.summary.totalGapMinutes > 60 ? (
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                ) : (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                )}
                Delta
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div
                className={cn(
                  'text-2xl font-bold',
                  data.summary.totalGapMinutes > 60 ? 'text-red-600' : 'text-green-600'
                )}
              >
                {formatMinutes(data.summary.totalGapMinutes)}
              </div>
              <p className="text-muted-foreground text-xs">
                {data.summary.daysWithGaps} dni z lukami
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Overall Progress Bar */}
      {data && !loading && !selectedDay && (
        <div className="mb-4">
          <DayProgressBar
            awMinutes={data.summary.totalAwMinutes}
            tempoMinutes={data.summary.totalTempoMinutes}
          />
        </div>
      )}

      {/* Day Detail View */}
      {selectedDay && (
        <CompareDayTable day={selectedDay} onBack={handleBack} onRefresh={fetchData} />
      )}

      {/* Week Table View */}
      {data && !loading && !selectedDay && data.weeks.length > 0 && (
        <CompareWeekTable
          week={data.weeks[currentWeekIndex]}
          onDayClick={handleDayClick}
          onPrevWeek={handlePrevWeek}
          onNextWeek={handleNextWeek}
          hasPrev={currentWeekIndex > 0}
          hasNext={currentWeekIndex < data.weeks.length - 1}
        />
      )}
    </div>
  );
}
