import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { ListingDetailApi } from '@services';
import { BookingBasket } from '@features/public/listing/booking/booking-basket';
import { RoomOffer } from '@features/public/listing/booking/room-offer';
import { AccountBookingEdit } from './booking-edit';
import { BookingEditModal } from './booking-edit-modal';
import { GuestBooking, GuestBookingPatch, MyBookingsApi, toGuestBooking } from './my-bookings-api';

const KING: RoomOffer = {
  id: 'KGJwMC',
  title: 'King size room',
  kind: 'private',
  capacity: 4,
  actualPrice: 12000,
  discountedPrice: 10000,
  images: [],
  bookable: true,
  available: 99,
};
const DORM: RoomOffer = {
  id: 'MqVuEl',
  title: 'Dormitory',
  kind: 'shared',
  capacity: 12,
  actualPrice: 2000,
  discountedPrice: 1200,
  images: [],
  bookable: true,
  available: 12,
};

/** The live booking: one king room for three, two dorm beds, 30 Sep – 25 Oct. */
function booking(status = 'pending', lines = true): GuestBooking {
  return toGuestBooking({
    id: 'RbNKwO',
    booking_ref: 'HH-2026-LI9V1AQC',
    guest_name: 'hassan Khossa',
    guest_phone: '923030491909',
    guest_email: 'guest@example.com',
    notes: 'Testing the notes',
    checkin_date: '2026-09-30T14:00:00.000+05:00',
    checkout_date: '2026-10-25T11:00:00.000+05:00',
    total_price: 310000,
    hostel: { id: 'MjvuEl', name: 'Backpacker', city: 'Lahore' },
    line_items: lines
      ? [
          { id: 'a', room_type_id: 'KGJwMC', room_type_name: 'King size room', guests: 3, quantity: 1, occupancy_type: 'private_room', subtotal: 250000 },
          { id: 'b', room_type_id: 'MqVuEl', room_type_name: 'Dormitory', guests: 2, quantity: 2, occupancy_type: 'shared', subtotal: 60000 },
        ]
      : [{ id: 'c', room_type_id: 'GONE', room_type_name: 'Family suite', guests: 2, quantity: 1, occupancy_type: 'private_room', subtotal: 1 }],
    status: { slug: status, name: status },
    disposition: { slug: 'pending', name: 'Pending' },
  });
}

const LISTING = {
  id: 'MjvuEl',
  name: 'Backpacker',
  currency: 'PKR',
  country: 'Pakistan',
  billingFrequency: 'night',
  accommodationType: 'backpacker',
  roomOffers: [KING, DORM],
};

function render(
  b: GuestBooking,
  update: (id: string, patch: GuestBookingPatch) => Observable<GuestBooking> = () => new Subject(),
) {
  TestBed.configureTestingModule({
    imports: [AccountBookingEdit],
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      { provide: MyBookingsApi, useValue: { get: vi.fn(() => of(b)), update: vi.fn(update) } },
      { provide: ListingDetailApi, useValue: { getBySlug: vi.fn(() => of(LISTING)) } },
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(convertToParamMap({ id: 'RbNKwO' })),
          snapshot: { paramMap: convertToParamMap({ id: 'RbNKwO' }) },
        },
      },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(AccountBookingEdit);
  fixture.detectChanges();
  const basket = fixture.debugElement.injector.get(BookingBasket);
  const review = () => {
    (fixture.componentInstance as unknown as { review(): void }).review();
    fixture.detectChanges();
    return fixture.debugElement.query(By.directive(BookingEditModal))?.componentInstance as BookingEditModal | undefined;
  };
  return { fixture, el: fixture.nativeElement as HTMLElement, basket, review, navigate };
}

const DETAILS = { guestName: 'hassan Khossa', guestPhone: '+923030491909', guestEmail: 'guest@example.com', notes: 'Testing the notes' };

