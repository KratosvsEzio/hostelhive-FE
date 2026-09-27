import { FilterGroup, FilterOption, FilterValues } from '@hostelhive/ui';
import { LANES, slugsFor } from '@features/host/bookings/booking-month';

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
export function bookingFilterGroups(rooms: readonly FilterOption[] = []): FilterGroup[] {
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
    // Only once the rooms are known: an empty picker would read as a hostel with none.
    ...(rooms.length
      ? [
          {
            key: 'room',
            label: 'Room',
            icon: 'ti-door',
            fields: [
              {
                key: 'room',
                type: 'select' as const,
                label: 'Guests in room',
                description: 'Bookings with guests checked into this room now.',
                options: [...rooms],
              },
            ],
          },
        ]
      : []),
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
 *  - Days go **plain**, `2026-08-24` (Trello #81): the server applies the hostel's own day
 *    boundaries. Booking lists only — other lists still send the time-bounded convention.
 */
export function bookingFilterParams(values: FilterValues): Record<string, string | string[]> {
  const params: Record<string, string | string[]> = {};

  const dispositions = Array.isArray(values['disposition'])
    ? (values['disposition'] as string[])
    : [];
  // Each lane also asks for its pre-reseed slug, so older records are not silently missed.
  if (dispositions.length) params['f[disposition.slug][]'] = dispositions.flatMap(slugsFor);

  const range = (values['checkIn'] ?? {}) as { from?: string; to?: string };
  if (range.from) params['f[checkin_date][gte]'] = range.from;
  if (range.to) params['f[checkin_date][lte]'] = range.to;

  // Bookings with guests in this room now — the index's active occupancies (Trello #81).
  const room = values['room'];
  if (typeof room === 'string' && room) params['f[occupied_room_ids]'] = room;

  return params;
}
