import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { AccountBookingDetail } from './booking-detail';
import { GuestBooking, MyBookingsApi, toGuestBooking } from './my-bookings-api';

function booking(over: Partial<GuestBooking> = {}): GuestBooking {
  return {
    ...toGuestBooking({
      id: 'RbNKwO',
      booking_ref: 'HH-2026-LI9V1AQC',
      guest_name: 'Hassan',
      checkin_date: '2026-09-30T14:00:00.000+05:00',
      checkout_date: '2026-10-25T11:00:00.000+05:00',
      nights: 25,
      guests: 5,
      total_price: 310000,
      balance_due: 310000,
      hostel: { id: 'MjvuEl', name: 'Backpacker', city: 'Lahore' },
      line_items: [{ id: 'l1', room_type_name: 'King size room', guests: 3, quantity: 1, occupancy_type: 'private_room', subtotal: 250000 }],
      disposition: { name: 'Pending', slug: 'pending' },
    }),
    ...over,
  };
}

function render(get: (id: string) => Observable<GuestBooking>) {
  TestBed.configureTestingModule({
    imports: [AccountBookingDetail],
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      { provide: MyBookingsApi, useValue: { get: vi.fn(get) } },
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(convertToParamMap({ id: 'RbNKwO' })),
          snapshot: { paramMap: convertToParamMap({ id: 'RbNKwO' }) },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(AccountBookingDetail);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('AccountBookingDetail', () => {
  afterEach(() => history.replaceState(null, ''));

  it('fetches the booking by the id in the route and shows it', () => {
    const { el } = render(() => of(booking()));

    expect(TestBed.inject(MyBookingsApi).get).toHaveBeenCalledWith('RbNKwO');
    expect(el.querySelector('h1')?.textContent).toContain('Backpacker');
    expect(el.textContent).toContain('HH-2026-LI9V1AQC');
    expect(el.textContent).toContain('King size room');
  });

  it('draws the booking the list handed over before the fetch answers', () => {
    history.replaceState({ booking: booking({ hostel: { id: 'MjvuEl', name: 'From the list', place: '' } }) }, '');
    const pending = new Subject<GuestBooking>();
    const { el } = render(() => pending);

    expect(el.querySelector('h1')?.textContent).toContain('From the list');
    expect(el.querySelector('hh-skeleton')).toBeNull();
  });

  it('ignores a handed-over booking that is a different one', () => {
    history.replaceState({ booking: booking({ id: 'other' }) }, '');
    const { el } = render(() => new Subject<GuestBooking>());

    expect(el.querySelector('h1')).toBeNull();
    expect(el.querySelector('hh-skeleton')).not.toBeNull();
  });

  it('keeps the handed-over booking on screen when the refresh fails', () => {
    history.replaceState({ booking: booking() }, '');
    const { el } = render(() => throwError(() => new Error('500')));

    expect(el.querySelector('h1')?.textContent).toContain('Backpacker');
    expect(el.querySelector('hh-error-state')).toBeNull();
  });

  it('shows the error state when there is nothing to show', () => {
    const { el } = render(() => throwError(() => new Error('404')));

    expect(el.querySelector('hh-error-state')).not.toBeNull();
    expect(el.textContent).not.toContain('HH-2026-LI9V1AQC');
  });

  it('marks the current step of the track', () => {
    const { el } = render(() => of(booking({ stage: 'assigned' })));

    const current = el.querySelector('[aria-current="step"]');
    expect(current?.textContent).toContain('userBookings.stageAssigned');
  });

  it('swaps the track for a note when the booking was cancelled', () => {
    const { el } = render(() => of(booking({ stage: 'cancelled' })));

    expect(el.querySelector('ol')).toBeNull();
    expect(el.textContent).toContain('userBookings.cancelledNote');
  });
});
