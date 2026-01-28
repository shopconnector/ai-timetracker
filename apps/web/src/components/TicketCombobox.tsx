'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Check, ChevronsUpDown, Search, Loader2 } from 'lucide-react';
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
}

export function TicketCombobox({
  tickets,
  value,
  onValueChange,
  disabled = false,
  placeholder = 'Wybierz ticket...',
}: TicketComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when popover opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Filter tickets by search query (local filtering)
  const filteredTickets = useMemo(() => {
    if (!searchValue.trim()) return tickets;

    const query = searchValue.toLowerCase();
    return tickets.filter(
      (ticket) =>
        ticket.key.toLowerCase().includes(query) ||
        ticket.name.toLowerCase().includes(query)
    );
  }, [tickets, searchValue]);

  // Selected ticket info
  const selectedTicket = tickets.find((t) => t.key === value);

  const handleSelect = (ticketKey: string) => {
    onValueChange(ticketKey);
    setOpen(false);
    setSearchValue('');
  };

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
        <div className="flex items-center border-b px-3 py-2">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            ref={inputRef}
            placeholder="Szukaj po kluczu lub nazwie..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="h-8 border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <div className="max-h-60 overflow-y-auto">
          {filteredTickets.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {searchValue.length < 2
                ? 'Wpisz aby wyszukać...'
                : 'Nie znaleziono ticketów'}
            </div>
          ) : (
            <div className="p-1">
              {filteredTickets.slice(0, 50).map((ticket) => (
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
          )}
          {filteredTickets.length > 50 && (
            <div className="p-2 text-center text-xs text-muted-foreground border-t">
              Wyświetlono 50 z {filteredTickets.length} ticketów
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default TicketCombobox;
