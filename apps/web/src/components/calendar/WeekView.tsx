'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { DayColumn } from './DayColumn';
import { TimeBlockData } from './TimeBlock';
import { cn } from '@/lib/utils';

interface DayData {
  date: string;
  dayName: string;
  isWeekend: boolean;
  activities: TimeBlockData[];
  worklogs: TimeBlockData[];
  calendarEvents: TimeBlockData[];
  awTotalMinutes: number;
  tempoTotalMinutes: number;
  targetMinutes: number;
}

interface WeekData {
  startDate: string;
  endDate: string;
  days: DayData[];
}

interface WeekViewProps {
  weekData: WeekData | null;
  isLoading: boolean;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onBlockClick: (block: TimeBlockData) => void;
  onAddClick: (date: string) => void;
  onLogAll: () => void;
}

const START_HOUR = 0;
const END_HOUR = 24;
const PIXELS_PER_MINUTE = 1; // 1px per minute = 60px per hour

function formatWeekRange(startDate: string, endDate: string): string {
  const start = new Date(startDate);
  const end = new Date(endDate);

  const startDay = start.getDate();
  const endDay = end.getDate();
  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
  const year = start.getFullYear();

  if (startMonth === endMonth) {
    return `${startDay} - ${endDay} ${startMonth}, ${year}`;
  }
  return `${startDay} ${startMonth} - ${endDay} ${endMonth}, ${year}`;
}

function isToday(dateStr: string): boolean {
  const today = new Date().toISOString().split('T')[0];
  return dateStr === today;
}

export function WeekView({
  weekData,
  isLoading,
  onPrevWeek,
  onNextWeek,
  onToday,
  onBlockClick,
  onAddClick,
  onLogAll
}: WeekViewProps) {
  const [showOther, setShowOther] = useState(true);

  const totalHours = END_HOUR - START_HOUR;
  const gridHeight = totalHours * 60 * PIXELS_PER_MINUTE;

  // Filter activities based on showOther toggle
  const filterActivities = (activities: TimeBlockData[]) => {
    if (showOther) return activities;
    return activities.filter(a => a.category !== 'other');
  };

  // Calculate week totals
  const weekTotals = weekData?.days.reduce(
    (acc, day) => ({
      awMinutes: acc.awMinutes + day.awTotalMinutes,
      tempoMinutes: acc.tempoMinutes + day.tempoTotalMinutes,
      targetMinutes: acc.targetMinutes + day.targetMinutes
    }),
    { awMinutes: 0, tempoMinutes: 0, targetMinutes: 0 }
  ) || { awMinutes: 0, tempoMinutes: 0, targetMinutes: 0 };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={onPrevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={onNextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={onToday}>
            Today
          </Button>

          {weekData && (
            <h2 className="text-lg font-semibold ml-4">
              {formatWeekRange(weekData.startDate, weekData.endDate)}
            </h2>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Week summary */}
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Week: {Math.floor(weekTotals.tempoMinutes / 60)}h / {Math.floor(weekTotals.targetMinutes / 60)}h logged
          </div>

          {/* Toggle "other" */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showOther}
              onChange={(e) => setShowOther(e.target.checked)}
              className="rounded"
            />
            Show "Other"
          </label>

          <Button onClick={onLogAll} className="bg-green-600 hover:bg-green-700">
            Log All Activities
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-blue-100 border-l-2 border-blue-500" />
          <span>ActivityWatch (to log)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-green-100 border-l-2 border-green-500" />
          <span>Tempo (logged)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-red-100 border-l-2 border-red-500" />
          <span>Calendar</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-gray-100 border-l-2 border-gray-300" />
          <span>Other (not loggable)</span>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <span className="ml-2 text-gray-600">Loading week data...</span>
        </div>
      )}

      {/* Calendar grid */}
      {!isLoading && weekData && (
        <div className="flex flex-1 overflow-auto">
          {/* Hour labels */}
          <div
            className="sticky left-0 z-10 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-gray-700"
            style={{ minWidth: '60px' }}
          >
            {/* Spacer for header */}
            <div className="h-[88px] border-b border-gray-200 dark:border-gray-700" />

            {/* Hour labels */}
            <div className="relative" style={{ height: `${gridHeight}px` }}>
              {Array.from({ length: totalHours }, (_, i) => (
                <div
                  key={i}
                  className="absolute right-2 text-xs text-gray-500 dark:text-gray-400"
                  style={{
                    top: `${i * 60 * PIXELS_PER_MINUTE - 8}px`
                  }}
                >
                  {(START_HOUR + i).toString().padStart(2, '0')}:00
                </div>
              ))}
            </div>
          </div>

          {/* Day columns */}
          {weekData.days.map(day => (
            <DayColumn
              key={day.date}
              date={day.date}
              dayName={day.dayName}
              isWeekend={day.isWeekend}
              isToday={isToday(day.date)}
              activities={filterActivities(day.activities)}
              worklogs={day.worklogs}
              calendarEvents={day.calendarEvents}
              tempoTotalMinutes={day.tempoTotalMinutes}
              targetMinutes={day.targetMinutes}
              startHour={START_HOUR}
              endHour={END_HOUR}
              pixelsPerMinute={PIXELS_PER_MINUTE}
              onBlockClick={onBlockClick}
              onAddClick={onAddClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
