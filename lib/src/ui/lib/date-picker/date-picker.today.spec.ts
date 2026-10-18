import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslocoTesting } from '../../../testing/provide-transloco-testing';
import { DatePicker } from './date-picker';

/** Noon UTC, 31 March 2026: a hostel east of the date line is already on 1 April. */
const NOON_UTC = Date.UTC(2026, 2, 31, 12, 0, 0);

afterEach(() => vi.useRealTimers());

interface Internals {
  monthView(): { key: string; cells: ({ iso: string; today: boolean } | null)[] };
  toggle(): void;
  pickTime(time: string | null): void;
  value(): string | null;
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
  const fixture = TestBed.createComponent(DatePicker);
  fixture.componentRef.setInput('today', today);
  fixture.componentRef.setInput('withTime', true);
  fixture.detectChanges();
  const picker = fixture.componentInstance as unknown as Internals;
  picker.toggle();
  fixture.detectChanges();
  return picker;
}

const marked = (p: Internals) => p.monthView().cells.filter((c) => c?.today).map((c) => c!.iso);

/** The single date picker on console forms takes "today" from its caller. */
describe('DatePicker today', () => {
  it('marks the day it is given and opens on its month', () => {
    const p = open('2026-04-01');
    expect(marked(p)).toEqual(['2026-04-01']);
    expect(p.monthView().key).toBe('2026-3');
  });

  it('puts a time-first pick on the day it is given', () => {
    const p = open('2026-04-01');
    p.pickTime('09:30');
    expect(p.value()).toBe('2026-04-01T09:30');
  });

  it('falls back to the device’s date when none is given', () => {
    const p = open(null);
    expect(marked(p)).toEqual([deviceDay(NOON_UTC)]);
    p.pickTime('09:30');
    expect(p.value()).toBe(`${deviceDay(NOON_UTC)}T09:30`);
  });
});
