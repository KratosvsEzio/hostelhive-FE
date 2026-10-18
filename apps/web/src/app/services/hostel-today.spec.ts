import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject } from 'rxjs';
import { HostPropertyStore } from './host-property-store';
import { followToday, hostelZone, selectedHostelToday, selectedHostelZone } from './hostel-today';

/** Two zones a full day apart, so every pair below differs on any device. */
const EAST = 'Pacific/Kiritimati'; // UTC+14
const WEST = 'Pacific/Pago_Pago'; // UTC-11
/** EAST is already 16 March, WEST still 15 March. */
const NOON_UTC = Date.UTC(2026, 2, 15, 12, 0, 0);

afterEach(() => vi.useRealTimers());

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function deviceDay(instant: number): string {
  const d = new Date(instant);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A store whose zone reads stay open until the test answers them. */
class StoreStub {
  readonly selected = signal('hA');
  readonly reads: string[] = [];
  readonly answers = new Map<string, Subject<string | null>>();
  timeZoneOf(id: string): Observable<string | null> {
    this.reads.push(id);
    const s = new Subject<string | null>();
    this.answers.set(id, s);
    return s;
  }
  answer(id: string, zone: string | null): void {
    this.answers.get(id)?.next(zone);
  }
}

@Component({ template: '' })
class Host {
  readonly openedAt = new Date();
  readonly zone = selectedHostelZone();
  readonly today = selectedHostelToday(this.openedAt, this.zone);
  readonly otherId = signal<string | null>('hB');
  readonly otherZone = hostelZone(this.otherId);
  readonly field = signal('');
  readonly moves: [string, string][] = [];
  constructor() {
    this.field.set(this.today());
    followToday(this.today, (from, to) => {
      this.moves.push([from, to]);
      if (this.field() === from) this.field.set(to);
    });
  }
}

function setUp() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOON_UTC);
  const store = new StoreStub();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: HostPropertyStore, useValue: store }] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const settle = () => {
    TestBed.tick();
    fixture.detectChanges();
  };
  return { store, host: fixture.componentInstance, settle };
}

describe('selectedHostelZone / selectedHostelToday', () => {
  it('is pending, on the device date, until the zone is read', () => {
    const { store, host } = setUp();
    expect(store.reads).toContain('hA');
    expect(host.zone()).toBeUndefined();
    expect(host.today()).toBe(deviceDay(NOON_UTC));
  });

  it('gives the hostel’s date east of the device', () => {
    const { store, host, settle } = setUp();
    store.answer('hA', EAST);
    settle();
    expect(host.zone()).toBe(EAST);
    expect(host.today()).toBe('2026-03-16');
  });

  it('gives the hostel’s date west of the device', () => {
    const { store, host, settle } = setUp();
    store.answer('hA', WEST);
    settle();
    expect(host.today()).toBe('2026-03-15');
  });

  it('falls back to the device date when the hostel has no zone', () => {
    const { store, host, settle } = setUp();
    store.answer('hA', null);
    settle();
    expect(host.zone()).toBeNull();
    expect(host.today()).toBe(deviceDay(NOON_UTC));
  });

  it('counts from when the screen opened, not when the zone arrived', () => {
    const { store, host, settle } = setUp();
    vi.setSystemTime(NOON_UTC + 2 * 86_400_000);
    store.answer('hA', EAST);
    settle();
    expect(host.today()).toBe('2026-03-16');
  });

  it('reads the newly selected hostel’s zone when the selection changes', () => {
    const { store, host, settle } = setUp();
    store.answer('hA', WEST);
    settle();
    store.selected.set('hC');
    settle();
    expect(host.zone()).toBeUndefined();
    store.answer('hC', EAST);
    settle();
    expect(host.today()).toBe('2026-03-16');
  });

  it('is null, not pending, with no hostel selected', () => {
    const { store, host, settle } = setUp();
    store.selected.set('');
    settle();
    expect(host.zone()).toBeNull();
  });
});

describe('hostelZone', () => {
  it('reads the hostel it is given, not the selected one', () => {
    const { store, host, settle } = setUp();
    expect(store.reads).toContain('hB');
    store.answer('hB', EAST);
    settle();
    expect(host.otherZone()).toBe(EAST);
  });
});

describe('followToday', () => {
  it('moves an untouched default onto the hostel’s date once the zone lands', () => {
    const { store, host, settle } = setUp();
    store.answer('hA', EAST);
    settle();
    expect(host.moves).toEqual([[deviceDay(NOON_UTC), '2026-03-16']]);
    expect(host.field()).toBe('2026-03-16');
  });

  it('leaves a value the host already changed', () => {
    const { store, host, settle } = setUp();
    host.field.set('2026-01-01');
    store.answer('hA', EAST);
    settle();
    expect(host.field()).toBe('2026-01-01');
  });

  it('does not fire when the hostel’s date is the device’s', () => {
    const { store, host, settle } = setUp();
    store.answer('hA', null);
    settle();
    expect(host.moves).toEqual([]);
  });
});
