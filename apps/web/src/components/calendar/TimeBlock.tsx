'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface TimeBlockData {
  id: string;
  source: 'activitywatch' | 'tempo' | 'calendar';
  startTime: string;
  endTime: string;
  durationMinutes: number;
  title: string;
  app?: string;
  category: string;
  issueKey?: string;
  tempoWorklogId?: number;
  isLogged: boolean;
  canLogToTempo: boolean;
  project?: string;
}

interface TimeBlockProps {
  block: TimeBlockData;
  pixelsPerMinute: number;
  startHour: number;
  onClick?: (block: TimeBlockData) => void;
}

function getSourceColors(source: string, category: string) {
  if (category === 'other') {
    return {
      bg: 'bg-gray-100 dark:bg-gray-800',
      border: 'border-gray-300 dark:border-gray-600',
      text: 'text-gray-600 dark:text-gray-400'
    };
  }

  switch (source) {
    case 'tempo':
      return {
        bg: 'bg-green-100 dark:bg-green-900/30',
        border: 'border-green-500 dark:border-green-600',
        text: 'text-green-700 dark:text-green-300'
      };
    case 'calendar':
      return {
        bg: 'bg-red-100 dark:bg-red-900/30',
        border: 'border-red-500 dark:border-red-600',
        text: 'text-red-700 dark:text-red-300'
      };
    case 'activitywatch':
    default:
      return {
        bg: 'bg-blue-100 dark:bg-blue-900/30',
        border: 'border-blue-500 dark:border-blue-600',
        text: 'text-blue-700 dark:text-blue-300'
      };
  }
}

function getSourceIcon(source: string, category: string) {
  if (category === 'other') return '⬜';

  switch (source) {
    case 'tempo':
      return '✓';
    case 'calendar':
      return '📅';
    case 'activitywatch':
    default:
      return getCategoryIcon(category);
  }
}

function getCategoryIcon(category: string) {
  switch (category) {
    case 'coding':
      return '💻';
    case 'terminal':
      return '⬛';
    case 'meeting':
      return '📹';
    case 'communication':
      return '💬';
    case 'browser':
      return '🌐';
    case 'design':
      return '🎨';
    case 'docs':
      return '📝';
    default:
      return '📄';
  }
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function TimeBlock({ block, pixelsPerMinute, startHour, onClick }: TimeBlockProps) {
  const colors = getSourceColors(block.source, block.category);
  const icon = getSourceIcon(block.source, block.category);

  const blockStartMinutes = timeToMinutes(block.startTime);
  const dayStartMinutes = startHour * 60;
  const topOffset = (blockStartMinutes - dayStartMinutes) * pixelsPerMinute;
  const height = Math.max(block.durationMinutes * pixelsPerMinute, 20); // Min 20px

  // Don't render if block is before start hour
  if (blockStartMinutes < dayStartMinutes) {
    return null;
  }

  return (
    <div
      className={cn(
        'absolute left-1 right-1 rounded-md border-l-4 px-2 py-1 cursor-pointer',
        'overflow-hidden transition-all hover:shadow-md hover:z-10',
        colors.bg,
        colors.border
      )}
      style={{
        top: `${topOffset}px`,
        height: `${height}px`,
        minHeight: '20px'
      }}
      onClick={() => onClick?.(block)}
      title={`${block.title}\n${block.startTime} - ${block.endTime} (${formatDuration(block.durationMinutes)})`}
    >
      <div className="flex items-start gap-1 h-full">
        <span className="text-xs shrink-0">{icon}</span>
        <div className="flex-1 min-w-0 overflow-hidden">
          <p className={cn('text-xs font-medium truncate', colors.text)}>
            {block.issueKey ? `[${block.issueKey}]` : ''} {block.title}
          </p>
          {height > 30 && (
            <p className="text-[10px] text-gray-500 dark:text-gray-400">
              {formatDuration(block.durationMinutes)}
            </p>
          )}
          {height > 45 && block.app && (
            <Badge variant="outline" className="text-[9px] mt-0.5 px-1 py-0">
              {block.app}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
