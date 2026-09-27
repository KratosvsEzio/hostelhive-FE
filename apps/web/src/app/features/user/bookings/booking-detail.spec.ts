import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { AccountBookingDetail } from './booking-detail';
import { ListingDetailApi } from '@services';
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

interface ListingStub {
  images: string[];
  lat: number;
  lng: number;
  address: string;
  currency?: string;
  publicPhones?: string[];
}

function render(
  get: (id: string) => Observable<GuestBooking>,
  listing: () => Observable<ListingStub | undefined> = () => of(undefined),
) {
  TestBed.configureTestingModule({
    imports: [AccountBookingDetail],
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      { provide: MyBookingsApi, useValue: { get: vi.fn(get) } },
      { provide: ListingDetailApi, useValue: { getBySlug: vi.fn(listing) } },
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

  describe('the hostel photo and location', () => {
    const LISTING: ListingStub = {
      images: ['https://cdn.example/primary.jpg', 'https://cdn.example/second.jpg'],
      lat: 31.5,
      lng: 74.3,
      address: '355-G1, Bahria Orchard',
    };
    const withPin = () =>
      booking({ hostel: { id: 'MjvuEl', name: 'Backpacker', place: 'Lahore', address: '355-G1', lat: 31.31401, lng: 74.23497 } });
    const mapsHref = (el: HTMLElement) =>
      el.querySelector<HTMLAnchorElement>('a[href^="https://www.google.com/maps"]')?.getAttribute('href');

    it("shows the listing's primary photo, fetched by the booking's hostel id", () => {
      const { el } = render(() => of(booking()), () => of(LISTING));

      expect(TestBed.inject(ListingDetailApi).getBySlug).toHaveBeenCalledWith('MjvuEl');
      expect(el.querySelector('header img')?.getAttribute('src')).toBe('https://cdn.example/primary.jpg');
    });

    it('holds the space with a placeholder when there is no photo', () => {
      const { el } = render(() => of(booking()), () => throwError(() => new Error('500')));

      expect(el.querySelector('header img')).toBeNull();
      expect(el.querySelector('header hh-photo-placeholder')).not.toBeNull();
      // The listing failing is decoration failing: the booking is all still there.
      expect(el.textContent).toContain('HH-2026-LI9V1AQC');
    });

    it('falls back to the placeholder when the photo will not load', () => {
      const { fixture, el } = render(() => of(booking()), () => of(LISTING));

      el.querySelector('header img')?.dispatchEvent(new Event('error'));
      fixture.detectChanges();

      expect(el.querySelector('header img')).toBeNull();
      expect(el.querySelector('header hh-photo-placeholder')).not.toBeNull();
    });

    it("links to the booking's own coordinates, opening a new tab", () => {
      const { el } = render(() => of(withPin()), () => of(LISTING));

      expect(mapsHref(el)).toBe('https://www.google.com/maps/search/?api=1&query=31.31401,74.23497');
      const link = el.querySelector('a[href^="https://www.google.com/maps"]');
      expect(link?.getAttribute('target')).toBe('_blank');
      expect(link?.getAttribute('rel')).toContain('noopener');
    });

    it("uses the listing's coordinates when the booking has none", () => {
      const { el } = render(() => of(booking()), () => of(LISTING));

      expect(mapsHref(el)).toBe('https://www.google.com/maps/search/?api=1&query=31.5,74.3');
    });

    it('searches for the hostel by name and place when nobody has coordinates', () => {
      const { el } = render(() => of(booking()));

      expect(mapsHref(el)).toBe(
        'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Backpacker, Lahore'),
      );
    });
  });

  describe("the hostel's phone", () => {
    const LISTING = { images: [], lat: 0, lng: 0, address: '' };
    const telLinks = (el: HTMLElement) =>
      [...el.querySelectorAll<HTMLAnchorElement>('header a[href^="tel:"]')].map((a) => [
        a.getAttribute('href'),
        a.textContent?.trim(),
      ]);

    it('lists each number as a link that dials it', () => {
      const { el } = render(
        () => of(booking()),
        () => of({ ...LISTING, publicPhones: ['+92 300 1234567', '042-111-222-333'] }),
      );

      expect(telLinks(el)).toEqual([
        ['tel:+923001234567', '+92 300 1234567'],
        ['tel:042111222333', '042-111-222-333'],
      ]);
      expect(el.textContent).not.toContain('userBookings.noHostelPhone');
    });

    it('says so when the hostel has shared no number', () => {
      const { el } = render(() => of(booking()), () => of({ ...LISTING, publicPhones: [] }));

      expect(telLinks(el)).toEqual([]);
      expect(el.textContent).toContain('userBookings.noHostelPhone');
    });

    it('says nothing about the phone while the hostel is still loading', () => {
      const { el } = render(() => of(booking()), () => new Subject<ListingStub>());

      expect(el.textContent).not.toContain('userBookings.noHostelPhone');
    });
  });

  describe('money', () => {
    const LISTING = { images: [], lat: 0, lng: 0, address: '' };
    const priceText = (el: HTMLElement) =>
      el.querySelector('[aria-labelledby="booking-price"]')?.textContent?.replace(/\s+/g, ' ') ?? '';

    it("prices in the hostel's own currency", () => {
      const { el } = render(() => of(booking({ currency: 'PKR' })), () => of({ ...LISTING, currency: 'USD' }));

      expect(priceText(el)).toContain('$ 310,000');
      expect(priceText(el)).not.toContain('Rs');
    });

    it("uses the booking's currency until the hostel answers", () => {
      const { el } = render(() => of(booking({ currency: 'USD' })), () => new Subject<ListingStub>());

      expect(priceText(el)).toContain('$ 310,000');
    });

    it('falls back to the default currency when nobody says', () => {
      const { el } = render(() => of(booking({ currency: '' })));

      expect(priceText(el)).toContain('Rs 310,000');
    });

    it('shows the total and what is due, and not the deposit or what was paid', () => {
      const { el } = render(() => of(booking({ deposit: 31000, paid: 0 })));

      expect(priceText(el)).toContain('userBookings.total');
      expect(priceText(el)).toContain('userBookings.dueAtHostel');
      expect(priceText(el)).not.toContain('userBookings.deposit');
      expect(priceText(el)).not.toContain('userBookings.paid');
    });
  });
});
