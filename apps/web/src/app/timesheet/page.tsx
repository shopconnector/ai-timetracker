'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { ActivityCard, Activity, Ticket } from '@/components/ActivityCard';
import { WorklogFormDialog, WorklogFormData } from '@/components/WorklogFormDialog';
import { format, isSameDay, startOfWeek, addDays } from 'date-fns';
import { pl } from 'date-fns/locale';
import {
  Search,
  Download,
  Filter,
  Loader2,
  RefreshCw,
  Eye,
  EyeOff,
  GitMerge,
  X,
  LayoutGrid,
  Table2,
  ChevronLeft,
  ChevronRight,
  Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { MergeDialog, SplitDialog } from '@/components/MergeSplitDialog';
import { TimesheetTable, TimesheetRow } from '@/components/TimesheetTable';
import { DayProgressBar } from '@/components/DayProgressBar';
import { TicketCombobox } from '@/components/TicketCombobox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDebouncedCallback } from 'use-debounce';
import {
  recordTaskUsage,
  getRecentTasks,
  getProjectMappings,
  getSmartSuggestions,
} from '@/lib/taskHistory';
import { recordTimeLog, recordMerge, recordSplit } from '@/lib/auditTrail';
import {
  getAssignments,
  setAssignment,
  mergeDayAssignments,
  type Assignment,
} from '@/lib/assignmentStore';
import { getTaskHistory } from '@/lib/taskHistory';

interface Summary {
  date: string;
  totalSeconds: number;
  totalFormatted: string;
  activitiesCount: number;
  topApps: Array<{ app: string; seconds: number; formatted: string }>;
}

interface ApiResponse {
  date: string;
  summary: Summary;
  activities: Activity[];
}

// Worklog z Tempo (musi pasować do TempoWorklog w TimesheetTable)
interface TempoWorklogData {
  tempoWorklogId: number;
  issue: { key: string; id?: number };
  timeSpentSeconds: number;
  startDate: string;
  startTime: string;
  description?: string;
}

interface WorklogResponse {
  availableTickets: Ticket[];
  totalSeconds: number;
  totalFormatted: string;
  worklogs: TempoWorklogData[];
}

export default function TimesheetPage() {
  const [date, setDate] = useState<Date>(new Date());
  const [activities, setActivities] = useState<Activity[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loggedSeconds, setLoggedSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loggingIds, setLoggingIds] = useState<Set<string>>(new Set());
  const [loggedIds, setLoggedIds] = useState<Set<string>>(() => {
    // Restore from localStorage przy starcie
    if (typeof window !== 'undefined') {
      const dateKey = format(new Date(), 'yyyy-MM-dd');
      const saved = localStorage.getItem(`loggedIds-${dateKey}`);
      if (saved) {
        try {
          return new Set(JSON.parse(saved));
        } catch {
          return new Set();
        }
      }
    }
    return new Set();
  });
  const [tempoWorklogs, setTempoWorklogs] = useState<TempoWorklogData[]>([]);
  const [suggestingAll, setSuggestingAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [loadingAllTickets, setLoadingAllTickets] = useState(false);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [issueFilter, setIssueFilter] = useState<'all' | 'in_progress' | 'assigned' | 'recent'>(
    'all'
  );
  const [awStatus, setAwStatus] = useState<'connected' | 'error' | 'checking'>('checking');
  const [showPrivate, setShowPrivate] = useState(true); // Show private activities by default
  const [batchAssigning, setBatchAssigning] = useState(false);
  const [minDurationFilter, setMinDurationFilter] = useState<number>(0); // Filter: minimum duration in seconds
  const [activityFilter, setActivityFilter] = useState(''); // Filter: search in app/title
  const [viewMode, setViewMode] = useState<'cards' | 'table'>(() => {
    // Load from localStorage if available
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('timesheet-view-mode') as 'cards' | 'table') || 'cards';
    }
    return 'cards';
  });

  // Dialog state
  const [dialogActivity, setDialogActivity] = useState<Activity | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Merge/Split state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [splitActivity, setSplitActivity] = useState<Activity | null>(null);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);

  // Quick Merge Bar state
  const [quickMergeTicket, setQuickMergeTicket] = useState<string | null>(null);
  const [quickMerging, setQuickMerging] = useState(false);

  const dateStr = format(date, 'yyyy-MM-dd');

  // Aggregate worklogs by ticket for display in TicketCombobox
  const worklogsByTicket = useMemo(() => {
    const map = new Map<string, { ticketKey: string; totalSeconds: number; count: number }>();
    for (const wl of tempoWorklogs) {
      const key = wl.issue.key;
      const existing = map.get(key);
      if (existing) {
        existing.totalSeconds += wl.timeSpentSeconds;
        existing.count += 1;
      } else {
        map.set(key, { ticketKey: key, totalSeconds: wl.timeSpentSeconds, count: 1 });
      }
    }
    return map;
  }, [tempoWorklogs]);

  // Day navigation helpers
  const changeDay = (delta: number) => {
    setDate(prev => addDays(prev, delta));
  };

  const goToToday = () => setDate(new Date());

  // Week days for navigation strip
  const weekDays = (() => {
    const start = startOfWeek(date, { weekStartsOn: 1 }); // Monday
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(start, i);
      return {
        date: day,
        dateStr: format(day, 'yyyy-MM-dd'),
        dayName: format(day, 'EEE', { locale: pl }),
        dayNum: format(day, 'd'),
        isWeekend: day.getDay() === 0 || day.getDay() === 6,
        isToday: isSameDay(day, new Date()),
        isSelected: isSameDay(day, date),
      };
    });
  })();

  // Fetch activities from ActivityWatch
  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/timetracker/api/activities?date=${dateStr}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: ApiResponse = await response.json();

      // Restore saved assignments from localStorage
      const savedAssignments = getAssignments(dateStr);
      const activitiesWithAssignments = data.activities.map(a => {
        const saved = savedAssignments[a.id];
        if (saved) {
          return { ...a, suggestedTicket: saved.ticketKey, confidence: saved.confidence };
        }
        return a;
      });

      setActivities(activitiesWithAssignments);
      setSummary(data.summary);
      setAwStatus('connected');
      toast.success('Aktywności odświeżone', {
        description: `${data.activities.length} aktywności na ${dateStr}`,
      });
    } catch (error) {
      setAwStatus('error');
      toast.error('Błąd pobierania aktywności', {
        description:
          error instanceof Error ? error.message : 'Sprawdź czy ActivityWatch jest uruchomiony',
      });
    } finally {
      setLoading(false);
    }
  }, [dateStr]);

  // Fetch tickets from Jira and logged time from Tempo
  const fetchWorklogs = useCallback(async () => {
    setLoadingTickets(true);
    try {
      // Fetch worklogs (for logged time)
      const worklogsRes = await fetch(`/timetracker/api/tempo/worklogs?date=${dateStr}`);
      const worklogsData: WorklogResponse = await worklogsRes.json();
      setLoggedSeconds(worklogsData.totalSeconds);
      setTempoWorklogs(worklogsData.worklogs || []);

      // Fetch dynamic tickets from Jira with filter
      const filterParam = issueFilter !== 'all' ? `&filter=${issueFilter}` : '';
      const ticketsRes = await fetch(`/timetracker/api/jira/my-issues?${filterParam}`);
      if (ticketsRes.ok) {
        const ticketsData = await ticketsRes.json();
        const jiraTickets: Ticket[] =
          ticketsData.issues?.map((i: { key: string; name: string; id?: string }) => ({
            key: i.key,
            name: i.name,
            id: i.id, // issueId for Tempo API v4
          })) || [];

        // Merge with recent tasks from history
        const recentTasks = getRecentTasks(5);
        const recentTickets: Ticket[] = recentTasks
          .filter(t => !jiraTickets.some(j => j.key === t.key))
          .map(t => ({ key: t.key, name: t.name }));

        // Recent first, then Jira
        setTickets([...recentTickets, ...jiraTickets]);
      } else {
        // Fallback to available tickets from worklogs response
        setTickets(worklogsData.availableTickets || []);
      }
    } catch (error) {
      toast.error('Błąd pobierania worklogów', {
        description: error instanceof Error ? error.message : 'Sprawdź połączenie z Tempo',
      });
    }
    setLoadingTickets(false);
  }, [dateStr, issueFilter]);

  // Refresh all data (ActivityWatch + Tempo)
  const refreshAll = useCallback(async () => {
    setRefreshingAll(true);
    try {
      await Promise.all([fetchActivities(), fetchWorklogs()]);
      toast.success('Dane odświeżone', {
        description: 'ActivityWatch i Tempo zaktualizowane',
      });
    } catch (error) {
      toast.error('Błąd odświeżania', {
        description: error instanceof Error ? error.message : 'Spróbuj ponownie',
      });
    } finally {
      setRefreshingAll(false);
    }
  }, [fetchActivities, fetchWorklogs]);

  // Search tickets (debounced)
  const searchTickets = useDebouncedCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) return;
    setLoadingTickets(true);
    try {
      const res = await fetch(`/timetracker/api/jira/my-issues?query=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        const searchResults: Ticket[] =
          data.issues?.map((i: { key: string; name: string }) => ({
            key: i.key,
            name: i.name,
          })) || [];
        // Add search results to existing tickets (at the top)
        setTickets(prev => {
          const newTickets = searchResults.filter(s => !prev.some(p => p.key === s.key));
          return [...newTickets, ...prev];
        });
      }
    } catch (error) {
      toast.error('Błąd wyszukiwania', {
        description: error instanceof Error ? error.message : 'Spróbuj ponownie',
      });
    }
    setLoadingTickets(false);
  }, 300);

  // Load ALL tickets from all projects
  const loadAllTickets = async () => {
    setLoadingAllTickets(true);
    try {
      const res = await fetch('/timetracker/api/jira/my-issues?loadAll=true&limit=300');
      if (res.ok) {
        const data = await res.json();
        const allTickets: Ticket[] =
          data.issues?.map((i: { key: string; name: string }) => ({
            key: i.key,
            name: i.name,
          })) || [];

        // Merge with recent tasks from history
        const recentTasks = getRecentTasks(5);
        const recentTickets: Ticket[] = recentTasks
          .filter(t => !allTickets.some(j => j.key === t.key))
          .map(t => ({ key: t.key, name: t.name }));

        setTickets([...recentTickets, ...allTickets]);
      }
    } catch (error) {
      toast.error('Błąd ładowania ticketów', {
        description: error instanceof Error ? error.message : 'Sprawdź połączenie z Jira',
      });
    }
    setLoadingAllTickets(false);
  };

  // Request LLM suggestions for all activities
  const suggestAll = async () => {
    if (activities.length === 0) return;

    setSuggestingAll(true);

    // Get history context
    const recentTasks = getRecentTasks(10);
    const projectMappings = getProjectMappings();

    try {
      const response = await fetch('/timetracker/api/llm/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activities: activities.map(a => ({
            id: a.id,
            title: a.title,
            app: a.app,
            project: a.project,
            totalSeconds: a.totalSeconds,
            // Terminal-specific fields for better LLM context
            isTerminal: a.isTerminal,
            shell: a.shell,
            workingDir: a.workingDir,
            gitBranch: a.gitBranch,
            terminalCommand: a.terminalCommand,
          })),
          context: {
            recentTasks: recentTasks.map(t => ({
              key: t.key,
              name: t.name,
              useCount: t.useCount,
            })),
            projectMappings: projectMappings.map(m => ({
              project: m.project,
              taskKey: m.taskKey,
              taskName: m.taskName,
              confidence: m.confidence,
            })),
          },
          availableTickets: tickets.map(t => ({
            key: t.key,
            name: t.name,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.suggestions) {
        const suggestionCount = Object.keys(data.suggestions).length;
        const llmAssignments: Record<string, Assignment> = {};

        setActivities(prev =>
          prev.map(activity => {
            const suggestion = data.suggestions[activity.id];
            if (suggestion) {
              llmAssignments[activity.id] = {
                ticketKey: suggestion.ticket,
                confidence: suggestion.confidence,
                source: 'history', // LLM suggestions stored as history-type
              };
              return {
                ...activity,
                suggestedTicket: suggestion.ticket,
                confidence: suggestion.confidence,
              };
            }
            return activity;
          })
        );

        // Persist LLM suggestions
        if (Object.keys(llmAssignments).length > 0) {
          mergeDayAssignments(dateStr, llmAssignments);
        }

        toast.success('Sugestie wygenerowane', {
          description: `LLM zasugerował tickety dla ${suggestionCount} aktywności`,
        });
      }
    } catch (error) {
      toast.error('Błąd generowania sugestii', {
        description: error instanceof Error ? error.message : 'Problem z LLM API',
      });
    } finally {
      setSuggestingAll(false);
    }
  };

  // Apply smart suggestions from history (without LLM)
  const applyHistorySuggestions = () => {
    const historyAssignments: Record<string, Assignment> = {};

    setActivities(prev =>
      prev.map(activity => {
        if (activity.suggestedTicket) return activity; // Skip already assigned
        const suggestions = getSmartSuggestions(activity.title, activity.project, 1);
        if (suggestions.length > 0) {
          historyAssignments[activity.id] = {
            ticketKey: suggestions[0].taskKey,
            confidence: suggestions[0].confidence,
            source: 'history',
          };
          return {
            ...activity,
            suggestedTicket: suggestions[0].taskKey,
            confidence: suggestions[0].confidence,
          };
        }
        return activity;
      })
    );

    // Persist
    if (Object.keys(historyAssignments).length > 0) {
      mergeDayAssignments(dateStr, historyAssignments);
    }
  };

  // Auto-assign tickets to all activities (history + project mappings, NO logging)
  // Also persists assignments to localStorage
  const autoAssignTickets = () => {
    let assignedCount = 0;
    const newAssignments: Record<string, Assignment> = {};

    setActivities(prev =>
      prev.map(activity => {
        // Skip already assigned
        if (activity.suggestedTicket) return activity;

        // 1. Try smart suggestions from history
        const suggestions = getSmartSuggestions(activity.title, activity.project, 1);
        if (suggestions.length > 0 && suggestions[0].confidence > 0.3) {
          assignedCount++;
          newAssignments[activity.id] = {
            ticketKey: suggestions[0].taskKey,
            confidence: suggestions[0].confidence,
            source: 'history',
          };
          return {
            ...activity,
            suggestedTicket: suggestions[0].taskKey,
            confidence: suggestions[0].confidence,
          };
        }

        // 2. Try project mapping
        const mappings = getProjectMappings();
        if (activity.project) {
          const mapping = mappings.find(m => m.project === activity.project);
          if (mapping && mapping.confidence > 0.3) {
            assignedCount++;
            newAssignments[activity.id] = {
              ticketKey: mapping.taskKey,
              confidence: mapping.confidence,
              source: 'project_mapping',
            };
            return {
              ...activity,
              suggestedTicket: mapping.taskKey,
              confidence: mapping.confidence,
            };
          }
        }

        return activity;
      })
    );

    // Persist to localStorage
    if (Object.keys(newAssignments).length > 0) {
      mergeDayAssignments(dateStr, newAssignments);
    }

    if (assignedCount > 0) {
      toast.success('Tickety przypisane', {
        description: `Automatycznie przypisano ${assignedCount} ticketów na podstawie historii`,
      });
    } else {
      toast.info('Brak dopasowań', {
        description:
          'Nie znaleziono pasujących ticketów w historii. Użyj "Sugeruj (LLM)" lub przypisz ręcznie.',
      });
    }
  };

  // Batch auto-assign for date range (from Jan 12)
  const batchAutoAssign = async () => {
    setBatchAssigning(true);
    const toastId = toast.loading('Przetwarzam...');

    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await fetch('/timetracker/api/batch-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromDate: '2026-01-12',
          toDate: today,
          taskHistory: getTaskHistory(),
          projectMappings: getProjectMappings(),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      // Save all assignments to localStorage
      for (const [date, dayResult] of Object.entries(data.results)) {
        const result = dayResult as { assignments: Record<string, Assignment> };
        if (Object.keys(result.assignments).length > 0) {
          mergeDayAssignments(date, result.assignments);
        }
      }

      // Reload current day's activities with saved assignments
      const savedAssignments = getAssignments(dateStr);
      setActivities(prev =>
        prev.map(a => {
          const saved = savedAssignments[a.id];
          if (saved && !a.suggestedTicket) {
            return { ...a, suggestedTicket: saved.ticketKey, confidence: saved.confidence };
          }
          return a;
        })
      );

      toast.success('Batch auto-assign zakończony', {
        id: toastId,
        description: `${data.summary.daysProcessed} dni, ${data.summary.totalAssigned} przypisań (${data.summary.totalTempoMatches} z Tempo, ${data.summary.totalHistoryMatches} z historii)`,
        duration: 8000,
      });
    } catch (error) {
      toast.error('Błąd batch auto-assign', {
        id: toastId,
        description: error instanceof Error ? error.message : 'Spróbuj ponownie',
      });
    } finally {
      setBatchAssigning(false);
    }
  };

  // Log activity to Tempo (quick log)
  const handleLog = async (activityId: string, ticketKey: string) => {
    const activity = activities.find(a => a.id === activityId);
    if (!activity) return;

    // Validation: totalSeconds must be > 0
    if (!activity.totalSeconds || activity.totalSeconds <= 0) {
      toast.error('Nie można zalogować', {
        description: 'Czas aktywności musi być większy niż 0',
      });
      return;
    }

    // Validation: ticketKey must be provided
    if (!ticketKey) {
      toast.error('Nie można zalogować', {
        description: 'Wybierz ticket przed zalogowaniem',
      });
      return;
    }

    setLoggingIds(prev => new Set(prev).add(activityId));

    try {
      const startTime = activity.firstSeen ? activity.firstSeen.substring(11, 19) : '09:00:00';

      // Calculate end time for overlap check
      const startParts = startTime.split(':');
      const startMinutes = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
      const durationMinutes = Math.ceil(activity.totalSeconds / 60);
      const endMinutes = startMinutes + durationMinutes;
      const endTime = `${Math.floor(endMinutes / 60)
        .toString()
        .padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;

      // Check for overlap before logging
      const overlapRes = await fetch('/timetracker/api/tempo/check-overlap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: dateStr,
          newStartTime: startTime.substring(0, 5),
          newEndTime: endTime,
        }),
      });

      if (overlapRes.ok) {
        const overlapData = await overlapRes.json();
        if (overlapData.hasOverlap) {
          const conflicts = overlapData.conflictingWorklogs
            .map(
              (c: { issueKey: string; startTime: string; endTime: string }) =>
                `${c.issueKey} (${c.startTime}-${c.endTime})`
            )
            .join(', ');
          toast.warning('Nakładający się czas!', {
            description: `Konflikt z: ${conflicts}. Użyj szczegółów aby zmienić czas.`,
            duration: 5000,
          });
          setLoggingIds(prev => {
            const next = new Set(prev);
            next.delete(activityId);
            return next;
          });
          return;
        }
      }

      // Get issueId from selected ticket
      const selectedTicketData = tickets.find(t => t.key === ticketKey);

      const response = await fetch('/timetracker/api/tempo/worklogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueKey: ticketKey,
          issueId: selectedTicketData?.id ? parseInt(selectedTicketData.id, 10) : undefined,
          timeSpentSeconds: activity.totalSeconds,
          startDate: dateStr,
          startTime: startTime,
          description: `${activity.title} (via TimeTracker)`,
        }),
      });

      if (response.ok) {
        setLoggedIds(prev => new Set(prev).add(activityId));
        setLoggedSeconds(prev => prev + activity.totalSeconds);

        // Record task usage for history
        const ticket = tickets.find(t => t.key === ticketKey);
        recordTaskUsage(ticketKey, ticket?.name || ticketKey, activity.title, activity.project);

        // Record to audit trail
        recordTimeLog(
          {
            title: activity.title,
            app: activity.app,
            project: activity.project,
            totalSeconds: activity.totalSeconds,
            suggestedTicket: activity.suggestedTicket,
            confidence: activity.confidence,
          },
          ticketKey,
          activity.suggestedTicket ? 'llm' : undefined
        );

        toast.success('Czas zalogowany', {
          description: `${ticketKey}: ${Math.round(activity.totalSeconds / 60)} min`,
        });
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Nieznany błąd' }));
        toast.error('Błąd logowania czasu', {
          description: errorData.error || 'Nieznany błąd',
        });
      }
    } catch (error) {
      toast.error('Błąd logowania czasu', {
        description: error instanceof Error ? error.message : 'Sprawdź połączenie z Tempo',
      });
    } finally {
      setLoggingIds(prev => {
        const next = new Set(prev);
        next.delete(activityId);
        return next;
      });
    }
  };

  // Open dialog to log with details
  const handleLogWithDetails = (activity: Activity) => {
    setDialogActivity(activity);
    setDialogOpen(true);
  };

  // Submit from dialog (with extended options)
  const handleDialogSubmit = async (data: WorklogFormData) => {
    if (!dialogActivity) return;

    setLoggingIds(prev => new Set(prev).add(dialogActivity.id));

    try {
      const response = await fetch('/timetracker/api/tempo/worklogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueKey: data.ticketKey,
          timeSpentSeconds: data.timeSpentSeconds,
          startDate: dateStr,
          startTime: `${data.startTime}:00`,
          description: data.description,
          billableSeconds: data.billableSeconds,
          attributes: data.attributes,
        }),
      });

      if (response.ok) {
        setLoggedIds(prev => new Set(prev).add(dialogActivity.id));
        setLoggedSeconds(prev => prev + data.timeSpentSeconds);

        // Record task usage for history
        const ticket = tickets.find(t => t.key === data.ticketKey);
        recordTaskUsage(
          data.ticketKey,
          ticket?.name || data.ticketKey,
          dialogActivity.title,
          dialogActivity.project
        );

        setDialogOpen(false);
        setDialogActivity(null);

        toast.success('Czas zalogowany', {
          description: `${data.ticketKey}: ${Math.round(data.timeSpentSeconds / 60)} min`,
        });
      } else {
        const errorData = await response.json();
        toast.error('Błąd logowania czasu', {
          description: errorData.error || 'Nieznany błąd',
        });
      }
    } catch (error) {
      toast.error('Błąd logowania czasu', {
        description: error instanceof Error ? error.message : 'Sprawdź połączenie z Tempo',
      });
    } finally {
      setLoggingIds(prev => {
        const next = new Set(prev);
        if (dialogActivity) next.delete(dialogActivity.id);
        return next;
      });
    }
  };

  // Log all with suggestions
  const handleLogAll = async () => {
    for (const activity of activities) {
      if (loggedIds.has(activity.id)) continue;
      const ticket = activity.suggestedTicket || tickets[0]?.key;
      if (ticket) {
        await handleLog(activity.id, ticket);
      }
    }
  };

  // Selection handlers for merge mode
  const handleSelectionChange = (activityId: string, selected: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (selected) {
        next.add(activityId);
      } else {
        next.delete(activityId);
      }
      return next;
    });
  };

  const toggleSelectionMode = () => {
    setSelectionMode(prev => !prev);
    setSelectedIds(new Set());
  };

  // Handle merge submission
  const handleMerge = async (data: {
    activities: Activity[];
    ticketKey: string;
    description: string;
    totalSeconds: number;
  }) => {
    try {
      // Use earliest start time from merged activities
      const earliestActivity = data.activities.reduce((earliest, a) =>
        a.firstSeen && (!earliest.firstSeen || a.firstSeen < earliest.firstSeen) ? a : earliest
      );
      const startTime = earliestActivity.firstSeen
        ? earliestActivity.firstSeen.substring(11, 19)
        : '09:00:00';

      const response = await fetch('/timetracker/api/tempo/worklogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueKey: data.ticketKey,
          timeSpentSeconds: data.totalSeconds,
          startDate: dateStr,
          startTime: startTime,
          description: `${data.description} (merged ${data.activities.length} activities via TimeTracker)`,
        }),
      });

      if (response.ok) {
        // Mark all merged activities as logged
        data.activities.forEach(a => {
          setLoggedIds(prev => new Set(prev).add(a.id));
        });
        setLoggedSeconds(prev => prev + data.totalSeconds);

        // Record task usage
        const ticket = tickets.find(t => t.key === data.ticketKey);
        recordTaskUsage(
          data.ticketKey,
          ticket?.name || data.ticketKey,
          data.description,
          earliestActivity.project
        );

        // Record to audit trail
        recordMerge(
          data.activities.map(a => ({ title: a.title, app: a.app, totalSeconds: a.totalSeconds })),
          data.ticketKey,
          data.totalSeconds
        );

        toast.success('Aktywności scalone', {
          description: `${data.ticketKey}: ${Math.round(data.totalSeconds / 60)} min (${data.activities.length} połączonych)`,
        });

        // Exit selection mode
        setSelectionMode(false);
        setSelectedIds(new Set());
      } else {
        const errorData = await response.json();
        toast.error('Błąd scalania', {
          description: errorData.error || 'Nieznany błąd',
        });
      }
    } catch (error) {
      toast.error('Błąd scalania', {
        description: error instanceof Error ? error.message : 'Sprawdź połączenie',
      });
    }
  };

  // Handle split submission
  const handleSplit = async (
    parts: Array<{
      ticketKey: string;
      description: string;
      seconds: number;
      startTime: string;
    }>
  ) => {
    if (!splitActivity) return;

    let allSuccess = true;
    let totalLogged = 0;

    for (const part of parts) {
      try {
        const response = await fetch('/timetracker/api/tempo/worklogs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            issueKey: part.ticketKey,
            timeSpentSeconds: part.seconds,
            startDate: dateStr,
            startTime: `${part.startTime}:00`,
            description: `${part.description} (split via TimeTracker)`,
          }),
        });

        if (response.ok) {
          totalLogged += part.seconds;
          // Record task usage
          const ticket = tickets.find(t => t.key === part.ticketKey);
          recordTaskUsage(
            part.ticketKey,
            ticket?.name || part.ticketKey,
            part.description,
            splitActivity.project
          );
        } else {
          allSuccess = false;
        }
      } catch {
        allSuccess = false;
      }
    }

    if (allSuccess) {
      setLoggedIds(prev => new Set(prev).add(splitActivity.id));
      setLoggedSeconds(prev => prev + totalLogged);

      // Record to audit trail
      recordSplit(
        {
          title: splitActivity.title,
          app: splitActivity.app,
          project: splitActivity.project,
          totalSeconds: splitActivity.totalSeconds,
        },
        parts.map(p => ({ ticketKey: p.ticketKey, seconds: p.seconds }))
      );

      toast.success('Aktywność podzielona', {
        description: `${parts.length} części, łącznie ${Math.round(totalLogged / 60)} min`,
      });
    } else {
      toast.warning('Częściowy sukces', {
        description: 'Niektóre części nie zostały zalogowane',
      });
    }

    setSplitDialogOpen(false);
    setSplitActivity(null);
  };

  // Open split dialog
  const handleOpenSplit = (activity: Activity) => {
    setSplitActivity(activity);
    setSplitDialogOpen(true);
  };

  // Quick merge from floating bar (logs directly without dialog)
  const handleQuickMerge = async () => {
    if (!quickMergeTicket || selectedIds.size === 0) return;

    setQuickMerging(true);
    const selectedActivities = activities.filter(a => selectedIds.has(a.id));
    const totalSeconds = selectedActivities.reduce((sum, a) => sum + a.totalSeconds, 0);

    // Use earliest start time
    const earliestActivity = selectedActivities.reduce((earliest, a) =>
      a.firstSeen && (!earliest.firstSeen || a.firstSeen < earliest.firstSeen) ? a : earliest
    );
    const startTime = earliestActivity.firstSeen
      ? earliestActivity.firstSeen.substring(11, 19)
      : '09:00:00';

    // Build description from all activities
    const description = selectedActivities
      .map(a => a.title)
      .filter((v, i, arr) => arr.indexOf(v) === i) // unique
      .slice(0, 3)
      .join(', ');

    try {
      const response = await fetch('/timetracker/api/tempo/worklogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueKey: quickMergeTicket,
          timeSpentSeconds: totalSeconds,
          startDate: dateStr,
          startTime: startTime,
          description: `${description} (merged ${selectedActivities.length} activities via TimeTracker)`,
        }),
      });

      if (response.ok) {
        // Mark all merged activities as logged
        selectedActivities.forEach(a => {
          setLoggedIds(prev => new Set(prev).add(a.id));
        });
        setLoggedSeconds(prev => prev + totalSeconds);

        // Record task usage
        const ticket = tickets.find(t => t.key === quickMergeTicket);
        recordTaskUsage(
          quickMergeTicket,
          ticket?.name || quickMergeTicket,
          description,
          earliestActivity.project
        );

        // Record to audit trail
        recordMerge(
          selectedActivities.map(a => ({
            title: a.title,
            app: a.app,
            totalSeconds: a.totalSeconds,
          })),
          quickMergeTicket,
          totalSeconds
        );

        toast.success('Szybkie scalenie', {
          description: `${quickMergeTicket}: ${Math.round(totalSeconds / 60)} min (${selectedActivities.length} aktywności)`,
        });

        // Reset selection mode
        setSelectionMode(false);
        setSelectedIds(new Set());
        setQuickMergeTicket(null);
      } else {
        const errorData = await response.json();
        toast.error('Błąd scalania', {
          description: errorData.error || 'Nieznany błąd',
        });
      }
    } catch (error) {
      toast.error('Błąd scalania', {
        description: error instanceof Error ? error.message : 'Sprawdź połączenie',
      });
    } finally {
      setQuickMerging(false);
    }
  };

  // View mode change with localStorage persistence
  const handleViewModeChange = (mode: 'cards' | 'table') => {
    setViewMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('timesheet-view-mode', mode);
    }
  };

  // Handle ticket change from table view - persist to localStorage and update activities
  const handleTicketChange = useCallback(
    (activityId: string, ticketKey: string) => {
      // Persist to localStorage
      setAssignment(dateStr, activityId, {
        ticketKey,
        confidence: 1.0,
        source: 'manual',
      });

      // Update activities state
      setActivities(prev =>
        prev.map(a =>
          a.id === activityId ? { ...a, suggestedTicket: ticketKey, confidence: 1.0 } : a
        )
      );
    },
    [dateStr]
  );

  // Handle logging from table view
  const handleTableLog = async (row: TimesheetRow) => {
    if (!row.selectedTicket) {
      throw new Error('Brak przypisanego ticketa');
    }

    // Get issue ID from tickets
    const ticket = tickets.find(t => t.key === row.selectedTicket);

    const response = await fetch('/timetracker/api/tempo/worklogs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        issueKey: row.selectedTicket,
        timeSpentSeconds: row.duration,
        startDate: dateStr,
        startTime: `${row.startTime}:00`,
        description: row.description || `Logged via TimeTracker`,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Błąd logowania');
    }

    // Update logged state
    setLoggedIds(prev => new Set(prev).add(row.id));
    setLoggedSeconds(prev => prev + row.duration);

    // Record task usage
    if (ticket) {
      recordTaskUsage(row.selectedTicket, ticket.name, row.activityTitle, undefined);
    }

    // Refresh Tempo worklogs to show updated data
    await fetchWorklogs();
  };

  // Handle batch logging from table view
  const handleTableLogAll = async (rows: TimesheetRow[]) => {
    for (const row of rows) {
      await handleTableLog(row);
    }
  };

  // Handle editing worklog time in Tempo
  const handleEditWorklog = async (worklog: TempoWorklogData, newTimeSeconds: number) => {
    const response = await fetch(`/timetracker/api/tempo/worklogs/${worklog.tempoWorklogId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        issueKey: worklog.issue.key,
        timeSpentSeconds: newTimeSeconds,
        startDate: worklog.startDate,
        startTime: worklog.startTime,
        description: worklog.description,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Błąd aktualizacji' }));
      throw new Error(errorData.error || 'Błąd aktualizacji workloga');
    }

    // Refresh worklogs to show updated data
    await fetchWorklogs();
  };

  // Handle deleting worklog from Tempo
  const handleDeleteWorklog = async (worklogId: number) => {
    const response = await fetch(`/timetracker/api/tempo/worklogs/${worklogId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Błąd usuwania' }));
      throw new Error(errorData.error || 'Błąd usuwania workloga');
    }

    // Refresh worklogs to show updated data
    await fetchWorklogs();
  };

  useEffect(() => {
    fetchActivities();
    fetchWorklogs();
  }, [fetchActivities, fetchWorklogs]);

  // Persist loggedIds to localStorage przy każdej zmianie
  useEffect(() => {
    if (loggedIds.size > 0) {
      localStorage.setItem(`loggedIds-${dateStr}`, JSON.stringify([...loggedIds]));
    }
  }, [loggedIds, dateStr]);

  // Restore loggedIds from localStorage przy zmianie daty
  useEffect(() => {
    const saved = localStorage.getItem(`loggedIds-${dateStr}`);
    if (saved) {
      try {
        setLoggedIds(new Set(JSON.parse(saved)));
      } catch {
        setLoggedIds(new Set());
      }
    } else {
      setLoggedIds(new Set());
    }
  }, [dateStr]);

  // Rekonstruuj loggedIds z worklogów Tempo (match po czasie)
  useEffect(() => {
    if (tempoWorklogs.length === 0 || activities.length === 0) return;

    // Znajdź aktywności które pokrywają się czasowo z worklogami w Tempo
    const reconstructedIds = new Set<string>();

    tempoWorklogs.forEach(worklog => {
      // Parse worklog time
      const wStartParts = worklog.startTime.split(':').map(Number);
      const wStartMinutes = (wStartParts[0] || 0) * 60 + (wStartParts[1] || 0);
      const wDurationMinutes = Math.ceil(worklog.timeSpentSeconds / 60);
      const wEndMinutes = wStartMinutes + wDurationMinutes;

      // Szukaj aktywności która się pokrywa czasowo
      activities.forEach(activity => {
        if (!activity.firstSeen || !activity.lastSeen) return;

        const aStart = new Date(activity.firstSeen);
        const aEnd = new Date(activity.lastSeen);
        const aStartMinutes = aStart.getHours() * 60 + aStart.getMinutes();
        const aEndMinutes = aEnd.getHours() * 60 + aEnd.getMinutes();

        // Sprawdź overlap (nie (wEnd <= aStart || wStart >= aEnd))
        const overlaps = !(wEndMinutes <= aStartMinutes || wStartMinutes >= aEndMinutes);

        // Dodatkowo sprawdź czy opis zawiera tytuł aktywności lub ID
        const descMatch =
          worklog.description?.includes(activity.id) ||
          worklog.description?.toLowerCase().includes(activity.title?.toLowerCase() || '');

        if (overlaps || descMatch) {
          reconstructedIds.add(activity.id);
        }
      });
    });

    // Merge z istniejącymi loggedIds (nie nadpisuj tych zalogowanych w tej sesji)
    if (reconstructedIds.size > 0) {
      setLoggedIds(prev => {
        const merged = new Set(prev);
        reconstructedIds.forEach(id => merged.add(id));
        return merged;
      });
    }
  }, [tempoWorklogs, activities]);

  // Filter activities based on showPrivate toggle
  // Filter activities by privacy, minimum duration, and text search
  const filteredActivities = activities
    .filter(a => showPrivate || !a.isPrivate)
    .filter(a => a.totalSeconds >= minDurationFilter)
    .filter(a => {
      if (!activityFilter.trim()) return true;
      const query = activityFilter.toLowerCase();
      return (
        a.app?.toLowerCase().includes(query) ||
        a.title?.toLowerCase().includes(query) ||
        a.suggestedTicket?.toLowerCase().includes(query)
      );
    });

  const privateCount = activities.filter(a => a.isPrivate).length;
  const unloggedSeconds = (summary?.totalSeconds || 0) - loggedSeconds;
  const unloggedCount = filteredActivities.filter(a => !loggedIds.has(a.id)).length;

  return (
    <div className="max-w-4xl space-y-6 lg:max-w-6xl xl:max-w-7xl 2xl:max-w-full">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Timesheet</h1>
        <p className="text-slate-500 dark:text-slate-400">ActivityWatch to Tempo Logger</p>
      </div>

      {/* Date picker + Comparison Summary */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Data z nawigacją */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">📅 Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {/* Nawigacja prev/next */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => changeDay(-1)}
                title="Poprzedni dzień"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="flex-1 justify-center text-sm font-bold">
                    {format(date, 'EEEE, d MMM', { locale: pl })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={d => d && setDate(d)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => changeDay(1)}
                title="Następny dzień"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Przycisk "Dziś" */}
            {!isSameDay(date, new Date()) && (
              <Button variant="ghost" size="sm" className="w-full text-xs" onClick={goToToday}>
                Dziś
              </Button>
            )}
          </CardContent>
        </Card>

        {/* ActivityWatch */}
        <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-600">🔵 ActivityWatch</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">{summary?.totalFormatted || '-'}</div>
            <div className="text-xs text-blue-600">{summary?.activitiesCount || 0} aktywności</div>
          </CardContent>
        </Card>

        {/* Tempo */}
        <Card className="border-green-200 bg-green-50/50 dark:bg-green-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">✅ Tempo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">
              {Math.floor(loggedSeconds / 3600)}h {Math.floor((loggedSeconds % 3600) / 60)}m
            </div>
            <div className="text-xs text-green-600">{tempoWorklogs.length} worklogów</div>
          </CardContent>
        </Card>

        {/* Różnica */}
        <Card
          className={`border-2 ${unloggedSeconds > 0 ? 'border-orange-300 bg-orange-50/50 dark:bg-orange-950/20' : 'border-green-300 bg-green-50/50'}`}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">📊 Różnica</CardTitle>
          </CardHeader>
          <CardContent>
            {unloggedSeconds > 0 ? (
              <>
                <div className="text-2xl font-bold text-orange-600">
                  -{Math.floor(unloggedSeconds / 3600)}h {Math.floor((unloggedSeconds % 3600) / 60)}
                  m
                </div>
                <div className="text-xs text-orange-600">{unloggedCount} do zalogowania</div>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-green-600">✓ Komplet</div>
                <div className="text-xs text-green-600">Wszystko zalogowane</div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Day Progress Bar */}
      {summary && (
        <div className="mb-6">
          <DayProgressBar
            awMinutes={Math.round((summary.totalSeconds || 0) / 60)}
            tempoMinutes={Math.round(loggedSeconds / 60)}
          />
        </div>
      )}

      {/* Jira tickets & Search */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/* Pobierz taski z Jira */}
        <Button
          onClick={loadAllTickets}
          disabled={loadingAllTickets}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {loadingAllTickets ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Pobieram taski...
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Pobierz taski z Jira ({tickets.length})
            </>
          )}
        </Button>

        {/* Filter dropdown */}
        <Select value={issueFilter} onValueChange={v => setIssueFilter(v as typeof issueFilter)}>
          <SelectTrigger className="w-[160px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Filtr" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie</SelectItem>
            <SelectItem value="in_progress">W realizacji</SelectItem>
            <SelectItem value="assigned">Przypisane do mnie</SelectItem>
            <SelectItem value="recent">Ostatnio logowane</SelectItem>
          </SelectContent>
        </Select>

        {/* Search input */}
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
          <Input
            placeholder="Szukaj tasków Jira..."
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              searchTickets(e.target.value);
            }}
            className="pl-10"
          />
        </div>

        {/* AW Status indicator */}
        <Badge
          variant={
            awStatus === 'connected'
              ? 'default'
              : awStatus === 'error'
                ? 'destructive'
                : 'secondary'
          }
          className="ml-auto"
        >
          {awStatus === 'connected' ? '🟢 AW' : awStatus === 'error' ? '🔴 AW' : '⏳ AW'}
        </Badge>
      </div>

      {/* Actions */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button onClick={refreshAll} disabled={refreshingAll || loading} variant="outline">
          {refreshingAll ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Odświeżam...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Odśwież
            </>
          )}
        </Button>

        {/* Auto-assign tickets */}
        <Button
          onClick={autoAssignTickets}
          disabled={activities.length === 0}
          variant="outline"
          className="border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/30"
        >
          <Wand2 className="mr-2 h-4 w-4" />
          Auto-przypisz
        </Button>

        {/* Batch auto-assign from Jan 12 */}
        <Button
          onClick={batchAutoAssign}
          disabled={batchAssigning}
          variant="outline"
          className="border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-400 dark:hover:bg-purple-900/30"
        >
          {batchAssigning ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Przetwarzam...
            </>
          ) : (
            <>
              <Wand2 className="mr-2 h-4 w-4" />
              Auto-przypisz
            </>
          )}
        </Button>

        <Button
          onClick={suggestAll}
          disabled={suggestingAll || activities.length === 0}
          variant="outline"
        >
          {suggestingAll ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analizowanie...
            </>
          ) : (
            '🤖 Sugeruj (LLM)'
          )}
        </Button>
        <Button
          onClick={handleLogAll}
          disabled={unloggedCount === 0}
          className="bg-green-600 hover:bg-green-700"
        >
          ✅ Zaloguj wszystkie ({unloggedCount})
        </Button>

        {/* Merge mode toggle */}
        <Button
          variant={selectionMode ? 'default' : 'outline'}
          onClick={toggleSelectionMode}
          className={selectionMode ? 'bg-blue-600 hover:bg-blue-700' : ''}
        >
          {selectionMode ? (
            <>
              <X className="mr-1 h-4 w-4" />
              Anuluj
            </>
          ) : (
            <>
              <GitMerge className="mr-1 h-4 w-4" />
              Scal
            </>
          )}
        </Button>

        {/* Merge selected button (visible when activities selected) */}
        {selectionMode && selectedIds.size >= 2 && (
          <Button
            onClick={() => setMergeDialogOpen(true)}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <GitMerge className="mr-1 h-4 w-4" />
            Scal zaznaczone ({selectedIds.size})
          </Button>
        )}

        {/* Private activities toggle */}
        <div className="ml-auto flex items-center gap-2 border-l pl-4">
          <Switch id="show-private" checked={showPrivate} onCheckedChange={setShowPrivate} />
          <Label
            htmlFor="show-private"
            className="flex cursor-pointer items-center gap-1 text-sm text-gray-600 dark:text-gray-400"
          >
            {showPrivate ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            {showPrivate ? 'Prywatne widoczne' : 'Prywatne ukryte'}
            {privateCount > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                🔒 {privateCount}
              </Badge>
            )}
          </Label>
        </div>
      </div>

      {/* Top apps */}
      {summary?.topApps && summary.topApps.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {summary.topApps.map(app => (
            <Badge key={app.app} variant="secondary" className="text-xs">
              {app.app}: {app.formatted}
            </Badge>
          ))}
        </div>
      )}

      {/* Week navigation strip */}
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-50 p-1 dark:bg-slate-800/50">
        {weekDays.map(day => (
          <button
            key={day.dateStr}
            onClick={() => setDate(day.date)}
            className={cn(
              'flex-1 rounded-md px-1 py-2 text-center text-sm transition-colors',
              day.isSelected
                ? 'bg-blue-600 text-white shadow-sm'
                : day.isToday
                  ? 'bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50'
                  : 'hover:bg-white dark:hover:bg-slate-700',
              day.isWeekend && !day.isSelected && 'text-gray-400'
            )}
          >
            <div className="text-xs font-medium uppercase">{day.dayName}</div>
            <div
              className={cn('text-lg font-bold', day.isToday && !day.isSelected && 'text-blue-600')}
            >
              {day.dayNum}
            </div>
          </button>
        ))}
      </div>

      {/* Tempo worklogs section */}
      {tempoWorklogs.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
            Zalogowane w Tempo ({tempoWorklogs.length})
            <Badge variant="outline" className="ml-auto text-green-700 dark:text-green-400">
              {Math.floor(loggedSeconds / 3600)}h {Math.floor((loggedSeconds % 3600) / 60)}m
            </Badge>
          </h3>
          <div className="space-y-1">
            {tempoWorklogs.map(w => (
              <div
                key={w.tempoWorklogId}
                className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-2 dark:border-green-800 dark:bg-green-900/20"
              >
                <Badge className="shrink-0 bg-green-600 text-white">{w.issue.key}</Badge>
                <span className="flex-1 truncate text-sm text-gray-700 dark:text-gray-300">
                  {w.description || '—'}
                </span>
                <span className="shrink-0 font-mono text-xs text-gray-500">
                  {w.startTime?.substring(0, 5)}
                </span>
                <Badge variant="outline" className="shrink-0">
                  {Math.floor(w.timeSpentSeconds / 3600) > 0
                    ? `${Math.floor(w.timeSpentSeconds / 3600)}h ${Math.floor((w.timeSpentSeconds % 3600) / 60)}m`
                    : `${Math.round(w.timeSpentSeconds / 60)}m`}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View mode tabs + duration filter */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'cards' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => handleViewModeChange('cards')}
            className="gap-2"
          >
            <LayoutGrid className="h-4 w-4" />
            Karty
          </Button>
          <Button
            variant={viewMode === 'table' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => handleViewModeChange('table')}
            className="gap-2"
          >
            <Table2 className="h-4 w-4" />
            Tabela
          </Button>
        </div>

        {/* Activity text filter */}
        <div className="flex max-w-xs flex-1 items-center gap-2">
          <div className="relative flex-1">
            <Search className="text-muted-foreground absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
            <Input
              placeholder="Filtruj po opisie..."
              value={activityFilter}
              onChange={e => setActivityFilter(e.target.value)}
              className="h-8 pl-7 pr-7 text-xs"
            />
            {activityFilter && (
              <button
                onClick={() => setActivityFilter('')}
                className="text-muted-foreground hover:text-foreground absolute right-2 top-1/2 -translate-y-1/2"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Min duration filter */}
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Min. czas:</span>
          <Select
            value={minDurationFilter.toString()}
            onValueChange={v => setMinDurationFilter(parseInt(v))}
          >
            <SelectTrigger className="h-8 w-[100px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Wszystkie</SelectItem>
              <SelectItem value="60">≥1 min</SelectItem>
              <SelectItem value="120">≥2 min</SelectItem>
              <SelectItem value="300">≥5 min</SelectItem>
              <SelectItem value="600">≥10 min</SelectItem>
            </SelectContent>
          </Select>
          {(minDurationFilter > 0 || activityFilter) && (
            <Badge variant="secondary" className="text-xs">
              {activities.length - filteredActivities.length} ukryte
            </Badge>
          )}
        </div>
      </div>

      {/* Activities list */}
      <div className="space-y-2">
        {loading ? (
          <Card>
            <CardContent className="p-8 text-center text-gray-500">
              <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin" />
              Ładowanie aktywności z ActivityWatch...
            </CardContent>
          </Card>
        ) : filteredActivities.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-gray-500">
              {activities.length > 0 && !showPrivate ? (
                <>
                  Wszystkie aktywności są prywatne ({privateCount}).
                  <Button
                    variant="link"
                    onClick={() => setShowPrivate(true)}
                    className="ml-1 h-auto p-0"
                  >
                    Pokaż prywatne
                  </Button>
                </>
              ) : (
                'Brak aktywności dla wybranej daty'
              )}
            </CardContent>
          </Card>
        ) : viewMode === 'table' ? (
          <TimesheetTable
            activities={filteredActivities}
            tickets={tickets}
            loggedIds={loggedIds}
            dateStr={dateStr}
            tempoWorklogs={tempoWorklogs}
            onLog={handleTableLog}
            onLogAll={handleTableLogAll}
            onRefresh={refreshAll}
            isRefreshing={refreshingAll}
            onTicketChange={handleTicketChange}
            onEditWorklog={handleEditWorklog}
            onDeleteWorklog={handleDeleteWorklog}
          />
        ) : (
          filteredActivities.map(activity => (
            <ActivityCard
              key={activity.id}
              activity={activity}
              tickets={tickets}
              onLog={handleLog}
              onLogWithDetails={handleLogWithDetails}
              onSplit={handleOpenSplit}
              isLogging={loggingIds.has(activity.id)}
              isLogged={loggedIds.has(activity.id)}
              selectionMode={selectionMode}
              isSelected={selectedIds.has(activity.id)}
              onSelectionChange={handleSelectionChange}
            />
          ))
        )}
      </div>

      {/* Worklog Form Dialog */}
      {dialogActivity && (
        <WorklogFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          activity={dialogActivity}
          tickets={tickets}
          defaultTicket={dialogActivity.suggestedTicket}
          date={dateStr}
          onSubmit={handleDialogSubmit}
        />
      )}

      {/* Merge Dialog */}
      <MergeDialog
        open={mergeDialogOpen}
        onOpenChange={setMergeDialogOpen}
        activities={activities.filter(a => selectedIds.has(a.id))}
        tickets={tickets}
        onMerge={handleMerge}
      />

      {/* Split Dialog */}
      {splitActivity && (
        <SplitDialog
          open={splitDialogOpen}
          onOpenChange={setSplitDialogOpen}
          activity={splitActivity}
          tickets={tickets}
          date={dateStr}
          onSplit={handleSplit}
        />
      )}

      {/* Quick Merge Floating Bar */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="animate-in slide-in-from-bottom-4 fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-xl border-2 border-blue-200 bg-white p-4 shadow-2xl dark:border-blue-800 dark:bg-slate-900">
          {/* Selected count and duration */}
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
              {selectedIds.size} aktywności
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {(() => {
                const totalSec = activities
                  .filter(a => selectedIds.has(a.id))
                  .reduce((sum, a) => sum + a.totalSeconds, 0);
                const hours = Math.floor(totalSec / 3600);
                const mins = Math.floor((totalSec % 3600) / 60);
                return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
              })()}
            </span>
          </div>

          {/* Ticket selector */}
          <div className="min-w-[200px] flex-1">
            <TicketCombobox
              tickets={tickets}
              value={quickMergeTicket}
              onValueChange={setQuickMergeTicket}
              placeholder="Wybierz ticket..."
              size="md"
              enableApiSearch={true}
              worklogsByTicket={worklogsByTicket}
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              onClick={handleQuickMerge}
              disabled={!quickMergeTicket || quickMerging}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              {quickMerging ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  Loguję...
                </>
              ) : (
                <>✅ Zaloguj razem</>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={() => setMergeDialogOpen(true)}
              title="Otwórz szczegóły scalania"
            >
              <GitMerge className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setSelectionMode(false);
                setSelectedIds(new Set());
                setQuickMergeTicket(null);
              }}
              title="Anuluj"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
