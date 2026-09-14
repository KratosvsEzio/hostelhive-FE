import { CalendarDayCounts } from '@features/host/bookings/host-bookings-api';
import { STRIP_DAYS, stripRange, upcomingStrip } from './upcoming-strip';

/** Local noon, so no timezone can drag the date onto its neighbour. */
function day(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d, 12, 0, 0);
}

function counts(rows: Partial<CalendarDayCounts>[]): CalendarDayCounts[] {
  return rows.map((r) => ({
    date: r.date ?? '',
    checkins: r.checkins ?? 0,
    checkouts: r.checkouts ?? 0,
    byDisposition: r.byDisposition ?? {},
  }));
}

describe('upcomingStrip', () => {
  const TODAY = day(2026, 9, 13);

  it('draws a cell for every day in the window', () => {
    expect(upcomingStrip([], TODAY).days.length).toBe(STRIP_DAYS);
  });

  it('starts on today and runs forward', () => {
    const s = upcomingStrip([], TODAY);

    expect(s.days[0].date).toBe('2026-09-13');
    expect(s.days[0].isToday).toBe(true);
    expect(s.days[13].date).toBe('2026-09-26');
    expect(s.days.filter((d) => d.isToday).length).toBe(1);
  });

  it('carries the counts onto their own dates', () => {
    const s = upcomingStrip(
      counts([
        { date: '2026-09-13', checkins: 4, checkouts: 1 },
        { date: '2026-09-16', checkins: 6, checkouts: 2 },
      ]),
      TODAY,
    );

    expect(s.days[0]).toMatchObject({ checkins: 4, checkouts: 1 });
    expect(s.days[3]).toMatchObject({ date: '2026-09-16', checkins: 6, checkouts: 2 });
  });

  /**
   * The endpoint only sends days it has something to say about. Laying its rows onto cells
   * in order would draw a continuous fortnight with the quiet days missing — the 16th's
   * arrivals appearing under the 14th, and every later date wrong by the same drift.
   */
  it('leaves the days the server never mentioned empty, in place', () => {
    const s = upcomingStrip(
      counts([
        { date: '2026-09-13', checkins: 4 },
        { date: '2026-09-16', checkins: 6 },
      ]),
      TODAY,
    );

    expect(s.days[1]).toMatchObject({ date: '2026-09-14', checkins: 0, checkouts: 0 });
    expect(s.days[2]).toMatchObject({ date: '2026-09-15', checkins: 0, checkouts: 0 });
  });

  it('ignores days outside the window', () => {
    const s = upcomingStrip(
      counts([
        { date: '2026-09-12', checkins: 9 },
        { date: '2026-10-05', checkins: 7 },
      ]),
      TODAY,
    );

    expect(s.totalIn).toBe(0);
    expect(s.days.every((d) => d.checkins === 0)).toBe(true);
  });

  it('totals what is inside the window', () => {
    const s = upcomingStrip(
      counts([
        { date: '2026-09-13', checkins: 4, checkouts: 1 },
        { date: '2026-09-14', checkins: 2, checkouts: 0 },
        { date: '2026-09-26', checkins: 1, checkouts: 3 },
      ]),
      TODAY,
    );

    expect(s.totalIn).toBe(7);
    expect(s.totalOut).toBe(4);
  });

  it('marks weekends', () => {
    const s = upcomingStrip([], TODAY); // 13 Sep 2026 is a Sunday

    expect(s.days[0].isWeekend).toBe(true);
    expect(s.days[1].isWeekend).toBe(false);
    expect(s.days[6].isWeekend).toBe(true);
  });

  it('labels the range from the window, not the payload', () => {
    expect(upcomingStrip([], TODAY).rangeLabel).toBe('13 Sep – 26 Sep');
  });

  it('crosses a month boundary without losing a day', () => {
    const s = upcomingStrip([], day(2026, 9, 25));

    expect(s.days[0].date).toBe('2026-09-25');
    expect(s.days[6].date).toBe('2026-10-01');
    expect(s.days[13].date).toBe('2026-10-08');
    expect(s.rangeLabel).toBe('25 Sep – 8 Oct');
  });

  /**
   * Tints are scaled against the busiest figure in the window rather than a fixed ceiling, so
   * a quiet fortnight still reads as a shape instead of fourteen identical pale cells.
   */
  describe('volume tint', () => {
    it('is nothing at all on a day with none', () => {
      const s = upcomingStrip(counts([{ date: '2026-09-13', checkins: 4 }]), TODAY);

      expect(s.days[1].inLevel).toBe(0);
      expect(s.days[1].outLevel).toBe(0);
    });

    it('puts the busiest day at the top band', () => {
      const s = upcomingStrip(
        counts([
          { date: '2026-09-13', checkins: 2 },
          { date: '2026-09-14', checkins: 8 },
        ]),
        TODAY,
      );

      expect(s.days[1].inLevel).toBe(3);
      expect(s.busiest).toBe(8);
    });

    it('bands the quieter days below it', () => {
      const s = upcomingStrip(
        counts([
          { date: '2026-09-13', checkins: 1 },
          { date: '2026-09-14', checkins: 5 },
          { date: '2026-09-15', checkins: 9 },
        ]),
        TODAY,
      );

      expect(s.days[0].inLevel).toBe(1);
      expect(s.days[1].inLevel).toBe(2);
      expect(s.days[2].inLevel).toBe(3);
    });

    // Departures are scaled on the same ruler as arrivals, so the two rows stay comparable.
    it('scales departures against the same busiest figure', () => {
      const s = upcomingStrip(
        counts([
          { date: '2026-09-13', checkins: 9, checkouts: 3 },
          { date: '2026-09-14', checkouts: 9 },
        ]),
        TODAY,
      );

      expect(s.days[0].outLevel).toBe(1);
      expect(s.days[1].outLevel).toBe(3);
    });
  });

  it('survives a payload with no dates on it', () => {
    const s = upcomingStrip(counts([{ checkins: 5 }]), TODAY);

    expect(s.totalIn).toBe(0);
    expect(s.days.length).toBe(STRIP_DAYS);
  });
});

describe('stripRange', () => {
  it('asks for today through the last cell, inclusive', () => {
    expect(stripRange(day(2026, 9, 13))).toEqual({ from: '2026-09-13', to: '2026-09-26' });
  });

  it('matches the window the strip draws', () => {
    const today = day(2026, 9, 13);
    const { from, to } = stripRange(today);
    const days = upcomingStrip([], today).days;

    expect(days[0].date).toBe(from);
    expect(days[days.length - 1].date).toBe(to);
  });
});
