'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { apiUrl } from '@/lib/api';
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
  BarChart3,
  ExternalLink,
  PackageCheck,
  HelpCircle,
  ChevronDown
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
  getLoggingRules,
  setLoggingRules,
  resetLoggingRules,
  DEFAULT_LOGGING_RULES,
  DEFAULT_ROUNDING_TIERS,
  type LoggingRules,
  type RoundingTier,
} from '@/lib/loggingRules';
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

function HelpGuide({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-600 transition-colors">
        <HelpCircle className="h-3.5 w-3.5" />
        <span>{title}</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-lg text-xs text-gray-700 dark:text-gray-300 space-y-1.5">
          {children}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const t = useTranslations('settings');
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

  // Version & update state
  const [versionInfo, setVersionInfo] = useState<{
    current: string;
    latest: string;
    hasUpdate: boolean;
    downloadUrl: string | null;
    releaseUrl: string;
    releaseNotes: string;
    publishedAt: string | null;
    platform: string;
    checkedAt: string;
    error?: string;
    debug?: {
      nextPublicAppVersion: string | null;
      timetrackerDataDir: string | null;
      cwd: string;
      nodeVersion: string;
      assetNames?: string[];
    };
  } | null>(null);
  const [checkingVersion, setCheckingVersion] = useState(false);
  const [updateDownloading, setUpdateDownloading] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'downloading' | 'ready' | 'applying' | 'error'>('idle');
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Self-update state (macOS/Linux)
  const [selfUpdateStatus, setSelfUpdateStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [selfUpdateStep, setSelfUpdateStep] = useState('');
  const [selfUpdateSteps, setSelfUpdateSteps] = useState<{ name: string; status: string }[]>([]);
  const [selfUpdateError, setSelfUpdateError] = useState<string | null>(null);

  // Logging rules state
  const [loggingRules, setLoggingRulesState] = useState<LoggingRules | null>(null);

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
    llmModel: 'gemini-2.5-flash',
    geminiApiKey: '',
    slackUserToken: '',
    slackBotToken: '',
    slackNotifyUserId: '',
    projectsRoot: '',
    gitAuthorFilter: '',
    githubToken: '',
    aiProvider: 'gemini' as 'gemini' | 'openrouter',
    // Atlassian OAuth 2.0 — alternative to Basic Auth for Jira + enables Confluence
    atlassianClientId: '',
    atlassianSiteUrl: '',
    atlassianRedirectUri: '',
  });
  const [oauthStatus, setOauthStatus] = useState<{
    connected: boolean;
    userEmail: string | null;
    userName: string | null;
    expiresAt: string | null;
    cloudId: string | null;
    scopes: string | null;
  }>({ connected: false, userEmail: null, userName: null, expiresAt: null, cloudId: null, scopes: null });
  const [tempoOauthStatus, setTempoOauthStatus] = useState<{
    connected: boolean;
    expiresAt: string | null;
    scopes: string | null;
  }>({ connected: false, expiresAt: null, scopes: null });
  const [oauthBanner, setOauthBanner] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [tempoOauthBanner, setTempoOauthBanner] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [connectingOauth, setConnectingOauth] = useState(false);
  const [disconnectingOauth, setDisconnectingOauth] = useState(false);
  const [connectingTempoOauth, setConnectingTempoOauth] = useState(false);
  const [disconnectingTempoOauth, setDisconnectingTempoOauth] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingApis, setTestingApis] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  // Load data on mount
  useEffect(() => {
    loadAllData();
    checkForUpdates();
  }, []);

  // Pick up Atlassian + Tempo OAuth callback feedback from URL
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const atlassianStatus = params.get('atlassian');
    const tempoStatus = params.get('tempo');

    if (atlassianStatus === 'connected') {
      setOauthBanner({ type: 'success', msg: 'Połączono z Atlassian Cloud przez OAuth 2.0.' });
    } else if (atlassianStatus === 'error') {
      const msg = params.get('msg') || 'Nieznany błąd autoryzacji.';
      setOauthBanner({ type: 'error', msg: `Atlassian OAuth nie powiodło się: ${msg}` });
    }

    if (tempoStatus === 'connected') {
      setTempoOauthBanner({ type: 'success', msg: 'Połączono z Tempo Cloud przez OAuth 2.0.' });
    } else if (tempoStatus === 'error') {
      const msg = params.get('msg') || 'Nieznany błąd autoryzacji.';
      setTempoOauthBanner({ type: 'error', msg: `Tempo OAuth nie powiodło się: ${msg}` });
    }

    if (atlassianStatus || tempoStatus) {
      const url = new URL(window.location.href);
      url.search = '';
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const loadAllData = useCallback(async () => {
    // Load local data
    setProjectMappingsList(getProjectMappings());
    setTaskHistoryList(getTaskHistory());
    setFeedbackStats(getFeedbackStats());
    setBadSuggestions(getBadSuggestions());

    // Load logging rules
    setLoggingRulesState(getLoggingRules());

    // Load targets data
    setTargetsState(getTimeTargets());
    setHolidaysList(getHolidays());
    setTimeOffsList(getTimeOffs());

    // Load audit stats
    setAuditStats(getAuditStats());

    // Load API status
    setLoadingStatus(true);
    try {
      const res = await fetch(apiUrl('/api/status'));
      const data = await res.json();
      setApiStatus(data.apis || []);
    } catch {
      setApiStatus([]);
    }
    setLoadingStatus(false);

    // Load user settings / API config
    try {
      const settingsRes = await fetch(apiUrl('/api/settings'));
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
          llmModel: settings.llmModel || 'gemini-2.5-flash',
          geminiApiKey: settings.geminiApiKey || '',
          slackUserToken: settings.slackUserToken || '',
          slackBotToken: settings.slackBotToken || '',
          slackNotifyUserId: settings.slackNotifyUserId || '',
          projectsRoot: settings.projectsRoot || '',
          gitAuthorFilter: settings.gitAuthorFilter || '',
          githubToken: settings.githubToken || '',
          aiProvider: settings.aiProvider || 'gemini',
          atlassianClientId: settings.atlassianClientId || '',
          atlassianSiteUrl: settings.atlassianSiteUrl || 'https://beecommerce.atlassian.net',
          atlassianRedirectUri: settings.atlassianRedirectUri || '',
        });
        setOauthStatus({
          connected: !!settings.oauthConnected,
          userEmail: settings.oauthUserEmail || null,
          userName: settings.oauthUserName || null,
          expiresAt: settings.oauthExpiresAt || null,
          cloudId: settings.oauthCloudId || null,
          scopes: settings.oauthScopes || null,
        });
        setTempoOauthStatus({
          connected: !!settings.tempoOauthConnected,
          expiresAt: settings.tempoOauthExpiresAt || null,
          scopes: settings.tempoOauthScopes || null,
        });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }

    // Load Jira projects and issues
    loadJiraData();
  }, []);

  const checkForUpdates = useCallback(async (force = false) => {
    setCheckingVersion(true);
    try {
      const url = force ? '/api/version?refresh=1&debug=1' : '/api/version';
      const res = await fetch(apiUrl(url));
      if (res.ok) {
        const data = await res.json();
        setVersionInfo(data);
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
    }
    setCheckingVersion(false);
  }, []);

  const handleSelfUpdate = async () => {
    setSelfUpdateStatus('running');
    setSelfUpdateStep('Rozpoczynanie...');
    setSelfUpdateSteps([]);
    setSelfUpdateError(null);

    try {
      await fetch(apiUrl('/api/update?action=selfupdate'), { method: 'POST' });

      const poll = async () => {
        try {
          const res = await fetch(apiUrl('/api/update?action=selfupdate-status'), { method: 'POST' });
          if (!res.ok) return;
          const data = await res.json();
          setSelfUpdateStatus(data.status);
          setSelfUpdateStep(data.step || '');
          setSelfUpdateSteps(data.steps || []);
          if (data.error) setSelfUpdateError(data.error);

          if (data.status === 'running') {
            setTimeout(poll, 1000);
          } else if (data.status === 'done') {
            setTimeout(() => window.location.reload(), 5000);
          }
        } catch {
          // Server restarting — reload
          setTimeout(() => window.location.reload(), 5000);
        }
      };
      poll();
    } catch {
      setSelfUpdateStatus('error');
      setSelfUpdateError('Nie udalo sie rozpoczac aktualizacji');
    }
  };

  const handleDownloadUpdate = async () => {
    if (!versionInfo?.platform || versionInfo.platform !== 'win32') {
      handleSelfUpdate();
      return;
    }

    setUpdateStatus('downloading');
    setUpdateProgress(0);
    setUpdateError(null);

    try {
      await fetch(apiUrl('/api/update?action=download'), { method: 'POST' });

      // Poll for progress
      const poll = async () => {
        try {
          const res = await fetch(apiUrl('/api/update?action=status'), { method: 'POST' });
          if (!res.ok) return;
          const data = await res.json();
          setUpdateProgress(data.progress || 0);
          setUpdateStatus(data.status);
          if (data.error) setUpdateError(data.error);

          if (data.status === 'downloading') {
            setTimeout(poll, 500);
          }
        } catch {
          // ignore
        }
      };
      poll();
    } catch {
      setUpdateStatus('error');
      setUpdateError('Nie udalo sie rozpoczac pobierania');
    }
  };

  const handleApplyUpdate = async () => {
    setUpdateStatus('applying');
    try {
      await fetch(apiUrl('/api/update?action=apply'), { method: 'POST' });
    } catch {
      setUpdateStatus('error');
      setUpdateError('Nie udalo sie uruchomic instalatora');
    }
  };

  /**
   * Atlassian OAuth — Connect: save client_id/secret/site_url, then redirect to /start
   * which will redirect to Atlassian consent screen. After the user accepts,
   * Atlassian redirects to /callback which persists tokens and bounces back here.
   */
  const handleAtlassianConnect = () => {
    // Client ID and secret are embedded in the build (loadOAuthEnv reads defaults
    // from constants). No UI input needed — just jump straight into the OAuth flow.
    setConnectingOauth(true);
    setOauthBanner(null);
    window.location.href = apiUrl('/api/auth/atlassian/start');
  };

  const handleTempoConnect = () => {
    setConnectingTempoOauth(true);
    setTempoOauthBanner(null);
    window.location.href = apiUrl('/api/auth/tempo/start');
  };

  const handleTempoDisconnect = async () => {
    if (!confirm('Rozłączyć Tempo OAuth? Tokeny zostaną usunięte.')) return;
    setDisconnectingTempoOauth(true);
    setTempoOauthBanner(null);
    try {
      const res = await fetch(apiUrl('/api/auth/tempo/disconnect'), { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setTempoOauthBanner({ type: 'error', msg: `Disconnect nie powiódł się: ${data.error || res.status}` });
      } else {
        setTempoOauthStatus({ connected: false, expiresAt: null, scopes: null });
        setTempoOauthBanner({ type: 'success', msg: 'Rozłączono Tempo OAuth.' });
      }
    } catch (err) {
      setTempoOauthBanner({ type: 'error', msg: `Błąd: ${err instanceof Error ? err.message : 'unknown'}` });
    } finally {
      setDisconnectingTempoOauth(false);
    }
  };

  const handleAtlassianDisconnect = async () => {
    if (!confirm('Rozłączyć Atlassian OAuth? Tokeny zostaną usunięte (Client ID/Secret pozostaną).')) {
      return;
    }
    setDisconnectingOauth(true);
    setOauthBanner(null);
    try {
      const res = await fetch(apiUrl('/api/auth/atlassian/disconnect'), { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setOauthBanner({ type: 'error', msg: `Disconnect nie powiódł się: ${data.error || res.status}` });
      } else {
        setOauthStatus({
          connected: false,
          userEmail: null,
          userName: null,
          expiresAt: null,
          cloudId: null,
          scopes: null,
        });
        setOauthBanner({ type: 'success', msg: 'Rozłączono Atlassian OAuth.' });
      }
    } catch (err) {
      setOauthBanner({
        type: 'error',
        msg: `Błąd sieci: ${err instanceof Error ? err.message : 'unknown'}`,
      });
    } finally {
      setDisconnectingOauth(false);
    }
  };

  const handleSaveApiConfig = async () => {
    setSavingConfig(true);
    try {
      const res = await fetch(apiUrl('/api/settings'), {
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
      const res = await fetch(apiUrl('/api/settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send current form values — backend uses them when not masked,
        // so Test reflects what's currently typed (not last-saved process.env).
        body: JSON.stringify({
          testType: 'all',
          credentials: {
            jiraBaseUrl: apiConfig.jiraBaseUrl,
            jiraEmail: apiConfig.jiraEmail,
            jiraApiToken: apiConfig.jiraApiToken,
            tempoApiToken: apiConfig.tempoApiToken,
            tempoAccountId: apiConfig.tempoAccountId,
            slackUserToken: apiConfig.slackUserToken,
            geminiApiKey: apiConfig.geminiApiKey,
            openRouterApiKey: apiConfig.openRouterApiKey,
            activityWatchUrl: apiConfig.activityWatchUrl,
            githubToken: apiConfig.githubToken,
          },
        }),
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
        fetch(apiUrl('/api/jira/projects')),
        fetch(apiUrl('/api/jira/my-issues'))
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

  // Logging rules handlers
  const handleSaveLoggingRules = (updates: Partial<LoggingRules>) => {
    setLoggingRules(updates);
    setLoggingRulesState(getLoggingRules());
  };

  const handleResetLoggingRules = () => {
    resetLoggingRules();
    setLoggingRulesState(getLoggingRules());
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

  // TODO-10: Full config export/import (all settings in one file)
  const handleExportFullConfig = () => {
    const fullConfig = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      loggingRules: getLoggingRules(),
      timeTargets: getTimeTargets(),
      holidays: getHolidays(),
      timeOffs: getTimeOffs(),
      projectMappings: getProjectMappings(),
      taskHistory: exportHistory(),
    };
    const blob = new Blob([JSON.stringify(fullConfig, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timetracker-full-config-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFullConfig = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const config = JSON.parse(content);

        if (config.loggingRules) {
          setLoggingRules(config.loggingRules);
          setLoggingRulesState(getLoggingRules());
        }
        if (config.timeTargets) {
          setTimeTargets(config.timeTargets);
          setTargetsState(getTimeTargets());
        }
        if (config.holidays) {
          // Import holidays
          for (const h of config.holidays) {
            addHoliday(h);
          }
          setHolidaysList(getHolidays());
        }
        if (config.timeOffs) {
          // Import time offs
          for (const t of config.timeOffs) {
            addTimeOff({ startDate: t.startDate, endDate: t.endDate, type: t.type, description: t.description });
          }
          setTimeOffsList(getTimeOffs());
        }
        if (config.taskHistory) {
          importHistory(typeof config.taskHistory === 'string' ? config.taskHistory : JSON.stringify(config.taskHistory));
          setProjectMappingsList(getProjectMappings());
          setTaskHistoryList(getTaskHistory());
        }

        alert('Pelna konfiguracja zaimportowana pomyslnie!');
      } catch (err) {
        alert('Blad importu — nieprawidlowy format pliku');
        console.error('Config import error:', err);
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
      const res = await fetch(apiUrl(`/api/jira/my-issues?query=${encodeURIComponent(searchQuery)}`));
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
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{t('title')}</h1>
        <p className="text-slate-500 dark:text-slate-400">{t('subtitle')}</p>
      </div>

        {/* Version & Updates */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <PackageCheck className="h-5 w-5 text-emerald-600" />
                <div>
                  <CardTitle className="text-lg">Wersja i aktualizacje</CardTitle>
                  <CardDescription>Sprawdz dostepnosc nowych wersji TimeTracker</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => checkForUpdates(false)} disabled={checkingVersion}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${checkingVersion ? 'animate-spin' : ''}`} />
                  Sprawdz aktualizacje
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => checkForUpdates(true)}
                  disabled={checkingVersion}
                  title="Pomiń cache (6h) i pobierz świeże dane z GitHub. Pokazuje też debug info."
                >
                  Force refresh
                </Button>
                {/* Always-on reinstall button — works regardless of hasUpdate.
                    Lets users force-redownload the latest installer when the
                    automatic upgrade path is broken (stale node.exe holding :5666,
                    corrupted build, etc.). */}
                <a
                  href={versionInfo?.downloadUrl ?? versionInfo?.releaseUrl ?? 'https://github.com/shopconnector/ai-timetracker/releases/latest'}
                  target={versionInfo?.downloadUrl ? '_self' : '_blank'}
                  rel="noopener noreferrer"
                  download={versionInfo?.downloadUrl ? '' : undefined}
                  title={
                    versionInfo?.platform === 'win32'
                      ? 'Pobierz najnowszy TimeTracker-Setup-x64.exe i uruchom ręcznie'
                      : versionInfo?.platform === 'darwin'
                        ? 'Pobierz najnowszy TimeTracker-macos-arm64.dmg'
                        : 'Otwórz stronę release na GitHub'
                  }
                >
                  <Button variant="default" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Reinstaluj
                  </Button>
                </a>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Aktualna wersja</div>
                <div className="text-lg font-bold text-slate-900 dark:text-white flex items-baseline gap-2">
                  <span>v{versionInfo?.current || process.env.NEXT_PUBLIC_APP_VERSION || '?'}</span>
                  <a
                    href={versionInfo?.downloadUrl ?? versionInfo?.releaseUrl ?? 'https://github.com/shopconnector/ai-timetracker/releases/latest'}
                    target={versionInfo?.downloadUrl ? '_self' : '_blank'}
                    rel="noopener noreferrer"
                    download={versionInfo?.downloadUrl ? '' : undefined}
                    className="text-xs font-normal text-blue-600 dark:text-blue-400 hover:underline"
                    title="Pobierz ten sam installer ponownie (przydatne gdy reinstall nie zmienia nic na localhost)"
                  >
                    · pobierz ponownie
                  </a>
                </div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Status</div>
                <div className="text-lg font-bold">
                  {versionInfo?.hasUpdate ? (
                    <span className="text-amber-600">Dostepna v{versionInfo.latest}</span>
                  ) : versionInfo ? (
                    <span className="text-green-600 flex items-center gap-2">
                      <CheckCircle className="h-5 w-5" />
                      Aktualna
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </div>
              </div>
            </div>

            {versionInfo?.hasUpdate && (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-200">
                      Nowa wersja v{versionInfo.latest}
                    </p>
                    {versionInfo.publishedAt && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                        Wydana: {new Date(versionInfo.publishedAt).toLocaleDateString('pl')}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={versionInfo.releaseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300 hover:underline"
                    >
                      Release notes
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>

                {/* Self-update progress (macOS/Linux) */}
                {selfUpdateStatus === 'running' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin text-amber-600" />
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        Aktualizacja: {selfUpdateStep}
                      </p>
                    </div>
                    {selfUpdateSteps.length > 0 && (
                      <div className="flex gap-2">
                        {selfUpdateSteps.map((s, i) => (
                          <span
                            key={i}
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              s.status === 'done' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                              s.status === 'running' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 animate-pulse' :
                              s.status === 'error' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                              'bg-gray-100 dark:bg-gray-800 text-gray-500'
                            }`}
                          >
                            {s.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {selfUpdateStatus === 'done' && (
                  <p className="text-sm text-green-600 dark:text-green-400">
                    Aktualizacja zakonczona. Restartowanie serwera...
                  </p>
                )}

                {selfUpdateStatus === 'error' && selfUpdateError && (
                  <p className="text-sm text-red-600 dark:text-red-400">{selfUpdateError}</p>
                )}

                {/* Download progress (Windows) */}
                {updateStatus === 'downloading' && (
                  <div className="space-y-1">
                    <div className="w-full h-2 bg-amber-200 dark:bg-amber-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full transition-all duration-300"
                        style={{ width: `${updateProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-amber-600 dark:text-amber-400">Pobieranie... {updateProgress}%</p>
                  </div>
                )}

                {updateStatus === 'applying' && (
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Instalowanie... Aplikacja zrestartuje sie automatycznie.
                  </p>
                )}

                {updateStatus === 'error' && updateError && (
                  <p className="text-sm text-red-600 dark:text-red-400">{updateError}</p>
                )}

                {updateStatus !== 'applying' && selfUpdateStatus !== 'running' && selfUpdateStatus !== 'done' && (
                  <div className="flex gap-2">
                    {versionInfo.platform === 'win32' ? (
                      updateStatus === 'ready' ? (
                        <Button size="sm" onClick={handleApplyUpdate}>
                          <Download className="h-4 w-4 mr-2" />
                          Zainstaluj aktualizacje
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={handleDownloadUpdate}
                          disabled={updateStatus === 'downloading'}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {updateStatus === 'downloading' ? 'Pobieranie...' : 'Pobierz i zainstaluj'}
                        </Button>
                      )
                    ) : (
                      <Button
                        size="sm"
                        onClick={handleSelfUpdate}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Aktualizuj
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

            {versionInfo?.checkedAt && (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Ostatnie sprawdzenie: {new Date(versionInfo.checkedAt).toLocaleString('pl')}
              </p>
            )}

            {versionInfo?.debug && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                  Debug info (dla supportu)
                </summary>
                <pre className="mt-2 p-3 bg-gray-50 dark:bg-slate-900 rounded text-xs overflow-auto">
{`current:                 ${versionInfo.current}
latest:                  ${versionInfo.latest}
hasUpdate:               ${versionInfo.hasUpdate}
platform:                ${versionInfo.platform}
downloadUrl:             ${versionInfo.downloadUrl ?? '(none)'}
NEXT_PUBLIC_APP_VERSION: ${versionInfo.debug.nextPublicAppVersion ?? '(unset)'}
TIMETRACKER_DATA_DIR:    ${versionInfo.debug.timetrackerDataDir ?? '(unset)'}
cwd:                     ${versionInfo.debug.cwd}
node:                    ${versionInfo.debug.nodeVersion}
${versionInfo.debug.assetNames ? `assetNames:              ${versionInfo.debug.assetNames.join(', ')}` : ''}
${versionInfo.error ? `lastError:               ${versionInfo.error}` : ''}`}
                </pre>
              </details>
            )}
          </CardContent>
        </Card>

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
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(api.status)}
                    <span className="font-medium text-slate-900 dark:text-slate-100">{api.name}</span>
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
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">Brak danych o statusie API</p>
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
                    <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">Cel dzienny (godziny)</label>
                    <Input
                      type="number"
                      min="1"
                      max="24"
                      value={targets.dailyHours}
                      onChange={(e) => handleSaveTargets({ dailyHours: parseInt(e.target.value) || 8 })}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">Cel tygodniowy (godziny)</label>
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
                  <label htmlFor="flexibleHours" className="text-sm text-gray-600 dark:text-gray-300">
                    Elastyczny czas pracy (nadgodziny kompensują braki)
                  </label>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Logging Rules (TODO-1, TODO-2, TODO-3) */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Settings className="h-5 w-5 text-orange-600" />
                <div>
                  <CardTitle className="text-lg">Reguly logowania</CardTitle>
                  <CardDescription>Minimalne czasy, zaokraglanie i agregacja krotkich taskow</CardDescription>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleResetLoggingRules}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {loggingRules && (
              <>
                {/* Minimum Activity Duration */}
                <div className="space-y-3">
                  <h3 className="font-medium text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                    Minimalny czas aktywnosci
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">
                        Min. czas aktywnosci (minuty)
                      </label>
                      <Input
                        type="number"
                        min="1"
                        max="30"
                        value={loggingRules.minActivityDurationMinutes}
                        onChange={(e) => handleSaveLoggingRules({
                          minActivityDurationMinutes: parseInt(e.target.value) || 5
                        })}
                      />
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        Aktywnosci krotsze niz ten czas beda ignorowane lub agregowane
                      </p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">
                        Min. czas eventu AW (sekundy)
                      </label>
                      <Input
                        type="number"
                        min="1"
                        max="120"
                        value={loggingRules.minEventDurationSeconds}
                        onChange={(e) => handleSaveLoggingRules({
                          minEventDurationSeconds: parseInt(e.target.value) || 10
                        })}
                      />
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        Pojedyncze eventy z ActivityWatch krotsze niz ten czas beda odfiltrowane
                      </p>
                    </div>
                  </div>
                </div>

                {/* Smart Rounding */}
                <div className="space-y-3">
                  <h3 className="font-medium text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    Smart rounding
                  </h3>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="smartRounding"
                      checked={loggingRules.smartRoundingEnabled}
                      onChange={(e) => handleSaveLoggingRules({ smartRoundingEnabled: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <label htmlFor="smartRounding" className="text-sm text-gray-600 dark:text-gray-300">
                      Zaokraglaj logi wg tierow (np. 5min→10min, 21min→30min)
                    </label>
                  </div>

                  {loggingRules.smartRoundingEnabled && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Tiery zaokraglania:</p>
                      <div className="grid grid-cols-3 gap-2">
                        {loggingRules.roundingTiers.map((tier, idx) => (
                          <div key={idx} className="flex items-center gap-1 p-2 bg-gray-50 dark:bg-slate-800 rounded text-xs">
                            <span className="text-gray-500">{tier.minMinutes}-{tier.maxMinutes}min</span>
                            <span className="text-gray-400">→</span>
                            <span className="font-medium">{tier.roundTo}min</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500 dark:text-gray-400">
                          Powyzej 60min, zaokraglaj co:
                        </label>
                        <Input
                          type="number"
                          min="5"
                          max="60"
                          className="w-20 h-7 text-xs"
                          value={loggingRules.roundingAbove60Interval}
                          onChange={(e) => handleSaveLoggingRules({
                            roundingAbove60Interval: parseInt(e.target.value) || 15
                          })}
                        />
                        <span className="text-xs text-gray-500">min</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Short Task Aggregation */}
                <div className="space-y-3">
                  <h3 className="font-medium text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                    Agregacja krotkich taskow
                  </h3>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="aggregateShortTasks"
                      checked={loggingRules.aggregateShortTasks}
                      onChange={(e) => handleSaveLoggingRules({ aggregateShortTasks: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <label htmlFor="aggregateShortTasks" className="text-sm text-gray-600 dark:text-gray-300">
                      Agreguj krotkie taski z tego samego projektu
                    </label>
                  </div>
                  {loggingRules.aggregateShortTasks && (
                    <div>
                      <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">
                        Prog agregacji (minuty)
                      </label>
                      <Input
                        type="number"
                        min="5"
                        max="60"
                        className="w-32"
                        value={loggingRules.aggregationThresholdMinutes}
                        onChange={(e) => handleSaveLoggingRules({
                          aggregationThresholdMinutes: parseInt(e.target.value) || 15
                        })}
                      />
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        Jesli suma odrzuconych krotkich taskow z jednego projektu przekroczy ten prog, zostaną zagregowane w jeden wpis
                      </p>
                    </div>
                  )}
                </div>

                {/* Thinking Time (TODO-7) */}
                <div className="space-y-3">
                  <h3 className="font-medium text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <span className="w-2 h-2 bg-cyan-500 rounded-full"></span>
                    Thinking time (estymacja pracy intelektualnej)
                  </h3>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="thinkingTime"
                      checked={loggingRules.thinkingTimeEnabled}
                      onChange={(e) => handleSaveLoggingRules({ thinkingTimeEnabled: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <label htmlFor="thinkingTime" className="text-sm text-gray-600 dark:text-gray-300">
                      Wykrywaj luki miedzy aktywnosciami jako czas myslenia/review
                    </label>
                  </div>
                  {loggingRules.thinkingTimeEnabled && (
                    <div className="space-y-3 pl-6">
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                            Min. luka (minuty)
                          </label>
                          <Input
                            type="number"
                            min="1"
                            max="30"
                            className="w-full h-8 text-sm"
                            value={loggingRules.thinkingTimeGapMinMin}
                            onChange={(e) => handleSaveLoggingRules({
                              thinkingTimeGapMinMin: parseInt(e.target.value) || 5
                            })}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                            Max. luka (minuty)
                          </label>
                          <Input
                            type="number"
                            min="5"
                            max="60"
                            className="w-full h-8 text-sm"
                            value={loggingRules.thinkingTimeGapMaxMin}
                            onChange={(e) => handleSaveLoggingRules({
                              thinkingTimeGapMaxMin: parseInt(e.target.value) || 15
                            })}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                            Mnoznik czasu
                          </label>
                          <Select
                            value={String(loggingRules.thinkingTimeMultiplier)}
                            onValueChange={(v) => handleSaveLoggingRules({
                              thinkingTimeMultiplier: parseFloat(v)
                            })}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0.5">0.5x (polowa)</SelectItem>
                              <SelectItem value="1">1.0x (pelny czas)</SelectItem>
                              <SelectItem value="1.5">1.5x</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        Jesli miedzy dwoma aktywnosciami na tym samym projekcie jest luka 5-15 min,
                        system zaproponuje ja jako &quot;thinking/review time&quot;
                      </p>
                    </div>
                  )}
                </div>

                {/* AI Agent Tracking (TODO-8) */}
                <div className="space-y-3">
                  <h3 className="font-medium text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                    AI Agent time tracking
                  </h3>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="aiAgentTracking"
                      checked={loggingRules.aiAgentTrackingEnabled}
                      onChange={(e) => handleSaveLoggingRules({ aiAgentTrackingEnabled: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <label htmlFor="aiAgentTracking" className="text-sm text-gray-600 dark:text-gray-300">
                      Wliczaj czas pracy agentow AI (Claude, GPT, Copilot)
                    </label>
                  </div>
                  {loggingRules.aiAgentTrackingEnabled && (
                    <div className="pl-6">
                      <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                        Mnoznik czasu AI agenta
                      </label>
                      <Select
                        value={String(loggingRules.aiAgentMultiplier)}
                        onValueChange={(v) => handleSaveLoggingRules({
                          aiAgentMultiplier: parseFloat(v)
                        })}
                      >
                        <SelectTrigger className="w-40 h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0.5">0.5x (polowa)</SelectItem>
                          <SelectItem value="1">1.0x (pelny czas)</SelectItem>
                          <SelectItem value="1.5">1.5x</SelectItem>
                          <SelectItem value="2">2.0x (podwojny)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        Czas pracy AI agenta wykryty w terminalu bedzie pokazany osobno i wliczony do projektu z tym mnoznikiem
                      </p>
                    </div>
                  )}
                </div>

                {/* Value Multipliers (TODO-9) */}
                <div className="space-y-3">
                  <h3 className="font-medium text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <span className="w-2 h-2 bg-rose-500 rounded-full"></span>
                    Value-based time adjustment
                  </h3>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="valueMultipliers"
                      checked={loggingRules.valueMultipliersEnabled}
                      onChange={(e) => handleSaveLoggingRules({ valueMultipliersEnabled: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <label htmlFor="valueMultipliers" className="text-sm text-gray-600 dark:text-gray-300">
                      Stosuj mnozniki wartosci per projekt
                    </label>
                  </div>
                  {loggingRules.valueMultipliersEnabled && (
                    <div className="space-y-2 pl-6">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Mnoznik jest stosowany PRZED zaokragleniem. Np. 1h pracy z AI x 1.5 = 1.5h w logu.
                      </p>
                      {loggingRules.projectValueMultipliers.map((m, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Input
                            value={m.projectKey}
                            onChange={(e) => {
                              const updated = [...loggingRules.projectValueMultipliers];
                              updated[idx] = { ...updated[idx], projectKey: e.target.value.toUpperCase() };
                              handleSaveLoggingRules({ projectValueMultipliers: updated });
                            }}
                            placeholder="Projekt (np. BCI)"
                            className="w-24 h-7 text-xs"
                          />
                          <Input
                            type="number"
                            min="0.1"
                            max="5"
                            step="0.1"
                            value={m.multiplier}
                            onChange={(e) => {
                              const updated = [...loggingRules.projectValueMultipliers];
                              updated[idx] = { ...updated[idx], multiplier: parseFloat(e.target.value) || 1 };
                              handleSaveLoggingRules({ projectValueMultipliers: updated });
                            }}
                            className="w-20 h-7 text-xs"
                          />
                          <span className="text-xs text-gray-400">x</span>
                          <Input
                            value={m.label || ''}
                            onChange={(e) => {
                              const updated = [...loggingRules.projectValueMultipliers];
                              updated[idx] = { ...updated[idx], label: e.target.value };
                              handleSaveLoggingRules({ projectValueMultipliers: updated });
                            }}
                            placeholder="Opis"
                            className="w-32 h-7 text-xs"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const updated = loggingRules.projectValueMultipliers.filter((_, i) => i !== idx);
                              handleSaveLoggingRules({ projectValueMultipliers: updated });
                            }}
                            className="h-7 w-7 p-0"
                          >
                            <Trash2 className="h-3 w-3 text-red-400" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const updated = [
                            ...loggingRules.projectValueMultipliers,
                            { projectKey: '', multiplier: 1.5, label: '' }
                          ];
                          handleSaveLoggingRules({ projectValueMultipliers: updated });
                        }}
                        className="text-xs h-7"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Dodaj mnoznik
                      </Button>
                    </div>
                  )}
                </div>

                {/* Real-time Prompting (TODO-5) */}
                <div className="space-y-3">
                  <h3 className="font-medium text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <span className="w-2 h-2 bg-cyan-500 rounded-full"></span>
                    Real-time prompting (Slack)
                  </h3>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="promptEnabled"
                      checked={loggingRules.promptEnabled}
                      onChange={(e) => handleSaveLoggingRules({ promptEnabled: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <label htmlFor="promptEnabled" className="text-sm text-gray-600 dark:text-gray-300">
                      Proponuj logowanie po zakonczeniu sesji pracy (gap-based)
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Prompt na Slack TYLKO gdy: aktywnosc trwala dluzej niz minimum,
                    A POTEM nastapila przerwa dluzsza niz prog. Krotkie przerwy (kawa) nie triggeruja promptu.
                  </p>
                  {loggingRules.promptEnabled && (
                    <div className="space-y-3 pl-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                            Min. czas aktywnosci (min)
                          </label>
                          <Input
                            type="number"
                            min="5"
                            max="120"
                            className="w-full h-8 text-sm"
                            value={loggingRules.promptMinActivityMinutes}
                            onChange={(e) => handleSaveLoggingRules({
                              promptMinActivityMinutes: parseInt(e.target.value) || 15
                            })}
                          />
                          <p className="text-xs text-gray-400 mt-1">Aktywnosci krotsze nie beda promptowane</p>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                            Min. przerwa do triggera (min)
                          </label>
                          <Input
                            type="number"
                            min="5"
                            max="120"
                            className="w-full h-8 text-sm"
                            value={loggingRules.promptMinGapMinutes}
                            onChange={(e) => handleSaveLoggingRules({
                              promptMinGapMinutes: parseInt(e.target.value) || 20
                            })}
                          />
                          <p className="text-xs text-gray-400 mt-1">Przerwy krotsze (kawa) nie triggeruja</p>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                          Metoda powiadomienia
                        </label>
                        <Select
                          value={loggingRules.promptMethod}
                          onValueChange={(v) => handleSaveLoggingRules({
                            promptMethod: v as 'slack' | 'browser'
                          })}
                        >
                          <SelectTrigger className="h-8 text-sm w-48">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="slack">Slack DM</SelectItem>
                            <SelectItem value="browser">Browser push</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
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
            <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-lg space-y-3">
              <p className="font-medium text-sm text-slate-900 dark:text-slate-100">Dodaj urlop / wolne</p>
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
                <p className="font-medium text-sm text-gray-600 dark:text-gray-300">Zaplanowane wolne:</p>
                {timeOffs.map((to) => (
                  <div key={to.id} className="flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
                    <div className="flex items-center gap-2">
                      <span>
                        {to.type === 'vacation' ? '🏖️' : to.type === 'sick' ? '🤒' : to.type === 'remote' ? '🏠' : '📅'}
                      </span>
                      <span className="text-sm text-slate-700 dark:text-slate-300">
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
            <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-lg space-y-3">
              <p className="font-medium text-sm text-slate-900 dark:text-slate-100">Dodaj święto / dzień wolny</p>
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
              <p className="font-medium text-sm text-gray-600 dark:text-gray-300">Święta w tym roku:</p>
              <div className="flex flex-wrap gap-2">
                {holidays.slice(0, 15).map((h, i) => (
                  <Badge key={i} variant="outline" className="text-xs dark:text-slate-200 dark:border-slate-600">
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
              <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-lg space-y-2">
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

            {/* Tempo OAuth 2.0 — zalecane */}
            <div className="space-y-3 p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                  Tempo OAuth 2.0 <span className="text-xs text-purple-600 dark:text-purple-400">(zalecane)</span>
                </h3>
                {tempoOauthStatus.connected && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                    Połączono
                  </span>
                )}
              </div>

              {tempoOauthBanner && (
                <div
                  className={`text-sm p-2 rounded ${
                    tempoOauthBanner.type === 'success'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                  }`}
                >
                  {tempoOauthBanner.msg}
                </div>
              )}

              {tempoOauthStatus.connected ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-gray-500 dark:text-gray-400">Access expires:</div>
                    <div className="text-xs">
                      {tempoOauthStatus.expiresAt
                        ? new Date(tempoOauthStatus.expiresAt).toLocaleString('pl')
                        : '—'}
                    </div>
                    <div className="text-gray-500 dark:text-gray-400">Scopes:</div>
                    <div className="text-xs font-mono break-all">{tempoOauthStatus.scopes || '—'}</div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={handleTempoConnect} disabled={connectingTempoOauth}>
                      {connectingTempoOauth ? 'Łączenie...' : 'Reconnect'}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={handleTempoDisconnect} disabled={disconnectingTempoOauth}>
                      {disconnectingTempoOauth ? 'Rozłączanie...' : 'Disconnect'}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Połącz konto Tempo Cloud jednym kliknięciem. Client ID i Secret są wbudowane w aplikację.
                  </p>
                  <Button size="sm" onClick={handleTempoConnect} disabled={connectingTempoOauth}>
                    {connectingTempoOauth ? 'Łączenie...' : 'Connect with Tempo'}
                  </Button>
                </>
              )}

              <HelpGuide title="Co się stanie po kliknięciu Connect with Tempo?">
                <p>1. Browser przekieruje na Tempo (przez Jira tenant) — Tempo poprosi o zgodę na uprawnienia: <strong>Worklogs: Manage</strong>, <strong>Work attributes: View</strong>, <strong>Accounts: View</strong>.</p>
                <p>2. Kliknij <strong>Allow</strong> / <strong>Authorize</strong>.</p>
                <p>3. Wracasz tutaj automatycznie — pojawi się &quot;Połączono&quot; + szczegóły access tokenu.</p>
                <p className="text-xs text-gray-500">Tempo OAuth jest osobny od Atlassian OAuth — osobne tokeny, osobny consent screen.</p>
              </HelpGuide>
            </div>

            {/* Tempo Configuration — legacy Personal Token */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                Tempo API <span className="text-xs text-gray-500 dark:text-gray-400">(legacy — Personal Token)</span>
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">API Token</label>
                  <Input
                    type="password"
                    placeholder="Tempo API Token"
                    value={apiConfig.tempoApiToken}
                    onChange={(e) => setApiConfig({ ...apiConfig, tempoApiToken: e.target.value })}
                  />
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Pobierz z: tempo.io → Settings → API Integration
                  </p>
                </div>
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">Account ID</label>
                  <Input
                    placeholder="712020:xxxxxxxx-xxxx-xxxx-xxxx"
                    value={apiConfig.tempoAccountId}
                    onChange={(e) => setApiConfig({ ...apiConfig, tempoAccountId: e.target.value })}
                  />
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Twoje Atlassian Account ID
                  </p>
                </div>
              </div>
              <HelpGuide title="Jak uzyskac token Tempo?">
                <p>1. Otworz <strong>tempo.io</strong> i zaloguj sie kontem Atlassian</p>
                <p>2. Kliknij swoj avatar (prawy gorny rog) → <strong>&quot;Settings&quot;</strong></p>
                <p>3. W menu bocznym wybierz <strong>&quot;API Integration&quot;</strong></p>
                <p>4. Kliknij <strong>&quot;New Token&quot;</strong>, nadaj nazwe (np. &quot;TimeTracker&quot;) i skopiuj token</p>
                <p>5. <strong>Account ID</strong> znajdziesz: wejdz w Jira → kliknij swoj avatar → &quot;Profile&quot; → w URL zobaczysz swoje Account ID (format: 712020:xxxxxxxx-...)</p>
              </HelpGuide>
            </div>

            {/* Atlassian OAuth 2.0 — alternatywa dla Basic Auth + Confluence R/W */}
            <div className="space-y-3 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  Atlassian OAuth 2.0 <span className="text-xs text-blue-600 dark:text-blue-400">(zalecane — Jira + Confluence)</span>
                </h3>
                {oauthStatus.connected && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                    Połączono
                  </span>
                )}
              </div>

              {oauthBanner && (
                <div
                  className={`text-sm p-2 rounded ${
                    oauthBanner.type === 'success'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                  }`}
                >
                  {oauthBanner.msg}
                </div>
              )}

              {oauthStatus.connected ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-gray-500 dark:text-gray-400">User:</div>
                    <div className="font-medium">
                      {oauthStatus.userName || '—'}{' '}
                      <span className="text-gray-500 dark:text-gray-400">({oauthStatus.userEmail || '—'})</span>
                    </div>
                    <div className="text-gray-500 dark:text-gray-400">Cloud ID:</div>
                    <div className="font-mono text-xs">{oauthStatus.cloudId || '—'}</div>
                    <div className="text-gray-500 dark:text-gray-400">Access expires:</div>
                    <div className="text-xs">
                      {oauthStatus.expiresAt ? new Date(oauthStatus.expiresAt).toLocaleString('pl') : '—'}
                    </div>
                    <div className="text-gray-500 dark:text-gray-400">Scopes:</div>
                    <div className="text-xs font-mono break-all">{oauthStatus.scopes || '—'}</div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleAtlassianConnect}
                      disabled={connectingOauth}
                    >
                      {connectingOauth ? 'Łączenie...' : 'Reconnect'}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleAtlassianDisconnect}
                      disabled={disconnectingOauth}
                    >
                      {disconnectingOauth ? 'Rozłączanie...' : 'Disconnect'}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Połącz konto Atlassian (Jira + Confluence) jednym kliknięciem.
                    Client ID i Secret są wbudowane w aplikację — wystarczy zalogować się przez Atlassian.
                  </p>
                  <Button size="sm" onClick={handleAtlassianConnect} disabled={connectingOauth}>
                    {connectingOauth ? 'Łączenie...' : 'Connect with Atlassian'}
                  </Button>
                </>
              )}

              <HelpGuide title="Co się stanie po kliknięciu Connect?">
                <p>1. Browser przekieruje na <strong>auth.atlassian.com</strong> — Atlassian poprosi o logowanie (jeśli niezalogowany).</p>
                <p>2. Atlassian pokaże consent screen z listą uprawnień (Jira + Confluence) — kliknij <strong>Accept</strong>.</p>
                <p>3. Wracasz tutaj automatycznie — pojawi się &quot;Połączono jako: X&quot; + szczegóły.</p>
                <p className="text-xs text-gray-500">OAuth app jest pre-skonfigurowana (Client ID + Secret wbudowane w bundle). Token żyje 1h, jest automatycznie odświeżany.</p>
              </HelpGuide>
            </div>

            {/* Jira Configuration */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                Jira API <span className="text-xs text-gray-500 dark:text-gray-400">(legacy — Basic Auth z API tokenem)</span>
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">Base URL</label>
                  <Input
                    placeholder="https://company.atlassian.net"
                    value={apiConfig.jiraBaseUrl}
                    onChange={(e) => setApiConfig({ ...apiConfig, jiraBaseUrl: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">Email</label>
                  <Input
                    type="email"
                    placeholder="email@company.com"
                    value={apiConfig.jiraEmail}
                    onChange={(e) => setApiConfig({ ...apiConfig, jiraEmail: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">API Token</label>
                  <Input
                    type="password"
                    placeholder="Jira API Token"
                    value={apiConfig.jiraApiToken}
                    onChange={(e) => setApiConfig({ ...apiConfig, jiraApiToken: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Utwórz token: id.atlassian.com/manage/api-tokens
              </p>
              <HelpGuide title="Jak uzyskac dane do Jira?">
                <p>1. <strong>Base URL</strong>: to adres Twojej firmy w Jira, np. https://nazwafirmy.atlassian.net</p>
                <p>2. <strong>Email</strong>: wpisz ten sam email, ktorym logujesz sie do Jira</p>
                <p>3. <strong>API Token</strong>:</p>
                <p className="pl-3">a) Otworz <strong>id.atlassian.com/manage/api-tokens</strong></p>
                <p className="pl-3">b) Zaloguj sie kontem Atlassian</p>
                <p className="pl-3">c) Kliknij <strong>&quot;Create API token&quot;</strong></p>
                <p className="pl-3">d) Nadaj nazwe (np. &quot;TimeTracker&quot;) i kliknij &quot;Create&quot;</p>
                <p className="pl-3">e) Skopiuj token (pokaze sie tylko raz!)</p>
              </HelpGuide>
            </div>

            {/* ActivityWatch Configuration */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                ActivityWatch
              </h3>
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">Server URL</label>
                <Input
                  placeholder="http://localhost:5600"
                  value={apiConfig.activityWatchUrl}
                  onChange={(e) => setApiConfig({ ...apiConfig, activityWatchUrl: e.target.value })}
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Domyślnie: http://localhost:5600 (ActivityWatch musi być uruchomiony)
                </p>
              </div>
              <HelpGuide title="Jak skonfigurowac ActivityWatch?">
                <p>1. ActivityWatch jest juz zainstalowany razem z TimeTrackerem</p>
                <p>2. Powinien uruchamiac sie automatycznie (ikona w zasobniku systemowym)</p>
                <p>3. Domyslny adres to <strong>http://localhost:5600</strong> — zazwyczaj nie trzeba zmieniac</p>
                <p>4. Jesli ActivityWatch nie dziala: znajdz &quot;ActivityWatch&quot; w menu Start i uruchom</p>
              </HelpGuide>
            </div>

            {/* Slack Configuration */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <span className="w-2 h-2 bg-fuchsia-500 rounded-full"></span>
                Slack (opcjonalne)
              </h3>
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">User Token (xoxp-) — odczyt aktywnosci</label>
                <Input
                  type="password"
                  placeholder="xoxp-..."
                  value={apiConfig.slackUserToken}
                  onChange={(e) => setApiConfig({ ...apiConfig, slackUserToken: e.target.value })}
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Utwórz w: api.slack.com/apps &rarr; OAuth &amp; Permissions. Wymagane scopes: channels:history, channels:read, groups:history, groups:read, im:history, im:read, mpim:history, mpim:read, users:read
                </p>
              </div>
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">Bot Token (xoxb-) — powiadomienia outgoing</label>
                <Input
                  type="password"
                  placeholder="xoxb-..."
                  value={apiConfig.slackBotToken || ''}
                  onChange={(e) => setApiConfig({ ...apiConfig, slackBotToken: e.target.value })}
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Bot Token do wysylania powiadomien (propozycje logow, real-time prompty).
                  Wymagane scopes: chat:write, im:write, users:read
                </p>
              </div>
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">ID uzytkownika Slack (powiadomienia DM)</label>
                <Input
                  placeholder="U0123456789"
                  value={apiConfig.slackNotifyUserId || ''}
                  onChange={(e) => setApiConfig({ ...apiConfig, slackNotifyUserId: e.target.value })}
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Twoje Slack User ID — bot bedzie wysylal DM do tego uzytkownika.
                  Znajdziesz w: Slack Profile &rarr; More &rarr; Copy member ID
                </p>
              </div>
              <HelpGuide title="Jak skonfigurowac Slacka? (opcjonalne — dla powiadomien)">
                <p>1. Wejdz na <strong>api.slack.com/apps</strong> i kliknij &quot;Create New App&quot;</p>
                <p>2. Wybierz &quot;From scratch&quot;, podaj nazwe (np. &quot;TimeTracker&quot;) i wybierz workspace</p>
                <p>3. W menu bocznym kliknij <strong>&quot;OAuth &amp; Permissions&quot;</strong></p>
                <p>4. W sekcji <strong>&quot;User Token Scopes&quot;</strong> dodaj: channels:history, channels:read, groups:history, groups:read, im:history, im:read, mpim:history, mpim:read, users:read</p>
                <p>5. W sekcji <strong>&quot;Bot Token Scopes&quot;</strong> dodaj: chat:write, im:write, users:read</p>
                <p>6. Kliknij <strong>&quot;Install to Workspace&quot;</strong> na gorze strony</p>
                <p>7. Skopiuj &quot;User OAuth Token&quot; (xoxp-...) i &quot;Bot User OAuth Token&quot; (xoxb-...)</p>
                <p>8. <strong>Slack User ID</strong>: otworz Slack → kliknij swoj avatar → &quot;Profile&quot; → &quot;&#8943;&quot; (More) → &quot;Copy member ID&quot;</p>
              </HelpGuide>
            </div>

            {/* Git / Activity Configuration */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <span className="w-2 h-2 bg-zinc-500 rounded-full"></span>
                Git / Activity (opcjonalne)
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Dwa tryby: <strong>(A)</strong> GitHub Personal Access Token — działa cross-platform, nie wymaga lokalnych repo;
                albo <strong>(B)</strong> lokalny git scan — szybszy ale wymaga repo na dysku.
                Wybierz jeden.
              </p>
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">GitHub Personal Access Token (tryb A — opcjonalne)</label>
                <Input
                  type="password"
                  placeholder="ghp_... lub github_pat_..."
                  value={apiConfig.githubToken}
                  onChange={(e) => setApiConfig({ ...apiConfig, githubToken: e.target.value })}
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Z tokenem zakładka /activity pobiera commity z github.com (PushEvents) — działa wszędzie.
                  Bez tokenu używa lokalnych repo (ścieżka poniżej).
                </p>
              </div>
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">Projects root (pełna ścieżka)</label>
                <Input
                  placeholder="np. /Users/YOU/projects albo C:\Users\YOU\projects"
                  value={apiConfig.projectsRoot}
                  onChange={(e) => setApiConfig({ ...apiConfig, projectsRoot: e.target.value })}
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Katalog zawierający Twoje lokalne repo git. Aplikacja przeskanuje pierwszy poziom katalogów i wybierze te z podkatalogiem .git.
                </p>
              </div>
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">Git author (email lub nazwa)</label>
                <Input
                  placeholder="auto-detect: git config user.email"
                  value={apiConfig.gitAuthorFilter}
                  onChange={(e) => setApiConfig({ ...apiConfig, gitAuthorFilter: e.target.value })}
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Filtr <code>--author</code> dla <code>git log</code>. Puste = automatyczne wykrycie z <code>git config user.email</code>.
                </p>
              </div>
              <HelpGuide title="Tryb A — GitHub Personal Access Token (cross-platform)">
                <p>1. Otwórz: <strong>https://github.com/settings/tokens</strong> (Classic) lub <strong>/settings/tokens?type=beta</strong> (Fine-grained)</p>
                <p>2. <strong>Generate new token</strong> → wybierz scope:</p>
                <p>&nbsp;&nbsp;&nbsp;• <code>public_repo</code> — wystarczy do publicznych repo</p>
                <p>&nbsp;&nbsp;&nbsp;• <code>repo</code> — pełny dostęp (też prywatne) — <strong>zalecane</strong></p>
                <p>3. <strong>Copy</strong> token (zaczyna się od <code>ghp_</code> lub <code>github_pat_</code>)</p>
                <p>4. Wklej do pola &quot;GitHub Personal Access Token&quot; i kliknij &quot;Save&quot;</p>
                <p>5. Klikni &quot;Test connection&quot; — powinieneś zobaczyć swój login GitHub</p>
              </HelpGuide>
              <HelpGuide title="Tryb B — lokalny git scan (szybszy, ale wymaga repo na dysku)">
                <p>Bez tokenu GitHub — aplikacja odczytuje lokalne katalogi <code>.git/</code> z Twojego dysku.</p>
                <p>Jeśli masz repozytoria sklonowane lokalnie pod jednym katalogiem (np. <code>~/projects</code>), wskaż ten katalog w polu &quot;Projects root&quot; powyżej.</p>
                <p>Aplikacja przeskanuje pierwszy poziom katalogów i wybierze te z podkatalogiem <code>.git</code>.</p>
                <p>&quot;Git author&quot; jest auto-wykrywany z <code>git config user.email</code>, ale możesz nadpisać.</p>
              </HelpGuide>
            </div>

            {/* AI Provider Configuration */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                AI / LLM
              </h3>
              <div>
                <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">Provider</label>
                <Select
                  value={apiConfig.aiProvider}
                  onValueChange={(value: 'gemini' | 'openrouter') => {
                    setApiConfig({ ...apiConfig, aiProvider: value });
                  }}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini">Gemini (Google AI)</SelectItem>
                    <SelectItem value="openrouter">OpenRouter</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Gemini Configuration */}
              {apiConfig.aiProvider === 'gemini' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">Gemini API Key</label>
                      <Input
                        type="password"
                        placeholder="Gemini API Key"
                        value={apiConfig.geminiApiKey}
                        onChange={e => setApiConfig({ ...apiConfig, geminiApiKey: e.target.value })}
                      />
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        Pobierz z: aistudio.google.com/apikey
                      </p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">Model Gemini</label>
                      <Select
                        value={apiConfig.llmModel}
                        onValueChange={value => setApiConfig({ ...apiConfig, llmModel: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Wybierz model" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gemini-2.5-flash">
                            Gemini 2.5 Flash (darmowy, szybki)
                          </SelectItem>
                          <SelectItem value="gemini-2.5-pro">
                            Gemini 2.5 Pro ($1.25/1k, najlepsza jakosc)
                          </SelectItem>
                          <SelectItem value="gemini-2.0-flash">Gemini 2.0 Flash (darmowy)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <HelpGuide title="Jak uzyskac klucz Gemini? (darmowe)">
                    <p>1. Otworz <strong>aistudio.google.com/apikey</strong></p>
                    <p>2. Zaloguj sie kontem Google</p>
                    <p>3. Kliknij <strong>&quot;Create API Key&quot;</strong></p>
                    <p>4. Wybierz projekt Google Cloud (lub utworz nowy)</p>
                    <p>5. Skopiuj wygenerowany klucz</p>
                    <p className="text-blue-600 dark:text-blue-400">Tip: Model &quot;Gemini 2.5 Flash&quot; jest darmowy i wystarczajacy</p>
                  </HelpGuide>
                </>
              )}

              {/* OpenRouter Configuration */}
              {apiConfig.aiProvider === 'openrouter' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">OpenRouter API Key</label>
                      <Input
                        type="password"
                        placeholder="OpenRouter API Key"
                        value={apiConfig.openRouterApiKey}
                        onChange={e => setApiConfig({ ...apiConfig, openRouterApiKey: e.target.value })}
                      />
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Pobierz z: openrouter.ai/keys</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">Model LLM</label>
                      <Select
                        value={apiConfig.llmModel}
                        onValueChange={value => setApiConfig({ ...apiConfig, llmModel: value })}
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
                          <SelectItem value="openai/gpt-4o">GPT-4o (premium, $5/1k)</SelectItem>
                          <SelectItem value="google/gemini-flash-1.5">
                            Gemini Flash 1.5 ($0.075/1k)
                          </SelectItem>
                          <SelectItem value="meta-llama/llama-3.1-70b-instruct">
                            Llama 3.1 70B ($0.59/1k)
                          </SelectItem>
                          <SelectItem value="qwen/qwen-2.5-72b-instruct">
                            Qwen 2.5 72B ($0.35/1k)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        Automatyczny fallback do innych modeli jeśli wybrany zawiedzie
                      </p>
                    </div>
                  </div>
                  <HelpGuide title="Jak uzyskac klucz OpenRouter?">
                    <p>1. Otworz <strong>openrouter.ai</strong> i zaloz konto</p>
                    <p>2. Przejdz do <strong>openrouter.ai/keys</strong></p>
                    <p>3. Kliknij <strong>&quot;Create Key&quot;</strong> i skopiuj</p>
                    <p>4. Doladuj konto (od $5) — modele sa platne za uzycie</p>
                  </HelpGuide>
                </>
              )}
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
                <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">Nazwa projektu</label>
                <Input
                  placeholder="np. timetracker"
                  value={newProject}
                  onChange={(e) => setNewProject(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">Task Jira</label>
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
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                  Brak mapowań. Dodaj pierwsze mapowanie powyżej.
                </p>
              ) : (
                projectMappings.map((mapping) => (
                  <div
                    key={mapping.project}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{mapping.project}</Badge>
                      <span className="text-gray-400 dark:text-gray-500">→</span>
                      <span className="font-mono text-sm">{mapping.taskKey}</span>
                      <span className="text-gray-500 dark:text-gray-400 text-sm truncate max-w-xs">
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
                  <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-lg text-center">
                    <div className="text-2xl font-bold">{feedbackStats.total}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Wszystkie</div>
                  </div>
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                    <div className="text-2xl font-bold text-green-600 flex items-center justify-center gap-1">
                      <ThumbsUp className="h-4 w-4" />
                      {feedbackStats.positive}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Dobre</div>
                  </div>
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-center">
                    <div className="text-2xl font-bold text-red-600 flex items-center justify-center gap-1">
                      <ThumbsDown className="h-4 w-4" />
                      {feedbackStats.negative}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Złe</div>
                  </div>
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                    <div className="text-2xl font-bold text-blue-600 flex items-center justify-center gap-1">
                      <TrendingUp className="h-4 w-4" />
                      {Math.round(feedbackStats.accuracy * 100)}%
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Trafność</div>
                  </div>
                </div>

                {/* By Source Breakdown */}
                {Object.keys(feedbackStats.bySource).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Wg źródła:</p>
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
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Często odrzucane sugestie:</p>
                    <div className="space-y-1">
                      {badSuggestions.slice(0, 5).map((bad, i) => (
                        <div key={i} className="flex items-center justify-between text-xs p-2 bg-red-50 dark:bg-red-900/20 rounded">
                          <span className="truncate flex-1" title={bad.pattern}>
                            {bad.pattern.split(':')[0]} → <span className="font-mono">{bad.suggestedTicket}</span>
                          </span>
                          <Badge variant="destructive" className="ml-2">
                            {bad.rejectionCount}x ❌
                          </Badge>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      Te sugestie nie będą już proponowane dla podobnych aktywności.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-center py-4">
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
                  <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-lg text-center">
                    <div className="text-2xl font-bold">{auditStats.totalEntries}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Wszystkie wpisy</div>
                  </div>
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                    <div className="text-2xl font-bold text-green-600">{auditStats.byAction.accepted}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Zaakceptowane</div>
                  </div>
                  <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-center">
                    <div className="text-2xl font-bold text-yellow-600">{auditStats.byAction.modified}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Zmodyfikowane</div>
                  </div>
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                    <div className="text-2xl font-bold text-blue-600">{auditStats.byAction.manual}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Ręczne</div>
                  </div>
                </div>

                {/* Accuracy by Source */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Trafność wg źródła:</p>
                  <div className="grid grid-cols-3 gap-3">
                    {Object.entries(auditStats.bySource).map(([source, data]) => (
                      <div key={source} className="p-2 border rounded text-center">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                          {source === 'llm' ? '🤖 LLM' : source === 'history' ? '📚 Historia' : '📁 Mapping'}
                        </div>
                        <div className="text-lg font-bold">
                          {Math.round(data.accuracy * 100)}%
                        </div>
                        <div className="text-xs text-gray-400 dark:text-gray-500">
                          {data.accepted}/{data.total}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent Trend */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Trend:</p>
                  <div className="flex gap-4">
                    <div className="flex-1 p-2 bg-gray-50 dark:bg-slate-800 rounded">
                      <div className="text-xs text-gray-500 dark:text-gray-400">Ostatnie 7 dni</div>
                      <div className="font-bold">
                        {Math.round((auditStats.recentTrend.last7days.accuracy || 0) * 100)}% trafność
                      </div>
                      <div className="text-xs text-gray-400 dark:text-gray-500">
                        {auditStats.recentTrend.last7days.total} wpisów
                      </div>
                    </div>
                    <div className="flex-1 p-2 bg-gray-50 dark:bg-slate-800 rounded">
                      <div className="text-xs text-gray-500 dark:text-gray-400">Ostatnie 30 dni</div>
                      <div className="font-bold">
                        {Math.round((auditStats.recentTrend.last30days.accuracy || 0) * 100)}% trafność
                      </div>
                      <div className="text-xs text-gray-400 dark:text-gray-500">
                        {auditStats.recentTrend.last30days.total} wpisów
                      </div>
                    </div>
                  </div>
                </div>

                {/* Top Accepted Tickets */}
                {auditStats.topAcceptedTickets.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Najczęściej akceptowane:</p>
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
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Często korygowane:</p>
                    <div className="space-y-1">
                      {auditStats.topRejectedSuggestions.slice(0, 3).map(({ suggested, actual, count }, i) => (
                        <div key={i} className="text-xs p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded flex justify-between">
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
              <p className="text-gray-500 dark:text-gray-400 text-center py-4">
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
                  className="flex items-center justify-between p-2 bg-gray-50 dark:bg-slate-800 rounded"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{task.key}</span>
                    <span className="text-gray-500 dark:text-gray-400 text-sm truncate max-w-xs">
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
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">
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
                <p className="text-gray-500 dark:text-gray-400">Brak projektów lub błąd połączenia z Jira</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Export/Import */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Backup danych</CardTitle>
            <CardDescription>
              Eksportuj lub importuj historię, mapowania i pelna konfiguracje
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Historia i mapowania</p>
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
                  Wyczysc mapowania
                </Button>
              </div>
            </div>
            <div className="border-t pt-4">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Pelna konfiguracja (reguly, targety, urlopy, mapowania, historia)
              </p>
              <div className="flex gap-4">
                <Button variant="outline" onClick={handleExportFullConfig}>
                  <PackageCheck className="h-4 w-4 mr-2" />
                  Eksportuj pelna konfiguracje
                </Button>
                <div>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportFullConfig}
                    className="hidden"
                    id="import-full-config"
                  />
                  <Button variant="outline" onClick={() => document.getElementById('import-full-config')?.click()}>
                    <Upload className="h-4 w-4 mr-2" />
                    Importuj pelna konfiguracje
                  </Button>
                </div>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                Eksportuje/importuje WSZYSTKIE ustawienia w jednym pliku JSON.
                Przydatne do klonowania konfiguracji miedzy maszynami lub tworzenia presetow organizacyjnych.
              </p>
            </div>
          </CardContent>
        </Card>

    </div>
  );
}
