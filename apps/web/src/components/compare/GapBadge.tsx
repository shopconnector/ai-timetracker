'use client';

import { Badge } from '@/components/ui/badge';
import { GapStatus, formatMinutes } from '@/types/compare';
import { cn } from '@/lib/utils';
import { CheckCircle, AlertCircle, XCircle } from 'lucide-react';

interface GapBadgeProps {
  minutes: number;
  status: GapStatus;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}

export function GapBadge({ minutes, status, showIcon = true, size = 'md' }: GapBadgeProps) {
  const statusConfig = {
    ok: {
      variant: 'outline' as const,
      className: 'border-green-500 text-green-600 bg-green-50 dark:bg-green-950/30',
      icon: CheckCircle,
      label: 'OK',
    },
    warning: {
      variant: 'outline' as const,
      className: 'border-yellow-500 text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30',
      icon: AlertCircle,
      label: formatMinutes(minutes),
    },
    missing: {
      variant: 'outline' as const,
      className: 'border-red-500 text-red-600 bg-red-50 dark:bg-red-950/30',
      icon: XCircle,
      label: formatMinutes(minutes),
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge
      variant={config.variant}
      className={cn(
        config.className,
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm'
      )}
    >
      {showIcon && <Icon className={cn('mr-1', size === 'sm' ? 'h-3 w-3' : 'h-4 w-4')} />}
      {config.label}
    </Badge>
  );
}
