'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import { apiUrl } from '@/lib/api';
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
  MessageCircle,
  Users,
  User,
  Layers,
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

type IssueScope = 'assigned' | 'project_all';

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
  assigneeId: string | null;
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

interface IssueGroup {
  id: string;
  parentKey: string | null;
  parentSummary: string | null;
  parentStatus: string | null;
  parentType: string | null;
  parentProject: string | null;
  parentIssue: JiraIssueItem | null;
  children: JiraIssueItem[];
  stats: { total: number; doneCount: number; jiraTime: number; tempoTime: number };
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
  const [slackSummary, setSlackSummary] = useState<{ totalMinutes: number; conversationCount: number; huddleCount: number } | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Scope: assigned (my tasks) vs project_all (all project tasks)
  const [scope, setScope] = useState<IssueScope>('assigned');
  const [accountId, setAccountId] = useState<string | null>(null);

  // Filters
  const [filterProject, setFilterProject] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [showDoneOnly, setShowDoneOnly] = useState(false);
  const [hideLocalDone, setHideLocalDone] = useState(false);

  // Sorting
  const [sortField, setSortField] = useState<string>('status');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Debounce refs for notes
  const notesTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const tempoLoaded = useRef(false);

  // Fetch Tempo worklogs + Slack only once (not on scope change)
  const loadSideData = useCallback(async () => {
    if (tempoLoaded.current) return;
    tempoLoaded.current = true;

    try {
      const tempoRes = await fetch(apiUrl('/api/tempo/worklogs-by-issue'));
      if (tempoRes.ok) {
        const tempoData = await tempoRes.json();
        setTimeByIssueKey(tempoData.timeByIssueKey || {});
        setTimeByIssueId(tempoData.timeByIssueId || {});
      }
    } catch {
      // Tempo fetch failed silently
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      const slackRes = await fetch(apiUrl(`/api/slack/activities?date=${today}`));
      if (slackRes.ok) {
        const slackData = await slackRes.json();
        const activities = slackData.activities || [];
        const totalMinutes = Math.round(activities.reduce((sum: number, a: { totalSeconds: number }) => sum + a.totalSeconds, 0) / 60);
        const conversationCount = activities.filter((a: { isMeeting?: boolean }) => !a.isMeeting).length;
        const huddleCount = activities.filter((a: { isMeeting?: boolean }) => a.isMeeting).length;
        setSlackSummary({ totalMinutes, conversationCount, huddleCount });
      }
    } catch {
      // Slack not configured - silently ignore
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const filter = scope === 'project_all' ? 'project_all' : 'assigned';
      const limit = scope === 'project_all' ? 500 : 200;

      const issuesRes = await fetch(apiUrl(`/api/jira/my-issues?filter=${filter}&limit=${limit}`));

      if (!issuesRes.ok) throw new Error('Nie udalo sie pobrac zadan z Jiry');

      const issuesData = await issuesRes.json();
      setIssues(issuesData.issues || []);
      if (issuesData.accountId) setAccountId(issuesData.accountId);

      // Załaduj dane lokalne
      setLocalData(getAllIssueLocalData());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Blad ladowania danych');
    }

    setLoading(false);
  }, [scope]);

