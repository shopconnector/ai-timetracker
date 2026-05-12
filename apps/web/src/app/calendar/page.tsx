'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { apiUrl } from '@/lib/api';
import { WeekView } from '@/components/calendar/WeekView';
import { TimeBlockData } from '@/components/calendar/TimeBlock';
import { WorklogFormDialog } from '@/components/WorklogFormDialog';
import { toast } from 'sonner';

interface DayData {
  date: string;
  dayName: string;
  isWeekend: boolean;
  activities: TimeBlockData[];
  worklogs: TimeBlockData[];
  calendarEvents: TimeBlockData[];
  slackActivities: TimeBlockData[];
  awTotalMinutes: number;
  tempoTotalMinutes: number;
  slackTotalMinutes: number;
  targetMinutes: number;
}

interface WeekData {
  startDate: string;
  endDate: string;
  days: DayData[];
}

interface Ticket {
  key: string;
  name: string;
  id?: string;
  project?: string;
}

function getWeekDates(date: Date): { start: string; end: string } {
  const dayOfWeek = date.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0]
  };
}

export default function CalendarPage() {
  const tToast = useTranslations('calendar.toast');
  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const { start } = getWeekDates(new Date());
    return start;
  });

  // Dialog state
  const [showDialog, setShowDialog] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<TimeBlockData | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [tickets, setTickets] = useState<Ticket[]>([]);

  const fetchWeekData = useCallback(async (startDate: string) => {
    setIsLoading(true);
    try {
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      const end = endDate.toISOString().split('T')[0];

      const res = await fetch(apiUrl(`/api/calendar/week?start=${startDate}&end=${end}`));
      if (!res.ok) {
        throw new Error('Failed to fetch week data');
      }
      const data = await res.json();
      setWeekData(data);
    } catch (error) {
      console.error('Error fetching week:', error);
      toast.error(tToast('loadError'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/jira/my-issues'));
      if (res.ok) {
        const data = await res.json();
        setTickets(data.issues || []);
      }
    } catch (error) {
      console.error('Error fetching tickets:', error);
    }
  }, []);

  useEffect(() => {
    fetchWeekData(currentWeekStart);
    fetchTickets();
  }, [currentWeekStart, fetchWeekData, fetchTickets]);

  const handlePrevWeek = () => {
    const prev = new Date(currentWeekStart);
    prev.setDate(prev.getDate() - 7);
    setCurrentWeekStart(prev.toISOString().split('T')[0]);
  };

  const handleNextWeek = () => {
    const next = new Date(currentWeekStart);
    next.setDate(next.getDate() + 7);
    setCurrentWeekStart(next.toISOString().split('T')[0]);
  };

  const handleToday = () => {
    const { start } = getWeekDates(new Date());
    setCurrentWeekStart(start);
  };

  const handleBlockClick = (block: TimeBlockData) => {
    if (block.source === 'tempo') {
      toast.info(tToast('editWorklogComingSoon', { id: String(block.tempoWorklogId) }));
      return;
    }

    if (block.source === 'calendar') {
      toast.info(tToast('calendarEventInfo', { title: block.title }));
      return;
    }

    if (block.source === 'slack') {
      toast.info(tToast('slackInfo', { title: block.title, minutes: block.durationMinutes }));
      return;
    }

    if (!block.canLogToTempo) {
      toast.info(tToast('cannotLogToTempo'));
      return;
    }

    // Find the date for this activity
    const day = weekData?.days.find(d =>
      d.activities.some(a => a.id === block.id)
    );

    if (day) {
      setSelectedBlock(block);
      setSelectedDate(day.date);
      setShowDialog(true);
    }
  };

  const handleAddClick = (date: string) => {
    setSelectedBlock(null);
    setSelectedDate(date);
    setShowDialog(true);
  };

  const handleLogAll = async () => {
    if (!weekData) return;

    const loggableActivities = weekData.days.flatMap(day =>
      day.activities
        .filter(a => a.canLogToTempo && !a.isLogged)
        .map(a => ({ ...a, date: day.date }))
    );

    if (loggableActivities.length === 0) {
      toast.info(tToast('noActivitiesToLog'));
      return;
    }

    toast.info(tToast('bulkComingSoon', { count: loggableActivities.length }));
  };

  const handleDialogSubmit = async (data: {
    ticketKey: string;
    description: string;
    startTime: string;
    endTime: string;
    timeSpentSeconds: number;
    isBillable: boolean;
    billableSeconds?: number;
    attributes: { key: string; value: string }[];
  }) => {
    try {
      // Convert attributes array to Record format for API
      const attributesRecord = data.attributes.reduce((acc, attr) => {
        if (attr.value) {
          acc[attr.key] = attr.value;
        }
        return acc;
      }, {} as Record<string, string>);

      const res = await fetch(apiUrl('/api/tempo/worklogs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueKey: data.ticketKey,
          description: data.description,
          date: selectedDate,
          startTime: data.startTime,
          timeSpentSeconds: data.timeSpentSeconds,
          billable: data.isBillable,
          billableSeconds: data.billableSeconds,
          attributes: attributesRecord
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || tToast('worklogFailed'));
      }

      toast.success(tToast('worklogCreated'));
      setShowDialog(false);
      fetchWeekData(currentWeekStart);
    } catch (error) {
      console.error('Error creating worklog:', error);
      toast.error(error instanceof Error ? error.message : tToast('worklogFailed'));
    }
  };

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col">
      <WeekView
        weekData={weekData}
        isLoading={isLoading}
        onPrevWeek={handlePrevWeek}
        onNextWeek={handleNextWeek}
        onToday={handleToday}
        onBlockClick={handleBlockClick}
        onAddClick={handleAddClick}
        onLogAll={handleLogAll}
      />

      {showDialog && (
        <WorklogFormDialog
          open={showDialog}
          onOpenChange={setShowDialog}
          activity={selectedBlock ? {
            id: selectedBlock.id,
            title: selectedBlock.title,
            app: selectedBlock.app || '',
            totalSeconds: selectedBlock.durationMinutes * 60,
            formattedDuration: `${selectedBlock.durationMinutes}m`,
            events: 1,
            firstSeen: `${selectedDate}T${selectedBlock.startTime}:00`,
            lastSeen: `${selectedDate}T${selectedBlock.endTime}:00`
          } : undefined}
          tickets={tickets}
          date={selectedDate}
          onSubmit={handleDialogSubmit}
        />
      )}
    </div>
  );
}
