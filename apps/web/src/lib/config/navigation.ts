import {
  LayoutDashboard,
  Clock,
  Calendar,
  BarChart3,
  Settings,
  Plug,
  ClipboardList,
  Github,
  Sunrise,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  /** i18n key under the `nav` namespace */
  titleKey: string;
  href: string;
  icon: LucideIcon;
  children?: NavItem[];
}

export interface NavSection {
  /** i18n key under the `nav` namespace (section header) */
  titleKey?: string;
  items: NavItem[];
}

export const navigation: NavSection[] = [
  {
    items: [
      { titleKey: 'dashboard', href: '/', icon: LayoutDashboard },
      { titleKey: 'yesterday', href: '/yesterday', icon: Sunrise },
      { titleKey: 'timesheet', href: '/timesheet', icon: Clock },
      { titleKey: 'myIssues', href: '/my-issues', icon: ClipboardList },
      { titleKey: 'calendar', href: '/calendar', icon: Calendar },
      { titleKey: 'analytics', href: '/analytics', icon: BarChart3 },
      { titleKey: 'activity', href: '/activity', icon: Github },
    ],
  },
  {
    titleKey: 'configuration',
    items: [
      { titleKey: 'settings', href: '/settings', icon: Settings },
      { titleKey: 'connections', href: '/connections', icon: Plug },
    ],
  },
];
