'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { ActivityCard, Activity, Ticket } from '@/components/ActivityCard';
import { WorklogFormDialog, WorklogFormData } from '@/components/WorklogFormDialog';
import { format } from 'date-fns';
import { Search, Download, Filter, Loader2, RefreshCw, Eye, EyeOff, GitMerge, X, LayoutGrid, Table2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { MergeDialog, SplitDialog } from '@/components/MergeSplitDialog';
import { TimesheetTable, TimesheetRow } from '@/components/TimesheetTable';
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
  getSmartSuggestions
} from '@/lib/taskHistory';
import { recordTimeLog, recordMerge, recordSplit } from '@/lib/auditTrail';

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
  const [issueFilter, setIssueFilter] = useState<'all' | 'in_progress' | 'assigned' | 'recent'>('all');
  const [awStatus, setAwStatus] = useState<'connected' | 'error' | 'checking'>('checking');
  const [showPrivate, setShowPrivate] = useState(true); // Show private activities by default
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

  const dateStr = format(date, 'yyyy-MM-dd');

  // Fetch activities from ActivityWatch
  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/activities?date=${dateStr}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: ApiResponse = await response.json();
      setActivities(data.activities);
      setSummary(data.summary);
      setAwStatus('connected');
      toast.success('Aktywności odświeżone', {
        description: `${data.activities.length} aktywności na ${dateStr}`
      });
    } catch (error) {
      setAwStatus('error');
      toast.error('Błąd pobierania aktywności', {
        description: error instanceof Error ? error.message : 'Sprawdź czy ActivityWatch jest uruchomiony'
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
      const worklogsRes = await fetch(`/api/tempo/worklogs?date=${dateStr}`);
      const worklogsData: WorklogResponse = await worklogsRes.json();
      setLoggedSeconds(worklogsData.totalSeconds);
      setTempoWorklogs(worklogsData.worklogs || []);

      // Fetch dynamic tickets from Jira with filter
      const filterParam = issueFilter !== 'all' ? `&filter=${issueFilter}` : '';
      const ticketsRes = await fetch(`/api/jira/my-issues?${filterParam}`);
      if (ticketsRes.ok) {
        const ticketsData = await ticketsRes.json();
        const jiraTickets: Ticket[] = ticketsData.issues?.map((i: { key: string; name: string; id?: string }) => ({
          key: i.key,
          name: i.name,
          id: i.id  // issueId for Tempo API v4
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
        description: error instanceof Error ? error.message : 'Sprawdź połączenie z Tempo'
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
        description: 'ActivityWatch i Tempo zaktualizowane'
      });
    } catch (error) {
      toast.error('Błąd odświeżania', {
        description: error instanceof Error ? error.message : 'Spróbuj ponownie'
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
      const res = await fetch(`/api/jira/my-issues?query=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        const searchResults: Ticket[] = data.issues?.map((i: { key: string; name: string }) => ({
          key: i.key,
          name: i.name
        })) || [];
        // Add search results to existing tickets (at the top)
        setTickets(prev => {
          const newTickets = searchResults.filter(s => !prev.some(p => p.key === s.key));
          return [...newTickets, ...prev];
        });
      }
    } catch (error) {
      toast.error('Błąd wyszukiwania', {
        description: error instanceof Error ? error.message : 'Spróbuj ponownie'
      });
    }
    setLoadingTickets(false);
  }, 300);

  // Load ALL tickets from all projects
  const loadAllTickets = async () => {
    setLoadingAllTickets(true);
    try {
      const res = await fetch('/api/jira/my-issues?loadAll=true&limit=300');
      if (res.ok) {
        const data = await res.json();
        const allTickets: Ticket[] = data.issues?.map((i: { key: string; name: string }) => ({
          key: i.key,
          name: i.name
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
        description: error instanceof Error ? error.message : 'Sprawdź połączenie z Jira'
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
      const response = await fetch('/api/llm/suggest', {
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
            terminalCommand: a.terminalCommand
          })),
          context: {
            recentTasks: recentTasks.map(t => ({
              key: t.key,
              name: t.name,
              useCount: t.useCount
            })),
            projectMappings: projectMappings.map(m => ({
              project: m.project,
              taskKey: m.taskKey,
              taskName: m.taskName,
              confidence: m.confidence
            }))
          },
          availableTickets: tickets.map(t => ({
            key: t.key,
            name: t.name
          }))
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.suggestions) {
        const suggestionCount = Object.keys(data.suggestions).length;
        setActivities(prev => prev.map(activity => {
          const suggestion = data.suggestions[activity.id];
          if (suggestion) {
            return {
              ...activity,
              suggestedTicket: suggestion.ticket,
              confidence: suggestion.confidence
            };
          }
          return activity;
        }));
        toast.success('Sugestie wygenerowane', {
          description: `LLM zasugerował tickety dla ${suggestionCount} aktywności`
        });
      }
    } catch (error) {
      toast.error('Błąd generowania sugestii', {
        description: error instanceof Error ? error.message : 'Problem z LLM API'
      });
    } finally {
      setSuggestingAll(false);
    }
  };

  // Apply smart suggestions from history (without LLM)
  const applyHistorySuggestions = () => {
    setActivities(prev => prev.map(activity => {
      const suggestions = getSmartSuggestions(activity.title, activity.project, 1);
      if (suggestions.length > 0) {
        return {
          ...activity,
          suggestedTicket: suggestions[0].taskKey,
          confidence: suggestions[0].confidence
        };
      }
      return activity;
    }));
  };

  // Log activity to Tempo (quick log)
  const handleLog = async (activityId: string, ticketKey: string) => {
    const activity = activities.find(a => a.id === activityId);
    if (!activity) return;

    // Validation: totalSeconds must be > 0
    if (!activity.totalSeconds || activity.totalSeconds <= 0) {
      toast.error('Nie można zalogować', {
        description: 'Czas aktywności musi być większy niż 0'
      });
      return;
    }

    // Validation: ticketKey must be provided
    if (!ticketKey) {
      toast.error('Nie można zalogować', {
        description: 'Wybierz ticket przed zalogowaniem'
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
      const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;

      // Check for overlap before logging
      const overlapRes = await fetch('/api/tempo/check-overlap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: dateStr,
          newStartTime: startTime.substring(0, 5),
          newEndTime: endTime
        })
      });

      if (overlapRes.ok) {
        const overlapData = await overlapRes.json();
        if (overlapData.hasOverlap) {
          const conflicts = overlapData.conflictingWorklogs
            .map((c: { issueKey: string; startTime: string; endTime: string }) => `${c.issueKey} (${c.startTime}-${c.endTime})`)
            .join(', ');
          toast.warning('Nakładający się czas!', {
            description: `Konflikt z: ${conflicts}. Użyj szczegółów aby zmienić czas.`,
            duration: 5000
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

      const response = await fetch('/api/tempo/worklogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueKey: ticketKey,
          issueId: selectedTicketData?.id ? parseInt(selectedTicketData.id, 10) : undefined,
          timeSpentSeconds: activity.totalSeconds,
          startDate: dateStr,
          startTime: startTime,
          description: `${activity.title} (via TimeTracker)`
        })
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
          description: `${ticketKey}: ${Math.round(activity.totalSeconds / 60)} min`
        });
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Nieznany błąd' }));
        toast.error('Błąd logowania czasu', {
          description: errorData.error || 'Nieznany błąd'
        });
      }
    } catch (error) {
      toast.error('Błąd logowania czasu', {
        description: error instanceof Error ? error.message : 'Sprawdź połączenie z Tempo'
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
      const response = await fetch('/api/tempo/worklogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueKey: data.ticketKey,
          timeSpentSeconds: data.timeSpentSeconds,
          startDate: dateStr,
          startTime: `${data.startTime}:00`,
          description: data.description,
          billableSeconds: data.billableSeconds,
          attributes: data.attributes
        })
      });

      if (response.ok) {
        setLoggedIds(prev => new Set(prev).add(dialogActivity.id));
        setLoggedSeconds(prev => prev + data.timeSpentSeconds);

        // Record task usage for history
        const ticket = tickets.find(t => t.key === data.ticketKey);
        recordTaskUsage(data.ticketKey, ticket?.name || data.ticketKey, dialogActivity.title, dialogActivity.project);

        setDialogOpen(false);
        setDialogActivity(null);

        toast.success('Czas zalogowany', {
          description: `${data.ticketKey}: ${Math.round(data.timeSpentSeconds / 60)} min`
        });
      } else {
        const errorData = await response.json();
        toast.error('Błąd logowania czasu', {
          description: errorData.error || 'Nieznany błąd'
        });
      }
    } catch (error) {
      toast.error('Błąd logowania czasu', {
        description: error instanceof Error ? error.message : 'Sprawdź połączenie z Tempo'
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
        (a.firstSeen && (!earliest.firstSeen || a.firstSeen < earliest.firstSeen)) ? a : earliest
      );
      const startTime = earliestActivity.firstSeen ? earliestActivity.firstSeen.substring(11, 19) : '09:00:00';

      const response = await fetch('/api/tempo/worklogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueKey: data.ticketKey,
          timeSpentSeconds: data.totalSeconds,
          startDate: dateStr,
          startTime: startTime,
          description: `${data.description} (merged ${data.activities.length} activities via TimeTracker)`
        })
      });

      if (response.ok) {
        // Mark all merged activities as logged
        data.activities.forEach(a => {
          setLoggedIds(prev => new Set(prev).add(a.id));
        });
        setLoggedSeconds(prev => prev + data.totalSeconds);

        // Record task usage
        const ticket = tickets.find(t => t.key === data.ticketKey);
        recordTaskUsage(data.ticketKey, ticket?.name || data.ticketKey, data.description, earliestActivity.project);

        // Record to audit trail
        recordMerge(
          data.activities.map(a => ({ title: a.title, app: a.app, totalSeconds: a.totalSeconds })),
          data.ticketKey,
          data.totalSeconds
        );

        toast.success('Aktywności scalone', {
          description: `${data.ticketKey}: ${Math.round(data.totalSeconds / 60)} min (${data.activities.length} połączonych)`
        });

        // Exit selection mode
        setSelectionMode(false);
        setSelectedIds(new Set());
      } else {
        const errorData = await response.json();
        toast.error('Błąd scalania', {
          description: errorData.error || 'Nieznany błąd'
        });
      }
    } catch (error) {
      toast.error('Błąd scalania', {
        description: error instanceof Error ? error.message : 'Sprawdź połączenie'
      });
    }
  };

  // Handle split submission
  const handleSplit = async (parts: Array<{
    ticketKey: string;
    description: string;
    seconds: number;
    startTime: string;
  }>) => {
    if (!splitActivity) return;

    let allSuccess = true;
    let totalLogged = 0;

    for (const part of parts) {
      try {
        const response = await fetch('/api/tempo/worklogs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            issueKey: part.ticketKey,
            timeSpentSeconds: part.seconds,
            startDate: dateStr,
            startTime: `${part.startTime}:00`,
            description: `${part.description} (split via TimeTracker)`
          })
        });

        if (response.ok) {
          totalLogged += part.seconds;
          // Record task usage
          const ticket = tickets.find(t => t.key === part.ticketKey);
          recordTaskUsage(part.ticketKey, ticket?.name || part.ticketKey, part.description, splitActivity.project);
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
        description: `${parts.length} części, łącznie ${Math.round(totalLogged / 60)} min`
      });
    } else {
      toast.warning('Częściowy sukces', {
        description: 'Niektóre części nie zostały zalogowane'
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

  // View mode change with localStorage persistence
  const handleViewModeChange = (mode: 'cards' | 'table') => {
    setViewMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('timesheet-view-mode', mode);
    }
  };

  // Handle logging from table view
  const handleTableLog = async (row: TimesheetRow) => {
    if (!row.selectedTicket) {
      throw new Error('Brak przypisanego ticketa');
    }

    // Get issue ID from tickets
    const ticket = tickets.find(t => t.key === row.selectedTicket);

    const response = await fetch('/api/tempo/worklogs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        issueKey: row.selectedTicket,
        timeSpentSeconds: row.duration,
        startDate: dateStr,
        startTime: `${row.startTime}:00`,
        description: row.description || `Logged via TimeTracker`,
      })
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
        const descMatch = worklog.description?.includes(activity.id) ||
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
  const filteredActivities = showPrivate
    ? activities
    : activities.filter(a => !a.isPrivate);

  const privateCount = activities.filter(a => a.isPrivate).length;
  const unloggedSeconds = (summary?.totalSeconds || 0) - loggedSeconds;
  const unloggedCount = filteredActivities.filter(a => !loggedIds.has(a.id)).length;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Timesheet</h1>
        <p className="text-slate-500 dark:text-slate-400">ActivityWatch to Tempo Logger</p>
      </div>

      {/* Date picker + Comparison Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {/* Data */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">📅 Data</CardTitle>
            </CardHeader>
            <CardContent>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-bold">
                    {format(date, 'dd.MM.yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => d && setDate(d)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
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
          <Card className={`border-2 ${unloggedSeconds > 0 ? 'border-orange-300 bg-orange-50/50 dark:bg-orange-950/20' : 'border-green-300 bg-green-50/50'}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">📊 Różnica</CardTitle>
            </CardHeader>
            <CardContent>
              {unloggedSeconds > 0 ? (
                <>
                  <div className="text-2xl font-bold text-orange-600">
                    -{Math.floor(unloggedSeconds / 3600)}h {Math.floor((unloggedSeconds % 3600) / 60)}m
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

        {/* Search tickets & Filter */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {/* Filter dropdown */}
          <Select value={issueFilter} onValueChange={(v) => setIssueFilter(v as typeof issueFilter)}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filtr zadań" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie</SelectItem>
              <SelectItem value="in_progress">🔄 W realizacji</SelectItem>
              <SelectItem value="assigned">👤 Przypisane do mnie</SelectItem>
              <SelectItem value="recent">🕐 Ostatnio logowane</SelectItem>
            </SelectContent>
          </Select>

          {/* Search input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Szukaj tasków Jira (min. 2 znaki)..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                searchTickets(e.target.value);
              }}
              className="pl-10"
            />
          </div>

          {/* Load all button */}
          <Button
            variant="outline"
            onClick={loadAllTickets}
            disabled={loadingAllTickets}
            title="Załaduj wszystkie taski ze wszystkich projektów"
          >
            {loadingAllTickets ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Ładowanie...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-1" />
                Wszystkie ({tickets.length})
              </>
            )}
          </Button>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mb-4 flex-wrap items-center">
          {/* AW Status indicator */}
          <Badge
            variant={awStatus === 'connected' ? 'default' : awStatus === 'error' ? 'destructive' : 'secondary'}
            className="mr-2"
          >
            {awStatus === 'connected' ? '🟢 AW' :
             awStatus === 'error' ? '🔴 AW' : '⏳ AW'}
          </Badge>

          <Button onClick={fetchActivities} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Ładowanie...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Odśwież
              </>
            )}
          </Button>
          <Button onClick={applyHistorySuggestions} variant="outline" disabled={activities.length === 0}>
            📚 Sugestie z historii
          </Button>
          <Button onClick={suggestAll} disabled={suggestingAll || activities.length === 0} variant="outline">
            {suggestingAll ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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
                <X className="h-4 w-4 mr-1" />
                Anuluj
              </>
            ) : (
              <>
                <GitMerge className="h-4 w-4 mr-1" />
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
              <GitMerge className="h-4 w-4 mr-1" />
              Scal zaznaczone ({selectedIds.size})
            </Button>
          )}

          {/* Private activities toggle */}
          <div className="flex items-center gap-2 ml-auto border-l pl-4">
            <Switch
              id="show-private"
              checked={showPrivate}
              onCheckedChange={setShowPrivate}
            />
            <Label htmlFor="show-private" className="flex items-center gap-1 cursor-pointer text-sm text-gray-600 dark:text-gray-400">
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
          <div className="flex gap-2 mb-4 flex-wrap">
            {summary.topApps.map((app) => (
              <Badge key={app.app} variant="secondary" className="text-xs">
                {app.app}: {app.formatted}
              </Badge>
            ))}
          </div>
        )}

        {/* View mode tabs */}
        <div className="flex gap-2 mb-4 border-b pb-2">
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

        {/* Activities list */}
        <div className="space-y-2">
          {loading ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
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
                      className="p-0 h-auto ml-1"
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
            />
          ) : (
            filteredActivities.map((activity) => (
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
    </div>
  );
}
