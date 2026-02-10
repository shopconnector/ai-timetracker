'use client';

import { type ReadinessCriteria, type ReadinessLevel } from '@/lib/readiness';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const LEVEL_COLORS: Record<ReadinessLevel, string> = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-400',
  red: 'bg-red-500',
  unknown: 'bg-gray-300',
};

const LEVEL_EMOJI: Record<ReadinessLevel, string> = {
  green: '\uD83D\uDFE2',
  yellow: '\uD83D\uDFE1',
  red: '\uD83D\uDD34',
  unknown: '\u2B1C',
};

const CRITERIA_NAMES = {
  completeness: 'Completeness',
  clarity: 'Clarity',
  auditability: 'Auditability',
  estimated: 'Estimated',
};

/**
 * Compact view: 4 small colored dots for table cells.
 */
export function ReadinessBadgesCompact({ rc }: { rc: ReadinessCriteria | null }) {
  if (!rc) {
    return <span className="text-gray-300">-</span>;
  }

  const criteria = ['completeness', 'clarity', 'auditability', 'estimated'] as const;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1">
            {criteria.map(c => (
              <div key={c} className={`h-2.5 w-2.5 rounded-full ${LEVEL_COLORS[rc[c]]}`} />
            ))}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div className="space-y-0.5">
            {criteria.map(c => (
              <div key={c} className="flex items-center gap-1.5">
                <span>{LEVEL_EMOJI[rc[c]]}</span>
                <span>{CRITERIA_NAMES[c]}</span>
              </div>
            ))}
            <div className="mt-1 border-t pt-1 text-[10px] text-gray-400">
              Score: {rc.overallScore}/4
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Full view: detailed card for expanded rows.
 */
export function ReadinessBadgesFull({ rc }: { rc: ReadinessCriteria | null }) {
  if (!rc) {
    return (
      <div className="rounded border border-dashed bg-white p-3 text-center text-sm text-gray-400 dark:bg-slate-800">
        Brak danych Readiness Criteria
      </div>
    );
  }

  const criteria = ['completeness', 'clarity', 'auditability', 'estimated'] as const;

  return (
    <div className="rounded border bg-white p-3 dark:bg-slate-800">
      <h4 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
        Readiness Criteria ({rc.overallScore}/4)
      </h4>
      <div className="space-y-1.5">
        {criteria.map(c => (
          <div key={c} className="flex items-center gap-2 text-sm">
            <span className="text-base">{LEVEL_EMOJI[rc[c]]}</span>
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {CRITERIA_NAMES[c]}
            </span>
          </div>
        ))}
      </div>
      {rc.suggestions.length > 0 && (
        <div className="mt-2 border-t pt-2">
          <p className="mb-1 text-xs font-medium text-gray-500">Sugestie:</p>
          <ul className="space-y-0.5 text-xs text-gray-600 dark:text-gray-400">
            {rc.suggestions.map((s, i) => (
              <li key={i} className="flex gap-1">
                <span className="text-gray-400">-</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
