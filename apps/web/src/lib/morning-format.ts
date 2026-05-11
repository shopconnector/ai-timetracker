// Pure helpers — używane zarówno server-side jak i w client componentach.
// Bez importów `node:*` żeby Next bundle się nie wywalał.

export function formatMinutes(min: number): string {
  if (min < 1) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return `${h}h ${m}min`;
  if (h > 0) return `${h}h`;
  return `${m}min`;
}

export function yesterdayDate(now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Like yesterdayDate(), but skips weekends.
 * Mon → Fri, Sun → Fri, Sat → Fri. Other days = -1 day.
 */
export function previousWorkday(now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  // Sun(0) → -2 days, Sat(6) → -1 day
  if (d.getDay() === 0) d.setDate(d.getDate() - 2);
  else if (d.getDay() === 6) d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Returns YYYY-MM-DD for the most recent occurrence of the given weekday (1=Mon ... 5=Fri). */
export function lastWeekday(targetDow: number, now: Date = new Date()): string {
  const d = new Date(now);
  let delta = (d.getDay() - targetDow + 7) % 7;
  if (delta === 0) delta = 7; // always go BACK to previous occurrence, not today
  d.setDate(d.getDate() - delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Returns YYYY-MM-DD for N days ago. */
export function daysAgo(n: number, now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
