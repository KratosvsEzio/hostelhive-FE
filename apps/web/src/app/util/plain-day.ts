/**
 * Calendar days as plain `yyyy-MM-dd` strings, and arithmetic on them.
 *
 * A plain day names a square on the calendar, not an instant, so it has no zone. Counting
 * between two of them through a `Date` in the device zone lets that zone back in: a
 * daylight-saving change makes a day 23 or 25 hours long, and `new Date('yyyy-MM-dd')` is
 * parsed as UTC midnight, which is the previous evening anywhere west of Greenwich. Everything
 * here works on the year, month and day parts through `Date.UTC`, which has neither problem.
 */

const PLAIN_DAY = /^(\d{4})-(\d{2})-(\d{2})/;
const MS_PER_DAY = 86_400_000;

/** The parts of a plain day as UTC milliseconds, or null when they aren't a real date. */
function dayToUtcMs(day: string): number | null {
  const m = PLAIN_DAY.exec(day);
  if (!m) return null;
  const [year, month, date] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(year, month - 1, date);
  const d = new Date(ms);
  // `Date.UTC` rolls 30 Feb over into March rather than refusing it.
  const real =
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === date;
  return real ? ms : null;
}

/** First 10 chars of a plain day (`yyyy-MM-dd`) or `yyyy-MM-ddTHH:mm…`; null when it isn't one. */
export function dayPart(v: string | null | undefined): string | null {
  if (!v) return null;
  const day = v.slice(0, 10);
  const rest = v.slice(10);
  if (rest !== '' && rest[0] !== 'T') return null;
  return dayToUtcMs(day) === null || day.length !== 10 ? null : day;
}

/** Signed whole calendar days from `from` to `to` (both `yyyy-MM-dd`), by Date.UTC on the parts — never through a Date in the device zone, so DST and the device zone can't move it. */
export function calendarDaysBetween(from: string, to: string): number {
  const a = dayToUtcMs(from);
  const b = dayToUtcMs(to);
  if (a === null || b === null) return NaN;
  return Math.round((b - a) / MS_PER_DAY);
}

/** `day` + n calendar days, as `yyyy-MM-dd`. */
export function addDays(day: string, n: number): string {
  const ms = dayToUtcMs(day);
  if (ms === null) return day;
  return new Date(ms + n * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Local midnight of a plain day, for Intl / weekday rendering (new Date(y, m - 1, d)). */
export function dayToLocalDate(day: string): Date {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
