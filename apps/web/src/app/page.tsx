'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart
} from 'recharts';

interface ApiStatus {
  name: string;
  configured: boolean;
  status: 'ok' | 'error' | 'unconfigured';
  message?: string;
}

interface DayStats {
  date: string;
  dayName: string;
  awSeconds: number;
  awFormatted: string;
  tempoSeconds: number;
  tempoFormatted: string;
  worklogsCount: number;
  status: 'ok' | 'warning' | 'missing';
}

interface DashboardData {
  days: DayStats[];
  summary: {
    totalAwFormatted: string;
    totalTempoFormatted: string;
    avgTempoFormatted: string;
    daysCount: number;
    okDays: number;
    warningDays: number;
    missingDays: number;
  };
}

interface HourlyData {
  hour: number;
  hourLabel: string;
  awMinutes: number;
  tempoMinutes: number;
}

interface AppUsage {
  app: string;
  minutes: number;
  percentage: number;
  color: string;
  [key: string]: string | number;
}

interface TopActivity {
  title: string;
  app: string;
  minutes: number;
  events: number;
}

interface TempoWorklog {
  id: number;
  description: string;
  minutes: number;
  startTime: string;
}

interface DetailedData {
  date: string;
  summary: {
    awTotalMinutes: number;
    awTotalFormatted: string;
    tempoTotalMinutes: number;
    tempoTotalFormatted: string;
    worklogsCount: number;
    activitiesCount: number;
    efficiency: number;
  };
  hourlyData: HourlyData[];
  appUsage: AppUsage[];
  topActivities: TopActivity[];
  tempoWorklogs: TempoWorklog[];
}

const QUICK_TICKETS = [
  { id: 38484, key: 'BCI-390', name: 'Discovery/Meetings' },
  { id: 38482, key: 'BCI-395', name: 'Automation Ideas' },
  { id: 38408, key: 'BCI-396', name: 'Consulting/Onboarding' },
  { id: 13218, key: 'BCI-1', name: 'Daily Standup' },
];

