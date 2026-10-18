import { localDay } from './api-date';
import { localDateAtWallTime, todayIn, wallClockIn, zonedWallTimeToUtc } from './zoned-time';

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

// Instants are built with Date.UTC so the result never depends on the machine's own zone.
const MONTH_END = new Date(Date.UTC(2026, 2, 31, 12, 0)); // 31 March, 12:00Z
const SEASON_END = new Date(Date.UTC(2026, 7, 31, 10, 30)); // 31 August, 10:30Z
const EAST = 'Pacific/Kiritimati'; // UTC+14
const WEST = 'Pacific/Pago_Pago'; // UTC-11

describe('todayIn', () => {
  // The two zones sit a day apart at the same instant, so a device clock cannot match both.
  it('reads the calendar in a zone ahead of and behind UTC at a month end', () => {
    expect(todayIn(EAST, MONTH_END)).toBe('2026-04-01');
    expect(todayIn(WEST, MONTH_END)).toBe('2026-03-31');
  });

  it('puts the two edges of the date line two calendar days apart', () => {
    expect(todayIn(EAST, SEASON_END)).toBe('2026-09-01');
    expect(todayIn(WEST, SEASON_END)).toBe('2026-08-30');
  });

  it('turns over at the hostel midnight, not the device one', () => {
    // Karachi is UTC+5, so its midnight is 19:00Z the evening before.
    expect(todayIn('Asia/Karachi', new Date(Date.UTC(2026, 7, 31, 18, 59, 59)))).toBe('2026-08-31');
    expect(todayIn('Asia/Karachi', new Date(Date.UTC(2026, 7, 31, 19, 0, 0)))).toBe('2026-09-01');
  });

  it('reads UTC as UTC', () => {
    expect(todayIn('UTC', MONTH_END)).toBe('2026-03-31');
  });

  // Callers hand over whatever the hostel record said; none of it may throw on a screen that
  // only wanted a date.
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['an unknown name', 'Mars/Olympus'],
    ['whitespace', '   '],
  ])('falls back to the device date for %s', (_label, zone) => {
    expect(() => todayIn(zone, MONTH_END)).not.toThrow();
    expect(todayIn(zone, MONTH_END)).toBe(localDay(MONTH_END));
  });

  describe('with the clock frozen', () => {
    beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
    afterEach(() => vi.useRealTimers());

    it('reads the current instant when none is passed', () => {
      vi.setSystemTime(MONTH_END);

      expect(todayIn(EAST)).toBe('2026-04-01');
      expect(todayIn(WEST)).toBe('2026-03-31');
    });
  });
});

describe('wallClockIn', () => {
  /** 31 March, 12:37:45Z: 02:37 on 1 April at Kiritimati, 01:37 on 31 March at Pago Pago. */
  const AT = new Date(Date.UTC(2026, 2, 31, 12, 37, 45));

  it('reads the date and the time on the clock in a zone ahead of and behind UTC', () => {
    expect(wallClockIn(EAST, AT)).toBe('2026-04-01T02:37');
    expect(wallClockIn(WEST, AT)).toBe('2026-03-31T01:37');
  });

  it('drops the seconds rather than rounding the minute up', () => {
    expect(wallClockIn('UTC', new Date(Date.UTC(2026, 2, 31, 23, 59, 59)))).toBe('2026-03-31T23:59');
  });

  it('reads the hostel midnight as 00, on the new day', () => {
    // 19:00Z is midnight in Karachi (UTC+5); some engines report that hour as 24.
    expect(wallClockIn('Asia/Karachi', new Date(Date.UTC(2026, 7, 31, 19, 0)))).toBe('2026-09-01T00:00');
  });

  it('follows a daylight-saving change', () => {
    // London is on BST (UTC+1) until 01:00Z on 25 October 2026, and on GMT after.
    expect(wallClockIn('Europe/London', new Date(Date.UTC(2026, 9, 25, 0, 30)))).toBe('2026-10-25T01:30');
    expect(wallClockIn('Europe/London', new Date(Date.UTC(2026, 9, 25, 1, 30)))).toBe('2026-10-25T01:30');
    expect(wallClockIn('Europe/London', new Date(Date.UTC(2026, 9, 25, 2, 30)))).toBe('2026-10-25T02:30');
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an unknown name', 'Mars/Olympus'],
  ])('falls back to the device clock for %s', (_label, zone) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    expect(wallClockIn(zone, AT)).toBe(`${localDay(AT)}T${pad(AT.getHours())}:${pad(AT.getMinutes())}`);
  });
});
