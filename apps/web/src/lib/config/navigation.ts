import {
  LayoutDashboard,
  Clock,
  Calendar,
  BarChart3,
  Settings,
  Plug,
  ClipboardList,
  Github,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  children?: NavItem[];
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const navigation: NavSection[] = [
  {
    items: [
      {
        title: 'Dashboard',
        href: '/',
        icon: LayoutDashboard,
      },
      {
        title: 'Timesheet',
        href: '/timesheet',
        icon: Clock,
      },
      {
        title: 'My Issues',
        href: '/my-issues',
        icon: ClipboardList,
      },
      {
        title: 'Calendar',
        href: '/calendar',
        icon: Calendar,
      },
      {
        title: 'Analytics',
        href: '/analytics',
        icon: BarChart3,
      },
      {
        title: 'Activity',
        href: '/activity',
        icon: Github,
      },
    ],
  },
  {
    title: 'Configuration',
    items: [
      {
        title: 'Settings',
        href: '/settings',
        icon: Settings,
      },
      {
        title: 'Connections',
        href: '/connections',
        icon: Plug,
      },
    ],
  },
];
