import { TestBed } from '@angular/core/testing';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { DATE_RANGE_PRESETS, DateRange, DateRangePicker, presetRange } from './date-range-picker';

/** Noon UTC, 31 March 2026: a hostel east of the date line is already on 1 April. */
const NOON_UTC = Date.UTC(2026, 2, 31, 12, 0, 0);

afterEach(() => vi.useRealTimers());

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const span = (r: DateRange) => [iso(r.start), iso(r.end)];

interface Internals {
  value(): DateRange | null;
  viewDate(): Date;
  calDays(): { date: Date; isToday: boolean }[];
  selectPreset(p: (typeof DATE_RANGE_PRESETS)[0]): void;
}

function open(today: string | null): Internals {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOON_UTC);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideI18nTesting()] });
  TestBed.overrideComponent(DateRangePicker, { set: { template: '', imports: [] } });
  const fixture = TestBed.createComponent(DateRangePicker);
  fixture.componentRef.setInput('today', today);
  fixture.detectChanges();
  return fixture.componentInstance as unknown as Internals;
}

const ringed = (p: Internals) => p.calDays().filter((d) => d.isToday).map((d) => iso(d.date));
const byLabel = (label: string) => DATE_RANGE_PRESETS.find((p) => p.label === label)!;

/** The overview filter picker takes "today" from its caller. */
describe('layout DateRangePicker today', () => {
  it('rings the day it is given and opens on its month', () => {
    const p = open('2026-04-01');
    expect(ringed(p)).toEqual(['2026-04-01']);
    expect(iso(p.viewDate())).toBe('2026-04-01');
  });

  it('applies a preset counted from the day it is given', () => {
    const p = open('2026-04-01');
    p.selectPreset(byLabel('This month'));
    expect(span(p.value()!)).toEqual(['2026-04-01', '2026-04-01']);
    p.selectPreset(byLabel('Last 7 days'));
    expect(span(p.value()!)).toEqual(['2026-03-26', '2026-04-01']);
  });

  it('falls back to the device’s date when none is given', () => {
    const p = open(null);
    expect(ringed(p)).toEqual([iso(new Date(NOON_UTC))]);
  });
});

describe('presetRange', () => {
  it('counts the named preset from the day it is given', () => {
    expect(span(presetRange('Last 12 months', '2026-04-01'))).toEqual(['2025-04-02', '2026-04-01']);
    expect(span(presetRange('Last 12 months', '2026-03-31'))).toEqual(['2025-04-01', '2026-03-31']);
    expect(span(presetRange('Yesterday', '2026-03-01'))).toEqual(['2026-02-28', '2026-02-28']);
    // Sunday-first, as before: 1 April 2026 is a Wednesday.
    expect(span(presetRange('This week', '2026-04-01'))).toEqual(['2026-03-29', '2026-04-01']);
  });

  it('uses the device’s date without one', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOON_UTC);
    expect(iso(presetRange('Today').end)).toBe(iso(new Date(NOON_UTC)));
  });
});
