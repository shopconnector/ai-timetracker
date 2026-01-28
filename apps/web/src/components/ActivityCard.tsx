'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useState } from 'react';
import { Settings2, ChevronDown, ChevronRight, ThumbsUp, ThumbsDown, Scissors } from 'lucide-react';
import { recordSuggestionFeedback } from '@/lib/taskHistory';

export type ActivityCategory = 'coding' | 'terminal' | 'meeting' | 'communication' | 'browser' | 'docs' | 'design' | 'other';

// Raw event from ActivityWatch
export interface RawEvent {
  id: number;
  timestamp: string;
  duration: number;
  data: {
    app?: string;
    title?: string;
    url?: string;
  };
}

export interface Activity {
  id: string;
  title: string;
  app: string;
  totalSeconds: number;
  formattedDuration: string;
  events: number;
  rawEvents?: RawEvent[];  // Surowe eventy do expand
  suggestedTicket?: string;
  confidence?: number;
  // Pola czasowe
  firstSeen?: string;
  lastSeen?: string;
  // Kategoria aktywności
  category?: ActivityCategory;
  // Prywatność
  isPrivate?: boolean;
  // Pola dla projektów (edytory kodu)
  project?: string;
  fileName?: string;
  isCodeEditor?: boolean;
  // Pola dla terminala
  isTerminal?: boolean;
  shell?: string;
  workingDir?: string;
  gitBranch?: string;
  terminalCommand?: string;
  // Pola dla spotkań i komunikacji
  isMeeting?: boolean;
  meetingPlatform?: string;
  meetingId?: string;
  isCommunication?: boolean;
  channel?: string;
}

// Helper: format time from ISO string
function formatEventTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

// Helper: format duration in seconds to human readable
function formatEventDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
}

// Helper: calculate position for timeline
function calculateTimelinePosition(
  eventTimestamp: string,
  firstSeen: string,
  lastSeen: string
): number {
  const eventTime = new Date(eventTimestamp).getTime();
  const startTime = new Date(firstSeen).getTime();
  const endTime = new Date(lastSeen).getTime();
  const totalSpan = endTime - startTime;

  if (totalSpan <= 0) return 0;
  return ((eventTime - startTime) / totalSpan) * 100;
}

// Helper: calculate width for timeline event
function calculateTimelineWidth(
  eventDuration: number,
  firstSeen: string,
  lastSeen: string
): number {
  const startTime = new Date(firstSeen).getTime();
  const endTime = new Date(lastSeen).getTime();
  const totalSpan = (endTime - startTime) / 1000; // in seconds

  if (totalSpan <= 0) return 1;
  return Math.max(1, (eventDuration / totalSpan) * 100);
}

export interface Ticket {
  key: string;
  name: string;
  id?: string;  // Jira issue ID (numeric) - required for Tempo API v4
}

interface ActivityCardProps {
  activity: Activity;
  tickets: Ticket[];
  onLog: (activityId: string, ticketKey: string) => void;
  onLogWithDetails?: (activity: Activity) => void;
  onSplit?: (activity: Activity) => void;
  onFeedback?: (activityId: string, isPositive: boolean, suggestedTicket: string) => void;
  isLogging?: boolean;
  isLogged?: boolean;
  suggestionSource?: 'llm' | 'history' | 'project_mapping';
  // Selection mode for merge
  selectionMode?: boolean;
  isSelected?: boolean;
  onSelectionChange?: (activityId: string, selected: boolean) => void;
}

