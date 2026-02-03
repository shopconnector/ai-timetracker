'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Check,
  ChevronsUpDown,
  Search,
  Loader2,
  Clock,
  Folder,
  Hash,
  ChevronDown,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Ticket } from './ActivityCard';
import {
  enrichTicketsWithUsage,
  EnrichedTicket,
  getOrganizedTicketGroups,
  getRecentTicketsFromHistory,
  formatLastUsed,
  formatUsageCount,
} from '@/lib/ticketEnricher';

// Ikony typów JIRA
const ISSUE_TYPE_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  Story: { icon: '📗', color: 'text-green-600', bg: 'bg-green-100' },
  Task: { icon: '🔷', color: 'text-blue-600', bg: 'bg-blue-100' },
  Zadanie: { icon: '🔷', color: 'text-blue-600', bg: 'bg-blue-100' },
  Bug: { icon: '🔴', color: 'text-red-600', bg: 'bg-red-100' },
  Epic: { icon: '⚡', color: 'text-purple-600', bg: 'bg-purple-100' },
  Subtask: { icon: '📎', color: 'text-gray-600', bg: 'bg-gray-100' },
  Podzadanie: { icon: '📎', color: 'text-gray-600', bg: 'bg-gray-100' },
  meeting: { icon: '📅', color: 'text-orange-600', bg: 'bg-orange-100' },
  'project administration': { icon: '📁', color: 'text-slate-600', bg: 'bg-slate-100' },
  'Sales action': { icon: '💼', color: 'text-emerald-600', bg: 'bg-emerald-100' },
  Lead: { icon: '🎯', color: 'text-amber-600', bg: 'bg-amber-100' },
};

function IssueTypeIcon({ type, size = 'sm' }: { type?: string; size?: 'sm' | 'md' }) {
  const config = ISSUE_TYPE_CONFIG[type || ''] || {
    icon: '📋',
    color: 'text-gray-500',
    bg: 'bg-gray-100',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded',
        size === 'sm' ? 'h-4 w-4 text-xs' : 'h-5 w-5 text-sm',
        config.color
      )}
      title={type}
    >
      {config.icon}
    </span>
  );
}

// Status badge component
function StatusBadge({ status }: { status?: string }) {
  if (!status) return null;

  const statusLower = status.toLowerCase();
  const styles =
    statusLower.includes('progress') || statusLower.includes('toku')
      ? 'bg-blue-100 text-blue-700'
      : statusLower.includes('done') || statusLower.includes('zamkn')
        ? 'bg-green-100 text-green-700'
        : statusLower.includes('review')
          ? 'bg-purple-100 text-purple-700'
          : 'bg-gray-100 text-gray-600';

  return (
    <span className={cn('whitespace-nowrap rounded px-1.5 py-0.5 text-[9px]', styles)}>
      {status}
    </span>
  );
}

// Context row showing project, parent, usage
function TicketContext({ ticket }: { ticket: EnrichedTicket }) {
  const parts: React.ReactNode[] = [];

  // Project
  if (ticket.project || ticket.key) {
    const projectKey = ticket.project || ticket.key.split('-')[0];
    parts.push(
      <span key="project" className="flex items-center gap-0.5">
        <Folder className="h-3 w-3" />
        <span>{projectKey}</span>
      </span>
    );
  }

  // Parent task
  if (ticket.parentKey) {
    parts.push(
      <span key="parent" className="flex items-center gap-0.5">
        <span className="text-muted-foreground">↳</span>
        <span className="font-mono">{ticket.parentKey}</span>
      </span>
    );
  }

  // Usage stats
  if (ticket.usageCount && ticket.usageCount > 0) {
    const usageText = formatUsageCount(ticket.usageCount);
    const lastUsed = formatLastUsed(ticket.lastUsedDate);
    parts.push(
      <span key="usage" className="flex items-center gap-0.5">
        <Clock className="h-3 w-3" />
        <span>
          {usageText}
          {lastUsed ? ` (${lastUsed})` : ''}
        </span>
      </span>
    );
  }

  if (parts.length === 0) return null;

  return (
    <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-[10px]">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-gray-300">|</span>}
          {part}
        </span>
      ))}
    </div>
  );
}

