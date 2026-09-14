import { CalendarDayCounts } from '@features/host/bookings/host-bookings-api';

/** How many days the strip covers, today included. A fortnight fits a desk week either side. */
export const STRIP_DAYS = 14;

/** Volume band, 0–3, for picking a tint. Tailwind needs static classes, so this is a number. */
export type StripLevel = 0 | 1 | 2 | 3;

export interface StripDay {
  /** `yyyy-MM-dd`, local. */
  date: string;
  /** `Mon`, in the runtime's locale. */
  weekday: string;
  /** `13` — the day of the month, unpadded. */
  dayOfMonth: string;
  checkins: number;
  checkouts: number;
  isToday: boolean;
  isWeekend: boolean;
  inLevel: StripLevel;
  outLevel: StripLevel;
}

export interface UpcomingStrip {
  days: StripDay[];
  totalIn: number;
  totalOut: number;
  /** The busiest single figure in the window, which the tints are scaled against. */
  busiest: number;
  /** `13 Sep – 26 Sep`, for the card's subtitle. */
  rangeLabel: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * `yyyy-MM-dd` from the local calendar, never `toISOString()`.
 *
 * The latter is UTC, and returns yesterday for the first five hours of every day in PKT —
 * which would mark the wrong cell "today" and shift the whole strip by one.
 */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `n` days after `from`, as a fresh local date. */
function addDays(from: Date, n: number): Date {
  const out = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  out.setDate(out.getDate() + n);
  return out;
}

function level(n: number, busiest: number): StripLevel {
  if (n <= 0 || busiest <= 0) return 0;
  return Math.min(3, Math.ceil((n / busiest) * 3)) as StripLevel;
}

/**
 * The next fortnight of arrivals and departures, one cell per day.
 *
 * **Built forward from `today`, not from what came back.** The calendar endpoint only sends
 * days it has something to say about, so mapping its rows straight onto cells would draw a
 * fortnight with the quiet days missing and the busy ones sitting next to each other — a
 * strip that reads as continuous while skipping dates. Every day in the window gets a cell,
 * and a day the server never mentioned is a real answer: nobody is arriving.
 *
 * Counts are matched by date string rather than by index for the same reason.
 */
export function upcomingStrip(
  counts: readonly CalendarDayCounts[],
  today: Date,
  span: number = STRIP_DAYS,
): UpcomingStrip {
  const byDate = new Map<string, CalendarDayCounts>();
  for (const c of counts) if (c?.date) byDate.set(c.date, c);

  const todayKey = ymd(today);
  const dates = Array.from({ length: Math.max(0, span) }, (_, i) => addDays(today, i));

  const raw = dates.map((d) => {
    const hit = byDate.get(ymd(d));
    return { d, checkins: hit?.checkins ?? 0, checkouts: hit?.checkouts ?? 0 };
  });

  const busiest = raw.reduce((hi, r) => Math.max(hi, r.checkins, r.checkouts), 0);

  const days: StripDay[] = raw.map(({ d, checkins, checkouts }) => ({
    date: ymd(d),
    weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
    dayOfMonth: String(d.getDate()),
    checkins,
    checkouts,
    isToday: ymd(d) === todayKey,
    isWeekend: d.getDay() === 0 || d.getDay() === 6,
    inLevel: level(checkins, busiest),
    outLevel: level(checkouts, busiest),
  }));

  const month = (d: Date): string => d.toLocaleDateString(undefined, { month: 'short' });
  const first = dates[0];
  const last = dates[dates.length - 1];

  return {
    days,
    totalIn: raw.reduce((n, r) => n + r.checkins, 0),
    totalOut: raw.reduce((n, r) => n + r.checkouts, 0),
    busiest,
    rangeLabel:
      first && last ? `${first.getDate()} ${month(first)} – ${last.getDate()} ${month(last)}` : '',
  };
}

/** The window to ask the calendar endpoint for: `[today, today + span - 1]`. */
export function stripRange(today: Date, span: number = STRIP_DAYS): { from: string; to: string } {
  return { from: ymd(today), to: ymd(addDays(today, Math.max(1, span) - 1)) };
}