export function ActivityCard({
  activity,
  tickets,
  onLog,
  onLogWithDetails,
  onSplit,
  onFeedback,
  isLogging,
  isLogged,
  suggestionSource = 'llm',
  selectionMode = false,
  isSelected = false,
  onSelectionChange,
}: ActivityCardProps) {
  // Don't auto-select first ticket if no suggestion - force manual selection
  const [selectedTicket, setSelectedTicket] = useState(
    activity.suggestedTicket || ''
  );
  const [isExpanded, setIsExpanded] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState<'positive' | 'negative' | null>(null);

  const handleFeedback = (isPositive: boolean) => {
    if (!activity.suggestedTicket || feedbackGiven) return;

    // Record feedback to localStorage
    recordSuggestionFeedback(
      activity.title,
      activity.app,
      activity.suggestedTicket,
      isPositive,
      suggestionSource,
      activity.project,
      isPositive ? undefined : selectedTicket || undefined
    );

    setFeedbackGiven(isPositive ? 'positive' : 'negative');

    // Notify parent if callback provided
    if (onFeedback) {
      onFeedback(activity.id, isPositive, activity.suggestedTicket);
    }
  };

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return 'bg-gray-100 text-gray-700';
    if (confidence >= 0.8) return 'bg-green-100 text-green-700';
    if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  const getCategoryColor = (category: ActivityCategory) => {
    switch(category) {
      case 'coding': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
      case 'meeting': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
      case 'communication': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
      case 'terminal': return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
      case 'browser': return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300';
      case 'docs': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'design': return 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300';
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    }
  };

  const getCategoryLabel = (category: ActivityCategory) => {
    switch(category) {
      case 'coding': return '💻 Programowanie';
      case 'meeting': return '📹 Spotkanie';
      case 'communication': return '💬 Komunikacja';
      case 'terminal': return '⬛ Terminal';
      case 'browser': return '🌐 Przeglądarka';
      case 'docs': return '📝 Dokumenty';
      case 'design': return '🎨 Design';
      default: return '📄 Inne';
    }
  };

  const getAppIcon = (app: string, activity: Activity) => {
    // Priorytet: spotkanie > komunikacja > edytor > terminal > inne
    if (activity.isMeeting) return '📹';
    if (activity.isCommunication) return '💬';
    if (activity.isCodeEditor) return '💻';
    if (activity.isTerminal) return '⬛';

    const appLower = app.toLowerCase();
    if (appLower.includes('chrome') || appLower.includes('safari') || appLower.includes('firefox') || appLower.includes('edge')) return '🌐';
    if (appLower.includes('terminal') || appLower.includes('iterm') || appLower.includes('warp')) return '⬛';
    if (appLower.includes('comet') || appLower.includes('claude')) return '🤖';
    if (appLower.includes('slack')) return '💬';
    if (appLower.includes('discord')) return '💬';
    if (appLower.includes('teams')) return '💬';
    if (appLower.includes('whatsapp') || appLower.includes('telegram') || appLower.includes('signal')) return '📱';
    if (appLower.includes('cursor') || appLower.includes('code') || appLower.includes('webstorm') || appLower.includes('intellij')) return '💻';
    if (appLower.includes('figma') || appLower.includes('sketch') || appLower.includes('photoshop')) return '🎨';
    if (appLower.includes('notion') || appLower.includes('obsidian') || appLower.includes('word') || appLower.includes('docs')) return '📝';
    if (appLower.includes('zoom') || appLower.includes('meet') || appLower.includes('webex')) return '📹';
    return '📄';
  };

  return (
    <Card className={`mb-3 ${isLogged ? 'opacity-50 bg-green-50 dark:bg-green-900/20' : ''} ${activity.isPrivate ? 'border-dashed border-gray-300 dark:border-gray-600' : ''} ${isSelected ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Selection checkbox (merge mode) */}
          {selectionMode && !isLogged && (
            <div className="pt-1">
              <Checkbox
                checked={isSelected}
                onCheckedChange={(checked) => onSelectionChange?.(activity.id, !!checked)}
                className="h-5 w-5"
              />
            </div>
          )}

          {/* Left: Activity info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-lg">{getAppIcon(activity.app, activity)}</span>
              <span className="font-medium text-sm text-gray-500 dark:text-gray-400">{activity.app}</span>

              {/* Category badge */}
              {activity.category && (
                <Badge className={`${getCategoryColor(activity.category)} text-xs`}>
                  {getCategoryLabel(activity.category)}
                </Badge>
              )}

              {/* Private badge */}
              {activity.isPrivate && (
                <Badge className="bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300 text-xs">
                  🔒 PRIV
                </Badge>
              )}

              {/* Meeting badge */}
              {activity.isMeeting && activity.meetingPlatform && (
                <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 text-xs">
                  📹 {activity.meetingPlatform}
                </Badge>
              )}

              {/* Communication badge */}
              {activity.isCommunication && !activity.isMeeting && (
                <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 text-xs">
                  💬 {activity.channel ? activity.channel : 'Chat'}
                </Badge>
              )}

              {/* Project badge */}
              {activity.project && !activity.isMeeting && !activity.isCommunication && (
                <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 text-xs">
                  📁 {activity.project}
                </Badge>
              )}

              {/* Terminal shell */}
              {activity.isTerminal && activity.shell && (
                <Badge variant="outline" className="text-xs">
                  {activity.shell}
                </Badge>
              )}

              {/* Git branch */}
              {activity.gitBranch && (
                <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 text-xs">
                  🌿 {activity.gitBranch}
                </Badge>
              )}

              {/* Events count - clickable to expand */}
              <Badge
                variant="outline"
                className="text-xs cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 select-none"
                onClick={() => activity.rawEvents && activity.rawEvents.length > 0 && setIsExpanded(!isExpanded)}
              >
                {activity.rawEvents && activity.rawEvents.length > 0 ? (
                  isExpanded ? <ChevronDown className="h-3 w-3 inline mr-1" /> : <ChevronRight className="h-3 w-3 inline mr-1" />
                ) : null}
                {activity.events} events
              </Badge>
            </div>

            {/* Main title */}
            <p className="font-medium truncate" title={activity.title}>
              {activity.isMeeting
                ? activity.title
                : activity.isCommunication
                ? activity.channel || activity.title
                : activity.isCodeEditor && activity.project
                ? activity.fileName || activity.project
                : activity.isTerminal && activity.project
                ? activity.terminalCommand || activity.project
                : activity.title}
            </p>

            {/* Meeting ID */}
            {activity.isMeeting && activity.meetingId && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                Meeting ID: {activity.meetingId}
              </p>
            )}

            {/* Terminal working directory */}
            {activity.isTerminal && activity.workingDir && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5" title={activity.workingDir}>
                📂 {activity.workingDir}
              </p>
            )}

            {/* Time range */}
            {activity.firstSeen && activity.lastSeen && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                ⏱️ {activity.firstSeen.substring(11, 16)} — {activity.lastSeen.substring(11, 16)}
              </p>
            )}

            {/* Expanded events view */}
            {isExpanded && activity.rawEvents && activity.rawEvents.length > 0 && activity.firstSeen && activity.lastSeen && (
              <div className="mt-3 space-y-2 border-t pt-2">
                {/* Mini Timeline */}
                <div className="relative">
                  <div className="text-xs text-gray-400 mb-1 flex justify-between">
                    <span>{formatEventTime(activity.firstSeen)}</span>
                    <span className="text-gray-300">Timeline</span>
                    <span>{formatEventTime(activity.lastSeen)}</span>
                  </div>
                  <div className="h-6 bg-slate-100 dark:bg-slate-800 rounded relative overflow-hidden">
                    {activity.rawEvents.map((event, i) => {
                      const left = calculateTimelinePosition(event.timestamp, activity.firstSeen!, activity.lastSeen!);
                      const width = calculateTimelineWidth(event.duration, activity.firstSeen!, activity.lastSeen!);
                      return (
                        <div
                          key={i}
                          className="absolute h-full bg-blue-400 dark:bg-blue-600 hover:bg-blue-500 dark:hover:bg-blue-500 cursor-pointer transition-colors"
                          style={{
                            left: `${left}%`,
                            width: `${Math.max(width, 0.5)}%`,
                            minWidth: '2px'
                          }}
                          title={`${event.data.title || 'Unknown'}\n${formatEventTime(event.timestamp)} (${formatEventDuration(event.duration)})`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Events List */}
                <div className="max-h-[200px] overflow-y-auto border rounded p-2 text-xs bg-slate-50 dark:bg-slate-900">
                  {activity.rawEvents
                    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                    .map((event, i) => (
                      <div
                        key={i}
                        className="flex justify-between py-1 border-b last:border-0 hover:bg-white dark:hover:bg-slate-800 px-1 rounded"
                      >
                        <span className="truncate flex-1 text-gray-700 dark:text-gray-300" title={event.data.title}>
                          {event.data.title || 'Unknown'}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400 ml-2 whitespace-nowrap">
                          {formatEventTime(event.timestamp)} ({formatEventDuration(event.duration)})
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                {activity.formattedDuration}
              </Badge>
              {activity.suggestedTicket ? (
                <>
                  <Badge className={getConfidenceColor(activity.confidence)}>
                    Sugestia: {activity.suggestedTicket} ({Math.round((activity.confidence || 0) * 100)}%)
                  </Badge>
                  {/* Feedback buttons */}
                  {!feedbackGiven && !isLogged && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 hover:bg-green-100 dark:hover:bg-green-900/30"
                        onClick={() => handleFeedback(true)}
                        title="Dobra sugestia"
                      >
                        <ThumbsUp className="h-3.5 w-3.5 text-green-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 hover:bg-red-100 dark:hover:bg-red-900/30"
                        onClick={() => handleFeedback(false)}
                        title="Zła sugestia"
                      >
                        <ThumbsDown className="h-3.5 w-3.5 text-red-600" />
                      </Button>
                    </div>
                  )}
                  {feedbackGiven && (
                    <Badge variant="outline" className={feedbackGiven === 'positive' ? 'text-green-600 border-green-300' : 'text-red-600 border-red-300'}>
                      {feedbackGiven === 'positive' ? '👍' : '👎'} Dzięki!
                    </Badge>
                  )}
                </>
              ) : (
                <Badge variant="outline" className="text-gray-500 dark:text-gray-400">
                  Wybierz ticket ręcznie
                </Badge>
              )}
            </div>
          </div>

          {/* Right: Ticket selector + Log buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <Select
              value={selectedTicket}
              onValueChange={setSelectedTicket}
              disabled={isLogged}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Wybierz ticket ręcznie..." />
              </SelectTrigger>
              <SelectContent>
                {tickets.map((ticket) => (
                  <SelectItem key={ticket.key} value={ticket.key}>
                    {ticket.key} - {ticket.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Split button */}
            {onSplit && !isLogged && activity.totalSeconds > 300 && (
              <Button
                onClick={() => onSplit(activity)}
                variant="outline"
                size="sm"
                title="Podziel na części"
              >
                <Scissors className="h-4 w-4" />
              </Button>
            )}

            {/* Details button */}
            {onLogWithDetails && !isLogged && (
              <Button
                onClick={() => onLogWithDetails(activity)}
                variant="outline"
                size="sm"
                title="Log with details"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            )}

            {/* Quick log button */}
            <Button
              onClick={() => onLog(activity.id, selectedTicket)}
              disabled={isLogging || isLogged || !selectedTicket}
              size="sm"
              className={isLogged ? 'bg-green-600' : ''}
            >
              {isLogged ? '✓' : isLogging ? '...' : 'Log'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