type GroupBy = 'none' | 'project' | 'type';

// Tempo worklog info for showing logged time
interface TicketWorklogInfo {
  ticketKey: string;
  totalSeconds: number;
  count: number;
}

interface TicketComboboxProps {
  tickets: Ticket[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  enableApiSearch?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showGrouping?: boolean; // Show grouping dropdown
  worklogsByTicket?: Map<string, TicketWorklogInfo>; // Optional: logged time per ticket
}

// Helper to format seconds to time string
function formatLoggedTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

export function TicketCombobox({
  tickets,
  value,
  onValueChange,
  disabled = false,
  placeholder = 'Wybierz ticket...',
  enableApiSearch = true,
  size = 'sm',
  showGrouping = false,
  worklogsByTicket,
}: TicketComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [apiResults, setApiResults] = useState<Ticket[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [assignedTickets, setAssignedTickets] = useState<Ticket[]>([]);
  const [isLoadingAssigned, setIsLoadingAssigned] = useState(false);
  const [assignedLoaded, setAssignedLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch assigned tickets when popover opens (only once)
  useEffect(() => {
    if (open && !assignedLoaded) {
      setIsLoadingAssigned(true);
      fetch('/timetracker/api/jira/my-issues?filter=assigned')
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
          if (data?.issues) {
            setAssignedTickets(data.issues);
          }
        })
        .catch(err => console.error('Error fetching assigned tickets:', err))
        .finally(() => {
          setIsLoadingAssigned(false);
          setAssignedLoaded(true);
        });
    }
  }, [open, assignedLoaded]);

  // Focus input when popover opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Enrich tickets with usage data
  const enrichedTickets = useMemo(() => {
    return enrichTicketsWithUsage(tickets);
  }, [tickets]);

  // Get recent tickets from history (for showing even if not in current list)
  const recentFromHistory = useMemo(() => {
    return getRecentTicketsFromHistory(5);
  }, []);

  // Filter tickets by search query (local filtering)
  const filteredTickets = useMemo(() => {
    if (!searchValue.trim()) return enrichedTickets;

    const query = searchValue.toLowerCase();
    return enrichedTickets.filter(
      ticket =>
        ticket.key.toLowerCase().includes(query) ||
        ticket.name.toLowerCase().includes(query) ||
        (ticket.project && ticket.project.toLowerCase().includes(query))
    );
  }, [enrichedTickets, searchValue]);

  // API search with debounce
  const searchApi = useCallback(async (query: string) => {
    if (query.length < 2) {
      setApiResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(`/timetracker/api/jira/my-issues?query=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setApiResults(data.issues || []);
      }
    } catch (error) {
      console.error('Error searching tickets:', error);
    }
    setIsSearching(false);
  }, []);

  // Debounced API search
  useEffect(() => {
    if (!enableApiSearch) return;

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchValue.length >= 2 && filteredTickets.length < 5) {
      searchTimeoutRef.current = setTimeout(() => {
        searchApi(searchValue);
      }, 300);
    } else {
      setApiResults([]);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchValue, filteredTickets.length, enableApiSearch, searchApi]);

  // Combine local and API results
  const displayTickets = useMemo(() => {
    const localKeys = new Set(filteredTickets.map(t => t.key));
    const apiEnriched = enrichTicketsWithUsage(apiResults.filter(t => !localKeys.has(t.key)));
    return [...filteredTickets, ...apiEnriched];
  }, [filteredTickets, apiResults]);

  // Organize tickets into groups
  const organizedGroups = useMemo(() => {
    if (searchValue.trim()) {
      // When searching, show flat list
      return [{ name: 'Wyniki', tickets: displayTickets }];
    }
    return getOrganizedTicketGroups(displayTickets, groupBy);
  }, [displayTickets, groupBy, searchValue]);

  // Add assigned and recent sections
  const groupsWithRecent = useMemo(() => {
    if (searchValue.trim()) return organizedGroups;

    const existingKeys = new Set(displayTickets.map(t => t.key));
    const groups: typeof organizedGroups = [];

    // Add "Przypisane do mnie" section at the top
    const assignedEnriched = enrichTicketsWithUsage(
      assignedTickets.filter(t => !existingKeys.has(t.key))
    );
    if (assignedEnriched.length > 0 || isLoadingAssigned) {
      groups.push({
        name: 'Przypisane do mnie',
        icon: 'user',
        tickets: assignedEnriched,
      });
    }

    // Add existing groups
    groups.push(...organizedGroups);

    // Add "Z historii" section
    const allKeys = new Set([...existingKeys, ...assignedTickets.map(t => t.key)]);
    const missingRecent = recentFromHistory.filter(t => !allKeys.has(t.key));
    if (missingRecent.length > 0) {
      groups.push({
        name: 'Z historii',
        icon: 'history',
        tickets: missingRecent,
      });
    }

    return groups;
  }, [
    organizedGroups,
    recentFromHistory,
    displayTickets,
    searchValue,
    assignedTickets,
    isLoadingAssigned,
  ]);

  // Selected ticket info
  const selectedTicket = [...tickets, ...apiResults].find(t => t.key === value);

  const handleSelect = (ticketKey: string) => {
    onValueChange(ticketKey);
    setOpen(false);
    setSearchValue('');
    setApiResults([]);
  };

  // Size classes
  const sizeClasses = {
    sm: 'min-w-[100px] max-w-[140px] h-7 px-2',
    md: 'min-w-[140px] max-w-[200px] h-8 px-3',
    lg: 'min-w-[180px] max-w-[280px] h-9 px-3',
  };

  const textClasses = {
    sm: 'text-[11px]',
    md: 'text-xs',
    lg: 'text-sm',
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full justify-between text-left font-normal',
            sizeClasses[size],
            !value && 'text-muted-foreground'
          )}
          disabled={disabled}
        >
          {value ? (
            <span className="flex items-center gap-1.5 truncate">
              {selectedTicket?.type && <IssueTypeIcon type={selectedTicket.type} size="sm" />}
              <span className={cn('font-mono font-semibold', textClasses[size])}>{value}</span>
            </span>
          ) : (
            <span className={cn('truncate', textClasses[size])}>{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-0.5 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        {/* Search header */}
        <div className="flex items-center border-b px-3 py-2">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            ref={inputRef}
            placeholder="Szukaj po kluczu, nazwie lub projekcie..."
            value={searchValue}
            onChange={e => setSearchValue(e.target.value)}
            className="h-8 border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          {isSearching && <Loader2 className="text-muted-foreground ml-2 h-4 w-4 animate-spin" />}
        </div>

        {/* Grouping selector */}
        {showGrouping && !searchValue && (
          <div className="bg-muted/30 flex items-center gap-2 border-b px-3 py-1.5">
            <span className="text-muted-foreground text-[10px]">Grupuj:</span>
            <div className="flex gap-1">
              {(['none', 'project', 'type'] as GroupBy[]).map(g => (
                <button
                  key={g}
                  onClick={() => setGroupBy(g)}
                  className={cn(
                    'rounded px-2 py-0.5 text-[10px] transition-colors',
                    groupBy === g
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-muted/80'
                  )}
                >
                  {g === 'none' ? 'Brak' : g === 'project' ? 'Projekt' : 'Typ'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tickets list */}
        <div className="max-h-80 overflow-y-auto">
          {displayTickets.length === 0 && recentFromHistory.length === 0 ? (
            <div className="text-muted-foreground p-4 text-center text-sm">
              {isSearching
                ? 'Szukam...'
                : searchValue.length < 2
                  ? 'Wpisz min. 2 znaki aby wyszukać...'
                  : 'Nie znaleziono ticketów'}
            </div>
          ) : (
            <div className="p-1">
              {groupsWithRecent.map((group, groupIndex) => (
                <div key={group.name} className={groupIndex > 0 ? 'mt-2' : ''}>
                  {/* Group header */}
                  <div className="flex items-center gap-1.5 px-2 py-1">
                    {group.name === 'Przypisane do mnie' ? (
                      <User className="h-3 w-3 text-blue-600" />
                    ) : group.name === 'Recently Used' || group.name === 'Z historii' ? (
                      <Clock className="h-3 w-3 text-green-600" />
                    ) : group.icon === 'folder' ||
                      (group.name !== 'All Tickets' && group.name !== 'Wyniki') ? (
                      <Folder className="h-3 w-3 text-blue-600" />
                    ) : (
                      <Hash className="h-3 w-3 text-gray-500" />
                    )}
                    <span
                      className={cn(
                        'text-[10px] font-medium uppercase tracking-wider',
                        group.name === 'Przypisane do mnie'
                          ? 'text-blue-600'
                          : group.name === 'Recently Used' || group.name === 'Z historii'
                            ? 'text-green-600'
                            : 'text-muted-foreground'
                      )}
                    >
                      {group.name}
                    </span>
                    {group.name === 'Przypisane do mnie' && (
                      <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] text-blue-700">
                        {isLoadingAssigned ? '...' : `${group.tickets.length}`}
                      </span>
                    )}
                    {(group.name === 'Recently Used' || group.name === 'Z historii') && (
                      <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] text-green-700">
                        Recent
                      </span>
                    )}
                  </div>

                  {/* Group tickets */}
                  {group.tickets.slice(0, 25).map(ticket => (
                    <button
                      key={ticket.key}
                      onClick={() => handleSelect(ticket.key)}
                      className={cn(
                        'hover:bg-accent hover:text-accent-foreground flex w-full cursor-pointer flex-col rounded-sm px-2 py-1.5 text-left',
                        value === ticket.key && 'bg-accent'
                      )}
                    >
                      {/* Main row */}
                      <div className="flex w-full items-center gap-2">
                        <Check
                          className={cn(
                            'h-3.5 w-3.5 shrink-0',
                            value === ticket.key ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        <IssueTypeIcon type={ticket.type} size="sm" />
                        <span className="whitespace-nowrap font-mono text-xs font-semibold">
                          {ticket.key}
                        </span>
                        <span className="text-muted-foreground flex-1 truncate text-xs">
                          {ticket.name}
                        </span>
                        <StatusBadge status={ticket.status} />
                        {/* Show logged time from Tempo */}
                        {worklogsByTicket?.get(ticket.key) && (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">
                            {formatLoggedTime(worklogsByTicket.get(ticket.key)!.totalSeconds)}
                          </span>
                        )}
                        {ticket.isRecent && (
                          <span className="rounded bg-green-100 px-1 py-0.5 text-[9px] text-green-700">
                            Recent
                          </span>
                        )}
                        {ticket.isFrequent && !ticket.isRecent && (
                          <span className="rounded bg-blue-100 px-1 py-0.5 text-[9px] text-blue-700">
                            {formatUsageCount(ticket.usageCount)}
                          </span>
                        )}
                      </div>

                      {/* Context row */}
                      <div className="ml-7">
                        <TicketContext ticket={ticket} />
                      </div>
                    </button>
                  ))}

                  {group.tickets.length > 25 && (
                    <div className="text-muted-foreground px-2 py-1 text-center text-[10px]">
                      +{group.tickets.length - 25} więcej w tej grupie
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer with total count */}
        {displayTickets.length > 0 && (
          <div className="text-muted-foreground bg-muted/30 border-t p-2 text-center text-[10px]">
            {displayTickets.length} ticketów
            {apiResults.length > 0 && ` (${apiResults.length} z API)`}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// Export icon component for use elsewhere
export { IssueTypeIcon, ISSUE_TYPE_CONFIG };
export default TicketCombobox;
