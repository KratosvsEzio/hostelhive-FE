import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
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
    deposit: 0,
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
      providers: [provideI18nTesting(), { provide: HostBookingsApi, useValue: api }],
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
