'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Sparkles, Clock } from 'lucide-react';
import type { Activity, Ticket } from './ActivityCard';
import type { TempoAttribute, WorkAttribute } from '@/lib/tempo';

export interface WorklogFormData {
  ticketKey: string;
  description: string;
  startTime: string;
  endTime: string;
  timeSpentSeconds: number;
  isBillable: boolean;
  billableSeconds?: number;
  attributes: TempoAttribute[];
}

interface OverlapWarning {
  issueKey: string;
  startTime: string;
  endTime: string;
  description?: string;
}

interface WorklogFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity?: Activity; // Optional - undefined when adding new worklog manually
  tickets: Ticket[];
  defaultTicket?: string;
  date: string; // YYYY-MM-DD
  onSubmit: (data: WorklogFormData) => Promise<void>;
}

export function WorklogFormDialog({
  open,
  onOpenChange,
  activity,
  tickets,
  defaultTicket,
  date,
  onSubmit,
}: WorklogFormDialogProps) {
  const [ticketKey, setTicketKey] = useState(defaultTicket || tickets[0]?.key || '');
  const [description, setDescription] = useState(activity ? `${activity.title} (via TimeTracker)` : '');
  const [isBillable, setIsBillable] = useState(true);
  const [attributes, setAttributes] = useState<TempoAttribute[]>([]);
  const [workAttributes, setWorkAttributes] = useState<WorkAttribute[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Time inputs
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');

  // Overlap warnings
  const [overlapWarnings, setOverlapWarnings] = useState<OverlapWarning[]>([]);
  const [checkingOverlap, setCheckingOverlap] = useState(false);

  // LLM suggestion
  const [suggestingLLM, setSuggestingLLM] = useState(false);

  // Calculate time from firstSeen/lastSeen or use defaults
  const calculateInitialTimes = useCallback(() => {
    if (!activity) {
      // No activity - default to 1 hour starting at 9:00
      return { start: '09:00', end: '10:00' };
    }
    if (activity.firstSeen && activity.lastSeen) {
      const first = new Date(activity.firstSeen);
      const last = new Date(activity.lastSeen);
      return {
        start: `${first.getHours().toString().padStart(2, '0')}:${first.getMinutes().toString().padStart(2, '0')}`,
        end: `${last.getHours().toString().padStart(2, '0')}:${last.getMinutes().toString().padStart(2, '0')}`
      };
    }
    // Default: calculate from duration
    const durationMinutes = Math.ceil(activity.totalSeconds / 60);
    return {
      start: '09:00',
      end: formatMinutesToTime(9 * 60 + durationMinutes)
    };
  }, [activity]);

  // Fetch available Tempo work attributes
  useEffect(() => {
    const fetchAttributes = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/tempo/attributes');
        const data = await res.json();
        setWorkAttributes(data.attributes || []);
      } catch (error) {
        console.error('Error fetching attributes:', error);
      }
      setLoading(false);
    };

    if (open) {
      fetchAttributes();
    }
  }, [open]);

  // Reset form when activity changes
  useEffect(() => {
    setTicketKey(defaultTicket || activity?.suggestedTicket || tickets[0]?.key || '');
    setDescription(activity ? `${activity.title} (via TimeTracker)` : '');
    setIsBillable(true);
    setAttributes([]);
    setOverlapWarnings([]);

    const times = calculateInitialTimes();
    setStartTime(times.start);
    setEndTime(times.end);
  }, [activity, defaultTicket, tickets, calculateInitialTimes]);

  // Auto-fill with LLM when dialog opens (if activity exists and not private)
  useEffect(() => {
    if (open && activity && !activity.isPrivate && workAttributes.length > 0) {
      // Small delay to let user see the dialog first
      const timeout = setTimeout(() => {
        handleAutoFill();
      }, 500);
      return () => clearTimeout(timeout);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activity, workAttributes.length]);

  // Check overlap when times change
  useEffect(() => {
    const checkOverlap = async () => {
      if (!open || !startTime || !endTime) return;

      setCheckingOverlap(true);
      try {
        const res = await fetch('/api/tempo/check-overlap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, startTime, endTime })
        });
        const data = await res.json();
        setOverlapWarnings(data.conflictingWorklogs || []);
      } catch (error) {
        console.error('Error checking overlap:', error);
      }
      setCheckingOverlap(false);
    };

    const timeout = setTimeout(checkOverlap, 300);
    return () => clearTimeout(timeout);
  }, [open, date, startTime, endTime]);

  const handleAttributeChange = (key: string, value: string) => {
    setAttributes((prev) => {
      const existing = prev.findIndex((a) => a.key === key);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { key, value };
        return updated;
      }
      return [...prev, { key, value }];
    });
  };

  const getAttributeValue = (key: string): string => {
    return attributes.find((a) => a.key === key)?.value || '';
  };

  // Calculate duration from times
  const calculateDurationSeconds = (): number => {
    const startMinutes = parseTimeToMinutes(startTime);
    const endMinutes = parseTimeToMinutes(endTime);
    return Math.max(0, (endMinutes - startMinutes) * 60);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const timeSpentSeconds = calculateDurationSeconds();
      await onSubmit({
        ticketKey,
        description,
        startTime,
        endTime,
        timeSpentSeconds,
        isBillable,
        billableSeconds: isBillable ? timeSpentSeconds : 0,
        attributes: attributes.filter((a) => a.value), // Only non-empty
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Error submitting worklog:', error);
    }
    setSubmitting(false);
  };

  // LLM Auto-fill
  const handleAutoFill = async () => {
    if (!activity) return; // Can't auto-fill without activity context

    setSuggestingLLM(true);
    try {
      // Get action types from workAttributes
      const actionTypeAttr = workAttributes.find(a => a.key === '_Actiontype_');
      const tempoActionTypes = actionTypeAttr?.values?.map(v => ({
        value: v.value,
        name: v.name
      })) || [];

      const res = await fetch('/api/llm/suggest-worklog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity: {
            title: activity.title,
            app: activity.app,
            project: activity.project,
            duration: activity.totalSeconds,
            category: activity.category,
            isTerminal: activity.isTerminal,
            workingDir: activity.workingDir,
            gitBranch: activity.gitBranch,
            isMeeting: activity.isMeeting,
            meetingPlatform: activity.meetingPlatform,
            isCommunication: activity.isCommunication,
            channel: activity.channel
          },
          availableTickets: tickets.map(t => ({ key: t.key, name: t.name })),
          tempoActionTypes
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.suggestedTicket) {
          setTicketKey(data.suggestedTicket);
        }
        if (data.description) {
          setDescription(data.description);
        }
        if (data.actionType) {
          handleAttributeChange('_Actiontype_', data.actionType);
        }
      }
    } catch (error) {
      console.error('Error getting LLM suggestion:', error);
    }
    setSuggestingLLM(false);
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  // Helper functions for time
  function parseTimeToMinutes(time: string): number {
    const parts = time.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }

  function formatMinutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  const calculatedDuration = calculateDurationSeconds();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Log Time
            <Badge className="bg-blue-100 text-blue-700">
              {formatDuration(calculatedDuration)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Private activity warning */}
          {activity?.isPrivate && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium">To jest prywatna aktywność</span>
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                Ta aktywność została oznaczona jako prywatna. Upewnij się, że chcesz ją zalogować do Tempo.
              </p>
            </div>
          )}

          {/* Activity info - only show when activity is provided */}
          {activity ? (
            <div className={`rounded-lg p-3 ${activity.isPrivate ? 'bg-amber-50/50 dark:bg-amber-900/10 border border-dashed border-amber-300' : 'bg-slate-50 dark:bg-slate-800/50'}`}>
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <span className="font-medium">{activity.app}</span>
                {activity.project && (
                  <Badge variant="secondary" className="text-xs">
                    {activity.project}
                  </Badge>
                )}
                {activity.isPrivate && (
                  <Badge className="bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300 text-xs">
                    PRIV
                  </Badge>
                )}
              </div>
              <p className="text-sm mt-1 truncate" title={activity.title}>
                {activity.title}
              </p>
            </div>
          ) : (
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Nowy wpis czasu pracy
              </p>
            </div>
          )}

          {/* Time inputs */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Czas pracy
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-28"
              />
              <span className="text-slate-500">—</span>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-28"
              />
              <Badge variant="outline" className="ml-2">
                = {formatDuration(calculatedDuration)}
              </Badge>
            </div>
          </div>

          {/* Overlap warning */}
          {overlapWarnings.length > 0 && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm font-medium">
                <AlertTriangle className="h-4 w-4" />
                Nakładanie się czasów
              </div>
              <div className="mt-2 space-y-1">
                {overlapWarnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-600 dark:text-amber-500">
                    • {w.issueKey} ({w.startTime} - {w.endTime})
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Ticket selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Ticket</label>
            <Select value={ticketKey} onValueChange={setTicketKey}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz ticket" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {tickets.map((ticket) => (
                  <SelectItem key={ticket.key} value={ticket.key}>
                    {ticket.key} - {ticket.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Opis</label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleAutoFill}
                disabled={suggestingLLM || !activity}
                className="text-xs"
              >
                <Sparkles className="h-3 w-3 mr-1" />
                {suggestingLLM ? 'Generuję...' : 'Auto-uzupełnij'}
              </Button>
            </div>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Co robiłeś?"
              rows={3}
            />
          </div>

          {/* Billable toggle */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Billable</label>
            <Switch checked={isBillable} onCheckedChange={setIsBillable} />
          </div>

          {/* Dynamic Tempo attributes */}
          {loading ? (
            <div className="text-sm text-slate-500">Ładowanie atrybutów...</div>
          ) : workAttributes.length > 0 ? (
            <div className="space-y-3 border-t pt-4">
              <label className="text-sm font-medium text-slate-500">Atrybuty Tempo</label>
              {workAttributes.map((attr) => (
                <div key={attr.key} className="space-y-1">
                  <label className="text-sm">
                    {attr.name}
                    {attr.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  {attr.type === 'STATIC_LIST' && attr.values ? (
                    <Select
                      value={getAttributeValue(attr.key)}
                      onValueChange={(v) => handleAttributeChange(attr.key, v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={`Wybierz ${attr.name}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {attr.values.map((val) => (
                          <SelectItem key={val.value} value={val.value}>
                            {val.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : attr.type === 'CHECKBOX' ? (
                    <Switch
                      checked={getAttributeValue(attr.key) === 'true'}
                      onCheckedChange={(checked) =>
                        handleAttributeChange(attr.key, checked ? 'true' : 'false')
                      }
                    />
                  ) : (
                    <Input
                      value={getAttributeValue(attr.key)}
                      onChange={(e) => handleAttributeChange(attr.key, e.target.value)}
                      placeholder={attr.name}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !ticketKey}
            className={overlapWarnings.length > 0 ? 'bg-amber-600 hover:bg-amber-700' : ''}
          >
            {submitting ? 'Logowanie...' : overlapWarnings.length > 0 ? 'Zapisz mimo warning' : 'Zaloguj czas'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