export default function DashboardPage() {
  const [apis, setApis] = useState<ApiStatus[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [detailed, setDetailed] = useState<DetailedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  // Quick log form state
  const [quickLogTicket, setQuickLogTicket] = useState(QUICK_TICKETS[1].id);
  const [quickLogHours, setQuickLogHours] = useState('1');
  const [quickLogDesc, setQuickLogDesc] = useState('');
  const [quickLogLoading, setQuickLogLoading] = useState(false);
  const [quickLogMessage, setQuickLogMessage] = useState('');

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/status');
      const data = await response.json();
      setApis(data.apis);
    } catch (error) {
      console.error('Error fetching status:', error);
    }
  };

  const fetchDashboard = async () => {
    setDashboardLoading(true);
    try {
      const response = await fetch('/api/dashboard?days=14');
      const data = await response.json();
      setDashboard(data);
    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setDashboardLoading(false);
    }
  };

  const fetchDetailed = async (date: string) => {
    try {
      const response = await fetch(`/api/dashboard/detailed?date=${date}`);
      const data = await response.json();
      setDetailed(data);
    } catch (error) {
      console.error('Error fetching detailed:', error);
    }
  };

  const handleQuickLog = async () => {
    if (!quickLogDesc.trim()) {
      setQuickLogMessage('Podaj opis!');
      return;
    }

    setQuickLogLoading(true);
    setQuickLogMessage('');

    try {
      const now = new Date();
      const hours = parseFloat(quickLogHours);
      const seconds = Math.round(hours * 3600);

      const response = await fetch('/api/tempo/worklogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueId: quickLogTicket,
          timeSpentSeconds: seconds,
          startDate: now.toISOString().split('T')[0],
          startTime: `${String(now.getHours()).padStart(2, '0')}:00:00`,
          description: quickLogDesc
        })
      });

      const data = await response.json();

      if (response.ok) {
        setQuickLogMessage(`✓ Zalogowano ${hours}h!`);
        setQuickLogDesc('');
        fetchDashboard();
        fetchDetailed(selectedDate);
      } else {
        setQuickLogMessage(`✗ ${data.error}`);
      }
    } catch (error) {
      setQuickLogMessage('✗ Błąd połączenia');
    } finally {
      setQuickLogLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchStatus(), fetchDashboard(), fetchDetailed(selectedDate)])
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchDetailed(selectedDate);
  }, [selectedDate]);

  const getStatusBadge = (status: ApiStatus['status']) => {
    switch (status) {
      case 'ok':
        return <Badge className="bg-green-500 text-white">OK</Badge>;
      case 'error':
        return <Badge className="bg-red-500 text-white">Error</Badge>;
      case 'unconfigured':
        return <Badge className="bg-yellow-500 text-white">Not Set</Badge>;
    }
  };

  const getDayStatusColor = (status: DayStats['status']) => {
    switch (status) {
      case 'ok': return 'bg-green-100 border-green-300';
      case 'warning': return 'bg-yellow-100 border-yellow-300';
      case 'missing': return 'bg-red-100 border-red-300';
    }
  };

  // Prepare chart data for weekly comparison
  const weeklyChartData = dashboard?.days.slice().reverse().map(day => ({
    name: `${day.dayName} ${day.date.substring(8)}`,
    tempo: Math.round(day.tempoSeconds / 3600 * 10) / 10,
    aw: Math.round(day.awSeconds / 3600 * 10) / 10,
    target: 8
  })) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">ActivityWatch + Tempo Analytics</p>
        </div>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
        />
      </div>

        {/* Quick Log Card */}
        <Card className="mb-6 bg-gradient-to-r from-blue-600 to-indigo-600 border-0 shadow-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <span className="text-2xl">⚡</span> Quick Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-48">
                <label className="block text-sm text-blue-100 mb-1">Ticket</label>
                <select
                  value={quickLogTicket}
                  onChange={(e) => setQuickLogTicket(Number(e.target.value))}
                  className="w-full p-2.5 rounded-lg bg-white/10 border border-white/20 text-white backdrop-blur"
                >
                  {QUICK_TICKETS.map((t) => (
                    <option key={t.id} value={t.id} className="text-slate-900">
                      {t.key} - {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-24">
                <label className="block text-sm text-blue-100 mb-1">Hours</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="12"
                  value={quickLogHours}
                  onChange={(e) => setQuickLogHours(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-white/10 border border-white/20 text-white"
                />
              </div>
              <div className="flex-1 min-w-64">
                <label className="block text-sm text-blue-100 mb-1">Description</label>
                <input
                  type="text"
                  value={quickLogDesc}
                  onChange={(e) => setQuickLogDesc(e.target.value)}
                  placeholder="What did you work on?"
                  className="w-full p-2.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder-blue-200"
                />
              </div>
              <Button
                onClick={handleQuickLog}
                disabled={quickLogLoading}
                className="bg-white text-blue-600 hover:bg-blue-50 font-semibold px-6"
              >
                {quickLogLoading ? 'Logging...' : 'Log Now'}
              </Button>
            </div>
            {quickLogMessage && (
              <div className={`mt-3 text-sm font-medium ${quickLogMessage.startsWith('✓') ? 'text-green-200' : 'text-red-200'}`}>
                {quickLogMessage}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Day Summary Cards */}
        {detailed && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
              <CardContent className="pt-6">
                <div className="text-sm font-medium text-slate-400">ActivityWatch</div>
                <div className="text-3xl font-bold text-purple-400">{detailed.summary.awTotalFormatted}</div>
                <div className="text-xs text-slate-500 mt-1">{detailed.summary.activitiesCount} activities</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
              <CardContent className="pt-6">
                <div className="text-sm font-medium text-slate-400">Tempo Logged</div>
                <div className="text-3xl font-bold text-blue-400">{detailed.summary.tempoTotalFormatted}</div>
                <div className="text-xs text-slate-500 mt-1">{detailed.summary.worklogsCount} worklogs</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
              <CardContent className="pt-6">
                <div className="text-sm font-medium text-slate-400">Efficiency</div>
                <div className={`text-3xl font-bold ${detailed.summary.efficiency > 100 ? 'text-green-400' : detailed.summary.efficiency > 70 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {detailed.summary.efficiency}%
                </div>
                <div className="text-xs text-slate-500 mt-1">logged vs tracked</div>
              </CardContent>
            </Card>
            {dashboard && (
              <>
                <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
                  <CardContent className="pt-6">
                    <div className="text-sm font-medium text-slate-400">Week Total</div>
                    <div className="text-3xl font-bold text-emerald-400">{dashboard.summary.totalTempoFormatted}</div>
                    <div className="text-xs text-slate-500 mt-1">{dashboard.summary.daysCount} work days</div>
                  </CardContent>
                </Card>
                <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
                  <CardContent className="pt-6">
                    <div className="text-sm font-medium text-slate-400">Daily Average</div>
                    <div className="text-3xl font-bold text-cyan-400">{dashboard.summary.avgTempoFormatted}</div>
                    <div className="text-xs text-slate-500 mt-1">target: 8h</div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}

        {/* Charts Row */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Hourly Activity Chart */}
          <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <span>📊</span> Hourly Activity - {selectedDate}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {detailed ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={detailed.hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis
                      dataKey="hourLabel"
                      stroke="#94a3b8"
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      label={{ value: 'min', angle: -90, position: 'insideLeft', fill: '#94a3b8' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #475569',
                        borderRadius: '8px'
                      }}
                      labelStyle={{ color: '#f8fafc' }}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="awMinutes"
                      name="ActivityWatch"
                      fill="#a855f7"
                      fillOpacity={0.3}
                      stroke="#a855f7"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="tempoMinutes"
                      name="Tempo"
                      fill="#3b82f6"
                      fillOpacity={0.3}
                      stroke="#3b82f6"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-500">Loading...</div>
              )}
            </CardContent>
          </Card>

          {/* App Usage Pie Chart */}
          <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <span>🥧</span> App Usage - {selectedDate}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {detailed && detailed.appUsage.length > 0 ? (
                <div className="flex">
                  <ResponsiveContainer width="50%" height={280}>
                    <PieChart>
                      <Pie
                        data={detailed.appUsage}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="minutes"
                        nameKey="app"
                      >
                        {detailed.appUsage.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1e293b',
                          border: '1px solid #475569',
                          borderRadius: '8px'
                        }}
                        formatter={(value) => [`${value} min`, '']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="w-1/2 flex flex-col justify-center space-y-1.5 pl-2">
                    {detailed.appUsage.slice(0, 6).map((app, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <div
                          className="w-3 h-3 rounded"
                          style={{ backgroundColor: app.color }}
                        />
                        <span className="text-slate-300 truncate flex-1">{app.app}</span>
                        <span className="text-slate-400 font-mono">{app.minutes}m</span>
                        <span className="text-slate-500 text-xs w-10 text-right">{app.percentage}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-500">No data</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Weekly Comparison Chart */}
        <Card className="mb-6 bg-slate-800/50 border-slate-700 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <span>📈</span> Weekly Comparison
            </CardTitle>
            <Button
              onClick={fetchDashboard}
              disabled={dashboardLoading}
              size="sm"
              variant="outline"
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              {dashboardLoading ? 'Loading...' : 'Refresh'}
            </Button>
          </CardHeader>
          <CardContent>
            {weeklyChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={weeklyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="name"
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    label={{ value: 'hours', angle: -90, position: 'insideLeft', fill: '#94a3b8' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #475569',
                      borderRadius: '8px'
                    }}
                    labelStyle={{ color: '#f8fafc' }}
                  />
                  <Legend />
                  <Bar dataKey="tempo" name="Tempo Logged" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="aw" name="ActivityWatch" fill="#a855f7" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="target" name="Target (8h)" stroke="#22c55e" strokeDasharray="5 5" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-slate-500">Loading...</div>
            )}
          </CardContent>
        </Card>

        {/* Bottom Grid: Activities + Worklogs + Status */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Top Activities */}
          <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <span>🏆</span> Top Activities
              </CardTitle>
            </CardHeader>
            <CardContent>
              {detailed && detailed.topActivities.length > 0 ? (
                <div className="space-y-2">
                  {detailed.topActivities.slice(0, 8).map((activity, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 bg-slate-700/30 rounded-lg">
                      <div className="text-lg font-bold text-slate-500 w-6">{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-200 truncate">{activity.title}</div>
                        <div className="text-xs text-slate-500">{activity.app}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-purple-400">{activity.minutes}m</div>
                        <div className="text-xs text-slate-500">{activity.events} events</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">No activities</div>
              )}
            </CardContent>
          </Card>

          {/* Tempo Worklogs */}
          <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <span>📝</span> Today&apos;s Worklogs
              </CardTitle>
            </CardHeader>
            <CardContent>
              {detailed && detailed.tempoWorklogs.length > 0 ? (
                <div className="space-y-2">
                  {detailed.tempoWorklogs.map((worklog, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 bg-slate-700/30 rounded-lg">
                      <div className="text-sm text-slate-400 w-14">{worklog.startTime?.substring(0, 5) || '--:--'}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-200 truncate">{worklog.description}</div>
                      </div>
                      <Badge variant="outline" className="text-blue-400 border-blue-400/30">
                        {Math.floor(worklog.minutes / 60)}h {worklog.minutes % 60}m
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">No worklogs</div>
              )}
            </CardContent>
          </Card>

          {/* API Status */}
          <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <span>🔌</span> API Status
              </CardTitle>
              <Button
                onClick={fetchStatus}
                disabled={loading}
                size="sm"
                variant="outline"
                className="border-slate-600 text-slate-300 hover:bg-slate-700"
              >
                Check
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {apis.map((api) => (
                  <div
                    key={api.name}
                    className="flex items-center justify-between p-2 bg-slate-700/30 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          api.status === 'ok' ? 'bg-green-500' : api.status === 'error' ? 'bg-red-500' : 'bg-yellow-500'
                        }`}
                      />
                      <span className="text-sm text-slate-300">{api.name}</span>
                    </div>
                    {getStatusBadge(api.status)}
                  </div>
                ))}
              </div>

              {/* Quick Links */}
              <div className="mt-4 pt-4 border-t border-slate-700 flex flex-wrap gap-2">
                <a href="https://beecommerce.atlassian.net/jira/software/projects/BCI/boards" target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white hover:bg-slate-700">
                    Jira
                  </Button>
                </a>
                <a href="https://beecommerce.atlassian.net/plugins/servlet/ac/io.tempo.jira/tempo-app#!/my-work/week" target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white hover:bg-slate-700">
                    Tempo
                  </Button>
                </a>
                <a href="http://localhost:5600" target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white hover:bg-slate-700">
                    AW
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Weekly Day Cards */}
        <Card className="mt-6 bg-slate-800/50 border-slate-700 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <span>📅</span> Week Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard ? (
              <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-7 gap-3">
                {dashboard.days.slice().reverse().map((day) => (
                  <button
                    key={day.date}
                    onClick={() => setSelectedDate(day.date)}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      selectedDate === day.date
                        ? 'border-blue-500 bg-blue-500/20'
                        : day.status === 'ok'
                        ? 'border-green-500/30 bg-green-500/10 hover:border-green-500'
                        : day.status === 'warning'
                        ? 'border-yellow-500/30 bg-yellow-500/10 hover:border-yellow-500'
                        : 'border-red-500/30 bg-red-500/10 hover:border-red-500'
                    }`}
                  >
                    <div className="text-xs text-slate-400">{day.dayName}</div>
                    <div className="text-lg font-bold text-white">{day.date.substring(8)}</div>
                    <div className={`text-sm font-semibold ${
                      day.status === 'ok' ? 'text-green-400' : day.status === 'warning' ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {day.tempoFormatted}
                    </div>
                    <div className="text-xs text-slate-500">{day.worklogsCount} logs</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">Loading...</div>
            )}
          </CardContent>
        </Card>

    </div>
  );
}
