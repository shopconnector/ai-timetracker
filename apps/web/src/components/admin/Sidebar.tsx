'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { navigation } from '@/lib/config/navigation';
import { useSidebar } from '@/lib/providers/SidebarProvider';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock,
} from 'lucide-react';

export function Sidebar() {
  const pathname = usePathname();
  const { isCollapsed, setCollapsed } = useSidebar();
  const [expandedItems, setExpandedItems] = useState<string[]>(['/settings']);

  const toggleExpand = (href: string) => {
    setExpandedItems((prev) =>
      prev.includes(href)
        ? prev.filter((h) => h !== href)
        : [...prev, href]
    );
  };

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 h-screen bg-slate-900 text-slate-100 transition-all duration-300',
          isCollapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-slate-800 px-4">
          {!isCollapsed && (
            <Link href="/" className="flex items-center gap-2">
              <Clock className="h-6 w-6 text-blue-500" />
              <span className="font-semibold text-lg">TimeTracker</span>
            </Link>
          )}
          {isCollapsed && (
            <Link href="/" className="mx-auto">
              <Clock className="h-6 w-6 text-blue-500" />
            </Link>
          )}
        </div>

        {/* Navigation */}
        <ScrollArea className="h-[calc(100vh-8rem)]">
          <nav className="space-y-2 p-2">
            {navigation.map((section, sectionIndex) => (
              <div key={sectionIndex}>
                {section.title && !isCollapsed && (
                  <div className="px-3 py-2">
                    <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                      {section.title}
                    </span>
                  </div>
                )}
                {section.title && isCollapsed && (
                  <Separator className="my-2 bg-slate-800" />
                )}
                {section.items.map((item) => (
                  <div key={item.href}>
                    {/* Main nav item */}
                    {isCollapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link
                            href={item.children ? '#' : item.href}
                            onClick={(e) => {
                              if (item.children) {
                                e.preventDefault();
                                toggleExpand(item.href);
                              }
                            }}
                            className={cn(
                              'flex h-10 w-full items-center justify-center rounded-lg transition-colors',
                              isActive(item.href)
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                            )}
                          >
                            <item.icon className="h-5 w-5" />
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="bg-slate-800 text-slate-100 border-slate-700">
                          {item.title}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Link
                        href={item.children ? '#' : item.href}
                        onClick={(e) => {
                          if (item.children) {
                            e.preventDefault();
                            toggleExpand(item.href);
                          }
                        }}
                        className={cn(
                          'flex h-10 w-full items-center gap-3 rounded-lg px-3 transition-colors',
                          isActive(item.href)
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                        )}
                      >
                        <item.icon className="h-5 w-5 flex-shrink-0" />
                        <span className="flex-1 truncate">{item.title}</span>
                        {item.children && (
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 transition-transform',
                              expandedItems.includes(item.href) && 'rotate-180'
                            )}
                          />
                        )}
                      </Link>
                    )}

                    {/* Sub-items */}
                    {item.children && expandedItems.includes(item.href) && !isCollapsed && (
                      <div className="ml-4 mt-1 space-y-1 border-l border-slate-800 pl-3">
                        {item.children.map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={cn(
                              'flex h-9 items-center gap-2 rounded-lg px-3 text-sm transition-colors',
                              isActive(child.href)
                                ? 'bg-slate-800 text-blue-400'
                                : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-300'
                            )}
                          >
                            <child.icon className="h-4 w-4" />
                            <span>{child.title}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* Collapse toggle */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-slate-800 p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(!isCollapsed)}
            className="w-full justify-center text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-2" />
                <span>Collapse</span>
              </>
            )}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
