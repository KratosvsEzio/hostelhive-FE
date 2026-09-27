import { bookingFilterGroups, bookingFilterParams } from './booking-filter-groups';

/**
 * The half of the filter contract that turns panel state into query params.
 *
 * Worth its own tests because every mistake it can make is silent. A key the backend does
 * not recognise is ignored and the full list comes back; an empty value sent as a parameter
 * narrows to nothing; a repeated key without its `[]` keeps only the last value. None of
 * those raise anything — they just return a plausible list that is not the one asked for.
 */
describe('bookingFilterParams', () => {
  it('sends nothing at all for an untouched filter', () => {
    expect(bookingFilterParams({})).toEqual({});
  });

  /**
   * An empty checkbox set means "all", not "none". Sending the key with no values would ask
   * for bookings whose disposition is one of nothing, and the table would come back empty
   * the moment a host opened the panel and closed it again.
   */
  it('treats an empty selection as no filter', () => {
    expect(bookingFilterParams({ disposition: [] })).toEqual({});
    expect(bookingFilterParams({ checkIn: {} })).toEqual({});
  });

  // The `[]` is load-bearing: without it a repeated key collapses to the last value.
  it('repeats one bracketed key per selected disposition', () => {
    const p = bookingFilterParams({ disposition: ['pending-allotment', 'cancelled'] });

    expect(p['f[disposition.slug][]']).toEqual(['pending-allotment', 'cancelled']);
  });

  it('keeps a single selection in the array form too', () => {
    const p = bookingFilterParams({ disposition: ['checked-in'] });

    expect(p['f[disposition.slug][]']).toEqual(['checked-in']);
  });

  /**
   * `checkin_date` is a datetime. A bare `2026-08-24` on both ends matches only arrivals
   * recorded at exactly midnight — which is none of them — so a day has to become a range
   * that spans it.
   */
  // Plain days (Trello #81): the server applies the hostel's own day boundaries.
  it('sends the days plain, for the server to read in the hostel zone', () => {
    const p = bookingFilterParams({ checkIn: { from: '2026-08-01', to: '2026-08-31' } });

    expect(p['f[checkin_date][gte]']).toBe('2026-08-01');
    expect(p['f[checkin_date][lte]']).toBe('2026-08-31');
  });

  it('sends whichever end of the range was given', () => {
    expect(bookingFilterParams({ checkIn: { from: '2026-08-01' } })).toEqual({
      'f[checkin_date][gte]': '2026-08-01',
    });
    expect(bookingFilterParams({ checkIn: { to: '2026-08-31' } })).toEqual({
      'f[checkin_date][lte]': '2026-08-31',
    });
  });

  // What a lane click in the day ledger produces: one disposition, one day, both ends.
  it('turns a single day into a closed range', () => {
    const p = bookingFilterParams({
      disposition: ['pending'],
      checkIn: { from: '2026-08-26', to: '2026-08-26' },
    });

    expect(p).toEqual({
      // The lane asks for its pre-reseed slug too.
      'f[disposition.slug][]': ['pending', 'pending-allotment'],
      'f[checkin_date][gte]': '2026-08-26',
      'f[checkin_date][lte]': '2026-08-26',
    });
  });

  // Bookings with guests in a room now — the index's active occupancies (Trello #81).
  it('filters by the room guests are checked into', () => {
    expect(bookingFilterParams({ room: 'aVXGyz' })).toEqual({ 'f[occupied_room_ids]': 'aVXGyz' });
    expect(bookingFilterParams({ room: '' })).toEqual({});
  });

  it('offers the room filter only once the rooms are known', () => {
    expect(bookingFilterGroups().map((g) => g.key)).not.toContain('room');
    const withRooms = bookingFilterGroups([{ value: 'aVXGyz', label: 'Room 101' }]);
    expect(withRooms.find((g) => g.key === 'room')?.fields[0].options).toEqual([{ value: 'aVXGyz', label: 'Room 101' }]);
  });
});
