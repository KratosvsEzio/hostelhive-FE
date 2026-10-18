import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { AccountBookings } from './bookings';
import { MyBookingsApi, toGuestBooking } from './my-bookings-api';

/** Renders the list with one booking of `nights` nights for `guests` guests; returns its text. */
function listText(nights: number, guests: number): string {
  const booking = toGuestBooking({
    id: 'RbNKwO',
    booking_ref: 'HH-2026-LI9V1AQC',
    checkin_date: '2026-09-30T14:00:00.000+05:00',
    checkout_date: '2026-10-25T11:00:00.000+05:00',
    nights,
    guests,
    total_price: 310000,
    balance_due: 310000,
    hostel: { id: 'MjvuEl', name: 'Backpacker', city: 'Lahore' },
    disposition: { name: 'Pending', slug: 'pending' },
  });
  TestBed.configureTestingModule({
    imports: [AccountBookings],
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      {
        provide: MyBookingsApi,
        useValue: { list: () => of({ bookings: [booking], page: { page: 1, total: 1, totalPages: 1, hasNextPage: false } }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(AccountBookings);
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

/** The app has no plural rules, so a count of one asks for its own singular key. */
describe('AccountBookings row counts', () => {
  it.each([
    [1, 'common.nGuestsOne'],
    [2, 'common.nGuests'],
  ])('shows %i guest(s) as %s', (guests, key) => {
    expect(listText(3, guests).match(/common\.nGuests(?:One)?/g)).toEqual([key]);
  });

  it.each([
    [1, 'common.nNightsOne'],
    [2, 'common.nNights'],
  ])('shows %i night(s) as %s', (nights, key) => {
    expect(listText(nights, 2).match(/common\.nNights(?:One)?/g)).toEqual([key]);
  });
});
