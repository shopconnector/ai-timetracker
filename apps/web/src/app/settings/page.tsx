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
} from "@/components/ui/select";
import {
  Settings,
  Trash2,
  Download,
  Upload,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Plus,
  Link2,
  Key,
  Save,
  TestTube,
  ThumbsUp,
  ThumbsDown,
  Brain,
  TrendingUp,
  Target,
  Calendar,
  Clock,
  Umbrella,
  FileText,
  BarChart3
} from 'lucide-react';
import {
  getProjectMappings,
  getTaskHistory,
  clearTaskHistory,
  clearProjectMappings,
  exportHistory,
  importHistory,
  setProjectMapping,
  deleteProjectMapping,
  getFeedbackStats,
  clearSuggestionFeedback,
  getBadSuggestions,
  type ProjectMapping,
  type TaskUsage
} from '@/lib/taskHistory';
import {
  getTimeTargets,
  setTimeTargets,
  getHolidays,
  addHoliday,
  removeHoliday,
  getTimeOffs,
  addTimeOff,
  removeTimeOff,
  exportTargetsData,
  importTargetsData,
  type TimeTargets,
  type Holiday,
  type TimeOff
} from '@/lib/targets';
import {
  getAuditStats,
  clearAuditTrail,
  exportAuditTrail,
  type AuditStats
} from '@/lib/auditTrail';

interface APIStatus {
  name: string;
  status: 'ok' | 'error' | 'unconfigured';
  message?: string;
}

interface JiraProject {
  id: string;
  key: string;
  name: string;
}

interface JiraIssue {
  key: string;
  name: string;
  project: string;
}

