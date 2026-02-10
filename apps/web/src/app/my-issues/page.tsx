'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
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
  Clock,
  CheckCircle2,
  AlertCircle,
  ClipboardList,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  StickyNote,
  Shield,
} from 'lucide-react';
import {
  getAllIssueLocalData,
  setIssueNotes,
  setIssueDoneByMe,
  type IssueLocalData,
} from '@/lib/myIssuesStore';
import { findReadinessComment, type ReadinessCriteria } from '@/lib/readiness';
import { ReadinessBadgesCompact, ReadinessBadgesFull } from './components/ReadinessBadges';
import DailyLoggerSection from './components/DailyLoggerSection';

interface JiraComment {
  author: string;
  created: string;
  body: string;
}

interface SubtaskInfo {
  key: string;
  summary: string;
  status: string;
  type: string;
}

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
  subtasks: SubtaskInfo[];
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
  comments: JiraComment[];
}

const JIRA_BASE = 'https://beecommerce.atlassian.net/browse';

function formatSeconds(seconds: number): string {
  if (!seconds || seconds <= 0) return '0h';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function getStatusColor(status: string): string {
  const s = status.toLowerCase();
  if (s === 'done' || s === 'closed' || s === 'resolved') return 'bg-green-100 text-green-800';
  if (s === 'in progress' || s === 'in review') return 'bg-blue-100 text-blue-800';
  if (s === 'blocked') return 'bg-red-100 text-red-800';
  if (s === 'testing') return 'bg-purple-100 text-purple-800';
  return 'bg-gray-100 text-gray-700';
}

function getPriorityColor(priority: string): string {
  const p = (priority || '').toLowerCase();
  if (p === 'highest' || p === 'critical') return 'text-red-600';
  if (p === 'high') return 'text-orange-500';
  if (p === 'medium') return 'text-yellow-600';
  if (p === 'low') return 'text-blue-500';
  return 'text-gray-400';
}

export default function MyIssuesPage() {
  const [issues, setIssues] = useState<JiraIssueItem[]>([]);
  const [timeByIssueKey, setTimeByIssueKey] = useState<Record<string, number>>({});
  const [timeByIssueId, setTimeByIssueId] = useState<Record<string, number>>({});
  const [localData, setLocalData] = useState<Record<string, IssueLocalData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Filters
  const [filterProject, setFilterProject] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [showDoneOnly, setShowDoneOnly] = useState(false);
  const [hideLocalDone, setHideLocalDone] = useState(false);

  // Sorting
  const [sortField, setSortField] = useState<string>('status');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Debounce refs for notes
  const notesTimers = useRef<Record<string, NodeJS.Timeout>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Ładuj dane z Jira i Tempo równolegle
      const [issuesRes, tempoRes] = await Promise.all([
        fetch('/timetracker/api/jira/my-issues?filter=assigned&limit=200'),
        fetch('/timetracker/api/tempo/worklogs-by-issue'),
      ]);

      if (!issuesRes.ok) throw new Error('Nie udało się pobrać zadań z Jiry');

      const issuesData = await issuesRes.json();
      setIssues(issuesData.issues || []);

      if (tempoRes.ok) {
        const tempoData = await tempoRes.json();
        setTimeByIssueKey(tempoData.timeByIssueKey || {});
        setTimeByIssueId(tempoData.timeByIssueId || {});
      }

      // Załaduj dane lokalne
      setLocalData(getAllIssueLocalData());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd ładowania danych');
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Helper: get logged time for an issue (by key or by id)
  const getLoggedTime = useCallback(
    (issue: JiraIssueItem): number => {
      return timeByIssueKey[issue.key] || timeByIssueId[issue.id] || 0;
    },
    [timeByIssueKey, timeByIssueId]
  );

  // Opcje filtrów z danych
  const projectOptions = useMemo(
    () => [...new Set(issues.map(i => i.project).filter(Boolean))].sort(),
    [issues]
  );
  const statusOptions = useMemo(
    () => [...new Set(issues.map(i => i.status).filter(Boolean))].sort(),
    [issues]
  );
  const typeOptions = useMemo(
    () => [...new Set(issues.map(i => i.type).filter(Boolean))].sort(),
    [issues]
  );
  const priorityOptions = useMemo(
    () => [...new Set(issues.map(i => i.priority).filter(Boolean))].sort(),
    [issues]
  );

  // Filtruj i sortuj
  const filteredIssues = useMemo(() => {
    return issues
      .filter(issue => {
        if (filterProject !== 'all' && issue.project !== filterProject) return false;
        if (filterStatus !== 'all' && issue.status !== filterStatus) return false;
        if (filterType !== 'all' && issue.type !== filterType) return false;
        if (filterPriority !== 'all' && issue.priority !== filterPriority) return false;
        if (showDoneOnly && !localData[issue.key]?.doneByMe) return false;
        if (hideLocalDone && localData[issue.key]?.doneByMe) return false;
        if (searchText) {
          const s = searchText.toLowerCase();
          if (
            !issue.key.toLowerCase().includes(s) &&
            !issue.name.toLowerCase().includes(s) &&
            !(localData[issue.key]?.notes || '').toLowerCase().includes(s) &&
            !(issue.description || '').toLowerCase().includes(s)
          ) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        const aVal = String((a as unknown as Record<string, unknown>)[sortField] ?? '');
        const bVal = String((b as unknown as Record<string, unknown>)[sortField] ?? '');
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      });
  }, [
    issues,
    filterProject,
    filterStatus,
    filterType,
    filterPriority,
    searchText,
    showDoneOnly,
    hideLocalDone,
    localData,
    sortField,
    sortDir,
  ]);

  // Statystyki
  const stats = useMemo(() => {
    const total = issues.length;
    const doneCount = issues.filter(i => localData[i.key]?.doneByMe).length;
    const todoCount = total - doneCount;
    const totalTempoTime = issues.reduce((sum, i) => sum + getLoggedTime(i), 0);
    const totalJiraTime = issues.reduce((sum, i) => sum + (i.timespent || 0), 0);
    const totalComments = issues.reduce((sum, i) => sum + i.commentsCount, 0);
    return { total, doneCount, todoCount, totalTempoTime, totalJiraTime, totalComments };
  }, [issues, localData, getLoggedTime]);

  // Parse Readiness Criteria per issue from comments
  const readinessMap = useMemo(() => {
    const map: Record<string, ReadinessCriteria | null> = {};
    for (const issue of issues) {
      map[issue.key] = findReadinessComment(issue.comments);
    }
    return map;
  }, [issues]);

  // Readiness stats
  const readinessStats = useMemo(() => {
    let greenCount = 0;
    let totalWithRC = 0;
    for (const key of Object.keys(readinessMap)) {
      const rc = readinessMap[key];
      if (rc) {
        totalWithRC++;
        if (rc.overallScore === 4) greenCount++;
      }
    }
    return { greenCount, totalWithRC };
  }, [readinessMap]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const toggleRow = (key: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleDoneToggle = (issueKey: string, checked: boolean) => {
    setIssueDoneByMe(issueKey, checked);
    setLocalData(prev => ({
      ...prev,
      [issueKey]: {
        notes: prev[issueKey]?.notes || '',
        doneByMe: checked,
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  const handleNotesChange = (issueKey: string, value: string) => {
    setLocalData(prev => ({
      ...prev,
      [issueKey]: {
        notes: value,
        doneByMe: prev[issueKey]?.doneByMe || false,
        updatedAt: new Date().toISOString(),
      },
    }));
    // Debounced save
    if (notesTimers.current[issueKey]) clearTimeout(notesTimers.current[issueKey]);
    notesTimers.current[issueKey] = setTimeout(() => {
      setIssueNotes(issueKey, value);
    }, 500);
  };

  const handleExportCSV = () => {
    const headers = [
      'Done',
      'Key',
      'Summary',
      'Status',
      'Priority',
      'Type',
      'Parent',
      'Project',
      'Created',
      'Jira Time (h)',
      'Tempo Time (h)',
      'Comments',
      'Labels',
      'Notes',
      'Last Comment',
    ];
    const rows = filteredIssues.map(issue => {
      const ld = localData[issue.key];
      const jiraHours = ((issue.timespent || 0) / 3600).toFixed(1);
      const tempoHours = ((getLoggedTime(issue) || 0) / 3600).toFixed(1);
      const lastComment =
        issue.comments.length > 0
          ? issue.comments[issue.comments.length - 1].body.substring(0, 200)
          : '';
      return [
        ld?.doneByMe ? 'TAK' : '',
        issue.key,
        `"${issue.name.replace(/"/g, '""')}"`,
        issue.status,
        issue.priority || '',
        issue.type || '',
        issue.parentKey || '',
        issue.project,
        issue.created ? new Date(issue.created).toLocaleDateString('pl-PL') : '',
        jiraHours,
        tempoHours,
        issue.commentsCount,
        `"${issue.labels.join(', ')}"`,
        `"${(ld?.notes || '').replace(/"/g, '""')}"`,
        `"${lastComment.replace(/"/g, '""')}"`,
      ];
    });
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my-jira-issues-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setFilterProject('all');
    setFilterStatus('all');
    setFilterType('all');
    setFilterPriority('all');
    setSearchText('');
    setShowDoneOnly(false);
    setHideLocalDone(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Moje Zadania Jira</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Wszystkie przypisane zadania &mdash; sledz postep i dodawaj notatki
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Odswiez
          </Button>
          <Button onClick={handleExportCSV} disabled={filteredIssues.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Eksport CSV
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <ClipboardList className="h-8 w-8 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">{stats.total}</div>
                <div className="text-xs text-gray-500">Wszystkich zadan</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <div>
                <div className="text-2xl font-bold">{stats.doneCount}</div>
                <div className="text-xs text-gray-500">Zrobionych</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-8 w-8 text-yellow-500" />
              <div>
                <div className="text-2xl font-bold">{stats.todoCount}</div>
                <div className="text-xs text-gray-500">Do zrobienia</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">{formatSeconds(stats.totalJiraTime)}</div>
                <div className="text-xs text-gray-500">Czas w Jirze</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-green-500" />
              <div>
                <div className="text-2xl font-bold">{formatSeconds(stats.totalTempoTime)}</div>
                <div className="text-xs text-gray-500">Czas w Tempo</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-emerald-500" />
              <div>
                <div className="text-2xl font-bold">
                  {readinessStats.greenCount}/{readinessStats.totalWithRC}
                </div>
                <div className="text-xs text-gray-500">Readiness OK</div>
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
              <label className="mb-1 block text-sm text-gray-500">Projekt</label>
              <Select value={filterProject} onValueChange={setFilterProject}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie</SelectItem>
                  {projectOptions.map(p => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-500">Status</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie</SelectItem>
                  {statusOptions.map(s => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-500">Typ</label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie</SelectItem>
                  {typeOptions.map(t => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-500">Priorytet</label>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie</SelectItem>
                  {priorityOptions.map(p => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-500">Szukaj</label>
              <Input
                placeholder="Szukaj..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                className="w-48"
              />
            </div>
            <div className="flex items-center gap-4 pb-1">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={showDoneOnly}
                  onCheckedChange={v => {
                    setShowDoneOnly(!!v);
                    if (v) setHideLocalDone(false);
                  }}
                />
                Tylko zrobione
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={hideLocalDone}
                  onCheckedChange={v => {
                    setHideLocalDone(!!v);
                    if (v) setShowDoneOnly(false);
                  }}
                />
                Ukryj zrobione
              </label>
            </div>
            <Button variant="outline" onClick={clearFilters}>
              Wyczysc
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Daily Logger */}
      <DailyLoggerSection issues={issues} />

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Zadania ({filteredIssues.length} z {issues.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="py-8 text-center text-red-500">{error}</div>
          ) : loading ? (
            <div className="py-8 text-center text-gray-500">Ladowanie zadan z Jiry...</div>
          ) : filteredIssues.length === 0 ? (
            <div className="py-8 text-center text-gray-500">Brak zadan dla wybranych filtrow</div>
          ) : (
            <div className="max-h-[700px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">Done</TableHead>
                    <TableHead className="w-8"></TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('key')}>
                      Key {sortField === 'key' && (sortDir === 'asc' ? '↑' : '↓')}
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('name')}>
                      Summary {sortField === 'name' && (sortDir === 'asc' ? '↑' : '↓')}
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('status')}>
                      Status {sortField === 'status' && (sortDir === 'asc' ? '↑' : '↓')}
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('priority')}>
                      Priority {sortField === 'priority' && (sortDir === 'asc' ? '↑' : '↓')}
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('type')}>
                      Type {sortField === 'type' && (sortDir === 'asc' ? '↑' : '↓')}
                    </TableHead>
                    <TableHead>Parent</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('project')}>
                      Project {sortField === 'project' && (sortDir === 'asc' ? '↑' : '↓')}
                    </TableHead>
                    <TableHead className="text-right">Jira Time</TableHead>
                    <TableHead className="text-right">Tempo</TableHead>
                    <TableHead className="text-center">Comments</TableHead>
                    <TableHead className="w-16 text-center">RC</TableHead>
                    <TableHead className="w-10">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredIssues.map(issue => {
                    const ld = localData[issue.key];
                    const isExpanded = expandedRows.has(issue.key);
                    const logged = getLoggedTime(issue) || 0;

                    return (
                      <Fragment key={issue.key}>
                        <TableRow
                          className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 ${ld?.doneByMe ? 'opacity-60' : ''}`}
                        >
                          <TableCell onClick={e => e.stopPropagation()}>
                            <Checkbox
                              checked={ld?.doneByMe || false}
                              onCheckedChange={v => handleDoneToggle(issue.key, !!v)}
                            />
                          </TableCell>
                          <TableCell onClick={() => toggleRow(issue.key)}>
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-gray-400" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-gray-400" />
                            )}
                          </TableCell>
                          <TableCell onClick={() => toggleRow(issue.key)}>
                            <a
                              href={`${JIRA_BASE}/${issue.key}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-blue-600 hover:underline"
                              onClick={e => e.stopPropagation()}
                            >
                              <Badge variant="outline" className="font-mono text-xs">
                                {issue.key}
                              </Badge>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </TableCell>
                          <TableCell
                            className={`max-w-xs truncate ${ld?.doneByMe ? 'line-through' : ''}`}
                            title={issue.name}
                            onClick={() => toggleRow(issue.key)}
                          >
                            {issue.name}
                          </TableCell>
                          <TableCell onClick={() => toggleRow(issue.key)}>
                            <Badge
                              className={`text-xs ${getStatusColor(issue.status)}`}
                              variant="secondary"
                            >
                              {issue.status}
                            </Badge>
                          </TableCell>
                          <TableCell onClick={() => toggleRow(issue.key)}>
                            <span
                              className={`text-sm font-medium ${getPriorityColor(issue.priority)}`}
                            >
                              {issue.priority || '-'}
                            </span>
                          </TableCell>
                          <TableCell onClick={() => toggleRow(issue.key)}>
                            <span className="text-xs text-gray-600">{issue.type || '-'}</span>
                          </TableCell>
                          <TableCell onClick={() => toggleRow(issue.key)}>
                            {issue.parentKey ? (
                              <a
                                href={`${JIRA_BASE}/${issue.parentKey}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-500 hover:underline"
                                onClick={e => e.stopPropagation()}
                                title={issue.parentSummary || ''}
                              >
                                {issue.parentKey}
                              </a>
                            ) : (
                              <span className="text-xs text-gray-300">-</span>
                            )}
                          </TableCell>
                          <TableCell onClick={() => toggleRow(issue.key)}>
                            <Badge variant="secondary" className="text-xs">
                              {issue.project}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right" onClick={() => toggleRow(issue.key)}>
                            <span
                              className={`font-mono text-sm ${issue.timespent ? 'text-blue-600' : 'text-gray-400'}`}
                            >
                              {issue.timespent ? formatSeconds(issue.timespent) : '-'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right" onClick={() => toggleRow(issue.key)}>
                            <span
                              className={`font-mono text-sm ${logged > 0 ? 'font-medium text-green-600' : 'text-gray-400'}`}
                            >
                              {logged > 0 ? formatSeconds(logged) : '-'}
                            </span>
                          </TableCell>
                          <TableCell className="text-center" onClick={() => toggleRow(issue.key)}>
                            {issue.commentsCount > 0 ? (
                              <Badge variant="secondary" className="text-xs">
                                {issue.commentsCount}
                              </Badge>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center" onClick={() => toggleRow(issue.key)}>
                            <ReadinessBadgesCompact rc={readinessMap[issue.key]} />
                          </TableCell>
                          <TableCell onClick={() => toggleRow(issue.key)}>
                            {ld?.notes ? (
                              <StickyNote className="h-4 w-4 text-yellow-500" />
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </TableCell>
                        </TableRow>

                        {/* Expanded row */}
                        {isExpanded && (
                          <TableRow className="bg-slate-50 dark:bg-slate-900">
                            <TableCell colSpan={14} className="p-4">
                              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                                {/* Left column: Info */}
                                <div className="space-y-4">
                                  {/* Meta info */}
                                  <div className="rounded border bg-white p-3 dark:bg-slate-800">
                                    <h4 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                                      Informacje
                                    </h4>
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                      <div className="text-gray-500">Projekt:</div>
                                      <div className="font-medium">
                                        {issue.projectName || issue.project}
                                      </div>
                                      <div className="text-gray-500">Typ:</div>
                                      <div>{issue.type || '-'}</div>
                                      <div className="text-gray-500">Priorytet:</div>
                                      <div className={getPriorityColor(issue.priority)}>
                                        {issue.priority || '-'}
                                      </div>
                                      <div className="text-gray-500">Przypisany:</div>
                                      <div>{issue.assignee || '-'}</div>
                                      <div className="text-gray-500">Utworzony:</div>
                                      <div>
                                        {issue.created
                                          ? new Date(issue.created).toLocaleDateString('pl-PL')
                                          : '-'}
                                      </div>
                                      <div className="text-gray-500">Ostatnia zmiana:</div>
                                      <div>
                                        {issue.updated
                                          ? new Date(issue.updated).toLocaleDateString('pl-PL')
                                          : '-'}
                                      </div>
                                      {issue.duedate && (
                                        <>
                                          <div className="text-gray-500">Termin:</div>
                                          <div className="font-medium text-red-600">
                                            {new Date(issue.duedate).toLocaleDateString('pl-PL')}
                                          </div>
                                        </>
                                      )}
                                      {issue.resolution && (
                                        <>
                                          <div className="text-gray-500">Rozwiazanie:</div>
                                          <div>{issue.resolution}</div>
                                        </>
                                      )}
                                      <div className="text-gray-500">Czas w Jirze:</div>
                                      <div className="font-mono text-blue-600">
                                        {issue.timespent ? formatSeconds(issue.timespent) : '0h'}
                                      </div>
                                      <div className="text-gray-500">Czas w Tempo:</div>
                                      <div className="font-mono text-green-600">
                                        {logged > 0 ? formatSeconds(logged) : '0h'}
                                      </div>
                                      {issue.timeoriginalestimate && (
                                        <>
                                          <div className="text-gray-500">Estymacja:</div>
                                          <div className="font-mono">
                                            {formatSeconds(issue.timeoriginalestimate)}
                                          </div>
                                        </>
                                      )}
                                    </div>
                                    {/* Labels */}
                                    {issue.labels.length > 0 && (
                                      <div className="mt-2 flex flex-wrap gap-1">
                                        {issue.labels.map(l => (
                                          <Badge key={l} variant="outline" className="text-xs">
                                            {l}
                                          </Badge>
                                        ))}
                                      </div>
                                    )}
                                    {/* Components */}
                                    {issue.components.length > 0 && (
                                      <div className="mt-1 text-xs text-gray-500">
                                        Komponenty: {issue.components.join(', ')}
                                      </div>
                                    )}
                                  </div>

                                  {/* Parent info */}
                                  {issue.parentKey && (
                                    <div className="rounded border bg-white p-3 dark:bg-slate-800">
                                      <h4 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
                                        Parent
                                      </h4>
                                      <a
                                        href={`${JIRA_BASE}/${issue.parentKey}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                                      >
                                        <Badge variant="outline" className="font-mono text-xs">
                                          {issue.parentKey}
                                        </Badge>
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                      {issue.parentSummary && (
                                        <p className="mt-1 text-sm text-gray-600">
                                          {issue.parentSummary}
                                        </p>
                                      )}
                                    </div>
                                  )}

                                  {/* Subtasks */}
                                  {issue.subtasks.length > 0 && (
                                    <div className="rounded border bg-white p-3 dark:bg-slate-800">
                                      <h4 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                                        Subtaski ({issue.subtasks.length})
                                      </h4>
                                      <div className="space-y-1">
                                        {issue.subtasks.map(st => (
                                          <div
                                            key={st.key}
                                            className="flex items-center gap-2 text-sm"
                                          >
                                            <a
                                              href={`${JIRA_BASE}/${st.key}`}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="font-mono text-xs text-blue-600 hover:underline"
                                            >
                                              {st.key}
                                            </a>
                                            <Badge
                                              className={`text-[10px] ${getStatusColor(st.status)}`}
                                              variant="secondary"
                                            >
                                              {st.status}
                                            </Badge>
                                            <span className="truncate text-gray-600">
                                              {st.summary}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Readiness Criteria */}
                                  {readinessMap[issue.key] && (
                                    <ReadinessBadgesFull rc={readinessMap[issue.key]} />
                                  )}

                                  {/* Description */}
                                  {issue.description && (
                                    <div className="rounded border bg-white p-3 dark:bg-slate-800">
                                      <h4 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
                                        Opis
                                      </h4>
                                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                                        {issue.description}
                                      </pre>
                                    </div>
                                  )}
                                </div>

                                {/* Right column: Comments + Notes */}
                                <div className="space-y-4">
                                  {/* Notes */}
                                  <div className="rounded border bg-white p-3 dark:bg-slate-800">
                                    <h4 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
                                      Moje notatki
                                    </h4>
                                    <Textarea
                                      placeholder="Dodaj notatki do tego zadania..."
                                      value={ld?.notes || ''}
                                      onChange={e => handleNotesChange(issue.key, e.target.value)}
                                      rows={4}
                                    />
                                  </div>

                                  {/* Comments from Jira */}
                                  {issue.comments.length > 0 && (
                                    <div className="rounded border bg-white p-3 dark:bg-slate-800">
                                      <h4 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                                        Komentarze Jira ({issue.commentsCount})
                                      </h4>
                                      <div className="max-h-80 space-y-3 overflow-auto">
                                        {issue.comments.map((comment, ci) => (
                                          <div
                                            key={ci}
                                            className="rounded bg-gray-50 p-2 dark:bg-slate-700"
                                          >
                                            <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
                                              <span className="font-medium text-gray-700 dark:text-gray-300">
                                                {comment.author}
                                              </span>
                                              <span>
                                                {new Date(comment.created).toLocaleString('pl-PL', {
                                                  day: '2-digit',
                                                  month: '2-digit',
                                                  year: 'numeric',
                                                  hour: '2-digit',
                                                  minute: '2-digit',
                                                })}
                                              </span>
                                            </div>
                                            <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                                              {comment.body.length > 500
                                                ? comment.body.substring(0, 500) + '...'
                                                : comment.body}
                                            </pre>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* No comments/description info */}
                                  {!issue.description && issue.comments.length === 0 && (
                                    <div className="rounded border border-dashed bg-white p-4 text-center text-sm text-gray-400 dark:bg-slate-800">
                                      Brak opisu i komentarzy w Jirze.
                                      <br />
                                      Uzyj notatek powyzej, zeby dodac informacje.
                                    </div>
                                  )}
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
