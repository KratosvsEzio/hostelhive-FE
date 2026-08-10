/**
 * Formats a date-range boundary as a naive local datetime string for `f[…][gte]` / `f[…][lte]`
 * filter params.
 *
 * Date-range pickers yield date-only values (`YYYY-MM-DD`), but the API filters datetime columns,
 * so a bare date would drop same-day rows recorded after midnight. We pin the lower bound to the
 * start of the day and the upper bound to the end of the day, so a single-day range still spans
 * the whole day. No timezone suffix — the backend treats these as server-local (matching its own
 * examples, e.g. `2026-08-02T00:00:00`).
 *
 * Use everywhere a selected date range is sent to the API, so the convention stays uniform.
 */

/** Lower bound → start of that day (`YYYY-MM-DDT00:00:00`). */
export function dayRangeStart(date: string): string {
  return `${date.slice(0, 10)}T00:00:00`;
}

/** Upper bound → end of that day (`YYYY-MM-DDT23:59:59`). */
export function dayRangeEnd(date: string): string {
  return `${date.slice(0, 10)}T23:59:59`;
}
