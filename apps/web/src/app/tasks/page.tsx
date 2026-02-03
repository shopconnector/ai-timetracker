'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Download,
  RefreshCw,
  Filter,
  Calendar,
  Clock,
  User,
  Ticket,
  FileText,
  CheckCircle,
  AlertCircle,
  Bot,
  Zap,
  History,
  Hand,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { getAllAssignments, type Assignment } from '@/lib/assignmentStore';

interface TaskEntry {
  id: string;
  date: string;
  title: string;
  app: string;
  project?: string;
  ticketKey: string;
  ticketName?: string;
  durationMinutes: number;
  source: string;
  confidence: number;
  status: 'assigned' | 'pending' | 'logged';
  timestamp: string;
}

type SortField = 'date' | 'title' | 'ticketKey' | 'durationMinutes' | 'source' | 'confidence';
type SortDirection = 'asc' | 'desc';

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [filterTicket, setFilterTicket] = useState('');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Sorting
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Stats
  const [stats, setStats] = useState({
    totalTasks: 0,
    totalMinutes: 0,
    bySource: {} as Record<string, number>,
    byStatus: {} as Record<string, number>,
    uniqueTickets: 0,
  });

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Get all assignments from localStorage
      const allAssignments = getAllAssignments();

      // Get activities for date range
      const res = await fetch(`/timetracker/api/activities?from=${dateFrom}&to=${dateTo}`);

      if (!res.ok) {
        throw new Error('Nie udalo sie pobrac aktywnosci');
      }

      const data = await res.json();
      const activities = data.activities || [];

      // Combine activities with assignments
      const taskEntries: TaskEntry[] = activities.map(
        (activity: {
          id: string;
          title: string;
          app: string;
          project?: string;
          totalSeconds: number;
          firstSeen?: string;
        }) => {
          const date = activity.firstSeen?.split('T')[0] || dateFrom;
          const dayAssignments = allAssignments[date] || {};
          const assignment = dayAssignments[activity.id] as Assignment | undefined;

          return {
            id: activity.id,
            date,
            title: activity.title,
            app: activity.app,
            project: activity.project,
            ticketKey: assignment?.ticketKey || '',
            ticketName: undefined, // Assignment type doesn't have ticketName
            durationMinutes: Math.round(activity.totalSeconds / 60),
            source: assignment?.source || 'none',
            confidence: assignment?.confidence || 0,
            status: assignment?.ticketKey ? 'assigned' : 'pending',
            timestamp: activity.firstSeen || '',
          };
        }
      );

      setTasks(taskEntries);

      // Calculate stats
      const bySource: Record<string, number> = {};
      const byStatus: Record<string, number> = {};
      const tickets = new Set<string>();
      let totalMinutes = 0;

      for (const task of taskEntries) {
        bySource[task.source] = (bySource[task.source] || 0) + 1;
        byStatus[task.status] = (byStatus[task.status] || 0) + 1;
        if (task.ticketKey) tickets.add(task.ticketKey);
        totalMinutes += task.durationMinutes;
      }

      setStats({
        totalTasks: taskEntries.length,
        totalMinutes,
        bySource,
        byStatus,
        uniqueTickets: tickets.size,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Blad ladowania');
    }

    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Filter and sort tasks
  const filteredTasks = tasks
    .filter(task => {
      if (filterTicket && !task.ticketKey.toLowerCase().includes(filterTicket.toLowerCase())) {
        return false;
      }
      if (filterSource !== 'all' && task.source !== filterSource) {
        return false;
      }
      if (filterStatus !== 'all' && task.status !== filterStatus) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      return 0;
    });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleExportCSV = () => {
    const headers = [
      'Data',
      'Ticket',
      'Tytul',
      'Aplikacja',
      'Projekt',
      'Czas (min)',
      'Zrodlo',
      'Confidence',
      'Status',
    ];
    const rows = filteredTasks.map(t => [
      t.date,
      t.ticketKey,
      `"${t.title.replace(/"/g, '""')}"`,
      t.app,
      t.project || '',
      t.durationMinutes,
      t.source,
      Math.round(t.confidence * 100),
      t.status,
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timetracker-tasks-${dateFrom}-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'ai':
        return <Bot className="h-4 w-4 text-purple-500" />;
      case 'rule':
        return <Zap className="h-4 w-4 text-yellow-500" />;
      case 'history':
      case 'project_mapping':
        return <History className="h-4 w-4 text-blue-500" />;
      case 'manual':
        return <Hand className="h-4 w-4 text-green-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'ai':
        return 'AI';
      case 'rule':
        return 'Regula';
      case 'history':
        return 'Historia';
      case 'project_mapping':
        return 'Mapping';
      case 'manual':
        return 'Reczne';
      case 'tempo_match':
        return 'Tempo';
      default:
        return 'Brak';
    }
  };

  const formatDuration = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ChevronUp className="ml-1 inline h-4 w-4" />
    ) : (
      <ChevronDown className="ml-1 inline h-4 w-4" />
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Taski</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Przegladaj i eksportuj przypisane aktywnosci
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadTasks} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Odswiez
          </Button>
          <Button onClick={handleExportCSV}>
            <Download className="mr-2 h-4 w-4" />
            Eksport CSV
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">{stats.totalTasks}</div>
                <div className="text-xs text-gray-500">Aktywnosci</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-green-500" />
              <div>
                <div className="text-2xl font-bold">{formatDuration(stats.totalMinutes)}</div>
                <div className="text-xs text-gray-500">Laczny czas</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Ticket className="h-8 w-8 text-purple-500" />
              <div>
                <div className="text-2xl font-bold">{stats.uniqueTickets}</div>
                <div className="text-xs text-gray-500">Unikalnych ticketow</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div>
                <div className="text-2xl font-bold">{stats.byStatus['assigned'] || 0}</div>
                <div className="text-xs text-gray-500">Przypisanych</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-8 w-8 text-yellow-500" />
              <div>
                <div className="text-2xl font-bold">{stats.byStatus['pending'] || 0}</div>
                <div className="text-xs text-gray-500">Oczekujacych</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Filter className="h-5 w-5 text-gray-600" />
            <CardTitle className="text-lg">Filtry</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1 block text-sm text-gray-500">Od daty</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-40"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-500">Do daty</label>
              <Input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-40"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-500">Ticket</label>
              <Input
                placeholder="Szukaj ticketa..."
                value={filterTicket}
                onChange={e => setFilterTicket(e.target.value)}
                className="w-40"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-500">Zrodlo</label>
              <Select value={filterSource} onValueChange={setFilterSource}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie</SelectItem>
                  <SelectItem value="ai">AI</SelectItem>
                  <SelectItem value="rule">Regula</SelectItem>
                  <SelectItem value="history">Historia</SelectItem>
                  <SelectItem value="manual">Reczne</SelectItem>
                  <SelectItem value="none">Brak</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-500">Status</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie</SelectItem>
                  <SelectItem value="assigned">Przypisane</SelectItem>
                  <SelectItem value="pending">Oczekujace</SelectItem>
                  <SelectItem value="logged">Zalogowane</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setFilterTicket('');
                setFilterSource('all');
                setFilterStatus('all');
              }}
            >
              Wyczysc filtry
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Lista taskow ({filteredTasks.length} z {tasks.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="py-8 text-center text-red-500">{error}</div>
          ) : loading ? (
            <div className="py-8 text-center text-gray-500">Ladowanie...</div>
          ) : filteredTasks.length === 0 ? (
            <div className="py-8 text-center text-gray-500">Brak taskow dla wybranych filtrow</div>
          ) : (
            <div className="max-h-[600px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('date')}>
                      Data <SortIcon field="date" />
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('ticketKey')}>
                      Ticket <SortIcon field="ticketKey" />
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('title')}>
                      Tytul <SortIcon field="title" />
                    </TableHead>
                    <TableHead>Aplikacja</TableHead>
                    <TableHead
                      className="cursor-pointer text-right"
                      onClick={() => handleSort('durationMinutes')}
                    >
                      Czas <SortIcon field="durationMinutes" />
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('source')}>
                      Zrodlo <SortIcon field="source" />
                    </TableHead>
                    <TableHead
                      className="cursor-pointer text-right"
                      onClick={() => handleSort('confidence')}
                    >
                      Conf. <SortIcon field="confidence" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTasks.slice(0, 200).map(task => (
                    <TableRow key={task.id}>
                      <TableCell className="font-mono text-sm">{task.date}</TableCell>
                      <TableCell>
                        {task.ticketKey ? (
                          <Badge variant="outline" className="font-mono">
                            {task.ticketKey}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">-</Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs truncate" title={task.title}>
                        {task.title}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{task.app}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatDuration(task.durationMinutes)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {getSourceIcon(task.source)}
                          <span className="text-xs">{getSourceLabel(task.source)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {task.confidence > 0 ? (
                          <Badge variant={task.confidence >= 0.7 ? 'default' : 'secondary'}>
                            {Math.round(task.confidence * 100)}%
                          </Badge>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filteredTasks.length > 200 && (
                <p className="mt-4 text-center text-sm text-gray-500">
                  Wyswietlono 200 z {filteredTasks.length} wynikow. Uzyj filtrow aby zawezic.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Source breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Rozklad wg zrodla</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {Object.entries(stats.bySource).map(([source, count]) => (
              <div key={source} className="flex items-center gap-2 rounded-lg bg-gray-50 px-4 py-2">
                {getSourceIcon(source)}
                <span className="font-medium">{getSourceLabel(source)}</span>
                <Badge>{count}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
