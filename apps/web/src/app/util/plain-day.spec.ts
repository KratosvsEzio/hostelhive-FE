import {
  addDays,
  calendarDaysBetween,
  dayPart,
  dayToLocalDate,
} from './plain-day';

describe('dayPart', () => {
  it('returns a plain day as it is', () => {
    expect(dayPart('2026-09-20')).toBe('2026-09-20');
  });

  it('cuts the time off a day with one', () => {
    expect(dayPart('2026-09-20T14:30:00.000+05:00')).toBe('2026-09-20');
  });

  it('refuses what is not a day', () => {
    expect(dayPart('tomorrow')).toBeNull();
    expect(dayPart('20-09-2026')).toBeNull();
    expect(dayPart('2026-09-200')).toBeNull();
  });

  it('refuses a day that is not on the calendar', () => {
    expect(dayPart('2026-02-30')).toBeNull();
    expect(dayPart('2026-13-01')).toBeNull();
  });

  it('refuses a space-separated time', () => {
    expect(dayPart('2026-09-20 14:30')).toBeNull();
  });

  it('refuses a day with a time that is not on the calendar', () => {
    expect(dayPart('2026-02-30T10:00')).toBeNull();
    expect(dayPart('2027-02-29')).toBeNull();
  });

  it('refuses nothing', () => {
    expect(dayPart(null)).toBeNull();
    expect(dayPart(undefined)).toBeNull();
    expect(dayPart('')).toBeNull();
  });
});

describe('calendarDaysBetween', () => {
  it('counts forward', () => {
    expect(calendarDaysBetween('2026-09-20', '2026-09-25')).toBe(5);
  });

  it('is zero for the same day', () => {
    expect(calendarDaysBetween('2026-09-20', '2026-09-20')).toBe(0);
  });

  it('is negative going backward', () => {
    expect(calendarDaysBetween('2026-09-25', '2026-09-20')).toBe(-5);
  });

  it('counts across a month end', () => {
    expect(calendarDaysBetween('2026-09-28', '2026-10-03')).toBe(5);
  });

  it('counts across a year end', () => {
    expect(calendarDaysBetween('2026-12-30', '2027-01-02')).toBe(3);
  });

  it('is NaN when either end is not a day', () => {
    expect(calendarDaysBetween('2026-09-20', 'soon')).toBeNaN();
    expect(calendarDaysBetween('2026-02-30', '2026-03-05')).toBeNaN();
  });

  it('counts over a leap day', () => {
    expect(calendarDaysBetween('2028-02-28', '2028-03-01')).toBe(2);
  });

  // 2026-10-25 is a fall-back day in Europe: 25 hours long, which a local-midnight diff would round up.
  it('counts a daylight-saving day as one day', () => {
    expect(calendarDaysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });
});

describe('addDays', () => {
  it('adds within a month', () => {
    expect(addDays('2026-09-20', 1)).toBe('2026-09-21');
  });

  it('rolls over a month end', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  });

  it('rolls over a year end', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('lands on a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('subtracts with a negative count', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('returns an invalid day unchanged', () => {
    expect(addDays('soon', 1)).toBe('soon');
    expect(addDays('2026-02-30', 1)).toBe('2026-02-30');
  });
});

describe('dayToLocalDate', () => {
  it('is local midnight of the day', () => {
    const d = dayToLocalDate('2026-09-20');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 8, 20]);
    expect([d.getHours(), d.getMinutes()]).toEqual([0, 0]);
  });

  it('drops the time of a day that has one', () => {
    const d = dayToLocalDate('2026-09-20T23:30');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 8, 20]);
    expect([d.getHours(), d.getMinutes()]).toEqual([0, 0]);
  });
});
