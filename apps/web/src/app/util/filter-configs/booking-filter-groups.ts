import { FilterGroup, FilterValues } from '@hostelhive/ui';
import { LANES } from '@features/host/bookings/booking-month';
import { dayRangeEnd, dayRangeStart } from '@util/date-range-filter';

/**
 * The only filter on the bookings list — the table half of the page.
 *
 * It sat beside three Arrivals / Past / Cancelled chips until those were dropped. They were
 * a coarser cut of the disposition field below: every chip is some subset of these five, so
 * a host had two controls for one question and no way to tell which was in force. The five
 * say everything the three did and more, at the cost of the one-click "what is coming".
 *
 * The disposition options are {@link LANES}, in the order a stay moves through them, so the
 * list reads as a life cycle rather than an alphabet. They are the same five the calendar
 * counts and the status column badges, which is the point: one vocabulary for the page.
 */
export function bookingFilterGroups(): FilterGroup[] {
  return [
    {
      key: 'disposition',
      label: 'Status',
      icon: 'ti-filter',
      fields: [
        {
          key: 'disposition',
          type: 'checkbox',
          label: 'Booking status',
          description: 'Where each stay is in its life. Leave empty for all.',
          options: LANES.map((l) => ({ value: l.key, label: l.label })),
        },
      ],
    },
    {
      key: 'checkIn',
      label: 'Arrival',
      icon: 'ti-calendar',
      fields: [
        {
          key: 'checkIn',
          type: 'date-range',
          label: 'Arriving between',
          description: 'Matches the check-in day, inclusive of both ends.',
        },
      ],
    },
  ];
}

/**
 * The same two fields as query params for `GET …/bookings`.
 *
 * Lives beside {@link bookingFilterGroups} because the two halves have to agree: that one
 * names the keys the panel writes, this one names what each key becomes on the wire, and a
 * rename in either is only safe if you can see both at once.
 *
 * An absent field sends nothing. That is the whole difference between "all" and "none" — an
 * empty checkbox set is a filter nobody has touched, and turning it into a parameter would
 * ask the server for bookings whose disposition is one of nothing.
 *
 * Two conventions, both the backend’s:
 *  - `f[disposition.slug][]` repeats one key per value. The `[]` is required — without it a
 *    repeated key collapses to whichever value happened to come last.
 *  - `checkin_date` is a datetime, so a day is a *range* across it. A bare `2026-08-24` on
 *    both ends matches only arrivals recorded at exactly midnight, which is none of them.
 */
export function bookingFilterParams(values: FilterValues): Record<string, string | string[]> {
  const params: Record<string, string | string[]> = {};

  const dispositions = Array.isArray(values['disposition'])
    ? (values['disposition'] as string[])
    : [];
  if (dispositions.length) params['f[disposition.slug][]'] = dispositions;

  const range = (values['checkIn'] ?? {}) as { from?: string; to?: string };
  if (range.from) params['f[checkin_date][gte]'] = dayRangeStart(range.from);
  if (range.to) params['f[checkin_date][lte]'] = dayRangeEnd(range.to);

  return params;
}
