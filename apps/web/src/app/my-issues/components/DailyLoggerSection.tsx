'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sparkles,
  Loader2,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  FileText,
  Wand2,
  History,
  Bell,
} from 'lucide-react';
import { getLoggingRules } from '@/lib/loggingRules';

interface JiraIssueItem {
  id: string;
  key: string;
  name: string;
  fullName: string;
  status: string;
  project: string;
  projectName: string;
  type: string;
  priority: string;
  assignee: string;
  isSubtask: boolean;
  parentKey: string | null;
  parentSummary: string | null;
  subtaskCount: number;
  subtasks: Array<{ key: string; summary: string; status: string; type: string }>;
  description: string;
  updated: string;
  created: string | null;
  duedate: string | null;
  timeoriginalestimate: number | null;
  timespent: number | null;
  labels: string[];
  components: string[];
  resolution: string | null;
  commentsCount: number;
  comments: Array<{ author: string; created: string; body: string }>;
}

interface ParsedEntry {
  startTime: string;
  endTime: string;
  durationMinutes: number;
  description: string;
  suggestedTicket: string;
  ticketConfidence: number;
  category: string;
  selected: boolean;
}

interface LogResult {
  index: number;
  success: boolean;
  message: string;
}

interface TempoWorklog {
  tempoWorklogId: number;
  issue: { key: string };
  timeSpentSeconds: number;
  startTime: string;
  description: string;
}

