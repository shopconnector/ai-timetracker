'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
  Settings,
  Key,
  TestTube,
  Save,
  Info,
  Zap,
  Calendar,
  Clock,
  Bot,
  Database,
} from 'lucide-react';
import Link from 'next/link';

interface APIStatus {
  name: string;
  status: 'ok' | 'error' | 'unconfigured';
  message?: string;
}

interface ServiceConfig {
  name: string;
  icon: React.ReactNode;
  description: string;
  docsUrl: string;
  configUrl: string;
  fields: Array<{
    key: string;
    label: string;
    type: 'text' | 'password' | 'url';
    placeholder: string;
    helpText?: string;
  }>;
}

const SERVICES: ServiceConfig[] = [
  {
    name: 'ActivityWatch',
    icon: <Clock className="h-5 w-5 text-purple-500" />,
    description: 'Zbiera dane o aktywnosci na komputerze (wymagane)',
    docsUrl: 'https://activitywatch.net',
    configUrl: 'http://localhost:5600',
    fields: [
      {
        key: 'ACTIVITYWATCH_URL',
        label: 'URL serwera',
        type: 'url',
        placeholder: 'http://localhost:5600',
        helpText: 'Domyslnie: http://localhost:5600',
      },
    ],
  },
  {
    name: 'Tempo',
    icon: <Database className="h-5 w-5 text-blue-500" />,
    description: 'Integracja z Tempo do logowania czasu pracy',
    docsUrl: 'https://tempo.io',
    configUrl: 'https://tempo.io/settings/api-integration',
    fields: [
      {
        key: 'TEMPO_API_TOKEN',
        label: 'API Token',
        type: 'password',
        placeholder: 'Tempo API Token',
        helpText: 'Pobierz z: tempo.io → Settings → API Integration',
      },
      {
        key: 'TEMPO_ACCOUNT_ID',
        label: 'Account ID',
        type: 'text',
        placeholder: '712020:xxxxxxxx-xxxx-xxxx-xxxx',
        helpText: 'Twoje Atlassian Account ID',
      },
    ],
  },
  {
    name: 'Jira',
    icon: <Zap className="h-5 w-5 text-green-500" />,
    description: 'Integracja z Jira do pobierania ticketow',
    docsUrl:
      'https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/',
    configUrl: 'https://id.atlassian.com/manage/api-tokens',
    fields: [
      {
        key: 'JIRA_BASE_URL',
        label: 'Base URL',
        type: 'url',
        placeholder: 'https://company.atlassian.net',
        helpText: 'URL Twojej instancji Jira',
      },
      {
        key: 'JIRA_SERVICE_EMAIL',
        label: 'Email',
        type: 'text',
        placeholder: 'email@company.com',
        helpText: 'Email uzywany do logowania do Jira',
      },
      {
        key: 'JIRA_API_KEY',
        label: 'API Token',
        type: 'password',
        placeholder: 'Jira API Token',
        helpText: 'Utworz na: id.atlassian.com/manage/api-tokens',
      },
    ],
  },
  {
    name: 'OpenRouter (LLM)',
    icon: <Bot className="h-5 w-5 text-orange-500" />,
    description: 'AI do inteligentnego przypisywania taskow',
    docsUrl: 'https://openrouter.ai/docs',
    configUrl: 'https://openrouter.ai/keys',
    fields: [
      {
        key: 'OPENROUTER_API_KEY',
        label: 'API Key',
        type: 'password',
        placeholder: 'sk-or-...',
        helpText: 'Pobierz z: openrouter.ai/keys',
      },
    ],
  },
  {
    name: 'Google Calendar',
    icon: <Calendar className="h-5 w-5 text-red-500" />,
    description: 'Synchronizacja wydarzen z Google Calendar',
    docsUrl: 'https://support.google.com/calendar/answer/37648',
    configUrl: 'https://calendar.google.com/calendar/u/0/r/settings',
    fields: [
      {
        key: 'GOOGLE_CALENDAR_ICAL_URL',
        label: 'iCal URL',
        type: 'url',
        placeholder: 'https://calendar.google.com/calendar/ical/...',
        helpText: 'Tajny adres w formacie iCal z ustawien kalendarza',
      },
    ],
  },
];

const LOCAL_STORAGE_KEY = 'timetracker_api_config';

