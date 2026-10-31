import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { RefusalKind, refusalError } from '@app/testing/backend-refusals';
import { kindsShowing } from '@app/testing/load-refusal-surface';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { HostPropertyStore } from '@services';
import { BookingCalendar } from './booking-calendar';
import { BookingCalendar as CalendarData, HostBooking, HostBookingsApi } from './host-bookings-api';
import { isoDate } from './booking-month';

const TODAY = isoDate(new Date());

function booking(slug: string, over: Partial<HostBooking> = {}): HostBooking {
  return {
    id: 'b1',
    ref: 'HH-1',
    guest: { name: 'Ali Raza', phone: '923001234567', email: '' },
    checkIn: TODAY,
    checkOut: TODAY,
    nights: 1,
    guests: 2,
    roomType: { name: 'Dormitory', occupancyType: 'shared_room', capacity: 4, price: 3600 },
    total: 7200,
    paid: 0,
    balanceDue: 7200,
    room: null,
    renter: null,
    status: { name: slug, slug },
    disposition: { name: slug, slug },
    notes: '',
    lines: [],
    currency: 'PKR',
    cancellationReason: '',
    occupancies: [],
    source: '',
    createdAt: TODAY,
    confirmationPdfUrl: '',
    ...over,
  };
}

class ApiStub {
  calendar = vi.fn(
    (): Observable<CalendarData> =>
      of({
        days: [{ date: TODAY, checkins: 3, checkouts: 0, byDisposition: { pending: 2, confirmed: 1 } }],
        totals: { pending: 2, confirmed: 1 },
        revenue: {},
      }),
  );
  bookingsOn = vi.fn((): Observable<HostBooking[]> => of([booking('pending'), booking('pending', { id: 'b2' })]));
}

/**
 * A cancel (or any move) answered 200 carries the updated booking, and the month counts each
 * booking once on its check-in day — so the day's numbers move locally, with no second request.
 */
describe('BookingCalendar — applyChange', () => {
  let api: ApiStub;
  let comp: BookingCalendar;

  beforeEach(() => {
    api = new ApiStub();
    TestBed.configureTestingModule({
      imports: [BookingCalendar],
      providers: [
        provideI18nTesting(),
        { provide: HostBookingsApi, useValue: api },
        { provide: HostPropertyStore, useValue: { timeZoneOf: () => of(null) } },
      ],
    });
    const fixture = TestBed.createComponent(BookingCalendar);
    fixture.componentRef.setInput('hostelId', 'MjvuEl');
    fixture.detectChanges();
    comp = fixture.componentInstance;
  });

  const today = () => comp['month']().days.find((d) => d.date === TODAY);

  it('moves the cancelled booking out of pending and into cancelled on its check-in day', () => {
    expect(today()?.counts.pending).toBe(2);

    comp.applyChange(booking('pending'), booking('cancelled'));

    expect(today()?.counts.pending).toBe(1);
    expect(today()?.counts.cancelled).toBe(1);
    expect(today()?.counts.confirmed).toBe(1);
    expect(comp['month']().totals.cancelled).toBe(1);
  });

  it('drops the card from the day ledger without refetching anything', () => {
    expect(comp['needsAction']().map((b) => b.id)).toEqual(['b1', 'b2']);

    comp.applyChange(booking('pending'), booking('cancelled'));

    expect(comp['needsAction']().map((b) => b.id)).toEqual(['b2']);
    expect(api.calendar).toHaveBeenCalledTimes(1);
    expect(api.bookingsOn).toHaveBeenCalledTimes(1);
  });

  it('leaves the counts alone when the lane did not change', () => {
    comp.applyChange(booking('confirmed'), booking('confirmed', { paid: 7200 }));
    expect(today()?.counts.confirmed).toBe(1);
    expect(today()?.counts.pending).toBe(2);
  });
});

const QUIET = { suppressErrorToast: true };
const MONTH_GRID = '.grid.grid-cols-7';
const PANEL = 'hh-permission-refused';

/** Opens the calendar with `api`, the way the page mounts it for one hostel. */
function openWith(api: ApiStub): HTMLElement {
  TestBed.configureTestingModule({
    imports: [BookingCalendar],
    providers: [
      provideI18nTesting(),
      { provide: HostBookingsApi, useValue: api },
      { provide: HostPropertyStore, useValue: { timeZoneOf: () => of(null) } },
    ],
  });
  const fixture = TestBed.createComponent(BookingCalendar);
  fixture.componentRef.setInput('hostelId', 'MjvuEl');
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

/** The calendar with one of its two reads refused as the real interceptor shapes `kind`. */
function openRefused(read: 'calendar' | 'bookingsOn', kind: RefusalKind): HTMLElement {
  const api = new ApiStub();
  api[read] = vi.fn(() => throwError(() => refusalError(kind))) as never;
  return openWith(api);
}

const OTHER_KINDS = [...kindsShowing('error'), ...kindsShowing('network')];

describe('BookingCalendar when a read is refused', () => {
  describe('the month', () => {
    it.each(kindsShowing('permission'))('a %s refusal shows one permission panel and no grid or ledger', (kind) => {
      const el = openRefused('calendar', kind);

      expect(el.querySelectorAll(PANEL)).toHaveLength(1);
      expect(el.querySelector('aside')).toBeNull();
      expect(el.querySelector(MONTH_GRID)).toBeNull();
      expect(el.querySelector('button')).toBeNull();
    });

    it.each(OTHER_KINDS)('a %s failure keeps the month error with Try again and no panel', (kind) => {
      const el = openRefused('calendar', kind);

      expect(el.querySelector(PANEL)).toBeNull();
      expect(el.textContent).toContain('hostBookings.thisMonthSCalendarCould');
      expect(el.textContent).toContain('common.tryAgain');
    });
  });

  describe('the selected day', () => {
    it.each(kindsShowing('permission'))('a %s refusal puts one panel in the ledger and keeps the grid', (kind) => {
      const el = openRefused('bookingsOn', kind);

      expect(el.querySelectorAll(PANEL)).toHaveLength(1);
      expect(el.querySelector('aside')?.querySelector(PANEL)).not.toBeNull();
      expect(el.querySelector(MONTH_GRID)).not.toBeNull();
    });

    it.each(OTHER_KINDS)('a %s failure shows no permission panel and keeps the grid', (kind) => {
      const el = openRefused('bookingsOn', kind);

      expect(el.querySelector(PANEL)).toBeNull();
      expect(el.querySelector(MONTH_GRID)).not.toBeNull();
    });
  });

  it('asks for the month and the day without the global error toast', () => {
    const api = new ApiStub();
    openWith(api);

    expect(api.calendar).toHaveBeenCalledTimes(1);
    expect((api.calendar.mock.calls[0] as unknown[]).at(-1)).toEqual(QUIET);
    expect(api.bookingsOn).toHaveBeenCalledTimes(1);
    expect((api.bookingsOn.mock.calls[0] as unknown[]).at(-1)).toEqual(QUIET);
  });
});
