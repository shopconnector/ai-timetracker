'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, GitMerge, Scissors } from 'lucide-react';
import type { Activity, Ticket } from './ActivityCard';

// Split part definition
interface SplitPart {
  id: string;
  ticketKey: string;
  description: string;
  percentage: number;
  seconds: number;
}

// Merge Dialog Props
interface MergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activities: Activity[];
  tickets: Ticket[];
  onMerge: (data: {
    activities: Activity[];
    ticketKey: string;
    description: string;
    totalSeconds: number;
  }) => void;
}

export function MergeDialog({
  open,
  onOpenChange,
  activities,
  tickets,
  onMerge,
}: MergeDialogProps) {
  const [selectedTicket, setSelectedTicket] = useState('');
  const [description, setDescription] = useState('');

  const totalSeconds = activities.reduce((sum, a) => sum + a.totalSeconds, 0);
  const totalFormatted = `${Math.floor(totalSeconds / 3600)}h ${Math.floor((totalSeconds % 3600) / 60)}m`;

  // Auto-generate description from activities
  const generateDescription = () => {
    const apps = [...new Set(activities.map(a => a.app))];
    const projects = [...new Set(activities.map(a => a.project).filter(Boolean))];

    let desc = activities
      .map(a => a.title.substring(0, 30))
      .join('; ');

    if (projects.length > 0) {
      desc = `[${projects.join(', ')}] ${desc}`;
    }

    return desc.substring(0, 200) + (desc.length > 200 ? '...' : '');
  };

  // Initialize description
  useState(() => {
    if (activities.length > 0 && !description) {
      setDescription(generateDescription());
    }
  });

  const handleMerge = () => {
    if (!selectedTicket) return;
    onMerge({
      activities,
      ticketKey: selectedTicket,
      description: description || generateDescription(),
      totalSeconds,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-blue-600" />
            Scal aktywności ({activities.length})
          </DialogTitle>
          <DialogDescription>
            Połącz wybrane aktywności w jeden worklog
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Activities summary */}
          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-2 max-h-48 overflow-y-auto">
            {activities.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <span className="truncate flex-1" title={a.title}>
                  {a.app}: {a.title.substring(0, 40)}...
                </span>
                <Badge variant="outline" className="ml-2 shrink-0">
                  {a.formattedDuration}
                </Badge>
              </div>
            ))}
          </div>

          {/* Total time */}
          <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <span className="font-medium">Łączny czas:</span>
            <Badge className="bg-blue-600 text-white text-lg">
              {totalFormatted}
            </Badge>
          </div>

          {/* Ticket selector */}
          <div className="space-y-2">
            <Label>Ticket Jira</Label>
            <Select value={selectedTicket} onValueChange={setSelectedTicket}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz ticket..." />
              </SelectTrigger>
              <SelectContent>
                {tickets.map((ticket) => (
                  <SelectItem key={ticket.key} value={ticket.key}>
                    {ticket.key} - {ticket.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Opis (opcjonalnie)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opis worklogu..."
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDescription(generateDescription())}
              className="text-xs"
            >
              🔄 Generuj automatycznie
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button onClick={handleMerge} disabled={!selectedTicket}>
            <GitMerge className="h-4 w-4 mr-2" />
            Scal i zaloguj
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Split Dialog Props
interface SplitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity: Activity;
  tickets: Ticket[];
  date: string;
  onSplit: (parts: Array<{
    ticketKey: string;
    description: string;
    seconds: number;
    startTime: string;
  }>) => void;
}

export function SplitDialog({
  open,
  onOpenChange,
  activity,
  tickets,
  date,
  onSplit,
}: SplitDialogProps) {
  const [parts, setParts] = useState<SplitPart[]>([
    {
      id: '1',
      ticketKey: activity.suggestedTicket || '',
      description: activity.title,
      percentage: 50,
      seconds: Math.floor(activity.totalSeconds / 2),
    },
    {
      id: '2',
      ticketKey: '',
      description: '',
      percentage: 50,
      seconds: Math.floor(activity.totalSeconds / 2),
    },
  ]);

  const totalPercentage = parts.reduce((sum, p) => sum + p.percentage, 0);
  const isValid = totalPercentage === 100 && parts.every(p => p.ticketKey);

  const updatePart = (id: string, updates: Partial<SplitPart>) => {
    setParts(prev => prev.map(p => {
      if (p.id !== id) return p;
      const updated = { ...p, ...updates };

      // If percentage changed, recalculate seconds
      if ('percentage' in updates) {
        updated.seconds = Math.floor((updates.percentage! / 100) * activity.totalSeconds);
      }

      return updated;
    }));
  };

  const addPart = () => {
    const newId = String(Date.now());
    setParts(prev => [...prev, {
      id: newId,
      ticketKey: '',
      description: '',
      percentage: 0,
      seconds: 0,
    }]);
  };

  const removePart = (id: string) => {
    if (parts.length <= 2) return;
    setParts(prev => prev.filter(p => p.id !== id));
  };

  const distributeEvenly = () => {
    const percentage = Math.floor(100 / parts.length);
    const remainder = 100 - (percentage * parts.length);

    setParts(prev => prev.map((p, i) => ({
      ...p,
      percentage: percentage + (i === 0 ? remainder : 0),
      seconds: Math.floor(((percentage + (i === 0 ? remainder : 0)) / 100) * activity.totalSeconds),
    })));
  };

  const handleSplit = () => {
    if (!isValid) return;

    // Calculate start times based on original activity time
    const baseTime = activity.firstSeen ? activity.firstSeen.substring(11, 16) : '09:00';
    let currentMinutes = parseInt(baseTime.split(':')[0]) * 60 + parseInt(baseTime.split(':')[1]);

    const splitParts = parts.map(p => {
      const startTime = `${Math.floor(currentMinutes / 60).toString().padStart(2, '0')}:${(currentMinutes % 60).toString().padStart(2, '0')}`;
      currentMinutes += Math.ceil(p.seconds / 60);

      return {
        ticketKey: p.ticketKey,
        description: p.description || `${activity.title} (część)`,
        seconds: p.seconds,
        startTime,
      };
    });

    onSplit(splitParts);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5 text-orange-600" />
            Podziel aktywność
          </DialogTitle>
          <DialogDescription>
            Podziel {activity.formattedDuration} na kilka worklogów
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Original activity info */}
          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{activity.app}</p>
                <p className="text-sm text-gray-500 truncate" title={activity.title}>
                  {activity.title.substring(0, 50)}...
                </p>
              </div>
              <Badge className="bg-blue-600 text-white">
                {activity.formattedDuration}
              </Badge>
            </div>
          </div>

          {/* Split parts */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Części ({parts.length})</Label>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={distributeEvenly}>
                  ⚖️ Równo
                </Button>
                <Button variant="outline" size="sm" onClick={addPart}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {parts.map((part, index) => (
              <div key={part.id} className="p-3 border rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="shrink-0">#{index + 1}</Badge>

                  {/* Percentage input */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={part.percentage}
                      onChange={(e) => updatePart(part.id, { percentage: parseInt(e.target.value) || 0 })}
                      className="w-16 text-center"
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>

                  <Badge variant="secondary" className="shrink-0">
                    {Math.floor(part.seconds / 60)}m
                  </Badge>

                  {/* Ticket selector */}
                  <Select
                    value={part.ticketKey}
                    onValueChange={(v) => updatePart(part.id, { ticketKey: v })}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Ticket..." />
                    </SelectTrigger>
                    <SelectContent>
                      {tickets.map((ticket) => (
                        <SelectItem key={ticket.key} value={ticket.key}>
                          {ticket.key}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Remove button */}
                  {parts.length > 2 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removePart(part.id)}
                      className="shrink-0"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  )}
                </div>

                {/* Description input */}
                <Input
                  value={part.description}
                  onChange={(e) => updatePart(part.id, { description: e.target.value })}
                  placeholder="Opis (opcjonalnie)..."
                  className="text-sm"
                />
              </div>
            ))}
          </div>

          {/* Validation */}
          <div className={`p-2 rounded text-sm ${totalPercentage === 100 ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'}`}>
            Suma: {totalPercentage}% {totalPercentage !== 100 && '(musi być 100%)'}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button onClick={handleSplit} disabled={!isValid}>
            <Scissors className="h-4 w-4 mr-2" />
            Podziel i zaloguj
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
