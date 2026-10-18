import { LOCALE_ID, Pipe, PipeTransform, inject } from '@angular/core';
import { formatDate } from '@angular/common';
import { offsetOf } from '@util/api-date';

/**
 * Renders a backend timestamp in UTC, for the admin billing pages.
 *
 * `apiDate` keeps the offset the backend sent (`+05:00`), which suits the host's own pages.
 * Admin billing filters by UTC day and says so on the page ("Dates are in UTC."), so its
 * times have to read in UTC too — otherwise 10:00+05:00 shows as 10:00 next to that note.
 *
 * A bare `YYYY-MM-DD` has no instant to convert: it stays the calendar date it names.
 */
@Pipe({ name: 'adminUtcDate', standalone: true, pure: true })
export class AdminUtcDate implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);

  transform(
    value: string | Date | null | undefined,
    format = 'mediumDate',
  ): string {
    if (value == null || value === '') return '';
    const timezone =
      value instanceof Date || offsetOf(value) ? '+0000' : undefined;
    try {
      return formatDate(value, format, this.locale, timezone);
    } catch {
      return '';
    }
  }
}
