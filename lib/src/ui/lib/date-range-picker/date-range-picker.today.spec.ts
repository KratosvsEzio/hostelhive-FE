import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslocoTesting } from '../../../testing/provide-transloco-testing';
import { DateRangePicker, DateRangePreset, buildPresets } from './date-range-picker';

/** Noon UTC, 31 March 2026: a hostel east of the date line is already on 1 April. */
const NOON_UTC = Date.UTC(2026, 2, 31, 12, 0, 0);

afterEach(() => vi.useRealTimers());

interface Internals {
  presetList(): DateRangePreset[];
  monthViews(): { key: string; cells: ({ iso: string; today: boolean } | null)[] }[];
  toggle(): void;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function deviceDay(instant: number): string {
  const d = new Date(instant);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function open(today: string | null): Internals {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOON_UTC);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideRouter([]), provideTranslocoTesting()] });
  const fixture = TestBed.createComponent(DateRangePicker);
  fixture.componentRef.setInput('today', today);
  fixture.detectChanges();
  const picker = fixture.componentInstance as unknown as Internals;
  picker.toggle();
  fixture.detectChanges();
  return picker;
}

const ringed = (p: Internals) =>
  p.monthViews().flatMap((m) => m.cells).filter((c) => c?.today).map((c) => c!.iso);
const preset = (p: Internals, label: string) => p.presetList().find((x) => x.label === label);

/** The shared range picker (expenses filter, booking form) takes "today" from its caller. */
describe('DateRangePicker today', () => {
  it('rings the day it is given, opens on its month, and counts the presets from it', () => {
    const p = open('2026-04-01');
    expect(ringed(p)).toEqual(['2026-04-01']);
    expect(p.monthViews()[0].key).toBe('2026-3');
    expect(preset(p, 'Today')).toMatchObject({ from: '2026-04-01', to: '2026-04-01' });
    expect(preset(p, 'This month')).toMatchObject({ from: '2026-04-01', to: '2026-04-30' });
    expect(preset(p, 'Yesterday')).toMatchObject({ from: '2026-03-31', to: '2026-03-31' });
  });

  it('works the other side of the device too', () => {
    const p = open('2026-03-30');
    expect(ringed(p)).toEqual(['2026-03-30']);
    expect(p.monthViews()[0].key).toBe('2026-2');
    expect(preset(p, 'Today')).toMatchObject({ from: '2026-03-30', to: '2026-03-30' });
  });

  it('falls back to the device’s date when none is given', () => {
    const p = open(null);
    const device = deviceDay(NOON_UTC);
    expect(ringed(p)).toEqual([device]);
    expect(preset(p, 'Today')).toMatchObject({ from: device, to: device });
  });

  it('builds the week presets from Monday', () => {
    // 1 April 2026 is a Wednesday.
    const list = buildPresets(new Date(2026, 3, 1));
    expect(list.find((x) => x.label === 'This week')).toMatchObject({ from: '2026-03-30', to: '2026-04-01' });
    expect(list.find((x) => x.label === 'Last week')).toMatchObject({ from: '2026-03-23', to: '2026-03-29' });
  });
});
