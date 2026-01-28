'use client';

import { cn } from '@/lib/utils';
import { TimeBlock, TimeBlockData } from './TimeBlock';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

interface DayColumnProps {
  date: string;
  dayName: string;
  isWeekend: boolean;
  isToday: boolean;
  activities: TimeBlockData[];
  worklogs: TimeBlockData[];
  calendarEvents: TimeBlockData[];
  tempoTotalMinutes: number;
  targetMinutes: number;
  startHour: number;
  endHour: number;
  pixelsPerMinute: number;
  onBlockClick: (block: TimeBlockData) => void;
  onAddClick: (date: string) => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.getDate().toString();
}

function formatProgress(logged: number, target: number): string {
  const hours = Math.floor(logged / 60);
  const minutes = logged % 60;
  const loggedStr = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;

  if (target === 0) return loggedStr || '-';
  return `${loggedStr} of ${target / 60}h`;
}

export function DayColumn({
  date,
  dayName,
  isWeekend,
  isToday,
  activities,
  worklogs,
  calendarEvents,
  tempoTotalMinutes,
  targetMinutes,
  startHour,
  endHour,
  pixelsPerMinute,
  onBlockClick,
  onAddClick
}: DayColumnProps) {
  const totalHours = endHour - startHour;
  const gridHeight = totalHours * 60 * pixelsPerMinute;

  const progressPercent = targetMinutes > 0
    ? Math.min((tempoTotalMinutes / targetMinutes) * 100, 100)
    : 0;

  const progressColor = progressPercent >= 100
    ? 'text-green-600 dark:text-green-400'
    : progressPercent >= 75
    ? 'text-yellow-600 dark:text-yellow-400'
    : 'text-gray-600 dark:text-gray-400';

  return (
    <div
      className={cn(
        'flex flex-col border-r border-gray-200 dark:border-gray-700',
        isWeekend && 'bg-gray-50 dark:bg-gray-900/50',
        isToday && 'bg-blue-50/50 dark:bg-blue-900/20'
      )}
      style={{ minWidth: '120px' }}
    >
      {/* Header */}
      <div
        className={cn(
          'sticky top-0 z-20 border-b border-gray-200 dark:border-gray-700 px-2 py-2',
          'bg-white dark:bg-slate-900',
          isToday && 'bg-blue-50 dark:bg-blue-900/30'
        )}
      >
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {dayName}
            </span>
            <span
              className={cn(
                'ml-1 text-lg font-bold',
                isToday
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-900 dark:text-gray-100'
              )}
            >
              {formatDate(date)}
            </span>
          </div>
        </div>
        <div className={cn('text-xs mt-1', progressColor)}>
          {formatProgress(tempoTotalMinutes, targetMinutes)}
        </div>

        {/* Add button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-2 h-7"
          onClick={() => onAddClick(date)}
        >
          <Plus className="h-3 w-3 mr-1" />
          Add
        </Button>
      </div>

      {/* Time grid */}
      <div
        className="relative flex-1"
        style={{ height: `${gridHeight}px` }}
      >
        {/* Hour lines */}
        {Array.from({ length: totalHours + 1 }, (_, i) => (
          <div
            key={i}
            className="absolute left-0 right-0 border-t border-gray-100 dark:border-gray-800"
            style={{ top: `${i * 60 * pixelsPerMinute}px` }}
          />
        ))}

        {/* Activities (blue - from AW) */}
        {activities.map(block => (
          <TimeBlock
            key={block.id}
            block={block}
            pixelsPerMinute={pixelsPerMinute}
            startHour={startHour}
            onClick={onBlockClick}
          />
        ))}

        {/* Worklogs (green - from Tempo) */}
        {worklogs.map(block => (
          <TimeBlock
            key={block.id}
            block={block}
            pixelsPerMinute={pixelsPerMinute}
            startHour={startHour}
            onClick={onBlockClick}
          />
        ))}

        {/* Calendar events (red - from GCal) */}
        {calendarEvents.map(block => (
          <TimeBlock
            key={block.id}
            block={block}
            pixelsPerMinute={pixelsPerMinute}
            startHour={startHour}
            onClick={onBlockClick}
          />
        ))}
      </div>
    </div>
  );
}
