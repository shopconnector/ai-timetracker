'use client';

import { useState, useCallback, useEffect, Fragment } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { TicketCombobox } from './TicketCombobox';
import { Checkbox } from '@/components/ui/checkbox';
import { EditableTimeInput, formatSecondsToTime } from './EditableTimeInput';
import { Activity, Ticket } from './ActivityCard';
import {
  Plus,
  Trash2,
  Loader2,
  CheckCircle,
  Send,
  Clock,
  Layers,
  ChevronDown,
  ChevronRight,
  Unlink,
  RefreshCw,
  Filter,
  Lightbulb,
  Video,
  Pencil,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { findBestWorklogMatch, MeetingMatchContext, MatchResult } from '@/lib/worklogMatcher';
import { getSuggestedTicketForMeeting, recordMeetingTicket } from '@/lib/meetingHistory';

export interface TimesheetRow {
  id: string;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  duration: number; // seconds
  activityTitle: string; // from ActivityWatch
  activityApp: string; // app name
  description: string; // editable - for Tempo
  selectedTicket: string | null;
  isLogged: boolean;
  isManual: boolean; // manually added row
  // Agregacja - zachowaj szczegóły
  isAggregated?: boolean; // czy to zagregowany wiersz
  aggregatedFrom?: {
    // źródłowe aktywności
    originalId: string; // oryginalny ID z ActivityWatch
    startTime: string;
    endTime: string;
    title: string;
    app: string;
    duration: number;
  }[];
}

// Worklog z Tempo
export interface TempoWorklog {
  tempoWorklogId: number;
  issue: { key: string; id?: number };
  timeSpentSeconds: number;
  startDate: string;
  startTime: string;
  description?: string;
}

interface TimesheetTableProps {
  activities: Activity[];
  tickets: Ticket[];
  loggedIds: Set<string>;
  dateStr: string;
  tempoWorklogs?: TempoWorklog[]; // Worklogi z Tempo dla danego dnia
  onLog: (row: TimesheetRow) => Promise<void>;
  onLogAll: (rows: TimesheetRow[]) => Promise<void>;
  onRefresh?: () => Promise<void>; // Callback do odświeżenia danych
  isRefreshing?: boolean; // Czy trwa odświeżanie
  onTicketChange?: (activityId: string, ticketKey: string) => void; // Callback przy zmianie ticketa
  onEditWorklog?: (worklog: TempoWorklog, newTimeSeconds: number) => Promise<void>; // Edit worklog time
  onDeleteWorklog?: (worklogId: number) => Promise<void>; // Delete worklog
}

// Convert Activity to TimesheetRow
function activityToRow(activity: Activity): TimesheetRow {
  const startTime = activity.firstSeen
    ? new Date(activity.firstSeen).toLocaleTimeString('pl-PL', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '00:00';

  const endTime = activity.lastSeen
    ? new Date(activity.lastSeen).toLocaleTimeString('pl-PL', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : startTime;

  // Build description from activity details
  let description = activity.title || activity.app;
  if (activity.project) {
    description = `${activity.project} - ${description}`;
  }

  return {
    id: activity.id,
    startTime,
    endTime,
    duration: activity.totalSeconds,
    activityTitle: activity.title || 'Brak tytułu',
    activityApp: activity.app,
    description,
    selectedTicket: activity.suggestedTicket || null,
    isLogged: false,
    isManual: false,
  };
}

// Create empty manual row
function createEmptyRow(): TimesheetRow {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

  return {
    id: `manual-${Date.now()}`,
    startTime: timeStr,
    endTime: timeStr,
    duration: 3600, // Default 1h
    activityTitle: '',
    activityApp: 'Ręczny wpis',
    description: '',
    selectedTicket: null,
    isLogged: false,
    isManual: true,
  };
}

// Calculate end time from start time and duration
function calculateEndTime(startTime: string, durationSeconds: number): string {
  const [hours, minutes] = startTime.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return startTime;
  const totalMinutes = hours * 60 + minutes + Math.round(durationSeconds / 60);
  const endHours = Math.floor(totalMinutes / 60) % 24;
  const endMinutes = totalMinutes % 60;
  return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
}

// Parse time string "HH:MM" to minutes from midnight
function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Find Tempo worklogs that overlap with a time range
function findOverlappingWorklogs(
  worklogs: TempoWorklog[],
  startTime: string,
  endTime: string
): TempoWorklog[] {
  const rowStart = parseTimeToMinutes(startTime);
  const rowEnd = parseTimeToMinutes(endTime);

  return worklogs.filter(w => {
    // Parse worklog startTime (format: "HH:MM:SS" or "HH:MM")
    const wStartParts = w.startTime.split(':').map(Number);
    const wStart = (wStartParts[0] || 0) * 60 + (wStartParts[1] || 0);
    const wDurationMinutes = Math.ceil(w.timeSpentSeconds / 60);
    const wEnd = wStart + wDurationMinutes;

    // Check overlap: not (wEnd <= rowStart || wStart >= rowEnd)
    return !(wEnd <= rowStart || wStart >= rowEnd);
  });
}

// Status aktywności względem Tempo
type ActivityStatus = 'logged' | 'new' | 'partial' | 'conflict';

interface StatusInfo {
  status: ActivityStatus;
  label: string;
  overlappingWorklogs: TempoWorklog[];
  overlapPercent: number; // 0-100
}

// Meeting detection - keywords that indicate a meeting
const MEETING_APPS = ['google meet', 'zoom', 'microsoft teams', 'slack huddle', 'discord', 'webex'];
const MEETING_KEYWORDS = [
  'spotkanie',
  'meeting',
  'call',
  'sync',
  'standup',
  'daily',
  'retro',
  'planning',
  'review',
  'demo',
];

function isMeetingActivity(app: string, title: string): boolean {
  const appLower = app.toLowerCase();
  const titleLower = title.toLowerCase();

  // Check if app is a meeting platform
  if (MEETING_APPS.some(m => appLower.includes(m))) return true;

  // Check if title contains meeting keywords
  if (MEETING_KEYWORDS.some(k => titleLower.includes(k))) return true;

  return false;
}

// Enhanced meeting info with worklog matching
interface MeetingMatchInfo {
  isMeeting: boolean;
  platform?: string;
  matchResult: MatchResult | null;
  historicalTicket?: { ticketKey: string; confidence: number };
}

// Get meeting match info for a row
function getMeetingMatchInfo(row: TimesheetRow, worklogs: TempoWorklog[]): MeetingMatchInfo {
  const isMeeting = isMeetingActivity(row.activityApp, row.activityTitle);

  if (!isMeeting) {
    return { isMeeting: false, matchResult: null };
  }

  // Detect platform
  const appLower = row.activityApp.toLowerCase();
  let platform: string | undefined;
  if (appLower.includes('meet')) platform = 'Google Meet';
  else if (appLower.includes('zoom')) platform = 'Zoom';
  else if (appLower.includes('teams')) platform = 'Teams';
  else if (appLower.includes('slack')) platform = 'Slack';

  // Create meeting context
  const meetingContext: MeetingMatchContext = {
    meetingTitle: row.activityTitle,
    meetingPlatform: platform,
    startTime: row.startTime,
    endTime: row.endTime,
    duration: row.duration,
  };

  // Check history for suggested ticket
  const historicalSuggestion = getSuggestedTicketForMeeting(row.activityTitle, platform);

  // Find best matching worklog
  const matchResult = findBestWorklogMatch(
    meetingContext,
    worklogs,
    historicalSuggestion?.ticketKey
  );

  return {
    isMeeting: true,
    platform,
    matchResult,
    historicalTicket: historicalSuggestion
      ? { ticketKey: historicalSuggestion.ticketKey, confidence: historicalSuggestion.confidence }
      : undefined,
  };
}

// Określ status aktywności względem Tempo
function getActivityStatus(
  startTime: string,
  endTime: string,
  duration: number,
  worklogs: TempoWorklog[],
  _isManuallyLogged: boolean // Ignorujemy - bazujemy tylko na rzeczywistych danych z Tempo
): StatusInfo {
  // Zawsze sprawdzaj rzeczywiste dane z Tempo
  const overlapping = findOverlappingWorklogs(worklogs, startTime, endTime);

  if (overlapping.length === 0) {
    return {
      status: 'new',
      label: 'Do zalogowania',
      overlappingWorklogs: [],
      overlapPercent: 0,
    };
  }

  // Oblicz procent pokrycia
  const rowStart = parseTimeToMinutes(startTime);
  const rowEnd = parseTimeToMinutes(endTime);
  const rowDuration = rowEnd - rowStart;

  if (rowDuration <= 0) {
    return {
      status: 'new',
      label: 'Do zalogowania',
      overlappingWorklogs: overlapping,
      overlapPercent: 0,
    };
  }

  // Oblicz sumaryczny overlap
  let totalOverlapMinutes = 0;
  overlapping.forEach(w => {
    const wStartParts = w.startTime.split(':').map(Number);
    const wStart = (wStartParts[0] || 0) * 60 + (wStartParts[1] || 0);
    const wDurationMinutes = Math.ceil(w.timeSpentSeconds / 60);
    const wEnd = wStart + wDurationMinutes;

    const overlapStart = Math.max(rowStart, wStart);
    const overlapEnd = Math.min(rowEnd, wEnd);
    const overlapMinutes = Math.max(0, overlapEnd - overlapStart);
    totalOverlapMinutes += overlapMinutes;
  });

  const overlapPercent = Math.round((totalOverlapMinutes / rowDuration) * 100);

  // Wiele nakładających się worklogów = konflikt
  if (overlapping.length > 1 && totalOverlapMinutes > rowDuration) {
    return {
      status: 'conflict',
      label: 'Konflikt',
      overlappingWorklogs: overlapping,
      overlapPercent: Math.min(overlapPercent, 100),
    };
  }

  // >= 80% pokrycia = zalogowane
  if (overlapPercent >= 80) {
    return {
      status: 'logged',
      label: 'Zalogowane',
      overlappingWorklogs: overlapping,
      overlapPercent,
    };
  }

  // Częściowe pokrycie
  return {
    status: 'partial',
    label: `Częściowo (${overlapPercent}%)`,
    overlappingWorklogs: overlapping,
    overlapPercent,
  };
}

export function TimesheetTable({
  activities,
  tickets,
  loggedIds,
  dateStr,
  tempoWorklogs = [],
  onLog,
  onLogAll,
  onRefresh,
  isRefreshing = false,
  onTicketChange,
  onEditWorklog,
  onDeleteWorklog,
}: TimesheetTableProps) {
  // Convert activities to rows, maintaining local state for edits
  const [rows, setRows] = useState<TimesheetRow[]>(() =>
    activities
      .sort((a, b) => {
        // Sort by firstSeen time
        const aTime = a.firstSeen ? new Date(a.firstSeen).getTime() : 0;
        const bTime = b.firstSeen ? new Date(b.firstSeen).getTime() : 0;
        return aTime - bTime;
      })
      .map(activityToRow)
  );

  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [loggingIds, setLoggingIds] = useState<Set<string>>(new Set());
  const [logAllLoading, setLogAllLoading] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  // Śledzenie które activityIds zostały zagregowane - nie pokazuj ich ponownie
  const [aggregatedActivityIds, setAggregatedActivityIds] = useState<Set<string>>(new Set());
  // Filtry kolumnowe
  const [filters, setFilters] = useState({
    time: '', // filtr czasu (np. "09:", "10:30")
    minDuration: 0, // min długość w sekundach
    source: '', // filtr źródła/aplikacji
    description: '', // filtr opisu
    task: '', // filtr ticketa
    status: 'all' as 'all' | 'new' | 'logged' | 'partial' | 'conflict', // filtr statusu
    tempo: '', // filtr workloga w Tempo
  });
  // Edycja worklogów
  const [editingWorklogId, setEditingWorklogId] = useState<number | null>(null);
  const [editingWorklogTime, setEditingWorklogTime] = useState<number>(0);
  const [savingWorklogId, setSavingWorklogId] = useState<number | null>(null);
  const [deletingWorklogId, setDeletingWorklogId] = useState<number | null>(null);

  // Toggle expanded state for aggregated rows
  const toggleExpanded = useCallback((id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Sync rows when activities change (preserve manual rows, filter aggregated)
  useEffect(() => {
    const activityRows = activities
      // Filtruj aktywności które zostały już zagregowane
      .filter(a => !aggregatedActivityIds.has(a.id))
      .sort((a, b) => {
        const aTime = a.firstSeen ? new Date(a.firstSeen).getTime() : 0;
        const bTime = b.firstSeen ? new Date(b.firstSeen).getTime() : 0;
        return aTime - bTime;
      })
      .map(activityToRow);

    setRows(prev => {
      // Keep manual rows (includes aggregated rows)
      const manualRows = prev.filter(r => r.isManual);
      // Merge: activity rows first, then manual rows at the end
      return [...activityRows, ...manualRows];
    });
  }, [activities, aggregatedActivityIds]);

  // Update row field
  const updateRow = useCallback(
    (id: string, field: keyof TimesheetRow, value: unknown) => {
      setRows(prev =>
        prev.map(row => {
          if (row.id !== id) return row;

          const updated = { ...row, [field]: value };

          // Recalculate end time when duration changes (for display purposes)
          if (field === 'duration' && typeof value === 'number') {
            updated.endTime = calculateEndTime(row.startTime, value);
          }

          // Recalculate end time when start time changes (keeps same duration)
          if (field === 'startTime' && typeof value === 'string') {
            updated.endTime = calculateEndTime(value, row.duration);
          }

          // Note: endTime is now read-only (calculated from startTime + duration)
          // Users edit duration directly, not endTime

          return updated;
        })
      );

      // Notify parent when ticket changes (for persistence)
      if (field === 'selectedTicket' && onTicketChange && typeof value === 'string') {
        onTicketChange(id, value);
      }
    },
    [onTicketChange]
  );

  // Add manual row
  const addRow = useCallback(() => {
    setRows(prev => [...prev, createEmptyRow()]);
  }, []);

  // Remove row
  const removeRow = useCallback((id: string) => {
    setRows(prev => prev.filter(row => row.id !== id));
    setSelectedRows(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // Aggregate selected rows into one
  const aggregateRows = useCallback(() => {
    const selectedRowsList = rows.filter(r => selectedRows.has(r.id));
    if (selectedRowsList.length < 2) {
      toast.error('Zaznacz co najmniej 2 wiersze do agregacji');
      return;
    }

    // Sortuj chronologicznie wg startTime
    const sortedRows = [...selectedRowsList].sort((a, b) => {
      const [aH, aM] = a.startTime.split(':').map(Number);
      const [bH, bM] = b.startTime.split(':').map(Number);
      return aH * 60 + aM - (bH * 60 + bM);
    });

    // Find earliest start and latest end
    const earliestStart = sortedRows[0].startTime;
    const latestEnd = sortedRows[sortedRows.length - 1].endTime;

    // Sum durations
    const totalDuration = sortedRows.reduce((sum, r) => sum + r.duration, 0);

    // Zachowaj szczegóły źródłowych aktywności (z oryginalnym ID)
    const aggregatedFrom = sortedRows.map(r => ({
      originalId: r.id,
      startTime: r.startTime,
      endTime: r.endTime,
      title: r.activityTitle,
      app: r.activityApp,
      duration: r.duration,
    }));

    // Stwórz chronologiczny opis (bez duplikatów sąsiadujących)
    const chronologicalParts: string[] = [];
    sortedRows.forEach((r, idx) => {
      const timeRange = `${r.startTime}-${r.endTime}`;
      const shortDesc =
        r.description?.slice(0, 50) || r.activityTitle?.slice(0, 50) || r.activityApp;
      chronologicalParts.push(`[${timeRange}] ${shortDesc}`);
    });
    const chronologicalDescription = chronologicalParts.join(' → ');

    // Combine unique activity apps
    const activityApps = [...new Set(sortedRows.map(r => r.activityApp))].join(', ');

    // Stwórz tytuł z chronologią: "App1 → App2 → App3"
    const uniqueAppsInOrder: string[] = [];
    sortedRows.forEach(r => {
      if (
        uniqueAppsInOrder.length === 0 ||
        uniqueAppsInOrder[uniqueAppsInOrder.length - 1] !== r.activityApp
      ) {
        uniqueAppsInOrder.push(r.activityApp);
      }
    });
    const activityTitle = `📦 Agregacja (${sortedRows.length}): ${uniqueAppsInOrder.join(' → ')}`;

    // Use the ticket from the first row that has one
    const selectedTicket = sortedRows.find(r => r.selectedTicket)?.selectedTicket || null;

    // Create aggregated row
    const aggregatedRow: TimesheetRow = {
      id: `aggregated-${Date.now()}`,
      startTime: earliestStart,
      endTime: latestEnd,
      duration: totalDuration,
      activityTitle,
      activityApp: activityApps,
      description: chronologicalDescription,
      selectedTicket,
      isLogged: false,
      isManual: true, // Mark as manual so it can be deleted
      isAggregated: true,
      aggregatedFrom,
    };

    // Zapisz oryginalne IDs do aggregatedActivityIds (aby nie pojawiły się po odświeżeniu)
    const originalIds = sortedRows
      .filter(r => !r.isManual && !r.isAggregated) // Tylko oryginalne aktywności z AW
      .map(r => r.id);

    setAggregatedActivityIds(prev => {
      const next = new Set(prev);
      originalIds.forEach(id => next.add(id));
      return next;
    });

    // Remove selected rows and add aggregated one
    setRows(prev => {
      const remaining = prev.filter(r => !selectedRows.has(r.id));
      // Insert at position of first selected row
      const firstSelectedIndex = prev.findIndex(r => selectedRows.has(r.id));
      remaining.splice(firstSelectedIndex, 0, aggregatedRow);
      return remaining;
    });

    setSelectedRows(new Set());
    toast.success(
      `Zagregowano ${sortedRows.length} wierszy → ${formatSecondsToTime(totalDuration)}`
    );
  }, [rows, selectedRows]);

  // Rozdziel zagregowany wiersz na oryginalne
  const disaggregateRow = useCallback(
    (aggregatedRowId: string) => {
      const aggregatedRow = rows.find(r => r.id === aggregatedRowId);
      if (!aggregatedRow || !aggregatedRow.isAggregated || !aggregatedRow.aggregatedFrom) {
        toast.error('Ten wiersz nie jest zagregowany');
        return;
      }

      // Usuń oryginalne IDs z aggregatedActivityIds (pozwól im się pojawić ponownie z AW)
      const originalIds = aggregatedRow.aggregatedFrom.map(item => item.originalId);
      setAggregatedActivityIds(prev => {
        const next = new Set(prev);
        originalIds.forEach(id => next.delete(id));
        return next;
      });

      // Odtwórz oryginalne wiersze z aggregatedFrom (z oryginalnym ID!)
      const restoredRows: TimesheetRow[] = aggregatedRow.aggregatedFrom.map(item => ({
        id: item.originalId, // Przywróć oryginalny ID!
        startTime: item.startTime,
        endTime: item.endTime,
        duration: item.duration,
        activityTitle: item.title,
        activityApp: item.app,
        description: item.title,
        selectedTicket: aggregatedRow.selectedTicket,
        isLogged: false,
        isManual: false, // Przywróć jako NIE-manual (bo to oryginalne z AW)
        isAggregated: false,
      }));

      // Zamień zagregowany wiersz na odtworzone
      setRows(prev => {
        const index = prev.findIndex(r => r.id === aggregatedRowId);
        if (index === -1) return prev;

        const newRows = [...prev];
        newRows.splice(index, 1, ...restoredRows);
        return newRows;
      });

      // Usuń z rozwiniętych
      setExpandedRows(prev => {
        const next = new Set(prev);
        next.delete(aggregatedRowId);
        return next;
      });

      toast.success(`Rozdzielono na ${restoredRows.length} wierszy`);
    },
    [rows]
  );

  // Toggle row selection
  const toggleRowSelection = useCallback((id: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Select all unlogged rows
  const selectAllUnlogged = useCallback(() => {
    const unloggedIds = rows
      .filter(r => !r.isLogged && !loggedIds.has(r.id) && r.selectedTicket)
      .map(r => r.id);
    setSelectedRows(new Set(unloggedIds));
  }, [rows, loggedIds]);

  // Auto-agreguj aktywności w bloki godzinowe
  const autoAggregateByHour = useCallback(() => {
    // Grupuj wiersze wg godziny startu
    const hourGroups = new Map<number, TimesheetRow[]>();

    rows.forEach(row => {
      if (row.isLogged || loggedIds.has(row.id) || row.isAggregated) return;
      const hour = parseInt(row.startTime.split(':')[0]);
      if (!hourGroups.has(hour)) hourGroups.set(hour, []);
      hourGroups.get(hour)!.push(row);
    });

    // Znajdź grupy z więcej niż 1 wierszem i zaznacz pierwszą
    let groupsFound = 0;
    let firstGroupIds: string[] = [];

    hourGroups.forEach((rowsInHour, _hour) => {
      if (rowsInHour.length >= 2) {
        groupsFound++;
        if (firstGroupIds.length === 0) {
          firstGroupIds = rowsInHour.map(r => r.id);
        }
      }
    });

    if (groupsFound > 0) {
      setSelectedRows(new Set(firstGroupIds));
      toast.info(
        `Znaleziono ${groupsFound} grup godzinowych. Zaznaczono pierwszą (${firstGroupIds.length} wierszy). Kliknij "Agreguj" aby połączyć.`
      );
    } else {
      toast.info('Brak aktywności do automatycznej agregacji godzinowej');
    }
  }, [rows, loggedIds]);

  // Log single row
  const handleLogRow = useCallback(
    async (row: TimesheetRow) => {
      if (!row.selectedTicket) {
        toast.error('Wybierz ticket przed zalogowaniem');
        return;
      }

      setLoggingIds(prev => new Set(prev).add(row.id));

      try {
        await onLog(row);
        setRows(prev => prev.map(r => (r.id === row.id ? { ...r, isLogged: true } : r)));
        toast.success(`Zalogowano ${formatSecondsToTime(row.duration)} do ${row.selectedTicket}`);
      } catch (error) {
        toast.error('Błąd logowania', {
          description: error instanceof Error ? error.message : 'Spróbuj ponownie',
        });
      } finally {
        setLoggingIds(prev => {
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
      }
    },
    [onLog]
  );

  // Log all selected rows
  const handleLogAll = useCallback(async () => {
    const toLog = rows.filter(
      r => selectedRows.has(r.id) && !r.isLogged && !loggedIds.has(r.id) && r.selectedTicket
    );

    if (toLog.length === 0) {
      toast.error('Brak wierszy do zalogowania', {
        description: 'Zaznacz wiersze z przypisanym ticketem',
      });
      return;
    }

    setLogAllLoading(true);

    try {
      await onLogAll(toLog);
      setRows(prev =>
        prev.map(r => (toLog.some(t => t.id === r.id) ? { ...r, isLogged: true } : r))
      );
      setSelectedRows(new Set());
      toast.success(`Zalogowano ${toLog.length} wpisów`);
    } catch (error) {
      toast.error('Błąd logowania', {
        description: error instanceof Error ? error.message : 'Część wpisów mogła się nie zapisać',
      });
    } finally {
      setLogAllLoading(false);
    }
  }, [rows, selectedRows, loggedIds, onLogAll]);

  // Helper to get status for a row
  const getRowStatus = (row: TimesheetRow): ActivityStatus => {
    const overlapping = findOverlappingWorklogs(tempoWorklogs, row.startTime, row.endTime);
    return getActivityStatus(
      row.startTime,
      row.endTime,
      row.duration,
      tempoWorklogs,
      overlapping.length > 0
    ).status;
  };

  // Calculate totals with all filters applied
  const filteredRows = rows.filter(row => {
    // Duration filter
    if (row.duration < filters.minDuration && !row.isManual) return false;

    // Time filter (startTime contains)
    if (filters.time && !row.startTime.includes(filters.time)) return false;

    // Source/app filter
    if (filters.source && !row.activityApp.toLowerCase().includes(filters.source.toLowerCase()))
      return false;

    // Description filter
    if (
      filters.description &&
      !row.description.toLowerCase().includes(filters.description.toLowerCase()) &&
      !row.activityTitle.toLowerCase().includes(filters.description.toLowerCase())
    )
      return false;

    // Task filter
    if (
      filters.task &&
      (!row.selectedTicket ||
        !row.selectedTicket.toLowerCase().includes(filters.task.toLowerCase()))
    )
      return false;

    // Status filter
    if (filters.status !== 'all') {
      const status = getRowStatus(row);
      if (status !== filters.status) return false;
    }

    // Tempo worklog filter
    if (filters.tempo) {
      const overlapping = findOverlappingWorklogs(tempoWorklogs, row.startTime, row.endTime);
      const hasMatchingTempo = overlapping.some(
        w =>
          w.issue.key.toLowerCase().includes(filters.tempo.toLowerCase()) ||
          (w.description && w.description.toLowerCase().includes(filters.tempo.toLowerCase()))
      );
      if (!hasMatchingTempo) return false;
    }

    return true;
  });

  const totalSeconds = filteredRows.reduce((sum, r) => sum + r.duration, 0);
  const loggedSecondsInTable = filteredRows
    .filter(r => r.isLogged || loggedIds.has(r.id))
    .reduce((sum, r) => sum + r.duration, 0);
  const unloggedWithTicket = filteredRows.filter(
    r => !r.isLogged && !loggedIds.has(r.id) && r.selectedTicket
  ).length;
  const hiddenCount = rows.length - filteredRows.length;

  return (
    <div className="space-y-3">
      {/* Summary bar - responsive */}
      <div className="bg-muted flex flex-col gap-3 rounded-lg px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
        {/* Stats - wrap on mobile */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <strong>{formatSecondsToTime(totalSeconds)}</strong>
          </span>
          <span className="flex items-center gap-1 text-green-600">
            <CheckCircle className="h-4 w-4" />
            <strong>{formatSecondsToTime(loggedSecondsInTable)}</strong>
          </span>
          {selectedRows.size > 0 && (
            <span className="font-medium text-blue-600">✓ {selectedRows.size}</span>
          )}
          <span
            className={`text-xs ${tempoWorklogs.length > 0 ? 'text-green-600' : 'text-orange-500'}`}
          >
            Tempo: {tempoWorklogs.length}
          </span>
          {hiddenCount > 0 && (
            <span className="text-muted-foreground text-xs">({hiddenCount} ukrytych)</span>
          )}
        </div>

        {/* Actions - wrap on mobile */}
        <div className="flex flex-wrap gap-2">
          {/* Clear all filters button */}
          {(filters.time ||
            filters.minDuration > 0 ||
            filters.source ||
            filters.description ||
            filters.task ||
            filters.status !== 'all' ||
            filters.tempo) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setFilters({
                  time: '',
                  minDuration: 0,
                  source: '',
                  description: '',
                  task: '',
                  status: 'all',
                  tempo: '',
                })
              }
              className="text-muted-foreground h-8 text-xs"
            >
              ✕ Wyczyść filtry
            </Button>
          )}

          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Odśwież dane"
              className="h-8"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="ml-1 hidden sm:inline">Odśwież</span>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={autoAggregateByHour}
            title="Auto-agreguj"
            className="h-8"
          >
            <Clock className="h-4 w-4" />
            <span className="ml-1 hidden sm:inline">Auto</span>
          </Button>
          <Button variant="outline" size="sm" onClick={selectAllUnlogged} className="h-8">
            <span className="hidden sm:inline">Zaznacz</span>
            <span className="sm:hidden">✓ All</span>
          </Button>
          {selectedRows.size >= 2 && (
            <Button size="sm" variant="secondary" onClick={aggregateRows} className="h-8">
              <Layers className="h-4 w-4" />
              <span className="ml-1">{selectedRows.size}</span>
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleLogAll}
            disabled={logAllLoading || selectedRows.size === 0}
            className="h-8"
          >
            {logAllLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span className="ml-1">{selectedRows.size}</span>
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <Table className="w-full">
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-12 px-2 text-center">✓</TableHead>
              <TableHead className="w-24 px-2">Czas</TableHead>
              <TableHead className="w-16 px-2">Długość</TableHead>
              <TableHead className="hidden w-32 px-2 lg:table-cell xl:w-40">Źródło</TableHead>
              <TableHead className="min-w-[180px] px-2 lg:min-w-[300px] xl:min-w-[400px]">
                Opis
              </TableHead>
              <TableHead className="w-32 px-2 lg:w-40 xl:w-48">Task</TableHead>
              <TableHead className="w-16 px-2">Status</TableHead>
              <TableHead className="hidden min-w-[140px] px-2 md:table-cell lg:min-w-[180px] xl:min-w-[220px]">
                W Tempo
              </TableHead>
            </TableRow>
            {/* Filter row */}
            <TableRow className="bg-muted/30 border-b">
              <TableHead className="px-1 py-1">
                <span className="text-muted-foreground text-[10px]">🔍</span>
              </TableHead>
              <TableHead className="px-1 py-1">
                <Input
                  placeholder="09:00"
                  value={filters.time}
                  onChange={e => setFilters(f => ({ ...f, time: e.target.value }))}
                  className="h-6 px-1 text-[10px]"
                />
              </TableHead>
              <TableHead className="px-1 py-1">
                <Select
                  value={filters.minDuration.toString()}
                  onValueChange={v => setFilters(f => ({ ...f, minDuration: parseInt(v) }))}
                >
                  <SelectTrigger className="h-6 px-1 text-[10px]">
                    <SelectValue placeholder="Min" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Wszystkie</SelectItem>
                    <SelectItem value="60">≥1m</SelectItem>
                    <SelectItem value="120">≥2m</SelectItem>
                    <SelectItem value="300">≥5m</SelectItem>
                    <SelectItem value="600">≥10m</SelectItem>
                    <SelectItem value="1800">≥30m</SelectItem>
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="hidden px-1 py-1 lg:table-cell">
                <Input
                  placeholder="App..."
                  value={filters.source}
                  onChange={e => setFilters(f => ({ ...f, source: e.target.value }))}
                  className="h-6 px-1 text-[10px]"
                />
              </TableHead>
              <TableHead className="px-1 py-1">
                <Input
                  placeholder="Szukaj w opisie..."
                  value={filters.description}
                  onChange={e => setFilters(f => ({ ...f, description: e.target.value }))}
                  className="h-6 px-1 text-[10px]"
                />
              </TableHead>
              <TableHead className="px-1 py-1">
                <Input
                  placeholder="Ticket..."
                  value={filters.task}
                  onChange={e => setFilters(f => ({ ...f, task: e.target.value }))}
                  className="h-6 px-1 text-[10px]"
                />
              </TableHead>
              <TableHead className="px-1 py-1">
                <Select
                  value={filters.status}
                  onValueChange={v =>
                    setFilters(f => ({ ...f, status: v as typeof filters.status }))
                  }
                >
                  <SelectTrigger className="h-6 px-1 text-[10px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Wszystkie</SelectItem>
                    <SelectItem value="new">● Nowe</SelectItem>
                    <SelectItem value="logged">✓ Zalogowane</SelectItem>
                    <SelectItem value="partial">◐ Częściowe</SelectItem>
                    <SelectItem value="conflict">! Konflikt</SelectItem>
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="hidden px-1 py-1 md:table-cell">
                <Input
                  placeholder="W Tempo..."
                  value={filters.tempo}
                  onChange={e => setFilters(f => ({ ...f, tempo: e.target.value }))}
                  className="h-6 px-1 text-[10px]"
                />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.map(row => {
              // Sprawdź rzeczywisty status w Tempo (nie bazuj na localStorage)
              const overlappingWorklogs = findOverlappingWorklogs(
                tempoWorklogs,
                row.startTime,
                row.endTime
              );
              const isActuallyLogged = overlappingWorklogs.length > 0;
              const isLogging = loggingIds.has(row.id);
              const isSelected = selectedRows.has(row.id);
              const isExpanded = expandedRows.has(row.id);

              // Get meeting match info
              const meetingInfo = getMeetingMatchInfo(row, tempoWorklogs);

              const statusInfo = getActivityStatus(
                row.startTime,
                row.endTime,
                row.duration,
                tempoWorklogs,
                isActuallyLogged
              );

              return (
                <Fragment key={row.id}>
                  <TableRow
                    className={`transition-colors ${
                      isActuallyLogged
                        ? 'bg-green-50/70 opacity-70 dark:bg-green-950/30'
                        : isSelected
                          ? 'bg-blue-50 ring-1 ring-inset ring-blue-300 dark:bg-blue-950/20'
                          : row.isAggregated
                            ? 'border-l-2 border-l-purple-500 bg-gradient-to-r from-purple-50 to-white dark:from-purple-950/30 dark:to-transparent'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-900'
                    }`}
                  >
                    {/* Checkbox + Expand */}
                    <TableCell className="w-12 px-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {row.isAggregated && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0"
                            onClick={() => toggleExpanded(row.id)}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3 w-3" />
                            ) : (
                              <ChevronRight className="h-3 w-3" />
                            )}
                          </Button>
                        )}
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRowSelection(row.id)}
                          disabled={isActuallyLogged}
                          className="h-5 w-5 cursor-pointer accent-blue-600"
                        />
                      </div>
                    </TableCell>

                    {/* Time range (Od + calculated Do) */}
                    <TableCell className="px-2">
                      <div className="flex items-center gap-1 font-mono text-xs">
                        <Input
                          value={row.startTime}
                          onChange={e => updateRow(row.id, 'startTime', e.target.value)}
                          className="h-7 w-14 px-1 text-center text-xs"
                          disabled={isActuallyLogged}
                          title="Czas rozpoczęcia (edytowalny)"
                        />
                        <span className="text-muted-foreground">→</span>
                        <span
                          className="text-muted-foreground bg-muted/50 flex h-7 w-14 items-center justify-center rounded border px-1 text-xs"
                          title="Czas zakończenia (wyliczany automatycznie z Od + Długość)"
                        >
                          {calculateEndTime(row.startTime, row.duration)}
                        </span>
                      </div>
                    </TableCell>

                    {/* Duration */}
                    <TableCell className="px-2">
                      <EditableTimeInput
                        value={row.duration}
                        onChange={seconds => updateRow(row.id, 'duration', seconds)}
                        disabled={isActuallyLogged}
                      />
                    </TableCell>

                    {/* Source (hidden on mobile) */}
                    <TableCell className="hidden px-2 lg:table-cell">
                      <div className="space-y-1 text-xs">
                        {row.isAggregated && row.aggregatedFrom ? (
                          <Badge
                            variant="secondary"
                            className="bg-purple-100 text-[10px] text-purple-800"
                          >
                            <Layers className="mr-0.5 h-3 w-3" />
                            {row.aggregatedFrom.length}x
                          </Badge>
                        ) : (
                          <>
                            <Badge variant="outline" className="text-[10px]">
                              {row.activityApp}
                            </Badge>
                            {/* Meeting indicator */}
                            {meetingInfo.isMeeting && (
                              <div className="flex items-center gap-1">
                                <Video className="h-3 w-3 text-orange-500" />
                                {meetingInfo.matchResult &&
                                  meetingInfo.matchResult.matchType !== 'none' && (
                                    <span
                                      className={`rounded px-1 text-[9px] ${
                                        meetingInfo.matchResult.matchType === 'exact'
                                          ? 'bg-green-100 text-green-700'
                                          : meetingInfo.matchResult.matchType === 'strong'
                                            ? 'bg-blue-100 text-blue-700'
                                            : meetingInfo.matchResult.matchType === 'partial'
                                              ? 'bg-yellow-100 text-yellow-700'
                                              : 'bg-gray-100 text-gray-600'
                                      }`}
                                    >
                                      {meetingInfo.matchResult.matchType === 'exact'
                                        ? '✓'
                                        : meetingInfo.matchResult.matchType === 'strong'
                                          ? '≈'
                                          : '?'}
                                    </span>
                                  )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>

                    {/* Description (with app badge on mobile) */}
                    <TableCell className="px-2">
                      <div className="space-y-1">
                        {/* Show app badge on mobile only */}
                        <div className="flex flex-wrap items-center gap-1 lg:hidden">
                          {row.isAggregated ? (
                            <Badge
                              variant="secondary"
                              className="bg-purple-100 text-[10px] text-purple-800"
                            >
                              <Layers className="mr-0.5 h-3 w-3" />
                              {row.aggregatedFrom?.length}x
                            </Badge>
                          ) : (
                            <>
                              <Badge variant="outline" className="text-[10px]">
                                {row.activityApp}
                              </Badge>
                              {meetingInfo.isMeeting && (
                                <Video className="h-3 w-3 text-orange-500" />
                              )}
                            </>
                          )}
                        </div>
                        <Textarea
                          value={row.description}
                          onChange={e => updateRow(row.id, 'description', e.target.value)}
                          className={`min-h-[50px] resize-none text-xs ${row.isAggregated ? 'bg-purple-50/50 dark:bg-purple-900/20' : ''}`}
                          placeholder="Opis..."
                          disabled={isActuallyLogged}
                        />
                      </div>
                    </TableCell>

                    {/* Task */}
                    <TableCell className="px-2">
                      <div className="space-y-1">
                        <TicketCombobox
                          tickets={tickets}
                          value={row.selectedTicket}
                          onValueChange={value => {
                            updateRow(row.id, 'selectedTicket', value);
                            // Record meeting-ticket association if this is a meeting
                            if (meetingInfo.isMeeting && value) {
                              recordMeetingTicket(
                                row.activityTitle,
                                meetingInfo.platform,
                                value,
                                tickets.find(t => t.key === value)?.name
                              );
                            }
                          }}
                          disabled={isActuallyLogged}
                          placeholder="Task..."
                        />
                        {/* Suggestion button when no ticket selected but we have a suggestion */}
                        {!row.selectedTicket &&
                          !isActuallyLogged &&
                          meetingInfo.isMeeting &&
                          (meetingInfo.matchResult?.matchType === 'exact' ||
                          meetingInfo.matchResult?.matchType === 'strong' ? (
                            <button
                              onClick={() => {
                                const ticketKey = meetingInfo.matchResult!.worklog.issue.key;
                                updateRow(row.id, 'selectedTicket', ticketKey);
                                recordMeetingTicket(
                                  row.activityTitle,
                                  meetingInfo.platform,
                                  ticketKey
                                );
                                toast.success(`Ustawiono ${ticketKey}`);
                              }}
                              className="flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700 transition-colors hover:bg-blue-100"
                            >
                              <Lightbulb className="h-3 w-3" />
                              {meetingInfo.matchResult.worklog.issue.key}
                            </button>
                          ) : (
                            meetingInfo.historicalTicket &&
                            meetingInfo.historicalTicket.confidence >= 0.5 && (
                              <button
                                onClick={() => {
                                  const ticketKey = meetingInfo.historicalTicket!.ticketKey;
                                  updateRow(row.id, 'selectedTicket', ticketKey);
                                  toast.success(`Ustawiono ${ticketKey} z historii`);
                                }}
                                className="flex items-center gap-1 rounded bg-green-50 px-1.5 py-0.5 text-[10px] text-green-700 transition-colors hover:bg-green-100"
                              >
                                <Clock className="h-3 w-3" />
                                {meetingInfo.historicalTicket.ticketKey}
                              </button>
                            )
                          ))}
                      </div>
                    </TableCell>

                    {/* Status + Actions (combined) */}
                    <TableCell className="px-2">
                      <div className="flex flex-col items-center gap-1">
                        {/* Status badge */}
                        {(() => {
                          const statusStyles: Record<ActivityStatus, string> = {
                            logged: 'bg-green-100 text-green-800',
                            new: 'bg-blue-50 text-blue-700',
                            partial: 'bg-yellow-100 text-yellow-800',
                            conflict: 'bg-red-100 text-red-800',
                          };
                          const statusIcons: Record<ActivityStatus, string> = {
                            logged: '✓',
                            new: '●',
                            partial: '◐',
                            conflict: '!',
                          };
                          return (
                            <Badge
                              className={`${statusStyles[statusInfo.status]} px-1.5 py-0 text-[10px]`}
                            >
                              {statusIcons[statusInfo.status]}
                              {statusInfo.status === 'partial' && ` ${statusInfo.overlapPercent}%`}
                            </Badge>
                          );
                        })()}

                        {/* Action buttons */}
                        <div className="flex gap-0.5">
                          {isActuallyLogged ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  console.log('Log clicked:', row.id, row.selectedTicket);
                                  if (!row.selectedTicket) {
                                    toast.error('Wybierz ticket!');
                                    return;
                                  }
                                  handleLogRow(row);
                                }}
                                disabled={isLogging}
                                className="h-7 rounded bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {isLogging ? '...' : '▶ Log'}
                              </button>
                              {row.isAggregated && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => disaggregateRow(row.id)}
                                  className="h-6 w-6 p-0 text-purple-600"
                                >
                                  <Unlink className="h-3 w-3" />
                                </Button>
                              )}
                              {row.isManual && !row.isAggregated && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => removeRow(row.id)}
                                  className="h-6 w-6 p-0"
                                >
                                  <Trash2 className="text-destructive h-3 w-3" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* W Tempo (hidden on mobile) */}
                    <TableCell className="hidden px-2 md:table-cell">
                      {overlappingWorklogs.length === 0 ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : (
                        <div className="max-h-[120px] space-y-1 overflow-y-auto text-xs">
                          {overlappingWorklogs.slice(0, 3).map(w => (
                            <div
                              key={w.tempoWorklogId}
                              className="group rounded bg-green-50 p-1.5 text-[10px] dark:bg-green-950/30"
                            >
                              {editingWorklogId === w.tempoWorklogId ? (
                                // Edit mode
                                <div className="flex items-center gap-1">
                                  <span className="font-mono font-semibold text-green-700">
                                    {w.issue.key}
                                  </span>
                                  <EditableTimeInput
                                    value={editingWorklogTime}
                                    onChange={setEditingWorklogTime}
                                    disabled={savingWorklogId === w.tempoWorklogId}
                                  />
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-5 w-5 p-0 text-green-600 hover:text-green-700"
                                    disabled={savingWorklogId === w.tempoWorklogId}
                                    onClick={async () => {
                                      if (!onEditWorklog) return;
                                      setSavingWorklogId(w.tempoWorklogId);
                                      try {
                                        await onEditWorklog(w, editingWorklogTime);
                                        setEditingWorklogId(null);
                                        toast.success('Worklog zaktualizowany');
                                      } catch (err) {
                                        toast.error('Błąd aktualizacji', {
                                          description:
                                            err instanceof Error ? err.message : 'Spróbuj ponownie',
                                        });
                                      } finally {
                                        setSavingWorklogId(null);
                                      }
                                    }}
                                  >
                                    {savingWorklogId === w.tempoWorklogId ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <CheckCircle className="h-3 w-3" />
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-muted-foreground hover:text-foreground h-5 w-5 p-0"
                                    onClick={() => setEditingWorklogId(null)}
                                  >
                                    ✕
                                  </Button>
                                </div>
                              ) : (
                                // View mode
                                <div className="flex items-center justify-between">
                                  <div>
                                    <span className="font-mono font-semibold text-green-700">
                                      {w.issue.key}
                                    </span>
                                    <span className="text-muted-foreground ml-1">
                                      {formatSecondsToTime(w.timeSpentSeconds)}
                                    </span>
                                  </div>
                                  <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                    {onEditWorklog && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-5 w-5 p-0 text-blue-600 hover:text-blue-700"
                                        onClick={() => {
                                          setEditingWorklogId(w.tempoWorklogId);
                                          setEditingWorklogTime(w.timeSpentSeconds);
                                        }}
                                        title="Edytuj czas"
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </Button>
                                    )}
                                    {onDeleteWorklog && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-5 w-5 p-0 text-red-500 hover:text-red-600"
                                        disabled={deletingWorklogId === w.tempoWorklogId}
                                        onClick={async () => {
                                          if (
                                            !confirm(
                                              `Usunąć worklog ${w.issue.key} (${formatSecondsToTime(w.timeSpentSeconds)})?`
                                            )
                                          )
                                            return;
                                          setDeletingWorklogId(w.tempoWorklogId);
                                          try {
                                            await onDeleteWorklog(w.tempoWorklogId);
                                            toast.success('Worklog usunięty');
                                          } catch (err) {
                                            toast.error('Błąd usuwania', {
                                              description:
                                                err instanceof Error
                                                  ? err.message
                                                  : 'Spróbuj ponownie',
                                            });
                                          } finally {
                                            setDeletingWorklogId(null);
                                          }
                                        }}
                                        title="Usuń worklog"
                                      >
                                        {deletingWorklogId === w.tempoWorklogId ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          <Trash2 className="h-3 w-3" />
                                        )}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                          {overlappingWorklogs.length > 3 && (
                            <span className="text-muted-foreground">
                              +{overlappingWorklogs.length - 3} więcej
                            </span>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>

                  {/* Rozwinięte szczegóły agregacji */}
                  {row.isAggregated && isExpanded && row.aggregatedFrom && (
                    <TableRow
                      key={`${row.id}-details`}
                      className="bg-purple-50/50 dark:bg-purple-950/10"
                    >
                      <TableCell colSpan={8} className="px-3 py-2">
                        <div className="space-y-2 text-xs">
                          {/* Lista aktywności */}
                          <div className="grid gap-1">
                            {row.aggregatedFrom.map((item, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-2 rounded border border-purple-200 bg-white p-1.5 dark:border-purple-800 dark:bg-gray-800"
                              >
                                <span className="whitespace-nowrap font-mono text-[10px] text-purple-600">
                                  {item.startTime}-{item.endTime}
                                </span>
                                <Badge variant="outline" className="shrink-0 px-1 text-[10px]">
                                  {item.app}
                                </Badge>
                                <span
                                  className="text-muted-foreground flex-1 truncate text-[10px]"
                                  title={item.title}
                                >
                                  {item.title}
                                </span>
                                <span className="font-mono text-xs font-semibold text-purple-700">
                                  {formatSecondsToTime(item.duration)}
                                </span>
                              </div>
                            ))}
                          </div>
                          {/* Footer */}
                          <div className="text-muted-foreground flex items-center justify-between text-[10px]">
                            <span>{row.aggregatedFrom.length} aktywności</span>
                            <span className="font-mono font-bold text-purple-700">
                              = {formatSecondsToTime(row.duration)}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Add row button */}
      <div className="flex justify-center">
        <Button variant="outline" onClick={addRow}>
          <Plus className="mr-2 h-4 w-4" />
          Dodaj wiersz
        </Button>
      </div>
    </div>
  );
}

export default TimesheetTable;
