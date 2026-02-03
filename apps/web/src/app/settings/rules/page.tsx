'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Trash2,
  Plus,
  Edit,
  Save,
  Download,
  Upload,
  RefreshCw,
  ArrowLeft,
  Settings,
  Zap,
  BarChart3,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import Link from 'next/link';
import {
  getRules,
  addRule,
  updateRule,
  deleteRule,
  initializeDefaultRules,
  getRuleStats,
  exportRules,
  importRules,
  clearRules,
  type AssignmentRule,
  type RuleCondition,
} from '@/lib/rules-engine';

interface JiraIssue {
  key: string;
  name: string;
  project: string;
}

export default function RulesPage() {
  const [rules, setRules] = useState<AssignmentRule[]>([]);
  const [stats, setStats] = useState<ReturnType<typeof getRuleStats> | null>(null);
  const [jiraIssues, setJiraIssues] = useState<JiraIssue[]>([]);
  const [loadingJira, setLoadingJira] = useState(false);
  const [editingRule, setEditingRule] = useState<AssignmentRule | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

  // New rule form state
  const [newRule, setNewRule] = useState<{
    name: string;
    description: string;
    priority: number;
    conditions: RuleCondition;
    ticketKey: string;
    ticketName: string;
    confidence: number;
    enabled: boolean;
  }>({
    name: '',
    description: '',
    priority: 50,
    conditions: {},
    ticketKey: '',
    ticketName: '',
    confidence: 0.7,
    enabled: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    const loadedRules = getRules();
    if (loadedRules.length === 0) {
      setRules(initializeDefaultRules());
    } else {
      setRules(loadedRules);
    }
    setStats(getRuleStats());
    loadJiraIssues();
  };

  const loadJiraIssues = async () => {
    setLoadingJira(true);
    try {
      const res = await fetch('/timetracker/api/jira/my-issues');
      if (res.ok) {
        const data = await res.json();
        setJiraIssues(data.issues || []);
      }
    } catch (error) {
      console.error('Error loading Jira issues:', error);
    }
    setLoadingJira(false);
  };

  const handleToggleRule = (rule: AssignmentRule) => {
    updateRule(rule.id, { enabled: !rule.enabled });
    loadData();
  };

  const handleDeleteRule = (ruleId: string) => {
    if (confirm('Czy na pewno chcesz usunac te regule?')) {
      deleteRule(ruleId);
      loadData();
    }
  };

  const handleAddRule = () => {
    if (!newRule.name || !newRule.ticketKey) {
      alert('Nazwa i ticket sa wymagane');
      return;
    }

    const issue = jiraIssues.find(i => i.key === newRule.ticketKey);

    addRule({
      name: newRule.name,
      description: newRule.description,
      priority: newRule.priority,
      conditions: newRule.conditions,
      action: {
        ticketKey: newRule.ticketKey,
        ticketName: issue?.name || newRule.ticketName,
        confidence: newRule.confidence,
      },
      enabled: newRule.enabled,
    });

    setShowAddDialog(false);
    resetNewRuleForm();
    loadData();
  };

  const handleUpdateRule = () => {
    if (!editingRule) return;

    updateRule(editingRule.id, {
      name: editingRule.name,
      description: editingRule.description,
      priority: editingRule.priority,
      conditions: editingRule.conditions,
      action: editingRule.action,
      enabled: editingRule.enabled,
    });

    setEditingRule(null);
    loadData();
  };

  const resetNewRuleForm = () => {
    setNewRule({
      name: '',
      description: '',
      priority: 50,
      conditions: {},
      ticketKey: '',
      ticketName: '',
      confidence: 0.7,
      enabled: true,
    });
  };

  const handleExport = () => {
    const data = exportRules();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timetracker-rules-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
      const content = e.target?.result as string;
      if (importRules(content, true)) {
        loadData();
        alert('Import zakonczony pomyslnie!');
      } else {
        alert('Blad importu - nieprawidlowy format');
      }
    };
    reader.readAsText(file);
  };

  const handleClearRules = () => {
    if (confirm('Czy na pewno chcesz usunac wszystkie reguly? Ta operacja jest nieodwracalna.')) {
      clearRules();
      loadData();
    }
  };

  const formatConditions = (conditions: RuleCondition): string => {
    const parts: string[] = [];

    if (conditions.app?.length) {
      parts.push(`App: ${conditions.app.join(', ')}`);
    }
    if (conditions.titleContains?.length) {
      parts.push(`Tytul zawiera: ${conditions.titleContains.join(', ')}`);
    }
    if (conditions.projectName?.length) {
      parts.push(`Projekt: ${conditions.projectName.join(', ')}`);
    }
    if (conditions.timeRange) {
      parts.push(`Godz: ${conditions.timeRange.from}-${conditions.timeRange.to}`);
    }
    if (conditions.dayOfWeek?.length) {
      const days = ['Nd', 'Pn', 'Wt', 'Sr', 'Cz', 'Pt', 'Sb'];
      parts.push(`Dni: ${conditions.dayOfWeek.map(d => days[d]).join(', ')}`);
    }

    return parts.length > 0 ? parts.join(' | ') : 'Brak warunkow';
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/settings">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Powrot
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              Reguly przypisywania
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
              Zdefiniuj reguly automatycznego przypisywania aktywnosci do ticketow
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Odswiez
          </Button>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Dodaj regule
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Nowa regula</DialogTitle>
                <DialogDescription>
                  Zdefiniuj warunki i akcje dla nowej reguly przypisywania
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm text-gray-500">Nazwa reguly</label>
                    <Input
                      placeholder="np. Daily Standup"
                      value={newRule.name}
                      onChange={e => setNewRule({ ...newRule, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-gray-500">Priorytet (1-100)</label>
                    <Input
                      type="number"
                      min="1"
                      max="100"
                      value={newRule.priority}
                      onChange={e =>
                        setNewRule({ ...newRule, priority: parseInt(e.target.value) || 50 })
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm text-gray-500">Opis (opcjonalny)</label>
                  <Input
                    placeholder="Krotki opis reguly"
                    value={newRule.description}
                    onChange={e => setNewRule({ ...newRule, description: e.target.value })}
                  />
                </div>

                {/* Conditions */}
                <div className="rounded-lg bg-gray-50 p-4">
                  <h4 className="mb-3 font-medium">Warunki (jesli wszystkie spelnione)</h4>

                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-sm text-gray-500">
                        Aplikacja (oddzielone przecinkami)
                      </label>
                      <Input
                        placeholder="np. Slack, Teams"
                        value={newRule.conditions.app?.join(', ') || ''}
                        onChange={e =>
                          setNewRule({
                            ...newRule,
                            conditions: {
                              ...newRule.conditions,
                              app: e.target.value
                                ? e.target.value.split(',').map(s => s.trim())
                                : undefined,
                            },
                          })
                        }
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm text-gray-500">
                        Tytul zawiera (oddzielone przecinkami)
                      </label>
                      <Input
                        placeholder="np. daily, standup, meeting"
                        value={newRule.conditions.titleContains?.join(', ') || ''}
                        onChange={e =>
                          setNewRule({
                            ...newRule,
                            conditions: {
                              ...newRule.conditions,
                              titleContains: e.target.value
                                ? e.target.value.split(',').map(s => s.trim())
                                : undefined,
                            },
                          })
                        }
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm text-gray-500">
                        Nazwa projektu (oddzielone przecinkami)
                      </label>
                      <Input
                        placeholder="np. timetracker, customer-app"
                        value={newRule.conditions.projectName?.join(', ') || ''}
                        onChange={e =>
                          setNewRule({
                            ...newRule,
                            conditions: {
                              ...newRule.conditions,
                              projectName: e.target.value
                                ? e.target.value.split(',').map(s => s.trim())
                                : undefined,
                            },
                          })
                        }
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1 block text-sm text-gray-500">Od godziny</label>
                        <Input
                          type="time"
                          value={newRule.conditions.timeRange?.from || ''}
                          onChange={e =>
                            setNewRule({
                              ...newRule,
                              conditions: {
                                ...newRule.conditions,
                                timeRange: e.target.value
                                  ? {
                                      from: e.target.value,
                                      to: newRule.conditions.timeRange?.to || '23:59',
                                    }
                                  : undefined,
                              },
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm text-gray-500">Do godziny</label>
                        <Input
                          type="time"
                          value={newRule.conditions.timeRange?.to || ''}
                          onChange={e =>
                            setNewRule({
                              ...newRule,
                              conditions: {
                                ...newRule.conditions,
                                timeRange: newRule.conditions.timeRange?.from
                                  ? {
                                      from: newRule.conditions.timeRange.from,
                                      to: e.target.value,
                                    }
                                  : undefined,
                              },
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action */}
                <div className="rounded-lg bg-blue-50 p-4">
                  <h4 className="mb-3 font-medium">Akcja</h4>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-sm text-gray-500">
                        Przypisz do ticketa
                      </label>
                      <Select
                        value={newRule.ticketKey}
                        onValueChange={v => setNewRule({ ...newRule, ticketKey: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Wybierz ticket" />
                        </SelectTrigger>
                        <SelectContent>
                          {jiraIssues.slice(0, 50).map(issue => (
                            <SelectItem key={issue.key} value={issue.key}>
                              [{issue.key}] {issue.name.slice(0, 40)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm text-gray-500">Confidence (0-1)</label>
                      <Input
                        type="number"
                        min="0"
                        max="1"
                        step="0.1"
                        value={newRule.confidence}
                        onChange={e =>
                          setNewRule({ ...newRule, confidence: parseFloat(e.target.value) || 0.7 })
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* Enabled */}
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="newRuleEnabled"
                    checked={newRule.enabled}
                    onCheckedChange={checked => setNewRule({ ...newRule, enabled: !!checked })}
                  />
                  <label htmlFor="newRuleEnabled" className="text-sm">
                    Regula aktywna od razu
                  </label>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                  Anuluj
                </Button>
                <Button onClick={handleAddRule}>
                  <Save className="mr-2 h-4 w-4" />
                  Zapisz regule
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Statistics */}
      {stats && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <BarChart3 className="h-5 w-5 text-purple-600" />
              <CardTitle className="text-lg">Statystyki</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              <div className="rounded-lg bg-gray-50 p-3 text-center">
                <div className="text-2xl font-bold">{stats.totalRules}</div>
                <div className="text-xs text-gray-500">Wszystkie reguly</div>
              </div>
              <div className="rounded-lg bg-green-50 p-3 text-center">
                <div className="text-2xl font-bold text-green-600">{stats.enabledRules}</div>
                <div className="text-xs text-gray-500">Aktywne</div>
              </div>
              <div className="rounded-lg bg-blue-50 p-3 text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.totalMatches}</div>
                <div className="text-xs text-gray-500">Dopasowania</div>
              </div>
              <div className="rounded-lg bg-purple-50 p-3 text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {stats.topRules[0]?.matchCount || 0}
                </div>
                <div className="text-xs text-gray-500">Top regula</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rules List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="h-5 w-5 text-yellow-600" />
              <div>
                <CardTitle className="text-lg">Lista regul</CardTitle>
                <CardDescription>Reguly sa przetwarzane od najwyzszego priorytetu</CardDescription>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />
                Eksport
              </Button>
              <div>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="hidden"
                  id="import-rules"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('import-rules')?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Import
                </Button>
              </div>
              <Button variant="destructive" size="sm" onClick={handleClearRules}>
                <Trash2 className="mr-2 h-4 w-4" />
                Wyczysc
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {rules.length === 0 ? (
              <p className="py-8 text-center text-gray-500">
                Brak regul. Kliknij &quot;Dodaj regule&quot; aby utworzyc pierwsza.
              </p>
            ) : (
              rules
                .sort((a, b) => b.priority - a.priority)
                .map(rule => (
                  <div
                    key={rule.id}
                    className={`rounded-lg border p-4 ${
                      rule.enabled ? 'bg-white' : 'bg-gray-50 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleRule(rule)}
                            className="p-1"
                          >
                            {rule.enabled ? (
                              <ToggleRight className="h-5 w-5 text-green-600" />
                            ) : (
                              <ToggleLeft className="h-5 w-5 text-gray-400" />
                            )}
                          </Button>
                          <span className="font-medium">{rule.name}</span>
                          <Badge variant="outline">Priorytet: {rule.priority}</Badge>
                          {rule.matchCount > 0 && (
                            <Badge variant="secondary">{rule.matchCount} dopasow.</Badge>
                          )}
                        </div>
                        {rule.description && (
                          <p className="ml-9 mt-1 text-sm text-gray-500">{rule.description}</p>
                        )}
                        <div className="ml-9 mt-2 text-xs text-gray-400">
                          <strong>Warunki:</strong> {formatConditions(rule.conditions)}
                        </div>
                        <div className="ml-9 mt-1 text-xs text-gray-400">
                          <strong>Akcja:</strong>{' '}
                          <span className="font-mono">{rule.action.ticketKey}</span>
                          {rule.action.ticketName && ` - ${rule.action.ticketName}`}{' '}
                          <Badge variant="outline" className="ml-1">
                            {Math.round(rule.action.confidence * 100)}%
                          </Badge>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditingRule(rule)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteRule(rule.id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      {editingRule && (
        <Dialog open={!!editingRule} onOpenChange={() => setEditingRule(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edytuj regule: {editingRule.name}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm text-gray-500">Nazwa reguly</label>
                  <Input
                    value={editingRule.name}
                    onChange={e => setEditingRule({ ...editingRule, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-500">Priorytet</label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={editingRule.priority}
                    onChange={e =>
                      setEditingRule({ ...editingRule, priority: parseInt(e.target.value) || 50 })
                    }
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm text-gray-500">Opis</label>
                <Input
                  value={editingRule.description || ''}
                  onChange={e => setEditingRule({ ...editingRule, description: e.target.value })}
                />
              </div>

              <div className="rounded-lg bg-gray-50 p-4">
                <h4 className="mb-3 font-medium">Warunki</h4>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-sm text-gray-500">Aplikacja</label>
                    <Input
                      value={editingRule.conditions.app?.join(', ') || ''}
                      onChange={e =>
                        setEditingRule({
                          ...editingRule,
                          conditions: {
                            ...editingRule.conditions,
                            app: e.target.value
                              ? e.target.value.split(',').map(s => s.trim())
                              : undefined,
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-gray-500">Tytul zawiera</label>
                    <Input
                      value={editingRule.conditions.titleContains?.join(', ') || ''}
                      onChange={e =>
                        setEditingRule({
                          ...editingRule,
                          conditions: {
                            ...editingRule.conditions,
                            titleContains: e.target.value
                              ? e.target.value.split(',').map(s => s.trim())
                              : undefined,
                          },
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-blue-50 p-4">
                <h4 className="mb-3 font-medium">Akcja</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm text-gray-500">Ticket</label>
                    <Select
                      value={editingRule.action.ticketKey}
                      onValueChange={v =>
                        setEditingRule({
                          ...editingRule,
                          action: { ...editingRule.action, ticketKey: v },
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {jiraIssues.slice(0, 50).map(issue => (
                          <SelectItem key={issue.key} value={issue.key}>
                            [{issue.key}] {issue.name.slice(0, 40)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-gray-500">Confidence</label>
                    <Input
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      value={editingRule.action.confidence}
                      onChange={e =>
                        setEditingRule({
                          ...editingRule,
                          action: {
                            ...editingRule.action,
                            confidence: parseFloat(e.target.value) || 0.7,
                          },
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingRule(null)}>
                Anuluj
              </Button>
              <Button onClick={handleUpdateRule}>
                <Save className="mr-2 h-4 w-4" />
                Zapisz zmiany
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Settings className="h-5 w-5 text-gray-600" />
            <CardTitle className="text-lg">Jak dzialaja reguly?</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-gray-600">
          <ol className="ml-4 list-decimal space-y-2">
            <li>
              <strong>Priorytet</strong> - reguly o wyzszym priorytecie sa sprawdzane pierwsze
            </li>
            <li>
              <strong>Warunki</strong> - wszystkie zdefiniowane warunki musza byc spelnione
            </li>
            <li>
              <strong>Akcja</strong> - jesli warunki sa spelnione, aktywnosc zostaje przypisana do
              ticketa
            </li>
            <li>
              <strong>Fallback</strong> - jesli zadna regula nie pasuje, system sprobuje AI lub
              historii
            </li>
          </ol>
          <div className="mt-4 rounded bg-yellow-50 p-3 text-yellow-800">
            <strong>Wskazowka:</strong> Reguly dzialaja gdy AI (OpenRouter) jest niedostepne lub
            wylaczone. Jesli AI jest aktywne, reguly sa uzywane jako fallback.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
