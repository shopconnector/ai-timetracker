// Google Calendar Integration
// Supports both iCal URL feeds and Google Calendar API

export interface GoogleCalendarEvent {
  id: string;
  source: 'google-calendar';
  title: string;
  description?: string;
  startTime: string; // HH:MM
  endTime: string;
  durationMinutes: number;
  date: string; // YYYY-MM-DD
  isAllDay?: boolean;
  location?: string;
  color?: string;
  metadata?: Record<string, unknown>;
}

// Parse iCal VEVENT to event object
function parseVEvent(vevent: string, dateFilter?: string): GoogleCalendarEvent | null {
  const getValue = (key: string): string | null => {
    const regex = new RegExp(`^${key}[;:](.*)$`, 'im');
    const match = vevent.match(regex);
    if (match) {
      // Handle multi-line values (folded lines start with space/tab)
      let value = match[1];
      const lines = vevent.split('\n');
      const lineIndex = lines.findIndex(l => l.match(new RegExp(`^${key}[;:]`)));
      if (lineIndex >= 0) {
        let i = lineIndex + 1;
        while (i < lines.length && /^[ \t]/.test(lines[i])) {
          value += lines[i].substring(1);
          i++;
        }
      }
      return value.replace(/\\n/g, '\n').replace(/\\,/g, ',').trim();
    }
    return null;
  };

  const getDateTimeValue = (
    key: string
  ): { date: string; time?: string; isAllDay: boolean } | null => {
    // Try to find DTSTART;VALUE=DATE:YYYYMMDD (all day)
    const allDayRegex = new RegExp(`^${key};VALUE=DATE:(\\d{8})`, 'im');
    const allDayMatch = vevent.match(allDayRegex);
    if (allDayMatch) {
      const dateStr = allDayMatch[1];
      return {
        date: `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`,
        isAllDay: true,
      };
    }

    // Try DTSTART:YYYYMMDDTHHMMSS or DTSTART;TZID=...:YYYYMMDDTHHMMSS
    const dateTimeRegex = new RegExp(`^${key}[;:].*?(\\d{8}T\\d{6})`, 'im');
    const dateTimeMatch = vevent.match(dateTimeRegex);
    if (dateTimeMatch) {
      const dt = dateTimeMatch[1];
      return {
        date: `${dt.substring(0, 4)}-${dt.substring(4, 6)}-${dt.substring(6, 8)}`,
        time: `${dt.substring(9, 11)}:${dt.substring(11, 13)}`,
        isAllDay: false,
      };
    }

    return null;
  };

  const uid = getValue('UID');
  const summary = getValue('SUMMARY');
  const description = getValue('DESCRIPTION');
  const location = getValue('LOCATION');

  const dtstart = getDateTimeValue('DTSTART');
  const dtend = getDateTimeValue('DTEND');

  if (!uid || !summary || !dtstart) {
    return null;
  }

  // Filter by date if specified
  if (dateFilter && dtstart.date !== dateFilter) {
    return null;
  }

  // Calculate duration
  let durationMinutes = 60; // default 1h
  if (dtstart.time && dtend?.time) {
    const startMinutes =
      parseInt(dtstart.time.split(':')[0]) * 60 + parseInt(dtstart.time.split(':')[1]);
    const endMinutes = parseInt(dtend.time.split(':')[0]) * 60 + parseInt(dtend.time.split(':')[1]);
    durationMinutes = endMinutes - startMinutes;
    if (durationMinutes <= 0) durationMinutes = 60;
  }

  return {
    id: `gcal-${uid.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50)}`,
    source: 'google-calendar',
    title: summary,
    description: description || undefined,
    startTime: dtstart.time || '09:00',
    endTime:
      dtend?.time || (dtstart.time ? calculateEndTime(dtstart.time, durationMinutes) : '10:00'),
    durationMinutes,
    date: dtstart.date,
    isAllDay: dtstart.isAllDay,
    location: location || undefined,
    color: '#4285f4', // Google blue
    metadata: {
      originalUid: uid,
    },
  };
}

function calculateEndTime(startTime: string, durationMinutes: number): string {
  const [hours, minutes] = startTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  const endHours = Math.floor(totalMinutes / 60) % 24;
  const endMins = totalMinutes % 60;
  return `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
}

// Parse iCal feed content
export function parseICalFeed(icalContent: string, dateFilter?: string): GoogleCalendarEvent[] {
  const events: GoogleCalendarEvent[] = [];

  // Split by VEVENT
  const veventRegex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  let match;

  while ((match = veventRegex.exec(icalContent)) !== null) {
    const vevent = match[1];
    const event = parseVEvent(vevent, dateFilter);
    if (event) {
      events.push(event);
    }
  }

  return events;
}

// Fetch events from iCal URL
export async function getEventsFromICalUrl(
  icalUrl: string,
  startDate: string,
  endDate: string
): Promise<GoogleCalendarEvent[]> {
  try {
    const response = await fetch(icalUrl, {
      headers: {
        Accept: 'text/calendar, application/calendar+xml, text/plain',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch iCal feed:', response.status);
      return [];
    }

    const icalContent = await response.text();
    const allEvents = parseICalFeed(icalContent);

    // Filter by date range
    return allEvents.filter(e => e.date >= startDate && e.date <= endDate);
  } catch (error) {
    console.error('Error fetching iCal feed:', error);
    return [];
  }
}

// Get Google Calendar events (from iCal URL configured in env)
export async function getGoogleCalendarEvents(
  startDate: string,
  endDate: string
): Promise<GoogleCalendarEvent[]> {
  const icalUrl = process.env.GOOGLE_CALENDAR_ICAL_URL;

  if (!icalUrl) {
    // No calendar configured - return empty
    return [];
  }

  return getEventsFromICalUrl(icalUrl, startDate, endDate);
}

// Get Google Calendar events for a single date
export async function getGoogleCalendarEventsForDate(date: string): Promise<GoogleCalendarEvent[]> {
  return getGoogleCalendarEvents(date, date);
}

// Helper: Check if Google Calendar is configured
export function isGoogleCalendarConfigured(): boolean {
  return !!process.env.GOOGLE_CALENDAR_ICAL_URL;
}
