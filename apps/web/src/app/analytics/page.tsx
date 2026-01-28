'use client';

import { useState, useEffect, useCallback } from 'react';
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
  AreaChart,
  Area,
  ComposedChart,
  Line,
  RadialBarChart,
  RadialBar,
  Treemap
} from 'recharts';

interface AnalyticsData {
  period: string;
  dateRange: {
    start: string;
    end: string;
    workdays: number;
    prevStart: string;
    prevEnd: string;
    prevWorkdays: number;
  };
  kpis: {
    totalAW: { seconds: number; formatted: string; trend: number; prevFormatted: string };
    totalTempo: { seconds: number; formatted: string; trend: number; prevFormatted: string };
    avgDailyAW: { seconds: number; formatted: string };
    avgDailyTempo: { seconds: number; formatted: string };
    targetAchievement: number;
    captureRate: number;
    productivityScore: number;
    totalWorklogs: number;
    peakAWHour: string;
    peakTempoHour: string;
  };
  daysSummary: {
    total: number;
    onTarget: number;
    warning: number;
    missing: number;
    onTargetPercent: number;
  };
  productivity: {
    productive: { seconds: number; formatted: string; percent: number };
    neutral: { seconds: number; formatted: string; percent: number };
    distracting: { seconds: number; formatted: string; percent: number };
  };
  dailyData: Array<{
    date: string;
    dayName: string;
    awSeconds: number;
    awFormatted: string;
    tempoSeconds: number;
    tempoFormatted: string;
    worklogsCount: number;
    status: 'ok' | 'warning' | 'missing';
  }>;
  hourlyChartData: Array<{
    hour: number;
    label: string;
    awMinutes: number;
    tempoMinutes: number;
    gap: number;
  }>;
  heatmapData: Array<{
    date: string;
    day: string;
    hours: Array<{ hour: number; aw: number; tempo: number }>;
  }>;
  topApps: Array<{
    app: string;
    seconds: number;
    formatted: string;
    percentage: number;
    category: 'productive' | 'neutral' | 'distracting';
  }>;
  dailyGaps: Array<{
    date: string;
    day: string;
    awHours: number;
    tempoHours: number;
    gapHours: number;
    gapPercent: number;
  }>;
  timestamp: string;
}

const PERIODS = [
  { value: 'today', label: 'Dziś' },
  { value: 'wtd', label: 'Ten tydzień' },
  { value: '7d', label: 'Ostatnie 7 dni' },
  { value: 'mtd', label: 'Ten miesiąc' },
  { value: '30d', label: 'Ostatnie 30 dni' },
];

const REFRESH_INTERVALS = [
  { value: 0, label: 'Wyłączone' },
  { value: 30, label: '30 sekund' },
  { value: 60, label: '1 minuta' },
  { value: 300, label: '5 minut' },
];

const PRODUCTIVITY_COLORS = {
  productive: '#22c55e',
  neutral: '#eab308',
  distracting: '#ef4444'
};

