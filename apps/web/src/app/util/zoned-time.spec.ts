import { localDateAtWallTime, zonedWallTimeToUtc } from './zoned-time';

/** `2026-09-20T09:00:00.000Z` reads more clearly than a millisecond count. */
function iso(d: Date): string {
  return d.toISOString();
}

describe('zonedWallTimeToUtc', () => {
  /**
   * The home market, and the case the booking payload is built on: 2pm at a hostel in Lahore
   * is 09:00 UTC, because Pakistan runs five hours ahead and keeps no daylight saving.
   */
  it('resolves a Pakistani afternoon', () => {
    expect(iso(zonedWallTimeToUtc(2026, 9, 20, 14, 0, 'Asia/Karachi'))).toBe(
      '2026-09-20T09:00:00.000Z',
    );
  });

  it('resolves a Pakistani morning', () => {
    expect(iso(zonedWallTimeToUtc(2026, 9, 23, 11, 0, 'Asia/Karachi'))).toBe(
      '2026-09-23T06:00:00.000Z',
    );
  });

  // The identity case — a zone with no offset at all should come back unchanged.
  it('leaves UTC alone', () => {
    expect(iso(zonedWallTimeToUtc(2026, 9, 20, 14, 0, 'UTC'))).toBe('2026-09-20T14:00:00.000Z');
  });

  // Half-hour and three-quarter-hour zones are where a naive whole-hour offset shows up.
  it('handles a half-hour zone', () => {
    expect(iso(zonedWallTimeToUtc(2026, 9, 20, 14, 0, 'Asia/Kolkata'))).toBe(
      '2026-09-20T08:30:00.000Z',
    );
  });

  it('handles a forty-five-minute zone', () => {
    expect(iso(zonedWallTimeToUtc(2026, 9, 20, 14, 0, 'Asia/Kathmandu'))).toBe(
      '2026-09-20T08:15:00.000Z',
    );
  });

  it('handles a zone behind UTC', () => {
    // New York in September is on daylight time, four hours behind.
    expect(iso(zonedWallTimeToUtc(2026, 9, 20, 14, 0, 'America/New_York'))).toBe(
      '2026-09-20T18:00:00.000Z',
    );
  });

  /**
   * The same wall time either side of a daylight-saving change resolves to different offsets.
   * This is the whole reason the offset is read at the instant rather than once for the zone.
   */
  it('tracks daylight saving across the year', () => {
    const summer = zonedWallTimeToUtc(2026, 7, 1, 14, 0, 'Europe/London'); // BST, UTC+1
    const winter = zonedWallTimeToUtc(2026, 1, 1, 14, 0, 'Europe/London'); // GMT, UTC+0

    expect(iso(summer)).toBe('2026-07-01T13:00:00.000Z');
    expect(iso(winter)).toBe('2026-01-01T14:00:00.000Z');
  });

  // Southern hemisphere: the seasons, and therefore the offsets, run the other way.
  it('tracks daylight saving in the southern hemisphere', () => {
    const jan = zonedWallTimeToUtc(2026, 1, 15, 14, 0, 'Australia/Sydney'); // AEDT, UTC+11
    const jul = zonedWallTimeToUtc(2026, 7, 15, 14, 0, 'Australia/Sydney'); // AEST, UTC+10

    expect(iso(jan)).toBe('2026-01-15T03:00:00.000Z');
    expect(iso(jul)).toBe('2026-07-15T04:00:00.000Z');
  });

  // Midnight is where `hour12: false` reports 24 on some engines, rolling the day forward.
  it('does not roll midnight into the next day', () => {
    expect(iso(zonedWallTimeToUtc(2026, 9, 20, 0, 0, 'Asia/Karachi'))).toBe(
      '2026-09-19T19:00:00.000Z',
    );
  });

  it('takes a 1-indexed month', () => {
    // January, not February — the off-by-one this signature exists to avoid.
    expect(iso(zonedWallTimeToUtc(2026, 1, 5, 12, 0, 'UTC'))).toBe('2026-01-05T12:00:00.000Z');
  });
});

describe('localDateAtWallTime', () => {
  /**
   * The picker hands back a local midnight. Only its calendar date means anything, and
   * reading the instant instead is what would book the wrong day for a guest whose browser
   * is behind the hostel.
   */
  it('keeps the calendar date the picker showed', () => {
    const picked = new Date(2026, 8, 20); // 20 September, local midnight
    expect(iso(localDateAtWallTime(picked, 14, 0, 'Asia/Karachi'))).toBe(
      '2026-09-20T09:00:00.000Z',
    );
  });

  it('ignores whatever time the date was carrying', () => {
    const morning = localDateAtWallTime(new Date(2026, 8, 20, 0, 0), 14, 0, 'Asia/Karachi');
    const evening = localDateAtWallTime(new Date(2026, 8, 20, 23, 59), 14, 0, 'Asia/Karachi');

    expect(iso(morning)).toBe(iso(evening));
  });
});
