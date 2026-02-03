'use client';

import { cn } from '@/lib/utils';
import { CheckCircle, AlertTriangle, Clock } from 'lucide-react';

interface DayProgressBarProps {
  awMinutes: number; // Total ActivityWatch minutes
  tempoMinutes: number; // Total Tempo logged minutes
  className?: string;
  showLabels?: boolean;
}

function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function DayProgressBar({
  awMinutes,
  tempoMinutes,
  className,
  showLabels = true,
}: DayProgressBarProps) {
  const percentage = awMinutes > 0 ? Math.round((tempoMinutes / awMinutes) * 100) : 0;
  const clampedPercentage = Math.min(percentage, 100);
  const gapMinutes = Math.max(0, awMinutes - tempoMinutes);

  // Status based on percentage
  const isGood = percentage >= 90;
  const isWarning = percentage >= 50 && percentage < 90;
  const isBad = percentage < 50;

  const progressColor = isGood ? 'bg-green-500' : isWarning ? 'bg-yellow-500' : 'bg-red-400';

  const StatusIcon = isGood ? CheckCircle : isBad ? AlertTriangle : Clock;
  const statusColor = isGood ? 'text-green-600' : isBad ? 'text-red-500' : 'text-yellow-600';

  return (
    <div className={cn('space-y-1', className)}>
      {/* Progress bar */}
      <div className="relative h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className={cn('absolute inset-y-0 left-0 transition-all duration-500', progressColor)}
          style={{ width: `${clampedPercentage}%` }}
        />
        {/* Threshold markers */}
        <div className="absolute inset-y-0 left-[50%] w-px bg-gray-400/50" />
        <div className="absolute inset-y-0 left-[90%] w-px bg-gray-400/50" />
      </div>

      {/* Labels */}
      {showLabels && (
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1">
            <StatusIcon className={cn('h-3.5 w-3.5', statusColor)} />
            <span className={cn('font-bold', statusColor)}>{percentage}%</span>
            <span className="text-muted-foreground">
              ({formatTime(tempoMinutes)} / {formatTime(awMinutes)})
            </span>
          </div>
          {gapMinutes > 0 && (
            <span className="font-medium text-red-500">-{formatTime(gapMinutes)} brakuje</span>
          )}
        </div>
      )}
    </div>
  );
}

export default DayProgressBar;
