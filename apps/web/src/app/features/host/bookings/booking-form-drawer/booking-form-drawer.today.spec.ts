import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, Subject } from 'rxjs';
import { HostelsApi, HostPropertyStore } from '@services';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { HostBookingsApi } from '../host-bookings-api';
import { BookingFormDrawer } from './booking-form-drawer';

const EAST = 'Pacific/Kiritimati';
const WEST = 'Pacific/Pago_Pago';
const KARACHI = 'Asia/Karachi';

const I1 = Date.UTC(2026, 2, 31, 12);
const IY = Date.UTC(2026, 11, 31, 12);
const K = Date.UTC(2026, 2, 31, 20, 30);

const ROOM_TYPE = {
  id: 'rt1',
  name: 'Deluxe Dorm',
  occupancy_type: 'shared_room',
  capacity: 6,
  price: 1500,
  is_bookable: true,
};

/** The drawer's protected surface, read the way the template reads it. */
interface DrawerInternals {
  checkIn(): string | null;
  checkOut(): string | null;
  nights(): number;
  canSave(): boolean;
  guestName: { set(v: string): void };
  guestPhone: { set(v: string): void };
  onRoomsPicked(ids: string[]): void;
  onRangePicked(range: { from: string | null; to: string | null }): void;
}

/** The device's own calendar day for an instant, as `yyyy-MM-dd`. */
function deviceDay(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

describe('BookingFormDrawer opening day', () => {
  let fixture: ComponentFixture<BookingFormDrawer>;

  const drawer = () => fixture.componentInstance as unknown as DrawerInternals;
  const el = () => fixture.nativeElement as HTMLElement;
  const picker = () => el().querySelector('hh-date-range-picker');

  /** Fakes only `Date`, before the component exists: the drawer reads the clock once on construction. */
  function mount(now: number, timeZoneOf: () => Observable<string | null>): void {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    TestBed.configureTestingModule({
      imports: [BookingFormDrawer],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        { provide: HostelsApi, useValue: { getById: () => of({ id: 'h1', room_types: [ROOM_TYPE] }) } },
        { provide: HostBookingsApi, useValue: { create: vi.fn(() => of({ id: 'b1' })) } },
        { provide: HostPropertyStore, useValue: { timeZoneOf: vi.fn(timeZoneOf) } },
      ],
    });
    fixture = TestBed.createComponent(BookingFormDrawer);
    fixture.componentRef.setInput('hostelId', 'h1');
    fixture.detectChanges();
  }

  function fillValidForm(): void {
    drawer().guestName.set('Ali Raza');
    drawer().guestPhone.set('923001234567');
    drawer().onRoomsPicked(['rt1']);
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    { zone: EAST, from: '2026-04-01', to: '2026-04-02' },
    { zone: WEST, from: '2026-03-31', to: '2026-04-01' },
  ])('defaults to tonight and tomorrow on the hostel calendar in $zone', ({ zone, from, to }) => {
    mount(I1, () => of(zone));
    expect(drawer().checkIn()).toBe(from);
    expect(drawer().checkOut()).toBe(to);
    expect(drawer().nights()).toBe(1);
  });

  it.each([
    { zone: EAST, from: '2027-01-01', to: '2027-01-02' },
    { zone: WEST, from: '2026-12-31', to: '2027-01-01' },
  ])('carries the default check-out across the new year in $zone', ({ zone, from, to }) => {
    mount(IY, () => of(zone));
    expect(drawer().checkIn()).toBe(from);
    expect(drawer().checkOut()).toBe(to);
    expect(drawer().nights()).toBe(1);
  });

  it('shows a skeleton while the zone is pending, then moves an untouched default onto the hostel day', () => {
    const zone$ = new Subject<string | null>();
    mount(I1, () => zone$);
    expect(picker()).toBeNull();
    expect(el().querySelector('hh-skeleton')).not.toBeNull();

    zone$.next(EAST);
    fixture.detectChanges();

    expect(picker()).not.toBeNull();
    expect(drawer().checkIn()).toBe('2026-04-01');
    expect(drawer().checkOut()).toBe('2026-04-02');
  });

  it('keeps a range the host picked when the zone lands late', () => {
    const zone$ = new Subject<string | null>();
    mount(I1, () => zone$);
    drawer().onRangePicked({ from: '2026-05-10', to: '2026-05-13' });

    zone$.next(EAST);
    fixture.detectChanges();

    expect(drawer().checkIn()).toBe('2026-05-10');
    expect(drawer().checkOut()).toBe('2026-05-13');
    expect(drawer().nights()).toBe(3);
  });

  it('keeps a cleared range empty when the zone lands late', () => {
    const zone$ = new Subject<string | null>();
    mount(I1, () => zone$);
    drawer().onRangePicked({ from: null, to: null });

    zone$.next(EAST);
    fixture.detectChanges();

    expect(drawer().checkIn()).toBeNull();
    expect(drawer().checkOut()).toBeNull();
    expect(drawer().nights()).toBe(0);
  });

  it('cannot be saved while the zone is pending, and can once it lands', () => {
    const zone$ = new Subject<string | null>();
    mount(I1, () => zone$);
    fillValidForm();
    expect(drawer().canSave()).toBe(false);

    zone$.next(WEST);
    fixture.detectChanges();

    expect(drawer().canSave()).toBe(true);
  });

  it('falls back to the device date without a skeleton when the hostel has no zone', () => {
    mount(I1, () => of(null));
    expect(picker()).not.toBeNull();
    expect(el().querySelector('hh-skeleton')).toBeNull();
    expect(drawer().checkIn()).toBe(deviceDay(I1));
    expect(drawer().checkOut()).toBe(deviceDay(I1 + 24 * 60 * 60 * 1000));
    expect(drawer().nights()).toBe(1);
  });

  it('defaults check-in to the hostel day in Karachi after midnight there', () => {
    mount(K, () => of(KARACHI));
    expect(drawer().checkIn()).toBe('2026-04-01');
    expect(drawer().checkOut()).toBe('2026-04-02');
  });

  it('is unchanged when the hostel zone is the device zone', () => {
    const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    mount(I1, () => of(deviceZone));
    expect(drawer().checkIn()).toBe(deviceDay(I1));
    expect(drawer().nights()).toBe(1);
  });
});
