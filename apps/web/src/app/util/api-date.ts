import { Pipe, PipeTransform, LOCALE_ID, inject } from '@angular/core';
import { formatDate } from '@angular/common';

/**
 * The backend stores UTC but serialises with its own offset, e.g. a salary issue date of
 * 1 Sep comes back as `2026-09-01T00:00:00.000+05:00`. Angular's `date` pipe renders in the
 * *viewer's* timezone, so anyone west of that offset sees the previous day — 1 Sep reads as
 * 31 Aug. These values describe events in the hostel's own timezone, so the offset the
 * backend sent is the one to render in.
 */

/**
 * The offset an API timestamp carries, as Angular's `formatDate` wants it (`+0500`), or
 * null when the value has none — a bare `YYYY-MM-DD`, which Angular already reads as a
 * local calendar date and so needs no correction.
 */
export function offsetOf(value: string): string | null {
  if (/Z$/.test(value)) return '+0000';
  // Only a trailing offset counts: the `-` in `2026-09-01` must not match.
  const m = /([+-])(\d{2}):?(\d{2})$/.exec(value);
  return m && value.length > 10 ? `${m[1]}${m[2]}${m[3]}` : null;
}

/** `YYYY-MM-DD` in the offset the value carries — never shifted into the viewer's zone. */
export function apiDateOnly(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

/** Today as `YYYY-MM-DD` from local parts. `toISOString()` would give the UTC day, which
 *  is yesterday for any viewer west of UTC. */
export function localToday(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Renders a backend timestamp in the offset it was sent with.
 *
 * `{{ inv.due | apiDate: 'dd MMM yyyy' }}` — same calendar day for every viewer, wherever
 * they are. Use this for anything that came from the API; the stock `date` pipe stays
 * correct for values built locally (a picker's own state, `new Date()`).
 */
@Pipe({ name: 'apiDate', standalone: true, pure: true })
export class ApiDate implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);

  transform(
    value: string | Date | null | undefined,
    format = 'mediumDate',
  ): string {
    if (value == null || value === '') return '';
    if (value instanceof Date) return formatDate(value, format, this.locale);
    const tz = offsetOf(value);
    try {
      return formatDate(value, format, this.locale, tz ?? undefined);
    } catch {
      return '';
    }
  }
}