export default function SettingsPage() {
  const [apiStatus, setApiStatus] = useState<APIStatus[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const [projectMappings, setProjectMappingsList] = useState<ProjectMapping[]>([]);
  const [taskHistory, setTaskHistoryList] = useState<TaskUsage[]>([]);
  const [feedbackStats, setFeedbackStats] = useState<{
    total: number;
    positive: number;
    negative: number;
    accuracy: number;
    bySource: Record<string, { positive: number; negative: number }>;
  } | null>(null);
  const [badSuggestions, setBadSuggestions] = useState<Array<{
    pattern: string;
    suggestedTicket: string;
    rejectionCount: number;
  }>>([]);

  // Audit trail state
  const [auditStats, setAuditStats] = useState<AuditStats | null>(null);

  // Targets state
  const [targets, setTargetsState] = useState<TimeTargets | null>(null);
  const [holidays, setHolidaysList] = useState<Holiday[]>([]);
  const [timeOffs, setTimeOffsList] = useState<TimeOff[]>([]);
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newTimeOffStart, setNewTimeOffStart] = useState('');
  const [newTimeOffEnd, setNewTimeOffEnd] = useState('');
  const [newTimeOffType, setNewTimeOffType] = useState<'vacation' | 'sick' | 'remote' | 'other'>('vacation');

  const [jiraProjects, setJiraProjects] = useState<JiraProject[]>([]);
  const [jiraIssues, setJiraIssues] = useState<JiraIssue[]>([]);
  const [loadingJira, setLoadingJira] = useState(false);

  // New mapping form
  const [newProject, setNewProject] = useState('');
  const [newTaskKey, setNewTaskKey] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // API Configuration
  const [apiConfig, setApiConfig] = useState({
    tempoApiToken: '',
    tempoAccountId: '',
    jiraBaseUrl: '',
    jiraApiToken: '',
    jiraEmail: '',
    activityWatchUrl: 'http://localhost:5600',
    openRouterApiKey: '',
    llmModel: 'anthropic/claude-3.5-haiku',
  });
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingApis, setTestingApis] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  // Load data on mount
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = useCallback(async () => {
    // Load local data
    setProjectMappingsList(getProjectMappings());
    setTaskHistoryList(getTaskHistory());
    setFeedbackStats(getFeedbackStats());
    setBadSuggestions(getBadSuggestions());

    // Load targets data
    setTargetsState(getTimeTargets());
    setHolidaysList(getHolidays());
    setTimeOffsList(getTimeOffs());

    // Load audit stats
    setAuditStats(getAuditStats());

    // Load API status
    setLoadingStatus(true);
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      setApiStatus(data.apis || []);
    } catch {
      setApiStatus([]);
    }
    setLoadingStatus(false);

    // Load user settings / API config
    try {
      const settingsRes = await fetch('/api/settings');
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        setApiConfig({
          tempoApiToken: settings.tempoApiToken || '',
          tempoAccountId: settings.tempoAccountId || '',
          jiraBaseUrl: settings.jiraBaseUrl || '',
          jiraApiToken: settings.jiraApiToken || '',
          jiraEmail: settings.jiraEmail || '',
          activityWatchUrl: settings.activityWatchUrl || 'http://localhost:5600',
          openRouterApiKey: settings.openRouterApiKey || '',
          llmModel: settings.llmModel || 'anthropic/claude-3.5-haiku',
        });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }

    // Load Jira projects and issues
    loadJiraData();
  }, []);

  const handleSaveApiConfig = async () => {
    setSavingConfig(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiConfig),
      });

      if (res.ok) {
        alert('Konfiguracja zapisana!');
        loadAllData();
      } else {
        const data = await res.json();
        alert(`Błąd: ${data.error}`);
      }
    } catch (error) {
      console.error('Error saving config:', error);
      alert('Błąd zapisu konfiguracji');
    }
    setSavingConfig(false);
  };

  const handleTestApis = async () => {
    setTestingApis(true);
    setTestResults({});
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testType: 'all' }),
      });

      if (res.ok) {
        const data = await res.json();
        setTestResults(data.results || {});
      }
    } catch (error) {
      console.error('Error testing APIs:', error);
    }
    setTestingApis(false);
  };

  const loadJiraData = async () => {
    setLoadingJira(true);
    try {
      const [projectsRes, issuesRes] = await Promise.all([
        fetch('/api/jira/projects'),
        fetch('/api/jira/my-issues')
      ]);

      if (projectsRes.ok) {
        const data = await projectsRes.json();
        setJiraProjects(data.projects || []);
      }

      if (issuesRes.ok) {
        const data = await issuesRes.json();
        setJiraIssues(data.issues || []);
      }
    } catch (error) {
      console.error('Error loading Jira data:', error);
    }
    setLoadingJira(false);
  };

  const handleClearHistory = () => {
    if (confirm('Czy na pewno chcesz wyczyścić całą historię tasków?')) {
      clearTaskHistory();
      setTaskHistoryList([]);
    }
  };

  const handleClearMappings = () => {
    if (confirm('Czy na pewno chcesz wyczyścić wszystkie mapowania projektów?')) {
      clearProjectMappings();
      setProjectMappingsList([]);
    }
  };

  const handleClearFeedback = () => {
    if (confirm('Czy na pewno chcesz wyczyścić historię feedbacku AI?')) {
      clearSuggestionFeedback();
      setFeedbackStats(getFeedbackStats());
      setBadSuggestions([]);
    }
  };

  const handleClearAuditTrail = () => {
    if (confirm('Czy na pewno chcesz wyczyścić audit trail? Ta operacja jest nieodwracalna.')) {
      clearAuditTrail();
      setAuditStats(getAuditStats());
    }
  };

  const handleExportAuditTrail = () => {
    const data = exportAuditTrail();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timetracker-audit-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Targets handlers
  const handleSaveTargets = (newTargets: Partial<TimeTargets>) => {
    setTimeTargets(newTargets);
    setTargetsState(getTimeTargets());
  };

  const handleAddHoliday = () => {
    if (!newHolidayDate || !newHolidayName) return;
    addHoliday({
      date: newHolidayDate,
      name: newHolidayName,
      isRecurring: false
    });
    setHolidaysList(getHolidays());
    setNewHolidayDate('');
    setNewHolidayName('');
  };

  const handleRemoveHoliday = (date: string) => {
    removeHoliday(date);
    setHolidaysList(getHolidays());
  };

  const handleAddTimeOff = () => {
    if (!newTimeOffStart || !newTimeOffEnd) return;
    addTimeOff({
      startDate: newTimeOffStart,
      endDate: newTimeOffEnd,
      type: newTimeOffType
    });
    setTimeOffsList(getTimeOffs());
    setNewTimeOffStart('');
    setNewTimeOffEnd('');
  };

  const handleRemoveTimeOff = (id: string) => {
    removeTimeOff(id);
    setTimeOffsList(getTimeOffs());
  };

  const handleExport = () => {
    const data = exportHistory();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timetracker-history-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (importHistory(content)) {
        setProjectMappingsList(getProjectMappings());
        setTaskHistoryList(getTaskHistory());
        alert('Import zakończony pomyślnie!');
      } else {
        alert('Błąd importu - nieprawidłowy format pliku');
      }
    };
    reader.readAsText(file);
  };

  const handleAddMapping = () => {
    if (!newProject || !newTaskKey) return;

    const issue = jiraIssues.find(i => i.key === newTaskKey);
    const taskName = issue?.name || newTaskKey;

    setProjectMapping(newProject, newTaskKey, taskName);
    setProjectMappingsList(getProjectMappings());
    setNewProject('');
    setNewTaskKey('');
  };

  const handleDeleteMapping = (project: string) => {
    deleteProjectMapping(project);
    setProjectMappingsList(getProjectMappings());
  };

  const handleSearchIssues = async () => {
    if (!searchQuery) return;
    setLoadingJira(true);
    try {
      const res = await fetch(`/api/jira/my-issues?query=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setJiraIssues(data.issues || []);
      }
    } catch (error) {
      console.error('Search error:', error);
    }
    setLoadingJira(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ok':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ok':
        return <Badge className="bg-green-500">OK</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="secondary">Unconfigured</Badge>;
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Settings</h1>
        <p className="text-slate-500 dark:text-slate-400">Configure your TimeTracker integrations</p>
      </div>

        {/* API Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Status API</CardTitle>
              <Button variant="ghost" size="sm" onClick={loadAllData} disabled={loadingStatus}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loadingStatus ? 'animate-spin' : ''}`} />
                Odśwież
              </Button>
            </div>
            <CardDescription>Stan połączeń z zewnętrznymi serwisami</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {apiStatus.map((api, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(api.status)}
                    <span className="font-medium">{api.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {api.message && (
                      <span className="text-sm text-gray-500 max-w-xs truncate">{api.message}</span>
                    )}
                    {getStatusBadge(api.status)}
                  </div>
                </div>
              ))}
              {apiStatus.length === 0 && !loadingStatus && (
                <p className="text-gray-500 text-center py-4">Brak danych o statusie API</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Time Targets */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Target className="h-5 w-5 text-blue-600" />
              <div>
                <CardTitle className="text-lg">Cele czasowe</CardTitle>
                <CardDescription>Ustaw dzienne i tygodniowe cele pracy</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {targets && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-500 mb-1 block">Cel dzienny (godziny)</label>
                    <Input
                      type="number"
                      min="1"
                      max="24"
                      value={targets.dailyHours}
                      onChange={(e) => handleSaveTargets({ dailyHours: parseInt(e.target.value) || 8 })}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 mb-1 block">Cel tygodniowy (godziny)</label>
                    <Input
                      type="number"
                      min="1"
                      max="168"
                      value={targets.weeklyHours}
                      onChange={(e) => handleSaveTargets({ weeklyHours: parseInt(e.target.value) || 40 })}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-500 mb-2 block">Dni robocze</label>
                  <div className="flex gap-2">
                    {['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'].map((day, index) => (
                      <Button
                        key={index}
                        variant={targets.workDays.includes(index) ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          const newDays = targets.workDays.includes(index)
                            ? targets.workDays.filter(d => d !== index)
                            : [...targets.workDays, index].sort();
                          handleSaveTargets({ workDays: newDays });
                        }}
                      >
                        {day}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="flexibleHours"
                    checked={targets.flexibleHours}
                    onChange={(e) => handleSaveTargets({ flexibleHours: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <label htmlFor="flexibleHours" className="text-sm text-gray-600">
                    Elastyczny czas pracy (nadgodziny kompensują braki)
                  </label>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Time Off / Holidays */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Umbrella className="h-5 w-5 text-green-600" />
              <div>
                <CardTitle className="text-lg">Urlopy i święta</CardTitle>
                <CardDescription>Zarządzaj dniami wolnymi</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add Time Off */}
            <div className="p-3 bg-gray-50 rounded-lg space-y-3">
              <p className="font-medium text-sm">Dodaj urlop / wolne</p>
              <div className="grid grid-cols-4 gap-2">
                <Input
                  type="date"
                  value={newTimeOffStart}
                  onChange={(e) => setNewTimeOffStart(e.target.value)}
                  placeholder="Od"
                />
                <Input
                  type="date"
                  value={newTimeOffEnd}
                  onChange={(e) => setNewTimeOffEnd(e.target.value)}
                  placeholder="Do"
                />
                <Select value={newTimeOffType} onValueChange={(v: 'vacation' | 'sick' | 'remote' | 'other') => setNewTimeOffType(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vacation">🏖️ Urlop</SelectItem>
                    <SelectItem value="sick">🤒 Choroba</SelectItem>
                    <SelectItem value="remote">🏠 Home Office</SelectItem>
                    <SelectItem value="other">📅 Inne</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleAddTimeOff} disabled={!newTimeOffStart || !newTimeOffEnd}>
                  <Plus className="h-4 w-4 mr-1" />
                  Dodaj
                </Button>
              </div>
            </div>

            {/* Time Off List */}
            {timeOffs.length > 0 && (
              <div className="space-y-2">
                <p className="font-medium text-sm text-gray-600">Zaplanowane wolne:</p>
                {timeOffs.map((to) => (
                  <div key={to.id} className="flex items-center justify-between p-2 bg-blue-50 rounded">
                    <div className="flex items-center gap-2">
                      <span>
                        {to.type === 'vacation' ? '🏖️' : to.type === 'sick' ? '🤒' : to.type === 'remote' ? '🏠' : '📅'}
                      </span>
                      <span className="text-sm">
                        {to.startDate} — {to.endDate}
                      </span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleRemoveTimeOff(to.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add Holiday */}
            <div className="p-3 bg-gray-50 rounded-lg space-y-3">
              <p className="font-medium text-sm">Dodaj święto / dzień wolny</p>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  type="date"
                  value={newHolidayDate}
                  onChange={(e) => setNewHolidayDate(e.target.value)}
                  placeholder="Data"
                />
                <Input
                  value={newHolidayName}
                  onChange={(e) => setNewHolidayName(e.target.value)}
                  placeholder="Nazwa święta"
                />
                <Button onClick={handleAddHoliday} disabled={!newHolidayDate || !newHolidayName}>
                  <Plus className="h-4 w-4 mr-1" />
                  Dodaj
                </Button>
              </div>
            </div>

            {/* Holidays List */}
            <div className="space-y-2">
              <p className="font-medium text-sm text-gray-600">Święta w tym roku:</p>
              <div className="flex flex-wrap gap-2">
                {holidays.slice(0, 15).map((h, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {h.isRecurring ? '🔄' : '📅'} {h.date.length === 5 ? h.date : h.date.slice(5)} - {h.name}
                    {!h.isRecurring && (
                      <button
                        onClick={() => handleRemoveHoliday(h.date)}
                        className="ml-1 text-red-500 hover:text-red-700"
                      >
                        ×
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* API Configuration */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Key className="h-5 w-5 text-gray-600" />
                <div>
                  <CardTitle className="text-lg">Konfiguracja API</CardTitle>
                  <CardDescription>Klucze API do Tempo, Jira, ActivityWatch i OpenRouter</CardDescription>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleTestApis} disabled={testingApis}>
                  <TestTube className={`h-4 w-4 mr-2 ${testingApis ? 'animate-pulse' : ''}`} />
                  Testuj
                </Button>
                <Button size="sm" onClick={handleSaveApiConfig} disabled={savingConfig}>
                  <Save className={`h-4 w-4 mr-2 ${savingConfig ? 'animate-spin' : ''}`} />
                  Zapisz
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Test Results */}
            {Object.keys(testResults).length > 0 && (
              <div className="p-4 bg-gray-50 rounded-lg space-y-2">
                <p className="font-medium text-sm mb-2">Wyniki testów:</p>
                {Object.entries(testResults).map(([key, result]) => (
                  <div key={key} className="flex items-center gap-2 text-sm">
                    {result.success ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="font-medium capitalize">{key}:</span>
                    <span className={result.success ? 'text-green-600' : 'text-red-600'}>
                      {result.message}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Tempo Configuration */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm text-gray-700 flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                Tempo API
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-500 mb-1 block">API Token</label>
                  <Input
                    type="password"
                    placeholder="Tempo API Token"
                    value={apiConfig.tempoApiToken}
                    onChange={(e) => setApiConfig({ ...apiConfig, tempoApiToken: e.target.value })}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Pobierz z: tempo.io → Settings → API Integration
                  </p>
                </div>
                <div>
                  <label className="text-sm text-gray-500 mb-1 block">Account ID</label>
                  <Input
                    placeholder="712020:xxxxxxxx-xxxx-xxxx-xxxx"
                    value={apiConfig.tempoAccountId}
                    onChange={(e) => setApiConfig({ ...apiConfig, tempoAccountId: e.target.value })}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Twoje Atlassian Account ID
                  </p>
                </div>
              </div>
            </div>

            {/* Jira Configuration */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm text-gray-700 flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                Jira API
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm text-gray-500 mb-1 block">Base URL</label>
                  <Input
                    placeholder="https://company.atlassian.net"
                    value={apiConfig.jiraBaseUrl}
                    onChange={(e) => setApiConfig({ ...apiConfig, jiraBaseUrl: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-500 mb-1 block">Email</label>
                  <Input
                    type="email"
                    placeholder="email@company.com"
                    value={apiConfig.jiraEmail}
                    onChange={(e) => setApiConfig({ ...apiConfig, jiraEmail: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-500 mb-1 block">API Token</label>
                  <Input
                    type="password"
                    placeholder="Jira API Token"
                    value={apiConfig.jiraApiToken}
                    onChange={(e) => setApiConfig({ ...apiConfig, jiraApiToken: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400">
                Utwórz token: id.atlassian.com/manage/api-tokens
              </p>
            </div>

            {/* ActivityWatch Configuration */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm text-gray-700 flex items-center gap-2">
                <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                ActivityWatch
              </h3>
              <div>
                <label className="text-sm text-gray-500 mb-1 block">Server URL</label>
                <Input
                  placeholder="http://localhost:5600"
                  value={apiConfig.activityWatchUrl}
                  onChange={(e) => setApiConfig({ ...apiConfig, activityWatchUrl: e.target.value })}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Domyślnie: http://localhost:5600 (ActivityWatch musi być uruchomiony)
                </p>
              </div>
            </div>

            {/* OpenRouter Configuration */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm text-gray-700 flex items-center gap-2">
                <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                OpenRouter (AI)
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-500 mb-1 block">API Key</label>
                  <Input
                    type="password"
                    placeholder="OpenRouter API Key"
                    value={apiConfig.openRouterApiKey}
                    onChange={(e) => setApiConfig({ ...apiConfig, openRouterApiKey: e.target.value })}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Pobierz z: openrouter.ai/keys
                  </p>
                </div>
                <div>
                  <label className="text-sm text-gray-500 mb-1 block">Model LLM</label>
                  <Select
                    value={apiConfig.llmModel}
                    onValueChange={(value) => setApiConfig({ ...apiConfig, llmModel: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="anthropic/claude-3.5-haiku">
                        Claude 3.5 Haiku (szybki, $0.25/1k)
                      </SelectItem>
                      <SelectItem value="anthropic/claude-3.5-sonnet">
                        Claude 3.5 Sonnet (premium, $3/1k)
                      </SelectItem>
                      <SelectItem value="openai/gpt-4o-mini">
                        GPT-4o Mini (tani, $0.15/1k)
                      </SelectItem>
                      <SelectItem value="openai/gpt-4o">
                        GPT-4o (premium, $5/1k)
                      </SelectItem>
                      <SelectItem value="google/gemini-flash-1.5">
                        Gemini Flash 1.5 (najtańszy, $0.075/1k)
                      </SelectItem>
                      <SelectItem value="meta-llama/llama-3.1-70b-instruct">
                        Llama 3.1 70B (open source, $0.59/1k)
                      </SelectItem>
                      <SelectItem value="qwen/qwen-2.5-72b-instruct">
                        Qwen 2.5 72B (open source, $0.35/1k)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-400 mt-1">
                    Automatyczny fallback do innych modeli jeśli wybrany zawiedzie
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Project Mappings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Mapowania projektów
            </CardTitle>
            <CardDescription>
              Przypisz projekty (foldery z VS Code) do domyślnych tasków Jira
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add new mapping */}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-sm text-gray-500 mb-1 block">Nazwa projektu</label>
                <Input
                  placeholder="np. timetracker"
                  value={newProject}
                  onChange={(e) => setNewProject(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <label className="text-sm text-gray-500 mb-1 block">Task Jira</label>
                <Select value={newTaskKey} onValueChange={setNewTaskKey}>
                  <SelectTrigger>
                    <SelectValue placeholder="Wybierz task" />
                  </SelectTrigger>
                  <SelectContent>
                    {jiraIssues.slice(0, 50).map((issue) => (
                      <SelectItem key={issue.key} value={issue.key}>
                        [{issue.key}] {issue.name.slice(0, 40)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAddMapping} disabled={!newProject || !newTaskKey}>
                <Plus className="h-4 w-4 mr-1" />
                Dodaj
              </Button>
            </div>

            {/* Search issues */}
            <div className="flex gap-2">
              <Input
                placeholder="Szukaj tasków Jira..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchIssues()}
              />
              <Button variant="outline" onClick={handleSearchIssues} disabled={loadingJira}>
                {loadingJira ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Szukaj'}
              </Button>
            </div>

            {/* Existing mappings */}
            <div className="space-y-2">
              {projectMappings.length === 0 ? (
                <p className="text-gray-500 text-center py-4">
                  Brak mapowań. Dodaj pierwsze mapowanie powyżej.
                </p>
              ) : (
                projectMappings.map((mapping) => (
                  <div
                    key={mapping.project}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{mapping.project}</Badge>
                      <span className="text-gray-400">→</span>
                      <span className="font-mono text-sm">{mapping.taskKey}</span>
                      <span className="text-gray-500 text-sm truncate max-w-xs">
                        {mapping.taskName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={mapping.confidence >= 0.7 ? 'default' : 'secondary'}>
                        {Math.round(mapping.confidence * 100)}%
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteMapping(mapping.project)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* AI Feedback Stats */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Brain className="h-5 w-5 text-purple-600" />
                <div>
                  <CardTitle className="text-lg">Feedback AI</CardTitle>
                  <CardDescription>
                    Statystyki sugestii i uczenie się z feedbacku
                  </CardDescription>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleClearFeedback}>
                <Trash2 className="h-4 w-4 mr-2" />
                Wyczyść
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Stats Overview */}
            {feedbackStats && feedbackStats.total > 0 ? (
              <>
                <div className="grid grid-cols-4 gap-4">
                  <div className="p-3 bg-gray-50 rounded-lg text-center">
                    <div className="text-2xl font-bold">{feedbackStats.total}</div>
                    <div className="text-xs text-gray-500">Wszystkie</div>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg text-center">
                    <div className="text-2xl font-bold text-green-600 flex items-center justify-center gap-1">
                      <ThumbsUp className="h-4 w-4" />
                      {feedbackStats.positive}
                    </div>
                    <div className="text-xs text-gray-500">Dobre</div>
                  </div>
                  <div className="p-3 bg-red-50 rounded-lg text-center">
                    <div className="text-2xl font-bold text-red-600 flex items-center justify-center gap-1">
                      <ThumbsDown className="h-4 w-4" />
                      {feedbackStats.negative}
                    </div>
                    <div className="text-xs text-gray-500">Złe</div>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg text-center">
                    <div className="text-2xl font-bold text-blue-600 flex items-center justify-center gap-1">
                      <TrendingUp className="h-4 w-4" />
                      {Math.round(feedbackStats.accuracy * 100)}%
                    </div>
                    <div className="text-xs text-gray-500">Trafność</div>
                  </div>
                </div>

                {/* By Source Breakdown */}
                {Object.keys(feedbackStats.bySource).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-600">Wg źródła:</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(feedbackStats.bySource).map(([source, stats]) => (
                        <Badge key={source} variant="outline" className="text-xs">
                          {source === 'llm' ? '🤖 LLM' : source === 'history' ? '📚 Historia' : '📁 Mapping'}:
                          <span className="text-green-600 ml-1">+{stats.positive}</span>
                          <span className="text-red-600 ml-1">-{stats.negative}</span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bad Suggestions */}
                {badSuggestions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-600">Często odrzucane sugestie:</p>
                    <div className="space-y-1">
                      {badSuggestions.slice(0, 5).map((bad, i) => (
                        <div key={i} className="flex items-center justify-between text-xs p-2 bg-red-50 rounded">
                          <span className="truncate flex-1" title={bad.pattern}>
                            {bad.pattern.split(':')[0]} → <span className="font-mono">{bad.suggestedTicket}</span>
                          </span>
                          <Badge variant="destructive" className="ml-2">
                            {bad.rejectionCount}x ❌
                          </Badge>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400">
                      Te sugestie nie będą już proponowane dla podobnych aktywności.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-gray-500 text-center py-4">
                Brak feedbacku. Używaj 👍/👎 przy sugestiach aby AI się uczyło.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Audit Trail */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <BarChart3 className="h-5 w-5 text-indigo-600" />
                <div>
                  <CardTitle className="text-lg">Audit Trail</CardTitle>
                  <CardDescription>
                    Szczegółowa historia decyzji AI vs użytkownik
                  </CardDescription>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleExportAuditTrail}>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <Button variant="outline" size="sm" onClick={handleClearAuditTrail}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Wyczyść
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {auditStats && auditStats.totalEntries > 0 ? (
              <>
                {/* Summary Stats */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="p-3 bg-gray-50 rounded-lg text-center">
                    <div className="text-2xl font-bold">{auditStats.totalEntries}</div>
                    <div className="text-xs text-gray-500">Wszystkie wpisy</div>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg text-center">
                    <div className="text-2xl font-bold text-green-600">{auditStats.byAction.accepted}</div>
                    <div className="text-xs text-gray-500">Zaakceptowane</div>
                  </div>
                  <div className="p-3 bg-yellow-50 rounded-lg text-center">
                    <div className="text-2xl font-bold text-yellow-600">{auditStats.byAction.modified}</div>
                    <div className="text-xs text-gray-500">Zmodyfikowane</div>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg text-center">
                    <div className="text-2xl font-bold text-blue-600">{auditStats.byAction.manual}</div>
                    <div className="text-xs text-gray-500">Ręczne</div>
                  </div>
                </div>

                {/* Accuracy by Source */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-600">Trafność wg źródła:</p>
                  <div className="grid grid-cols-3 gap-3">
                    {Object.entries(auditStats.bySource).map(([source, data]) => (
                      <div key={source} className="p-2 border rounded text-center">
                        <div className="text-xs text-gray-500 mb-1">
                          {source === 'llm' ? '🤖 LLM' : source === 'history' ? '📚 Historia' : '📁 Mapping'}
                        </div>
                        <div className="text-lg font-bold">
                          {Math.round(data.accuracy * 100)}%
                        </div>
                        <div className="text-xs text-gray-400">
                          {data.accepted}/{data.total}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent Trend */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-600">Trend:</p>
                  <div className="flex gap-4">
                    <div className="flex-1 p-2 bg-gray-50 rounded">
                      <div className="text-xs text-gray-500">Ostatnie 7 dni</div>
                      <div className="font-bold">
                        {Math.round((auditStats.recentTrend.last7days.accuracy || 0) * 100)}% trafność
                      </div>
                      <div className="text-xs text-gray-400">
                        {auditStats.recentTrend.last7days.total} wpisów
                      </div>
                    </div>
                    <div className="flex-1 p-2 bg-gray-50 rounded">
                      <div className="text-xs text-gray-500">Ostatnie 30 dni</div>
                      <div className="font-bold">
                        {Math.round((auditStats.recentTrend.last30days.accuracy || 0) * 100)}% trafność
                      </div>
                      <div className="text-xs text-gray-400">
                        {auditStats.recentTrend.last30days.total} wpisów
                      </div>
                    </div>
                  </div>
                </div>

                {/* Top Accepted Tickets */}
                {auditStats.topAcceptedTickets.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-600">Najczęściej akceptowane:</p>
                    <div className="flex flex-wrap gap-2">
                      {auditStats.topAcceptedTickets.map(({ ticket, count }) => (
                        <Badge key={ticket} variant="outline" className="text-xs">
                          {ticket}: {count}x ✓
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top Rejected (Modified) */}
                {auditStats.topRejectedSuggestions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-600">Często korygowane:</p>
                    <div className="space-y-1">
                      {auditStats.topRejectedSuggestions.slice(0, 3).map(({ suggested, actual, count }, i) => (
                        <div key={i} className="text-xs p-2 bg-yellow-50 rounded flex justify-between">
                          <span>
                            <span className="line-through text-gray-400">{suggested}</span>
                            {' → '}
                            <span className="font-medium">{actual}</span>
                          </span>
                          <span className="text-yellow-600">{count}x</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-gray-500 text-center py-4">
                Brak danych w audit trail. Dane będą zbierane podczas logowania czasu.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Task History */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Historia tasków</CardTitle>
                <CardDescription>
                  {taskHistory.length} tasków w historii
                </CardDescription>
              </div>
              <Button variant="destructive" size="sm" onClick={handleClearHistory}>
                <Trash2 className="h-4 w-4 mr-2" />
                Wyczyść
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {taskHistory.slice(0, 20).map((task) => (
                <div
                  key={task.key}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{task.key}</span>
                    <span className="text-gray-500 text-sm truncate max-w-xs">
                      {task.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span>{task.useCount}x użyty</span>
                    <span>•</span>
                    <span>{new Date(task.lastUsed).toLocaleDateString('pl')}</span>
                  </div>
                </div>
              ))}
              {taskHistory.length === 0 && (
                <p className="text-gray-500 text-center py-4">
                  Brak historii. Historia będzie się budować podczas logowania czasu.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Jira Projects */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Projekty Jira</CardTitle>
                <CardDescription>
                  {jiraProjects.length} projektów dostępnych
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={loadJiraData} disabled={loadingJira}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loadingJira ? 'animate-spin' : ''}`} />
                Odśwież
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {jiraProjects.map((project) => (
                <Badge key={project.key} variant="outline" className="text-sm">
                  {project.key}: {project.name}
                </Badge>
              ))}
              {jiraProjects.length === 0 && !loadingJira && (
                <p className="text-gray-500">Brak projektów lub błąd połączenia z Jira</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Export/Import */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Backup danych</CardTitle>
            <CardDescription>
              Eksportuj lub importuj historię i mapowania
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Button variant="outline" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Eksportuj dane
              </Button>
              <div>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="hidden"
                  id="import-file"
                />
                <Button variant="outline" onClick={() => document.getElementById('import-file')?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  Importuj dane
                </Button>
              </div>
              <Button variant="destructive" onClick={handleClearMappings}>
                <Trash2 className="h-4 w-4 mr-2" />
                Wyczyść mapowania
              </Button>
            </div>
          </CardContent>
        </Card>

    </div>
  );
}