export default function ConnectionsPage() {
  const [apis, setApis] = useState<APIStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<ServiceConfig | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Load saved config from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try {
        setConfigValues(JSON.parse(saved));
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch('/timetracker/api/status');
      const data = await response.json();
      setApis(data.apis || []);
    } catch (error) {
      console.error('Error fetching status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ok':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ok':
        return <Badge className="bg-green-500 text-white">Polaczono</Badge>;
      case 'error':
        return <Badge variant="destructive">Blad</Badge>;
      default:
        return <Badge variant="secondary">Nie skonfigurowano</Badge>;
    }
  };

  const getServiceConfig = (apiName: string): ServiceConfig | undefined => {
    return SERVICES.find(s => apiName.includes(s.name) || s.name.includes(apiName.split(' ')[0]));
  };

  const openConfigDialog = (service: ServiceConfig) => {
    setSelectedService(service);
    setTestResult(null);
    setConfigDialogOpen(true);
  };

  const saveConfig = () => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(configValues));
    setConfigDialogOpen(false);
    // Show info about .env file
    alert(
      'Konfiguracja zapisana w localStorage.\n\n' +
        'UWAGA: Aby polaczenia dzialaly na serwerze, musisz rowniez:\n' +
        '1. Utworzyc plik apps/web/.env.local\n' +
        '2. Dodac te same wartosci jako zmienne srodowiskowe\n\n' +
        'Przyklad:\n' +
        selectedService?.fields.map(f => `${f.key}=${configValues[f.key] || ''}`).join('\n')
    );
    fetchStatus();
  };

  const testConnection = async () => {
    if (!selectedService) return;

    setTesting(true);
    setTestResult(null);

    try {
      // Test based on service type
      const serviceName = selectedService.name.toLowerCase();

      if (serviceName.includes('activitywatch')) {
        const url = configValues['ACTIVITYWATCH_URL'] || 'http://localhost:5600';
        const res = await fetch(`${url}/api/0/info`, { signal: AbortSignal.timeout(5000) });
        setTestResult({
          success: res.ok,
          message: res.ok ? 'ActivityWatch dziala!' : `Blad: ${res.status}`,
        });
      } else if (serviceName.includes('openrouter')) {
        const apiKey = configValues['OPENROUTER_API_KEY'];
        if (!apiKey) {
          setTestResult({ success: false, message: 'Brak klucza API' });
        } else {
          const res = await fetch('https://openrouter.ai/api/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(5000),
          });
          setTestResult({
            success: res.ok,
            message: res.ok ? 'Polaczono z OpenRouter!' : `Blad: ${res.status}`,
          });
        }
      } else {
        // For Tempo, Jira, Google Calendar - need server-side test
        const response = await fetch('/timetracker/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ testType: serviceName.replace(' (llm)', '').replace(' ', '') }),
        });
        const data = await response.json();
        const result = Object.values(data.results || {})[0] as
          | { success: boolean; message: string }
          | undefined;
        setTestResult(result || { success: false, message: 'Brak odpowiedzi' });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: `Blad: ${error instanceof Error ? error.message : 'Nieznany blad'}`,
      });
    } finally {
      setTesting(false);
    }
  };

  const connectedCount = apis.filter(a => a.status === 'ok').length;
  const errorCount = apis.filter(a => a.status === 'error').length;
  const unconfiguredCount = apis.filter(a => a.status === 'unconfigured').length;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Polaczenia</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Zarzadzaj integracjami z zewnetrznymi serwisami
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/settings">
            <Button variant="outline">
              <Settings className="mr-2 h-4 w-4" />
              Ustawienia
            </Button>
          </Link>
          <Button onClick={fetchStatus} disabled={loading} variant="outline">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Sprawdz
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div>
                <div className="text-2xl font-bold text-green-600">{connectedCount}</div>
                <p className="text-sm text-slate-500">Polaczone</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <XCircle className="h-8 w-8 text-red-500" />
              <div>
                <div className="text-2xl font-bold text-red-600">{errorCount}</div>
                <p className="text-sm text-slate-500">Bledy</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-8 w-8 text-yellow-500" />
              <div>
                <div className="text-2xl font-bold text-yellow-600">{unconfiguredCount}</div>
                <p className="text-sm text-slate-500">Do konfiguracji</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Connections List */}
      <Card>
        <CardHeader>
          <CardTitle>Status serwisow</CardTitle>
          <CardDescription>Aktualny stan polaczen z zewnetrznymi serwisami</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {loading && apis.length === 0 ? (
              <div className="py-8 text-center text-slate-500">
                <RefreshCw className="mx-auto mb-2 h-8 w-8 animate-spin" />
                Sprawdzanie polaczen...
              </div>
            ) : apis.length === 0 ? (
              <div className="py-8 text-center text-slate-500">Brak danych o polaczeniach</div>
            ) : (
              apis.map((api, index) => {
                const serviceConfig = getServiceConfig(api.name);
                return (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50"
                  >
                    <div className="flex items-center gap-4">
                      {serviceConfig?.icon || getStatusIcon(api.status)}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900 dark:text-white">
                            {api.name}
                          </span>
                          {getStatusBadge(api.status)}
                        </div>
                        {api.message && (
                          <p className="max-w-md truncate text-sm text-slate-500 dark:text-slate-400">
                            {api.message}
                          </p>
                        )}
                        {serviceConfig && (
                          <p className="text-xs text-slate-400">{serviceConfig.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {serviceConfig && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openConfigDialog(serviceConfig)}
                        >
                          <Key className="mr-1 h-4 w-4" />
                          {api.status === 'unconfigured' ? 'Konfiguruj' : 'Edytuj'}
                        </Button>
                      )}
                      {serviceConfig?.docsUrl && (
                        <a
                          href={serviceConfig.docsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quick Setup Guide */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Info className="h-5 w-5 text-blue-500" />
            <CardTitle>Jak skonfigurowac?</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600 dark:text-slate-400">
          <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
            <h4 className="mb-2 font-medium text-blue-900 dark:text-blue-200">Wymagane serwisy:</h4>
            <ul className="ml-4 list-disc space-y-1">
              <li>
                <strong>ActivityWatch</strong> - zbiera dane o aktywnosci (musi byc uruchomiony)
              </li>
              <li>
                <strong>Tempo + Jira</strong> - do logowania czasu i pobierania ticketow
              </li>
            </ul>
          </div>

          <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
            <h4 className="mb-2 font-medium text-green-900 dark:text-green-200">
              Opcjonalne serwisy:
            </h4>
            <ul className="ml-4 list-disc space-y-1">
              <li>
                <strong>OpenRouter (AI)</strong> - inteligentne przypisywanie taskow
              </li>
              <li>
                <strong>Google Calendar</strong> - synchronizacja spotkan
              </li>
            </ul>
          </div>

          <div className="rounded-lg bg-yellow-50 p-4 dark:bg-yellow-900/20">
            <h4 className="mb-2 font-medium text-yellow-900 dark:text-yellow-200">
              Jak uzyskac klucze API:
            </h4>
            <ol className="ml-4 list-decimal space-y-1">
              <li>Kliknij &quot;Konfiguruj&quot; przy wybranym serwisie</li>
              <li>Kliknij link do dokumentacji aby uzyskac klucze</li>
              <li>Wpisz klucze i kliknij &quot;Testuj polaczenie&quot;</li>
              <li>Jesli test przeszedl, zapisz konfiguracje</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* Configuration Dialog */}
      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedService?.icon}
              Konfiguracja {selectedService?.name}
            </DialogTitle>
            <DialogDescription>{selectedService?.description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {selectedService?.fields.map(field => (
              <div key={field.key}>
                <label className="mb-1 block text-sm font-medium">{field.label}</label>
                <Input
                  type={field.type}
                  placeholder={field.placeholder}
                  value={configValues[field.key] || ''}
                  onChange={e => setConfigValues({ ...configValues, [field.key]: e.target.value })}
                />
                {field.helpText && <p className="mt-1 text-xs text-slate-500">{field.helpText}</p>}
              </div>
            ))}

            {/* Test Result */}
            {testResult && (
              <div
                className={`rounded-lg p-3 ${
                  testResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  {testResult.success ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  {testResult.message}
                </div>
              </div>
            )}

            {/* Documentation Link */}
            {selectedService?.configUrl && (
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="mb-2 text-sm text-slate-600">Gdzie uzyskac klucze:</p>
                <a
                  href={selectedService.configUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  {selectedService.configUrl}
                </a>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfigDialogOpen(false)}>
              Anuluj
            </Button>
            <Button variant="outline" onClick={testConnection} disabled={testing}>
              <TestTube className={`mr-2 h-4 w-4 ${testing ? 'animate-pulse' : ''}`} />
              {testing ? 'Testowanie...' : 'Testuj'}
            </Button>
            <Button onClick={saveConfig}>
              <Save className="mr-2 h-4 w-4" />
              Zapisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
