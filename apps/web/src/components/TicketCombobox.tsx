'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Ticket } from './ActivityCard';

interface TicketComboboxProps {
  tickets: Ticket[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  onLoadAll?: () => void;
  loadingAll?: boolean;
}

/** Extract project key from ticket key (e.g. "BCI-123" -> "BCI") */
function getProjectKey(ticket: Ticket): string {
  return ticket.project || ticket.key.replace(/-\d+$/, '');
}

export function TicketCombobox({
  tickets,
  value,
  onValueChange,
  disabled = false,
  placeholder = 'Select ticket...',
  onLoadAll,
  loadingAll = false,
}: TicketComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when popover opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    if (!open) {
      setActiveProject(null);
      setSearchValue('');
    }
  }, [open]);

  // Extract unique project keys, sorted by ticket count (descending)
  const projects = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tickets) {
      const p = getProjectKey(t);
      counts.set(p, (counts.get(p) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => key);
  }, [tickets]);

  // Filter tickets by project and search query
  const filteredTickets = useMemo(() => {
    let result = tickets;

    // Filter by active project
    if (activeProject) {
      result = result.filter((t) => getProjectKey(t) === activeProject);
    }

    // Filter by search query
    if (searchValue.trim()) {
      const query = searchValue.toLowerCase();
      result = result.filter(
        (t) =>
          t.key.toLowerCase().includes(query) ||
          t.name.toLowerCase().includes(query)
      );
    }

    return result;
  }, [tickets, activeProject, searchValue]);

  // Group filtered tickets by project for display
  const groupedTickets = useMemo(() => {
    if (activeProject || searchValue.trim()) {
      // When filtering, show flat list (already filtered)
      return [{ project: null as string | null, tickets: filteredTickets }];
    }
    // Default: group by project
    const groups = new Map<string, Ticket[]>();
    for (const t of filteredTickets) {
      const p = getProjectKey(t);
      if (!groups.has(p)) groups.set(p, []);
      groups.get(p)!.push(t);
    }
    return [...groups.entries()].map(([project, tickets]) => ({
      project,
      tickets,
    }));
  }, [filteredTickets, activeProject, searchValue]);

  const handleSelect = (ticketKey: string) => {
    onValueChange(ticketKey);
    setOpen(false);
    setSearchValue('');
    setActiveProject(null);
  };

  const showProjectPills = projects.length > 1;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full min-w-[100px] max-w-[140px] justify-between text-left font-normal h-7 px-2',
            !value && 'text-muted-foreground'
          )}
          disabled={disabled}
        >
          {value ? (
            <span className="truncate text-[11px] font-mono font-semibold">{value}</span>
          ) : (
            <span className="text-[10px] truncate">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-0.5 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        {/* Search */}
        <div className="flex items-center border-b px-3 py-2">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            ref={inputRef}
            placeholder="Search by key or name..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="h-8 border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>

        {/* Project filter pills */}
        {showProjectPills && (
          <div className="flex flex-wrap gap-1 px-2 py-1.5 border-b">
            <button
              onClick={() => setActiveProject(null)}
              className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors',
                activeProject === null
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              )}
            >
              All
            </button>
            {projects.map((p) => (
              <button
                key={p}
                onClick={() => setActiveProject(activeProject === p ? null : p)}
                className={cn(
                  'px-2 py-0.5 rounded-full text-[10px] font-mono font-medium transition-colors',
                  activeProject === p
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                )}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Ticket list */}
        <div className="max-h-60 overflow-y-auto">
          {filteredTickets.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {searchValue.length < 2
                ? 'Type to search...'
                : 'No tickets found'}
            </div>
          ) : (
            <div className="p-1">
              {groupedTickets.map((group) => (
                <div key={group.project || '_all'}>
                  {group.project && (
                    <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {group.project}
                    </div>
                  )}
                  {group.tickets.slice(0, 50).map((ticket) => (
                    <button
                      key={ticket.key}
                      onClick={() => handleSelect(ticket.key)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer',
                        value === ticket.key && 'bg-accent'
                      )}
                    >
                      <Check
                        className={cn(
                          'h-4 w-4 shrink-0',
                          value === ticket.key ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <span className="font-mono text-xs font-semibold whitespace-nowrap">
                        {ticket.key}
                      </span>
                      <span className="flex-1 truncate text-xs text-muted-foreground text-left">
                        {ticket.name}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Load all button */}
          {onLoadAll && (
            <div className="p-2 border-t">
              <button
                onClick={onLoadAll}
                disabled={loadingAll}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1 transition-colors disabled:opacity-50"
              >
                {loadingAll ? 'Loading...' : 'Load all issues'}
              </button>
            </div>
          )}

          {filteredTickets.length > 50 && (
            <div className="p-2 text-center text-xs text-muted-foreground border-t">
              Showing 50 of {filteredTickets.length} tickets
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default TicketCombobox;