  useEffect(() => {
    loadData();
    loadSideData();
  }, [loadData, loadSideData]);

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
  const assigneeOptions = useMemo(
    () => [...new Set(issues.map(i => i.assignee).filter(Boolean))].sort(),
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
        if (filterAssignee === 'mine' && issue.assigneeId !== accountId) return false;
        if (filterAssignee === 'unassigned' && issue.assignee) return false;
        if (filterAssignee !== 'all' && filterAssignee !== 'mine' && filterAssignee !== 'unassigned' && issue.assignee !== filterAssignee) return false;
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
    filterAssignee,
    accountId,
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

  // Expanded groups (parent-level collapse/expand)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['__all__']));

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const expandAllGroups = () => {
    setExpandedGroups(new Set(hierarchicalIssues.map(g => g.id)));
  };
  const collapseAllGroups = () => {
    setExpandedGroups(new Set());
  };

  // Build hierarchical tree from flat filtered issues
  const hierarchicalIssues: IssueGroup[] = useMemo(() => {
    const issueByKey = new Map<string, JiraIssueItem>();
    for (const issue of filteredIssues) {
      issueByKey.set(issue.key, issue);
    }

    const groupMap = new Map<string, IssueGroup>();
    const consumedKeys = new Set<string>();

    // Pass 1: group children under their parents
    for (const issue of filteredIssues) {
      if (!issue.parentKey) continue;

      const gid = issue.parentKey;
      if (!groupMap.has(gid)) {
        const parentIssue = issueByKey.get(issue.parentKey) || null;
        groupMap.set(gid, {
          id: gid,
          parentKey: issue.parentKey,
          parentSummary: parentIssue?.name || issue.parentSummary || issue.parentKey,
          parentStatus: parentIssue?.status || null,
          parentType: parentIssue?.type || 'Story',
          parentProject: parentIssue?.project || issue.project,
          parentIssue,
          children: [],
          stats: { total: 0, doneCount: 0, jiraTime: 0, tempoTime: 0 },
        });
      }
      groupMap.get(gid)!.children.push(issue);
      consumedKeys.add(issue.key);
    }

    // Mark parent issues that are group headers as consumed
    for (const [gid] of groupMap) {
      if (issueByKey.has(gid)) consumedKeys.add(gid);
    }

    // Pass 2: standalone issues (no parent, not consumed as parent)
    for (const issue of filteredIssues) {
      if (consumedKeys.has(issue.key)) continue;

      // Check if it has children in our list (it IS a parent)
      if (groupMap.has(issue.key)) continue;

      // True standalone — show as single row (no group header)
      groupMap.set(`_s_${issue.key}`, {
        id: `_s_${issue.key}`,
        parentKey: null,
        parentSummary: null,
        parentStatus: null,
        parentType: null,
        parentProject: null,
        parentIssue: null,
        children: [issue],
        stats: { total: 1, doneCount: 0, jiraTime: 0, tempoTime: 0 },
      });
    }

    // Calculate stats
    const groups: IssueGroup[] = [];
    for (const group of groupMap.values()) {
      const all = group.parentIssue
        ? [group.parentIssue, ...group.children]
        : group.children;
      group.stats = {
        total: all.length,
        doneCount: all.filter(i => localData[i.key]?.doneByMe).length,
        jiraTime: all.reduce((s, i) => s + (i.timespent || 0), 0),
        tempoTime: all.reduce((s, i) => s + getLoggedTime(i), 0),
      };
      groups.push(group);
    }

    // Sort: multi-child groups first (stories), then standalone
    return groups.sort((a, b) => {
      const aMulti = a.children.length > 1 || a.parentIssue ? 1 : 0;
      const bMulti = b.children.length > 1 || b.parentIssue ? 1 : 0;
      if (aMulti !== bMulti) return bMulti - aMulti;
      // Within same tier, sort by project then parent key
      const pa = a.parentProject || a.children[0]?.project || '';
      const pb = b.parentProject || b.children[0]?.project || '';
      if (pa !== pb) return pa.localeCompare(pb);
      return (a.parentKey || a.children[0]?.key || '').localeCompare(b.parentKey || b.children[0]?.key || '');
    });
  }, [filteredIssues, localData, getLoggedTime]);

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
    setFilterAssignee('all');
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
            {scope === 'assigned'
              ? 'Zadania przypisane do mnie \u2014 sledz postep i dodawaj notatki'
              : 'Wszystkie zadania z moich projektow \u2014 pelny widok hierarchii'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { tempoLoaded.current = false; loadData(); loadSideData(); }} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Odswiez
          </Button>
          <Button onClick={handleExportCSV} disabled={filteredIssues.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Eksport CSV
          </Button>
        </div>
      </div>

      {/* Scope Tabs */}
      <div className="flex gap-2">
        <Button
          variant={scope === 'assigned' ? 'default' : 'outline'}
          onClick={() => setScope('assigned')}
          className="gap-2"
        >
          <User className="h-4 w-4" />
          Moje zadania
          {scope === 'assigned' && !loading && (
            <Badge variant="secondary" className="ml-1 text-xs">
              {issues.length}
            </Badge>
          )}
        </Button>
        <Button
          variant={scope === 'project_all' ? 'default' : 'outline'}
          onClick={() => setScope('project_all')}
          className="gap-2"
        >
          <Users className="h-4 w-4" />
          Wszystkie z projektow
          {scope === 'project_all' && !loading && (
            <Badge variant="secondary" className="ml-1 text-xs">
              {issues.length}
            </Badge>
          )}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-6 lg:grid-cols-7 gap-4">
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
        {slackSummary && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <MessageCircle className="h-8 w-8 text-purple-500" />
                <div>
                  <div className="text-2xl font-bold">
                    {Math.floor(slackSummary.totalMinutes / 60)}h {slackSummary.totalMinutes % 60}m
                  </div>
                  <div className="text-xs text-gray-500">
                    {slackSummary.conversationCount} rozmów dziś
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
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
            {scope === 'project_all' && (
              <div>
                <label className="mb-1 block text-sm text-gray-500">Przypisany</label>
                <Select value={filterAssignee} onValueChange={setFilterAssignee}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Wszyscy</SelectItem>
                    <SelectItem value="mine">Moje</SelectItem>
                    <SelectItem value="unassigned">Nieprzypisane</SelectItem>
                    {assigneeOptions.map(a => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              Zadania ({filteredIssues.length} z {issues.length})
              {hierarchicalIssues.filter(g => g.parentKey).length > 0 && (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  / {hierarchicalIssues.filter(g => g.parentKey).length} grup
                </span>
              )}
            </CardTitle>
            {hierarchicalIssues.filter(g => g.parentKey).length > 0 && (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={expandAllGroups}>
                  Rozwin
                </Button>
                <Button variant="ghost" size="sm" onClick={collapseAllGroups}>
                  Zwin
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="py-8 text-center text-red-500">{error}</div>
          ) : loading ? (
            <div className="py-8 text-center text-gray-500">Ladowanie zadan z Jiry...</div>
          ) : filteredIssues.length === 0 ? (
            <div className="py-8 text-center text-gray-500">Brak zadan dla wybranych filtrow</div>
          ) : (
            <div className="max-h-[800px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">Done</TableHead>
                    <TableHead className="w-8"></TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('key')}>
                      Key {sortField === 'key' && (sortDir === 'asc' ? '\u2191' : '\u2193')}
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('name')}>
                      Summary {sortField === 'name' && (sortDir === 'asc' ? '\u2191' : '\u2193')}
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('status')}>
                      Status {sortField === 'status' && (sortDir === 'asc' ? '\u2191' : '\u2193')}
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('priority')}>
                      Priority {sortField === 'priority' && (sortDir === 'asc' ? '\u2191' : '\u2193')}
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('type')}>
                      Type {sortField === 'type' && (sortDir === 'asc' ? '\u2191' : '\u2193')}
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('project')}>
                      Project {sortField === 'project' && (sortDir === 'asc' ? '\u2191' : '\u2193')}
                    </TableHead>
                    {scope === 'project_all' && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('assignee')}>
                        Assignee {sortField === 'assignee' && (sortDir === 'asc' ? '\u2191' : '\u2193')}
                      </TableHead>
                    )}
                    <TableHead className="text-right">Jira Time</TableHead>
                    <TableHead className="text-right">Tempo</TableHead>
                    <TableHead className="text-center">Cmt</TableHead>
                    <TableHead className="w-16 text-center">RC</TableHead>
                    <TableHead className="w-10">N</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hierarchicalIssues.map(group => {
                    const isMultiGroup = group.parentKey !== null;
                    const isGroupOpen = expandedGroups.has(group.id);
                    const colCount = scope === 'project_all' ? 14 : 13;

                    // Helper to render a single issue row
                    const renderIssueRow = (issue: JiraIssueItem, indent: number) => {
                      const ld = localData[issue.key];
                      const isExpanded = expandedRows.has(issue.key);
                      const logged = getLoggedTime(issue) || 0;
                      const isMyIssue = accountId && issue.assigneeId === accountId;

                      return (
                        <Fragment key={issue.key}>
                          <TableRow
                            className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 ${ld?.doneByMe ? 'opacity-60' : ''} ${scope === 'project_all' && isMyIssue ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''} ${scope === 'project_all' && !isMyIssue && !ld?.doneByMe ? 'opacity-75' : ''}`}
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
                              <span style={{ paddingLeft: `${indent * 16}px` }} className="flex items-center gap-1">
                                {indent > 0 && <span className="text-gray-300">{'└'}</span>}
                                {issue.name}
                              </span>
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
                              <span className={`text-sm font-medium ${getPriorityColor(issue.priority)}`}>
                                {issue.priority || '-'}
                              </span>
                            </TableCell>
                            <TableCell onClick={() => toggleRow(issue.key)}>
                              <span className="text-xs text-gray-600">{issue.type || '-'}</span>
                            </TableCell>
                            <TableCell onClick={() => toggleRow(issue.key)}>
                              <Badge variant="secondary" className="text-xs">
                                {issue.project}
                              </Badge>
                            </TableCell>
                            {scope === 'project_all' && (
                              <TableCell onClick={() => toggleRow(issue.key)}>
                                <span className={`text-xs ${isMyIssue ? 'font-semibold text-blue-600' : 'text-gray-500'}`}>
                                  {issue.assignee || <span className="text-gray-300">-</span>}
                                </span>
                              </TableCell>
                            )}
                            <TableCell className="text-right" onClick={() => toggleRow(issue.key)}>
                              <span className={`font-mono text-sm ${issue.timespent ? 'text-blue-600' : 'text-gray-400'}`}>
                                {issue.timespent ? formatSeconds(issue.timespent) : '-'}
                              </span>
                            </TableCell>
                            <TableCell className="text-right" onClick={() => toggleRow(issue.key)}>
                              <span className={`font-mono text-sm ${logged > 0 ? 'font-medium text-green-600' : 'text-gray-400'}`}>
                                {logged > 0 ? formatSeconds(logged) : '-'}
                              </span>
                            </TableCell>
                            <TableCell className="text-center" onClick={() => toggleRow(issue.key)}>
                              {issue.commentsCount > 0 ? (
                                <Badge variant="secondary" className="text-xs">{issue.commentsCount}</Badge>
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

                          {/* Expanded detail panel */}
                          {isExpanded && (
                            <TableRow className="bg-slate-50 dark:bg-slate-900">
                              <TableCell colSpan={colCount} className="p-4">
                                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                                  <div className="space-y-4">
                                    <div className="rounded border bg-white p-3 dark:bg-slate-800">
                                      <h4 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Informacje</h4>
                                      <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div className="text-gray-500">Projekt:</div>
                                        <div className="font-medium">{issue.projectName || issue.project}</div>
                                        <div className="text-gray-500">Typ:</div>
                                        <div>{issue.type || '-'}</div>
                                        <div className="text-gray-500">Priorytet:</div>
                                        <div className={getPriorityColor(issue.priority)}>{issue.priority || '-'}</div>
                                        <div className="text-gray-500">Przypisany:</div>
                                        <div>{issue.assignee || '-'}</div>
                                        <div className="text-gray-500">Utworzony:</div>
                                        <div>{issue.created ? new Date(issue.created).toLocaleDateString('pl-PL') : '-'}</div>
                                        <div className="text-gray-500">Ostatnia zmiana:</div>
                                        <div>{issue.updated ? new Date(issue.updated).toLocaleDateString('pl-PL') : '-'}</div>
                                        {issue.duedate && (<><div className="text-gray-500">Termin:</div><div className="font-medium text-red-600">{new Date(issue.duedate).toLocaleDateString('pl-PL')}</div></>)}
                                        {issue.resolution && (<><div className="text-gray-500">Rozwiazanie:</div><div>{issue.resolution}</div></>)}
                                        <div className="text-gray-500">Czas w Jirze:</div>
                                        <div className="font-mono text-blue-600">{issue.timespent ? formatSeconds(issue.timespent) : '0h'}</div>
                                        <div className="text-gray-500">Czas w Tempo:</div>
                                        <div className="font-mono text-green-600">{logged > 0 ? formatSeconds(logged) : '0h'}</div>
                                        {issue.timeoriginalestimate && (<><div className="text-gray-500">Estymacja:</div><div className="font-mono">{formatSeconds(issue.timeoriginalestimate)}</div></>)}
                                      </div>
                                      {issue.labels.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1">
                                          {issue.labels.map(l => (<Badge key={l} variant="outline" className="text-xs">{l}</Badge>))}
                                        </div>
                                      )}
                                      {issue.components.length > 0 && (
                                        <div className="mt-1 text-xs text-gray-500">Komponenty: {issue.components.join(', ')}</div>
                                      )}
                                    </div>
                                    {issue.parentKey && (
                                      <div className="rounded border bg-white p-3 dark:bg-slate-800">
                                        <h4 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">Parent</h4>
                                        <a href={`${JIRA_BASE}/${issue.parentKey}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                                          <Badge variant="outline" className="font-mono text-xs">{issue.parentKey}</Badge>
                                          <ExternalLink className="h-3 w-3" />
                                        </a>
                                        {issue.parentSummary && <p className="mt-1 text-sm text-gray-600">{issue.parentSummary}</p>}
                                      </div>
                                    )}
                                    {issue.subtasks.length > 0 && (
                                      <div className="rounded border bg-white p-3 dark:bg-slate-800">
                                        <h4 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Subtaski ({issue.subtasks.length})</h4>
                                        <div className="space-y-1">
                                          {issue.subtasks.map(st => (
                                            <div key={st.key} className="flex items-center gap-2 text-sm">
                                              <a href={`${JIRA_BASE}/${st.key}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-blue-600 hover:underline">{st.key}</a>
                                              <Badge className={`text-[10px] ${getStatusColor(st.status)}`} variant="secondary">{st.status}</Badge>
                                              <span className="truncate text-gray-600">{st.summary}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {readinessMap[issue.key] && <ReadinessBadgesFull rc={readinessMap[issue.key]} />}
                                    {issue.description && (
                                      <div className="rounded border bg-white p-3 dark:bg-slate-800">
                                        <h4 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">Opis</h4>
                                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{issue.description}</pre>
                                      </div>
                                    )}
                                  </div>
                                  <div className="space-y-4">
                                    <div className="rounded border bg-white p-3 dark:bg-slate-800">
                                      <h4 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">Moje notatki</h4>
                                      <Textarea placeholder="Dodaj notatki do tego zadania..." value={ld?.notes || ''} onChange={e => handleNotesChange(issue.key, e.target.value)} rows={4} />
                                    </div>
                                    {issue.comments.length > 0 && (
                                      <div className="rounded border bg-white p-3 dark:bg-slate-800">
                                        <h4 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Komentarze Jira ({issue.commentsCount})</h4>
                                        <div className="max-h-80 space-y-3 overflow-auto">
                                          {issue.comments.map((comment, ci) => (
                                            <div key={ci} className="rounded bg-gray-50 p-2 dark:bg-slate-700">
                                              <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
                                                <span className="font-medium text-gray-700 dark:text-gray-300">{comment.author}</span>
                                                <span>{new Date(comment.created).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                              </div>
                                              <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{comment.body.length > 500 ? comment.body.substring(0, 500) + '...' : comment.body}</pre>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {!issue.description && issue.comments.length === 0 && (
                                      <div className="rounded border border-dashed bg-white p-4 text-center text-sm text-gray-400 dark:bg-slate-800">
                                        Brak opisu i komentarzy w Jirze.<br />Uzyj notatek powyzej, zeby dodac informacje.
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    };

                    // --- Render group ---
                    if (!isMultiGroup) {
                      // Standalone issue (no parent group) — render directly
                      return group.children.map(issue => renderIssueRow(issue, 0));
                    }

                    // Multi-child group — render group header + children
                    return (
                      <Fragment key={group.id}>
                        {/* Group header row */}
                        <TableRow
                          className="cursor-pointer bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
                          onClick={() => toggleGroup(group.id)}
                        >
                          <TableCell colSpan={colCount}>
                            <div className="flex items-center gap-3">
                              {isGroupOpen ? (
                                <ChevronDown className="h-4 w-4 text-slate-500" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-slate-500" />
                              )}
                              <Layers className="h-4 w-4 text-indigo-500" />
                              {group.parentKey && (
                                <a
                                  href={`${JIRA_BASE}/${group.parentKey}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-mono text-xs text-indigo-600 hover:underline"
                                  onClick={e => e.stopPropagation()}
                                >
                                  {group.parentKey}
                                </a>
                              )}
                              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                {group.parentSummary}
                              </span>
                              {group.parentStatus && (
                                <Badge className={`text-[10px] ${getStatusColor(group.parentStatus)}`} variant="secondary">
                                  {group.parentStatus}
                                </Badge>
                              )}
                              <span className="text-xs text-gray-400">{group.parentType}</span>
                              <Badge variant="outline" className="text-[10px]">{group.parentProject}</Badge>
                              {/* Aggregate stats */}
                              <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
                                <span>{group.stats.total} zadan</span>
                                {group.stats.doneCount > 0 && (
                                  <span className="text-green-600">{group.stats.doneCount} done</span>
                                )}
                                {group.stats.jiraTime > 0 && (
                                  <span className="font-mono text-blue-500">{formatSeconds(group.stats.jiraTime)}</span>
                                )}
                                {group.stats.tempoTime > 0 && (
                                  <span className="font-mono text-green-500">{formatSeconds(group.stats.tempoTime)}</span>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Children (if group expanded) */}
                        {isGroupOpen && (
                          <>
                            {group.parentIssue && renderIssueRow(group.parentIssue, 0)}
                            {group.children.map(issue => renderIssueRow(issue, 1))}
                          </>
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
