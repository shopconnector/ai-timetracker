import {
  LayoutDashboard,
  Clock,
  Calendar,
  BarChart3,
  Settings,
  Plug,
  GitCompare,
  ListTodo,
  Zap,
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
        title: 'Tasks',
        href: '/tasks',
        icon: ListTodo,
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
        title: 'Compare',
        href: '/compare',
        icon: GitCompare,
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
        children: [
          {
            title: 'General',
            href: '/settings',
            icon: Settings,
          },
          {
            title: 'Rules',
            href: '/settings/rules',
            icon: Zap,
          },
        ],
      },
      {
        title: 'Connections',
        href: '/connections',
        icon: Plug,
      },
    ],
  },
];
