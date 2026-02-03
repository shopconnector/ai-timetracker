'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { TicketCombobox } from '@/components/TicketCombobox';
import { Ticket } from '@/components/ActivityCard';
import { formatMinutes, ActivitySummary } from '@/types/compare';
import { toast } from 'sonner';
import { Loader2, Clock, Monitor, Send } from 'lucide-react';

interface LogActivityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity: ActivitySummary | null;
  date: string; // YYYY-MM-DD
  tickets: Ticket[];
  onSuccess: () => void;
}

export function LogActivityDialog({
  open,
  onOpenChange,
  activity,
  date,
  tickets,
  onSuccess,
}: LogActivityDialogProps) {
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [isLogging, setIsLogging] = useState(false);

  // Reset state when dialog opens with new activity
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && activity) {
      setDescription(`${activity.app}: ${activity.title}`);
      setSelectedTicket(null);
    }
    onOpenChange(newOpen);
  };

  const handleLog = async () => {
    if (!selectedTicket || !activity) {
      toast.error('Wybierz ticket');
      return;
    }

    setIsLogging(true);

    try {
      const res = await fetch('/timetracker/api/tempo/worklogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueKey: selectedTicket,
          timeSpentSeconds: activity.minutes * 60,
          startDate: date,
          startTime: '09:00:00', // Default time
          description: description || `${activity.app}: ${activity.title}`,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Błąd logowania');
      }

      toast.success(`Zalogowano ${formatMinutes(activity.minutes)} do ${selectedTicket}`);
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error('Błąd logowania', {
        description: error instanceof Error ? error.message : 'Spróbuj ponownie',
      });
    } finally {
      setIsLogging(false);
    }
  };

  if (!activity) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Zaloguj aktywność
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Activity summary */}
          <div className="bg-muted space-y-2 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <Monitor className="text-muted-foreground h-4 w-4" />
              <span className="font-medium">{activity.app}</span>
              <Badge variant="secondary" className="ml-auto">
                {activity.category}
              </Badge>
            </div>
            <p className="text-muted-foreground line-clamp-2 text-sm">{activity.title}</p>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="text-muted-foreground h-4 w-4" />
              <span className="text-primary font-mono font-bold">
                {formatMinutes(activity.minutes)}
              </span>
              <span className="text-muted-foreground">→ {date}</span>
            </div>
          </div>

          {/* Ticket selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Ticket</label>
            <TicketCombobox
              tickets={tickets}
              value={selectedTicket}
              onValueChange={setSelectedTicket}
              placeholder="Wybierz ticket..."
              size="lg"
              enableApiSearch
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Opis (opcjonalnie)</label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Opis pracy..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLogging}>
            Anuluj
          </Button>
          <Button onClick={handleLog} disabled={isLogging || !selectedTicket}>
            {isLogging ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Logowanie...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Zaloguj {formatMinutes(activity.minutes)}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
