'use client';

import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { useSidebar } from '@/lib/providers/SidebarProvider';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { apiUrl } from '@/lib/api';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { cn } from '@/lib/utils';
import {
  Menu,
  Sun,
  Moon,
  Monitor,
  Wifi,
  WifiOff,
  Pause,
  Play,
  Loader2,
} from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { LangSwitcher } from './LangSwitcher';

// Map URL segments to i18n keys under `header.pathLabels`
const pathKeyMap: Record<string, string> = {
  '': 'dashboard',
  yesterday: 'yesterday',
  timesheet: 'timesheet',
  'my-issues': 'myIssues',
  calendar: 'calendar',
  analytics: 'analytics',
  activity: 'activity',
  settings: 'settings',
  connections: 'connections',
  api: 'api',
  mappings: 'mappings',
  history: 'history',
  admin: 'admin',
};

export function Header() {
  const pathname = usePathname();
  const { isCollapsed, toggle } = useSidebar();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [trackingPaused, setTrackingPaused] = useState(false);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingSupported, setTrackingSupported] = useState(true);
  const tCommon = useTranslations('common');
  const tHeader = useTranslations('header');

  const fetchTrackingState = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/tracking/toggle'));
      if (res.ok) {
        const data = await res.json();
        setTrackingPaused(data.paused);
        setTrackingSupported(data.supported);
      }
    } catch {}
  }, []);

  const toggleTracking = useCallback(async () => {
    if (trackingLoading) return;
    setTrackingLoading(true);
    try {
      const action = trackingPaused ? 'resume' : 'pause';
      const res = await fetch(apiUrl('/api/tracking/toggle'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) {
        setTrackingPaused(data.state === 'paused');
        toast.success(
          data.state === 'paused'
            ? tHeader('toast.trackingPaused')
            : tHeader('toast.trackingResumed')
        );
      } else {
        toast.error(data.error || tHeader('toast.trackingError'));
      }
    } catch {
      toast.error(tHeader('toast.connectionError'));
    } finally {
      setTrackingLoading(false);
    }
  }, [trackingPaused, trackingLoading, tHeader]);

  useEffect(() => {
    setMounted(true);
    setIsOnline(navigator.onLine);
    fetchTrackingState();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchTrackingState]);

  // Generate breadcrumbs from pathname
  const segments = pathname.split('/').filter(Boolean);
  const breadcrumbs = segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/');
    const key = pathKeyMap[segment];
    const label = key
      ? tHeader(`pathLabels.${key}`)
      : segment.charAt(0).toUpperCase() + segment.slice(1);
    const isLast = index === segments.length - 1;
    return { href, label, isLast };
  });

  // Add home if we're on a subpage
  if (breadcrumbs.length > 0) {
    breadcrumbs.unshift({ href: '/', label: tHeader('pathLabels.dashboard'), isLast: false });
  }

  return (
    <header
      className={cn(
        'fixed top-0 right-0 z-30 h-16 border-b border-slate-200 bg-white transition-all duration-300 dark:border-slate-800 dark:bg-slate-950',
        isCollapsed ? 'left-16' : 'left-64'
      )}
    >
      <div className="flex h-full items-center justify-between px-4">
        {/* Left side: Mobile menu + Breadcrumbs */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            className="lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Breadcrumbs */}
          <Breadcrumb>
            <BreadcrumbList>
              {breadcrumbs.length === 0 ? (
                <BreadcrumbItem>
                  <BreadcrumbPage className="text-slate-900 dark:text-slate-100">
                    {tHeader('pathLabels.dashboard')}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              ) : (
                breadcrumbs.map((crumb, index) => (
                  <BreadcrumbItem key={crumb.href}>
                    {crumb.isLast ? (
                      <BreadcrumbPage className="text-slate-900 dark:text-slate-100">
                        {crumb.label}
                      </BreadcrumbPage>
                    ) : (
                      <>
                        <BreadcrumbLink
                          href={crumb.href}
                          className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                        >
                          {crumb.label}
                        </BreadcrumbLink>
                        {index < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
                      </>
                    )}
                  </BreadcrumbItem>
                ))
              )}
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        {/* Right side: Status + Theme + Language */}
        <div className="flex items-center gap-2">
          {/* Connection status */}
          <div className={cn(
            'flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium',
            isOnline
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          )}>
            {isOnline ? (
              <>
                <Wifi className="h-3 w-3" />
                <span className="hidden sm:inline">{tCommon('online')}</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" />
                <span className="hidden sm:inline">{tCommon('offline')}</span>
              </>
            )}
          </div>

          {/* Tracking pause/resume toggle */}
          {mounted && trackingSupported && (
            <button
              onClick={toggleTracking}
              disabled={trackingLoading}
              title={trackingPaused ? tCommon('resumeTooltip') : tCommon('pauseTooltip')}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60',
                trackingPaused
                  ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
              )}
            >
              {trackingLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : trackingPaused ? (
                <Play className="h-3 w-3" />
              ) : (
                <Pause className="h-3 w-3" />
              )}
              <span className="hidden sm:inline">
                {trackingLoading ? '...' : trackingPaused ? tCommon('resume') : tCommon('pause')}
              </span>
            </button>
          )}

          {/* Language switcher */}
          {mounted && <LangSwitcher />}

          {/* Theme toggle */}
          {mounted && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  {theme === 'dark' ? (
                    <Moon className="h-4 w-4" />
                  ) : theme === 'light' ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Monitor className="h-4 w-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setTheme('light')}>
                  <Sun className="mr-2 h-4 w-4" />
                  {tCommon('theme.light')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('dark')}>
                  <Moon className="mr-2 h-4 w-4" />
                  {tCommon('theme.dark')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('system')}>
                  <Monitor className="mr-2 h-4 w-4" />
                  {tCommon('theme.system')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
}