interface Props {
  issues: JiraIssueItem[];
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const CATEGORY_LABELS: Record<string, string> = {
  development: 'Dev',
  meeting: 'Meeting',
  research: 'Research',
  communication: 'Comm',
  infrastructure: 'Infra',
};

const CATEGORY_COLORS: Record<string, string> = {
  development: 'bg-blue-100 text-blue-800',
  meeting: 'bg-purple-100 text-purple-800',
  research: 'bg-yellow-100 text-yellow-800',
  communication: 'bg-green-100 text-green-800',
  infrastructure: 'bg-orange-100 text-orange-800',
};

export default function DailyLoggerSection({ issues }: Props) {
  const today = new Date().toISOString().split('T')[0];

  const [rawNotes, setRawNotes] = useState('');
  const [date, setDate] = useState(today);
  const [entries, setEntries] = useState<ParsedEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [logging, setLogging] = useState(false);
  const [logResults, setLogResults] = useState<LogResult[]>([]);
  const [alreadyLogged, setAlreadyLogged] = useState<TempoWorklog[]>([]);
  const [alreadyLoggedTotal, setAlreadyLoggedTotal] = useState(0);
  const [startHour, setStartHour] = useState('08:00');
  const [endHour, setEndHour] = useState('16:00');
  const [generating, setGenerating] = useState(false);
  const [generateInfo, setGenerateInfo] = useState<{
    activitiesCount: number;
    totalMinutes: number;
  } | null>(null);

  // Step 3 states
  const [suggestingAI, setSuggestingAI] = useState(false);
  const [suggestingHistory, setSuggestingHistory] = useState(false);
  const [suggestStatus, setSuggestStatus] = useState('');

  // Fetch existing worklogs for date
  const fetchExistingWorklogs = useCallback(async (d: string) => {
    try {
      const res = await fetch(`/timetracker/api/tempo/worklogs?date=${d}`);
      if (res.ok) {
        const data = await res.json();
        setAlreadyLogged(data.worklogs || []);
        setAlreadyLoggedTotal(data.totalSeconds || 0);
      }
    } catch {
      // ignore
    }
  }, []);

  // Step 1: Generate note from ActivityWatch data
  const handleGenerateNote = async () => {
    setGenerating(true);
    setGenerateInfo(null);

    try {
      const rules = getLoggingRules();
      const res = await fetch('/timetracker/api/llm/generate-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          startHour,
          endHour,
          minActivityDurationSeconds: rules.minActivityDurationMinutes * 60,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const note = data.note || '';

        if (note) {
          setRawNotes(prev => (prev.trim() ? prev.trim() + '\n\n' + note : note));
          setGenerateInfo({
            activitiesCount: data.activitiesCount,
            totalMinutes: data.totalMinutes,
          });
        } else {
          alert(data.message || 'Brak aktywnosci w podanym zakresie');
        }
      } else {
        const err = await res.json();
        alert(`Blad: ${err.error || 'Nie udalo sie wygenerowac notatki'}`);
      }
    } catch (error) {
      alert(`Blad: ${error instanceof Error ? error.message : 'Nieznany blad'}`);
    }

    setGenerating(false);
  };

  // Step 2: Parse notes WITHOUT ticket matching
  const handleParse = async () => {
    if (!rawNotes.trim()) return;
    setLoading(true);
    setEntries([]);
    setLogResults([]);
    setSuggestStatus('');

    await fetchExistingWorklogs(date);

    try {
      const res = await fetch('/timetracker/api/llm/parse-daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawNotes,
          date,
          availableTickets: issues.map(i => ({ key: i.key, name: i.name, project: i.project })),
          skipTicketMatching: true,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const parsed = (data.entries || []).map((e: Omit<ParsedEntry, 'selected'>) => ({
          ...e,
          selected: true, // select all by default since no tickets yet
        }));
        setEntries(parsed);
      } else {
        const err = await res.json();
        alert(`Blad parsowania: ${err.error || 'Unknown error'}`);
      }
    } catch (error) {
      alert(`Blad: ${error instanceof Error ? error.message : 'Nieznany blad'}`);
    }

    setLoading(false);
  };

  // Step 3a: Suggest tickets via AI
  const handleSuggestByAI = async () => {
    if (entries.length === 0) return;
    setSuggestingAI(true);
    setSuggestStatus('Dopasowywanie ticketow przez AI...');

    try {
      const availableTickets = issues.map(i => ({
        key: i.key,
        name: i.name,
        project: i.project,
      }));

      // Re-parse with ticket matching enabled using the original notes
      const res = await fetch('/timetracker/api/llm/parse-daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawNotes,
          date,
          availableTickets,
          skipTicketMatching: false,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const aiEntries: Array<Omit<ParsedEntry, 'selected'>> = data.entries || [];
        const usedFallback = data.usedFallback === true;

        // Merge AI suggestions into current entries
        let matchedCount = 0;
        setEntries(prev =>
          prev.map((entry, idx) => {
            const aiEntry = aiEntries[idx];
            if (aiEntry && aiEntry.suggestedTicket) {
              matchedCount++;
              return {
                ...entry,
                suggestedTicket: aiEntry.suggestedTicket,
                ticketConfidence: aiEntry.ticketConfidence,
                selected: true,
              };
            }
            return entry;
          })
        );

        if (usedFallback) {
          setSuggestStatus(
            matchedCount > 0
              ? `Regex dopasował ${matchedCount}/${aiEntries.length} (AI niedostępne — spróbuj "z historii")`
              : 'AI niedostępne (quota/klucz) — spróbuj "Zaproponuj z historii"'
          );
        } else {
          setSuggestStatus(`AI dopasowalo ${matchedCount}/${aiEntries.length} ticketow`);
        }
      } else {
        const err = await res.json();
        alert(`Blad AI: ${err.error || 'Unknown error'}`);
        setSuggestStatus('');
      }
    } catch (error) {
      alert(`Blad: ${error instanceof Error ? error.message : 'Nieznany blad'}`);
      setSuggestStatus('');
    }

    setSuggestingAI(false);
  };

  // Step 3b: Suggest tickets from history
  const handleSuggestFromHistory = async () => {
    if (entries.length === 0) return;
    setSuggestingHistory(true);
    setSuggestStatus('Dopasowywanie z historii Tempo...');

    try {
      const res = await fetch('/timetracker/api/llm/suggest-from-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: entries.map(e => ({
            description: e.description,
            category: e.category,
            durationMinutes: e.durationMinutes,
            startTime: e.startTime,
            endTime: e.endTime,
          })),
          availableTickets: issues.map(i => ({
            key: i.key,
            name: i.name,
            project: i.project,
          })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const suggestions: Array<{
          index: number;
          suggestedTicket: string;
          ticketConfidence: number;
          matchSource: string;
        }> = data.suggestions || [];

        setEntries(prev =>
          prev.map((entry, idx) => {
            const suggestion = suggestions.find(s => s.index === idx);
            if (suggestion && suggestion.suggestedTicket) {
              return {
                ...entry,
                suggestedTicket: suggestion.suggestedTicket,
                ticketConfidence: suggestion.ticketConfidence,
                selected: true,
              };
            }
            return entry;
          })
        );
        setSuggestStatus(
          `Z historii: ${data.matchedCount}/${entries.length} dopasowanych (${data.historyCount} worklogow)`
        );
      } else {
        const err = await res.json();
        alert(`Blad historii: ${err.error || 'Unknown error'}`);
        setSuggestStatus('');
      }
    } catch (error) {
      alert(`Blad: ${error instanceof Error ? error.message : 'Nieznany blad'}`);
      setSuggestStatus('');
    }