const APP_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#22c55e',
  '#06b6d4', '#f59e0b', '#ef4444', '#84cc16', '#6366f1'
];

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('7d');
  const [refreshInterval, setRefreshInterval] = useState(60);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/analytics?period=${period}`);
      const result = await response.json();
      setData(result);
      setLastRefresh(new Date());
      setCountdown(refreshInterval);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  }, [period, refreshInterval]);

  // Initial fetch and period change
  useEffect(() => {
    fetchData();
  }, [period]);

  // Auto-refresh
  useEffect(() => {
    if (refreshInterval === 0) return;

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          fetchData();
          return refreshInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [refreshInterval, fetchData]);

  // Trend indicator component
  const TrendIndicator = ({ value, inverted = false }: { value: number; inverted?: boolean }) => {
    const isPositive = inverted ? value < 0 : value > 0;
    const color = isPositive ? 'text-green-400' : value < 0 ? 'text-red-400' : 'text-slate-400';
    const arrow = value > 0 ? '↑' : value < 0 ? '↓' : '→';
    return (
      <span className={`text-sm font-medium ${color}`}>
        {arrow} {Math.abs(value)}%
      </span>
    );
  };

  // KPI Card component
  const KPICard = ({
    title,
    value,
    subtitle,
    trend,
    icon,
    color = 'blue',
    prevValue
  }: {
    title: string;
    value: string;
    subtitle?: string;
    trend?: number;
    icon: string;
    color?: string;
    prevValue?: string;
  }) => {
    const colorClasses: Record<string, string> = {
      blue: 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
      purple: 'from-purple-500/20 to-purple-600/10 border-purple-500/30',
      green: 'from-green-500/20 to-green-600/10 border-green-500/30',
      orange: 'from-orange-500/20 to-orange-600/10 border-orange-500/30',
      cyan: 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/30',
    };

    return (
      <div className={`bg-gradient-to-br ${colorClasses[color]} border rounded-xl p-4 backdrop-blur`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm text-slate-400 font-medium">{title}</div>
            <div className="text-3xl font-bold text-white mt-1">{value}</div>
            {subtitle && <div className="text-xs text-slate-500 mt-1">{subtitle}</div>}
            {prevValue && (
              <div className="text-xs text-slate-500 mt-1">poprzednio: {prevValue}</div>
            )}
          </div>
          <div className="flex flex-col items-end">
            <span className="text-2xl">{icon}</span>
            {trend !== undefined && <TrendIndicator value={trend} />}
          </div>
        </div>
      </div>
    );
  };

  // Heatmap cell component
  const HeatmapCell = ({ value, max }: { value: number; max: number }) => {
    const intensity = max > 0 ? Math.min(value / max, 1) : 0;
    const alpha = 0.1 + intensity * 0.8;
    return (
      <div
        className="w-6 h-6 rounded-sm border border-slate-700/50 flex items-center justify-center text-[10px] text-slate-300 font-mono"
        style={{ backgroundColor: `rgba(139, 92, 246, ${alpha})` }}
        title={`${value}m`}
      >
        {value > 0 ? value : ''}
      </div>
    );
  };

  if (!data && loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white text-xl">Ładowanie danych analitycznych...</div>
      </div>
    );
  }

  const maxHeatmapValue = data ? Math.max(...data.heatmapData.flatMap(d => d.hours.map(h => h.aw))) : 60;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Analytics</h1>
          <p className="text-slate-500 dark:text-slate-400">
            {data?.dateRange.start} - {data?.dateRange.end}
          </p>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          {/* Period selector */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/50 rounded-lg p-1">
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  period === p.value
                    ? 'bg-blue-500 text-white'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Refresh controls */}
          <div className="flex items-center gap-2">
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300"
            >
              {REFRESH_INTERVALS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>

            {refreshInterval > 0 && (
              <Badge variant="outline" className="text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-600 font-mono">
                {countdown}s
              </Badge>
            )}

            <Button
              onClick={fetchData}
              disabled={loading}
              size="sm"
              variant="outline"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div>
        {data && (
          <>
            {/* KPI Row */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              <KPICard
                title="ActivityWatch"
                value={data.kpis.totalAW.formatted}
                icon="👁️"
                color="purple"
                trend={data.kpis.totalAW.trend}
                prevValue={data.kpis.totalAW.prevFormatted}
                subtitle={`${data.dateRange.workdays} dni roboczych`}
              />
              <KPICard
                title="Tempo Logged"
                value={data.kpis.totalTempo.formatted}
                icon="⏱️"
                color="blue"
                trend={data.kpis.totalTempo.trend}
                prevValue={data.kpis.totalTempo.prevFormatted}
                subtitle={`${data.kpis.totalWorklogs} worklogów`}
              />
              <KPICard
                title="Średnia/dzień"
                value={data.kpis.avgDailyTempo.formatted}
                icon="📈"
                color="cyan"
                subtitle={`AW: ${data.kpis.avgDailyAW.formatted}`}
              />
              <KPICard
                title="Target (8h)"
                value={`${data.kpis.targetAchievement}%`}
                icon="🎯"
                color={data.kpis.targetAchievement >= 100 ? 'green' : 'orange'}
                subtitle={`${data.daysSummary.onTarget}/${data.daysSummary.total} dni OK`}
              />
              <KPICard
                title="Capture Rate"
                value={`${data.kpis.captureRate}%`}
                icon="📥"
                color="green"
                subtitle="logged / tracked"
              />
              <KPICard
                title="Productivity"
                value={`${data.kpis.productivityScore}%`}
                icon="🚀"
                color={data.kpis.productivityScore >= 70 ? 'green' : data.kpis.productivityScore >= 50 ? 'orange' : 'purple'}
                subtitle={`Peak: ${data.kpis.peakAWHour}`}
              />
            </div>

            {/* Charts Row 1 */}
            <div className="grid lg:grid-cols-3 gap-6 mb-6">
              {/* Daily Comparison Chart */}
              <Card className="lg:col-span-2 bg-slate-900/50 border-slate-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-base flex items-center gap-2">
                    📅 Porównanie dzienne (AW vs Tempo)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={data.dailyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis
                        dataKey="dayName"
                        stroke="#64748b"
                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                        tickFormatter={(_, i) => `${data.dailyData[i]?.dayName} ${data.dailyData[i]?.date.slice(-2)}`}
                      />
                      <YAxis
                        stroke="#64748b"
                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                        tickFormatter={(v) => `${Math.round(v / 3600)}h`}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: 8 }}
                        formatter={(value, name) => [
                          `${Math.floor(Number(value) / 3600)}h ${Math.floor((Number(value) % 3600) / 60)}m`,
                          name === 'awSeconds' ? 'ActivityWatch' : 'Tempo'
                        ]}
                        labelFormatter={(_, payload) => payload[0]?.payload?.date || ''}
                      />
                      <Legend />
                      <Bar dataKey="awSeconds" name="ActivityWatch" fill="#8b5cf6" radius={[4, 4, 0, 0]} opacity={0.7} />
                      <Bar dataKey="tempoSeconds" name="Tempo" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey={() => 8 * 3600} name="Target 8h" stroke="#22c55e" strokeDasharray="5 5" strokeWidth={2} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Days Status */}
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-base">📊 Status dni</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-center">
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                          <Pie
                            data={[
                              { name: 'OK (7h+)', value: data.daysSummary.onTarget, fill: '#22c55e' },
                              { name: 'Warning (4-7h)', value: data.daysSummary.warning, fill: '#eab308' },
                              { name: 'Missing (<4h)', value: data.daysSummary.missing, fill: '#ef4444' },
                            ]}
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={70}
                            paddingAngle={2}
                            dataKey="value"
                          >
                          </Pie>
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: 8 }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-green-500/20 rounded-lg p-2">
                        <div className="text-2xl font-bold text-green-400">{data.daysSummary.onTarget}</div>
                        <div className="text-xs text-green-300">OK</div>
                      </div>
                      <div className="bg-yellow-500/20 rounded-lg p-2">
                        <div className="text-2xl font-bold text-yellow-400">{data.daysSummary.warning}</div>
                        <div className="text-xs text-yellow-300">Warning</div>
                      </div>
                      <div className="bg-red-500/20 rounded-lg p-2">
                        <div className="text-2xl font-bold text-red-400">{data.daysSummary.missing}</div>
                        <div className="text-xs text-red-300">Missing</div>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-white">{data.daysSummary.onTargetPercent}%</div>
                      <div className="text-xs text-slate-400">dni na targecie</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts Row 2 */}
            <div className="grid lg:grid-cols-3 gap-6 mb-6">
              {/* Hourly Distribution */}
              <Card className="lg:col-span-2 bg-slate-900/50 border-slate-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-base">🕐 Rozkład godzinowy</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={data.hourlyChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="label" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 10 }} unit="m" />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: 8 }}
                        formatter={(value) => [`${value} min`, '']}
                      />
                      <Legend />
                      <Area type="monotone" dataKey="awMinutes" name="ActivityWatch" fill="#8b5cf6" fillOpacity={0.3} stroke="#8b5cf6" strokeWidth={2} />
                      <Area type="monotone" dataKey="tempoMinutes" name="Tempo" fill="#3b82f6" fillOpacity={0.3} stroke="#3b82f6" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Productivity Breakdown */}
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-base">🎯 Produktywność</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Productivity gauge */}
                    <div className="relative h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadialBarChart
                          cx="50%"
                          cy="100%"
                          innerRadius="60%"
                          outerRadius="100%"
                          startAngle={180}
                          endAngle={0}
                          data={[{ value: data.kpis.productivityScore, fill: data.kpis.productivityScore >= 70 ? '#22c55e' : data.kpis.productivityScore >= 50 ? '#eab308' : '#ef4444' }]}
                        >
                          <RadialBar dataKey="value" cornerRadius={10} background={{ fill: '#1e293b' }} />
                        </RadialBarChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex items-end justify-center pb-2">
                        <span className="text-3xl font-bold">{data.kpis.productivityScore}%</span>
                      </div>
                    </div>

                    {/* Breakdown bars */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-green-500" />
                        <span className="text-sm text-slate-300 flex-1">Produktywne</span>
                        <span className="text-sm font-mono text-slate-400">{data.productivity.productive.formatted}</span>
                        <span className="text-sm font-bold text-green-400 w-12 text-right">{data.productivity.productive.percent}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-yellow-500" />
                        <span className="text-sm text-slate-300 flex-1">Neutralne</span>
                        <span className="text-sm font-mono text-slate-400">{data.productivity.neutral.formatted}</span>
                        <span className="text-sm font-bold text-yellow-400 w-12 text-right">{data.productivity.neutral.percent}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-red-500" />
                        <span className="text-sm text-slate-300 flex-1">Rozpraszające</span>
                        <span className="text-sm font-mono text-slate-400">{data.productivity.distracting.formatted}</span>
                        <span className="text-sm font-bold text-red-400 w-12 text-right">{data.productivity.distracting.percent}%</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts Row 3 */}
            <div className="grid lg:grid-cols-2 gap-6 mb-6">
              {/* Heatmap */}
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-base">🗓️ Heatmapa aktywności (AW)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <div className="min-w-[500px]">
                      {/* Hours header */}
                      <div className="flex items-center gap-1 mb-2 ml-12">
                        {Array.from({ length: 16 }, (_, i) => (
                          <div key={i} className="w-6 text-center text-[10px] text-slate-500">
                            {i + 6}
                          </div>
                        ))}
                      </div>
                      {/* Days rows */}
                      {data.heatmapData.map((day, dayIdx) => (
                        <div key={dayIdx} className="flex items-center gap-1 mb-1">
                          <div className="w-12 text-xs text-slate-400 text-right pr-2">
                            {day.day} {day.date.slice(-2)}
                          </div>
                          {day.hours.map((h, hIdx) => (
                            <HeatmapCell key={hIdx} value={h.aw} max={maxHeatmapValue} />
                          ))}
                        </div>
                      ))}
                      {/* Legend */}
                      <div className="flex items-center gap-2 mt-4 ml-12">
                        <span className="text-xs text-slate-500">Mniej</span>
                        {[0.1, 0.3, 0.5, 0.7, 0.9].map((a, i) => (
                          <div
                            key={i}
                            className="w-4 h-4 rounded-sm"
                            style={{ backgroundColor: `rgba(139, 92, 246, ${a})` }}
                          />
                        ))}
                        <span className="text-xs text-slate-500">Więcej</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Gap Analysis */}
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-base">🔍 Gap Analysis (niezalogowany czas)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={data.dailyGaps} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis type="number" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 10 }} unit="h" />
                      <YAxis
                        dataKey="day"
                        type="category"
                        stroke="#64748b"
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                        width={35}
                        tickFormatter={(_, i) => `${data.dailyGaps[i]?.day} ${data.dailyGaps[i]?.date.slice(-2)}`}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: 8 }}
                        formatter={(value, name) => [
                          `${value}h`,
                          name === 'gapHours' ? 'Gap' : name === 'tempoHours' ? 'Logged' : 'Tracked'
                        ]}
                      />
                      <Legend />
                      <Bar dataKey="tempoHours" name="Zalogowane" fill="#3b82f6" stackId="a" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="gapHours" name="Niezalogowane" fill="#ef4444" stackId="a" radius={[0, 4, 4, 0]} opacity={0.7} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Bottom Row */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Top Apps */}
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-base">🏆 Top Aplikacje</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                    {data.topApps.map((app, i) => (
                      <div key={i} className="flex items-center gap-3 p-2 bg-slate-800/30 rounded-lg">
                        <div className="text-lg font-bold text-slate-500 w-6">{i + 1}</div>
                        <div
                          className="w-3 h-3 rounded"
                          style={{ backgroundColor: APP_COLORS[i % APP_COLORS.length] }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white truncate">{app.app}</div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1 py-0 ${
                                app.category === 'productive'
                                  ? 'text-green-400 border-green-400/30'
                                  : app.category === 'distracting'
                                  ? 'text-red-400 border-red-400/30'
                                  : 'text-yellow-400 border-yellow-400/30'
                              }`}
                            >
                              {app.category}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-slate-200">{app.formatted}</div>
                          <div className="text-xs text-slate-500">{app.percentage}%</div>
                        </div>
                        {/* Mini progress bar */}
                        <div className="w-20 h-2 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${app.percentage}%`,
                              backgroundColor: APP_COLORS[i % APP_COLORS.length]
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Daily Details Table */}
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-base">📋 Szczegóły dzienne</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-slate-400 border-b border-slate-700">
                          <th className="text-left py-2 font-medium">Dzień</th>
                          <th className="text-right py-2 font-medium">AW</th>
                          <th className="text-right py-2 font-medium">Tempo</th>
                          <th className="text-right py-2 font-medium">Gap</th>
                          <th className="text-right py-2 font-medium">Logs</th>
                          <th className="text-center py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.dailyData.map((day, i) => {
                          const gap = data.dailyGaps[i];
                          return (
                            <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                              <td className="py-2 text-slate-300">
                                {day.dayName} {day.date.slice(-5)}
                              </td>
                              <td className="py-2 text-right font-mono text-purple-400">{day.awFormatted}</td>
                              <td className="py-2 text-right font-mono text-blue-400">{day.tempoFormatted}</td>
                              <td className={`py-2 text-right font-mono ${gap?.gapHours > 2 ? 'text-red-400' : 'text-slate-500'}`}>
                                {gap?.gapHours > 0 ? `${gap.gapHours}h` : '-'}
                              </td>
                              <td className="py-2 text-right text-slate-400">{day.worklogsCount}</td>
                              <td className="py-2 text-center">
                                <Badge
                                  className={`text-xs ${
                                    day.status === 'ok'
                                      ? 'bg-green-500/20 text-green-400'
                                      : day.status === 'warning'
                                      ? 'bg-yellow-500/20 text-yellow-400'
                                      : 'bg-red-500/20 text-red-400'
                                  }`}
                                >
                                  {day.status === 'ok' ? '✓' : day.status === 'warning' ? '~' : '✗'}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>

          </>
        )}
      </div>
    </div>
  );
}