describe('AccountBookingEdit', () => {
  it('starts from the booking: its dates, its rooms, and who is in them', () => {
    const { basket } = render(booking());

    expect(basket.checkIn()).toEqual(new Date(2026, 8, 30));
    expect(basket.checkOut()).toEqual(new Date(2026, 9, 25));
    expect(basket.lines().map((l) => [l.roomId, l.quantity, l.guests])).toEqual([
      ['KGJwMC', 1, 3],
      ['MqVuEl', 2, 2],
    ]);
  });

  it('shows the room picker and the rail, reworded to review a change', () => {
    const { el } = render(booking());
    expect(el.querySelector('hh-room-picker')).not.toBeNull();
    expect(el.querySelector('hh-booking-rail')?.textContent).toContain('userBookings.reviewChanges');
  });

  it('sends only the details when the stay is as it was', () => {
    const { review, fixture } = render(booking());
    review()?.saved.emit(DETAILS);
    fixture.detectChanges();

    expect(TestBed.inject(MyBookingsApi).update).toHaveBeenCalledWith('RbNKwO', DETAILS);
  });

  it('sends the new dates and rooms when they changed, and reviews the new total first', () => {
    const { basket, review, fixture } = render(booking());
    basket.checkOut.set(new Date(2026, 9, 3));
    basket.setQuantity(KING, 2);

    const modal = review();
    expect(modal?.stay()).toMatchObject({ nights: 3, previousTotal: 310000 });
    // 2 king rooms × 10,000 × 3 nights + 2 dorm beds × 1,200 × 3 nights.
    expect(modal?.stay()?.total).toBe(67200);

    modal?.saved.emit(DETAILS);
    fixture.detectChanges();

    const [, patch] = vi.mocked(TestBed.inject(MyBookingsApi).update).mock.calls[0];
    expect(patch.stay?.checkIn).toEqual(new Date(2026, 8, 30));
    expect(patch.stay?.checkOut).toEqual(new Date(2026, 9, 3));
    expect(patch.stay?.lines.map((l) => [l.roomId, l.quantity])).toEqual([
      ['KGJwMC', 2],
      ['MqVuEl', 2],
    ]);
  });

  it('counts a changed headcount as a changed stay', () => {
    const { basket, review } = render(booking());
    basket.setGuests('KGJwMC', 2);
    expect(review()?.stay()).not.toBeNull();
  });

  it('returns to the booking with what the server stored', () => {
    const stored = booking();
    const { review, fixture, navigate } = render(booking(), () => of(stored));
    review()?.saved.emit(DETAILS);
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith(['..'], expect.objectContaining({ state: { booking: stored } }));
  });

  it("keeps the review open with the server's reason when the change is refused", () => {
    const refused = () => throwError(() => ({ message: 'Only pending bookings can be updated' }));
    const { review, fixture, el, navigate } = render(booking(), refused);
    review()?.saved.emit(DETAILS);
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
    expect(el.querySelector('app-booking-edit-modal [role="alert"]')?.textContent).toContain(
      'Only pending bookings can be updated',
    );
  });

  describe('a confirmed booking', () => {
    // Check-in is 14:00 Lahore on 30 Sep 2026. Only Date is faked; Angular's own timers run.
    afterEach(() => vi.useRealTimers());
    const at = (iso: string) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(iso));
    };

    it('can be changed more than 3 days out, and the review warns it goes back for confirmation', () => {
      at('2026-09-20T09:00:00Z');
      const { el, review } = render(booking('confirmed'));
      expect(el.querySelector('hh-room-picker')).not.toBeNull();
      expect(review()?.reconfirm()).toBe(true);
    });

    it('cannot be changed inside 3 days, and the page says that is why', () => {
      at('2026-09-28T09:00:00Z');
      const { el } = render(booking('confirmed'));
      expect(el.querySelector('hh-room-picker')).toBeNull();
      expect(el.textContent).toContain('userBookings.withinCutoff');
    });
  });

  it('offers no controls once the booking is checked in', () => {
    const { el } = render(booking('checked-in'));
    expect(el.querySelector('hh-room-picker')).toBeNull();
    expect(el.textContent).toContain('userBookings.noLongerEditable');
  });

  it('does not warn about reconfirming a pending booking', () => {
    const { review } = render(booking());
    expect(review()?.reconfirm()).toBe(false);
  });

  it('says which rooms the hostel no longer offers, rather than dropping them silently', () => {
    const { el, basket } = render(booking('pending', false));
    expect(basket.lines()).toEqual([]);
    expect(el.textContent).toContain('userBookings.roomsNoLongerOffered');
  });
});