    setSuggestingHistory(false);
  };

  // Update a single entry field
  const updateEntry = (
    index: number,
    field: keyof ParsedEntry,
    value: string | number | boolean
  ) => {
    setEntries(prev =>
      prev.map((e, i) => {
        if (i !== index) return e;
        const updated = { ...e, [field]: value };
        if (field === 'startTime' || field === 'endTime') {
          const start = field === 'startTime' ? String(value) : e.startTime;
          const end = field === 'endTime' ? String(value) : e.endTime;
          const [sh, sm] = start.split(':').map(Number);
          const [eh, em] = end.split(':').map(Number);
          if (!isNaN(sh) && !isNaN(sm) && !isNaN(eh) && !isNaN(em)) {
            updated.durationMinutes = Math.max(eh * 60 + em - (sh * 60 + sm), 0);
          }
        }
        if (field === 'durationMinutes') {
          const [sh, sm] = e.startTime.split(':').map(Number);
          if (!isNaN(sh) && !isNaN(sm)) {
            const totalMin = sh * 60 + sm + Number(value);
            const endH = Math.floor(totalMin / 60);
            const endM = totalMin % 60;
            updated.endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
          }
        }
        return updated;
      })
    );
  };

  // Select/deselect all
  const toggleSelectAll = (checked: boolean) => {
    setEntries(prev => prev.map(e => ({ ...e, selected: checked })));
  };

  // Log selected entries to Tempo (sequential, one by one)
  const handleLogAll = async () => {
    const selected = entries.filter(e => e.selected && e.suggestedTicket);
    if (selected.length === 0) {
      alert('Zaznacz wpisy z ticketami do zalogowania');
      return;
    }

    setLogging(true);
    setLogResults([]);
    const results: LogResult[] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry.selected || !entry.suggestedTicket) {
        if (!entry.suggestedTicket && entry.selected) {
          results.push({ index: i, success: false, message: 'Brak ticketa' });
        }
        continue;
      }

      try {
        const rules = getLoggingRules();
        const requestBody: Record<string, unknown> = {
          issueKey: entry.suggestedTicket,
          timeSpentSeconds: entry.durationMinutes * 60,
          startDate: date,
          startTime: `${entry.startTime}:00`,
          description: entry.description,
        };
        // Pass smart rounding options if enabled
        if (rules.smartRoundingEnabled) {
          requestBody.smartRounding = true;
          requestBody.roundingTiers = rules.roundingTiers;
          requestBody.roundingAbove60Interval = rules.roundingAbove60Interval;
        }
        // Pass value multiplier options if enabled (TODO-9)
        if (rules.valueMultipliersEnabled && rules.projectValueMultipliers.length > 0) {
          requestBody.valueMultipliersEnabled = true;
          requestBody.projectValueMultipliers = rules.projectValueMultipliers;
        }
        console.log(`[DailyLogger] Logging entry ${i}:`, requestBody);

        const res = await fetch('/timetracker/api/tempo/worklogs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        if (res.ok) {
          results.push({
            index: i,
            success: true,
            message: `${entry.durationMinutes}m zalogowano`,
          });
        } else {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          const errorMsg = err.error || `Blad logowania (HTTP ${res.status})`;
          console.error(`[DailyLogger] Error logging entry ${i}:`, errorMsg);
          results.push({ index: i, success: false, message: errorMsg });
        }
      } catch (error) {
        results.push({
          index: i,
          success: false,
          message: error instanceof Error ? error.message : 'Blad sieci',
        });
      }
    }

    setLogResults(results);
    setLogging(false);

    await fetchExistingWorklogs(date);
  };

  // Batch log all entries with tickets via single API call
  const handleBatchApprove = async () => {
    const selected = entries.filter(e => e.selected && e.suggestedTicket);
    if (selected.length === 0) {
      alert('Zaznacz wpisy z ticketami do zalogowania');
      return;
    }

    setLogging(true);
    setLogResults([]);

    try {
      const rules = getLoggingRules();
      const batchEntries = selected.map(entry => ({
        issueKey: entry.suggestedTicket,
        timeSpentSeconds: entry.durationMinutes * 60,
        startDate: date,
        startTime: `${entry.startTime}:00`,
        description: entry.description,
      }));

      const requestBody: Record<string, unknown> = { entries: batchEntries };
      if (rules.smartRoundingEnabled) {
        requestBody.smartRounding = true;
        requestBody.roundingTiers = rules.roundingTiers;
        requestBody.roundingAbove60Interval = rules.roundingAbove60Interval;
      }
      if (rules.valueMultipliersEnabled && rules.projectValueMultipliers.length > 0) {
        requestBody.valueMultipliersEnabled = true;
        requestBody.projectValueMultipliers = rules.projectValueMultipliers;
      }

      const res = await fetch('/timetracker/api/tempo/batch-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (res.ok) {
        const data = await res.json();
        // Map batch results back to entry indices
        const selectedIndices = entries
          .map((e, i) => (e.selected && e.suggestedTicket ? i : -1))
          .filter(i => i >= 0);

        const results: LogResult[] = (data.results || []).map(
          (r: { index: number; success: boolean; message: string }) => ({
            index: selectedIndices[r.index] ?? r.index,
            success: r.success,
            message: r.message,
          })
        );
        setLogResults(results);
      } else {
        const err = await res.json().catch(() => ({ error: 'Batch log failed' }));
        alert(`Blad batch logowania: ${err.error}`);
      }
    } catch (error) {
      alert(`Blad: ${error instanceof Error ? error.message : 'Nieznany blad'}`);
    }

    setLogging(false);
    await fetchExistingWorklogs(date);
  };

  // Send daily log proposal to Slack
  const handleSendToSlack = async () => {
    const withTickets = entries.filter(e => e.suggestedTicket);
    if (withTickets.length === 0) {
      alert('Brak wpisow z ticketami do wyslania');
      return;
    }

    try {
      const res = await fetch('/timetracker/api/slack/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'daily_log',
          date,
          entries: withTickets.map(e => ({
            issueKey: e.suggestedTicket,
            description: e.description,
            durationMinutes: e.durationMinutes,
            startTime: e.startTime,
            endTime: e.endTime,
            confidence: e.ticketConfidence,
          })),
          totalMinutes: withTickets.reduce((s, e) => s + e.durationMinutes, 0),
          alreadyLoggedMinutes: Math.round(alreadyLoggedTotal / 60),
        }),
      });

      if (res.ok) {
        alert('Propozycja wyslana na Slack!');
      } else {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        alert(`Blad: ${err.error}`);
      }
    } catch (error) {
      alert(`Blad: ${error instanceof Error ? error.message : 'Nieznany blad'}`);
    }
  };

  // Stats
  const totalMinutes = entries.reduce((s, e) => s + e.durationMinutes, 0);
  const selectedMinutes = entries
    .filter(e => e.selected)
    .reduce((s, e) => s + e.durationMinutes, 0);
  const unmatchedCount = entries.filter(e => !e.suggestedTicket).length;
  const allSelected = entries.length > 0 && entries.every(e => e.selected);
  const isBusy = generating || loading || suggestingAI || suggestingHistory || logging;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-indigo-500" />
            <CardTitle className="text-lg">Dzienny Logger</CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-gray-500">Data:</label>
            <Input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-40"
            />
            <label className="text-sm text-gray-500">Od:</label>
            <Input
              type="time"
              value={startHour}
              onChange={e => setStartHour(e.target.value)}
              className="w-28"
            />
            <label className="text-sm text-gray-500">Do:</label>
            <Input
              type="time"
              value={endHour}
              onChange={e => setEndHour(e.target.value)}
              className="w-28"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* ① Step 1: Generate note from ActivityWatch */}
        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
              1
            </span>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Zaproponuj notatke z TimeTrackera
            </h3>
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={handleGenerateNote}
              disabled={isBusy}
            >
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="mr-2 h-4 w-4" />
              )}
              Generuj z ActivityWatch
            </Button>
            {generating && (
              <span className="text-sm text-gray-500">Pobieranie danych z ActivityWatch...</span>
            )}
            {generateInfo && (
              <Badge variant="secondary" className="text-xs">
                {generateInfo.activitiesCount} aktywnosci (
                {Math.floor(generateInfo.totalMinutes / 60)}h{' '}
                {generateInfo.totalMinutes % 60}m)
              </Badge>
            )}
          </div>
          <Textarea
            placeholder={`Wklej notatki z dnia pracy...\nnp. 09:30-10:30 research Mike n8n\n    11:00-11:30 call Natalia claude setup\n    11:30-12:30 call z Piotkiem headlamp k8s`}
            value={rawNotes}
            onChange={e => setRawNotes(e.target.value)}
            rows={5}
            className="font-mono text-sm"
          />
        </div>

        {/* ② Step 2: Parse notes */}
        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
              2
            </span>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Parsuj notatki
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleParse}
              disabled={isBusy || !rawNotes.trim()}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Parsuj notatki
            </Button>
            {loading && <span className="text-sm text-gray-500">Analizowanie notatek z AI...</span>}
            {!rawNotes.trim() && (
              <span className="text-xs text-gray-400">Najpierw wpisz lub wygeneruj notatki</span>
            )}
          </div>
        </div>

        {/* ③ Step 3: Suggest tickets */}
        <div className={`rounded-lg border p-4 ${entries.length > 0 ? 'border-slate-200 dark:border-slate-700' : 'border-dashed border-slate-300 dark:border-slate-600'}`}>
          <div className="mb-3 flex items-center gap-2">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${entries.length > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-400'}`}>
              3
            </span>
            <h3 className={`text-sm font-semibold ${entries.length > 0 ? 'text-slate-700 dark:text-slate-300' : 'text-gray-400'}`}>
              Zaproponuj ticket
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleSuggestByAI}
              disabled={isBusy || entries.length === 0}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {suggestingAI ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Zaproponuj przez AI
            </Button>
            <Button
              variant="outline"
              onClick={handleSuggestFromHistory}
              disabled={isBusy || entries.length === 0}
            >
              {suggestingHistory ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <History className="mr-2 h-4 w-4" />
              )}
              Zaproponuj z historii
            </Button>
            {suggestStatus && (
              <span className="text-sm text-gray-500">{suggestStatus}</span>
            )}
            {entries.length === 0 && (
              <span className="text-xs text-gray-400">Najpierw sparsuj notatki</span>
            )}
          </div>
        </div>

        {/* Already logged today */}
        {alreadyLoggedTotal > 0 && (
          <div className="flex items-center gap-2 rounded bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
            <Clock className="h-4 w-4" />
            Juz zalogowane na {date}:{' '}
            <strong>{formatMinutes(Math.round(alreadyLoggedTotal / 60))}</strong>
            {alreadyLogged.length > 0 && (
              <span className="text-blue-500">
                ({alreadyLogged.length} {alreadyLogged.length === 1 ? 'wpis' : 'wpisow'})
              </span>
            )}
          </div>
        )}

        {/* Parsed entries table */}
        {entries.length > 0 && (
          <>
            <div className="overflow-auto rounded border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 dark:bg-slate-800">
                    <th className="w-10 px-2 py-2 text-center">
                      <Checkbox checked={allSelected} onCheckedChange={v => toggleSelectAll(!!v)} />
                    </th>
                    <th className="px-2 py-2 text-left font-medium text-gray-600">Czas</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-600">Opis</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-600">Ticket</th>
                    <th className="w-16 px-2 py-2 text-center font-medium text-gray-600">Kat.</th>
                    <th className="w-20 px-2 py-2 text-right font-medium text-gray-600">Min</th>
                    <th className="w-16 px-2 py-2 text-center font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, idx) => {
                    const result = logResults.find(r => r.index === idx);
                    return (
                      <tr
                        key={idx}
                        className={`border-b hover:bg-gray-50 dark:hover:bg-slate-800/50 ${
                          result?.success ? 'bg-green-50 dark:bg-green-900/10' : ''
                        } ${result && !result.success ? 'bg-red-50 dark:bg-red-900/10' : ''}`}
                      >
                        {/* Checkbox */}
                        <td className="px-2 py-1.5 text-center">
                          <Checkbox
                            checked={entry.selected}
                            onCheckedChange={v => updateEntry(idx, 'selected', !!v)}
                          />
                        </td>

                        {/* Time range */}
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1">
                            <Input
                              value={entry.startTime}
                              onChange={e => updateEntry(idx, 'startTime', e.target.value)}
                              className="h-7 w-16 px-1 text-center font-mono text-xs"
                            />
                            <span className="text-gray-400">-</span>
                            <Input
                              value={entry.endTime}
                              onChange={e => updateEntry(idx, 'endTime', e.target.value)}
                              className="h-7 w-16 px-1 text-center font-mono text-xs"
                            />
                          </div>
                        </td>

                        {/* Description */}
                        <td className="px-2 py-1.5">
                          <Input
                            value={entry.description}
                            onChange={e => updateEntry(idx, 'description', e.target.value)}
                            className="h-7 text-xs"
                          />
                        </td>

                        {/* Ticket */}
                        <td className="px-2 py-1.5">
                          <Select
                            value={entry.suggestedTicket || '_none'}
                            onValueChange={v =>
                              updateEntry(idx, 'suggestedTicket', v === '_none' ? '' : v)
                            }
                          >
                            <SelectTrigger
                              className={`h-7 w-36 text-xs ${!entry.suggestedTicket ? 'border-red-300 text-red-500' : ''}`}
                            >
                              <SelectValue placeholder="Wybierz ticket" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">
                                <span className="text-red-500">BRAK</span>
                              </SelectItem>
                              {issues.map(issue => (
                                <SelectItem key={issue.key} value={issue.key}>
                                  <span className="font-mono">{issue.key}</span>{' '}
                                  <span className="text-gray-500">
                                    {issue.name.substring(0, 30)}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {entry.ticketConfidence > 0 && entry.ticketConfidence < 0.7 && (
                            <span className="ml-1 text-[10px] text-yellow-600">
                              {Math.round(entry.ticketConfidence * 100)}%
                            </span>
                          )}
                        </td>

                        {/* Category */}
                        <td className="px-2 py-1.5 text-center">
                          <Badge
                            variant="secondary"
                            className={`text-[10px] ${CATEGORY_COLORS[entry.category] || 'bg-gray-100 text-gray-600'}`}
                          >
                            {CATEGORY_LABELS[entry.category] || entry.category}
                          </Badge>
                        </td>

                        {/* Duration */}
                        <td className="px-2 py-1.5 text-right">
                          <Input
                            type="number"
                            value={entry.durationMinutes}
                            onChange={e =>
                              updateEntry(idx, 'durationMinutes', parseInt(e.target.value) || 0)
                            }
                            className="h-7 w-16 px-1 text-right font-mono text-xs"
                            min={0}
                          />
                        </td>

                        {/* Status */}
                        <td className="px-2 py-1.5 text-center">
                          {result ? (
                            result.success ? (
                              <CheckCircle className="mx-auto h-4 w-4 text-green-500" />
                            ) : (
                              <span title={result.message}>
                                <XCircle className="mx-auto h-4 w-4 text-red-500" />
                              </span>
                            )
                          ) : !entry.suggestedTicket ? (
                            <span title="Brak ticketa">
                              <AlertTriangle className="mx-auto h-4 w-4 text-yellow-500" />
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Summary bar */}
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-gray-400" />
                Suma: <strong>{formatMinutes(totalMinutes)}</strong>
              </div>
              <div className="text-gray-400">|</div>
              <div>
                Zaznaczono: <strong>{formatMinutes(selectedMinutes)}</strong>
              </div>
              {unmatchedCount > 0 && (
                <>
                  <div className="text-gray-400">|</div>
                  <div className="text-yellow-600">
                    Bez ticketa: <strong>{unmatchedCount}</strong>
                  </div>
                </>
              )}
            </div>

            {/* Log buttons */}
            <div className="flex items-center gap-3">
              <Button
                onClick={handleBatchApprove}
                disabled={
                  logging || entries.filter(e => e.selected && e.suggestedTicket).length === 0
                }
                className="bg-green-600 hover:bg-green-700"
              >
                {logging ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 h-4 w-4" />
                )}
                Approve All ({entries.filter(e => e.selected && e.suggestedTicket).length})
              </Button>
              <Button
                variant="outline"
                onClick={handleLogAll}
                disabled={
                  logging || entries.filter(e => e.selected && e.suggestedTicket).length === 0
                }
              >
                {logging ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Zaloguj sekwencyjnie
              </Button>
              <Button
                variant="outline"
                onClick={handleSendToSlack}
                disabled={logging || entries.filter(e => e.suggestedTicket).length === 0}
                title="Wyslij propozycje logow na Slack"
              >
                <Bell className="mr-2 h-4 w-4" />
                Slack
              </Button>
              {logging && <span className="text-sm text-gray-500">Logowanie...</span>}
            </div>

            {/* Log results */}
            {logResults.length > 0 && (
              <div className="space-y-1 rounded border bg-gray-50 p-3 dark:bg-slate-800">
                <p className="mb-1 text-xs font-medium text-gray-600">Wyniki logowania:</p>
                {logResults.map((r, i) => {
                  const entry = entries[r.index];
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {r.success ? (
                        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                      )}
                      <span className="font-mono">{entry?.suggestedTicket || '-'}</span>
                      <span className={r.success ? 'text-green-600' : 'text-red-600'}>
                        {r.message}
                      </span>
                    </div>
                  );
                })}
                <div className="mt-1 border-t pt-1 text-xs text-gray-500">
                  Zalogowano: {logResults.filter(r => r.success).length}/{logResults.length}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
