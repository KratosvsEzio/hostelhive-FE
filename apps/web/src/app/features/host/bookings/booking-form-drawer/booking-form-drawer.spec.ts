import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { HostelsApi } from '@services';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { HostBookingsApi } from '../host-bookings-api';
import { BookingFormDrawer } from './booking-form-drawer';

const API_URL = 'http://localhost/api/host/hostels/h1/bookings';
const DETAIL_URL = 'http://localhost/public/hostel_detail/h1';
const MAPPER_TEXT = 'Hostel response did not include a hostel.';

/** An error shaped the way the error interceptor rethrows it. */
function apiError(status: number, serverMessages?: readonly string[], url = API_URL, code = 'unknown_error') {
  return {
    status,
    code,
    message: serverMessages?.join(' ') ?? `Http failure response for ${url}: ${status} Forbidden`,
    serverMessages,
    method: 'POST',
  };
}

const ROOM_TYPE = {
  id: 'rt1',
  name: 'Deluxe Dorm',
  occupancy_type: 'shared_room',
  capacity: 6,
  price: 1500,
  is_bookable: true,
};

class HostelsStub {
  detail: () => Observable<unknown> = () => of({ id: 'h1', room_types: [ROOM_TYPE] });
  getById = vi.fn(() => this.detail());
}

class BookingsStub {
  failure: unknown = null;
  create = vi.fn(() => (this.failure ? throwError(() => this.failure) : of({ id: 'b1' })));
}

/** The drawer's protected surface, read the way the template reads it. */
interface DrawerInternals {
  guestName: { set(v: string): void };
  guestPhone: { set(v: string): void };
  onRoomsPicked(ids: string[]): void;
  save(): void;
}

describe('BookingFormDrawer', () => {
  let fixture: ComponentFixture<BookingFormDrawer>;
  let hostels: HostelsStub;
  let bookings: BookingsStub;

  function render(): HTMLElement {
    TestBed.configureTestingModule({
      imports: [BookingFormDrawer],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        { provide: HostelsApi, useValue: hostels },
        { provide: HostBookingsApi, useValue: bookings },
      ],
    });
    fixture = TestBed.createComponent(BookingFormDrawer);
    fixture.componentRef.setInput('hostelId', 'h1');
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function saveWith(failure: unknown): HTMLElement {
    bookings.failure = failure;
    const el = render();
    const drawer = fixture.componentInstance as unknown as DrawerInternals;
    drawer.guestName.set('Ali Raza');
    drawer.guestPhone.set('923001234567');
    drawer.onRoomsPicked(['rt1']);
    fixture.detectChanges();
    drawer.save();
    fixture.detectChanges();
    return el;
  }

  const alerts = (el: HTMLElement) =>
    [...el.querySelectorAll('[role="alert"]')].map((a) => a.textContent?.trim() ?? '');

  function expectNoLeak(el: HTMLElement, ...leaks: string[]): void {
    const shown = el.textContent ?? '';
    expect(shown).not.toContain('Http failure');
    expect(shown).not.toContain('http://');
    for (const leak of leaks) expect(shown).not.toContain(leak);
  }

  beforeEach(() => {
    hostels = new HostelsStub();
    bookings = new BookingsStub();
  });

  describe('when the rooms do not load', () => {
    it.each([
      { case: 'a bare 404 from the detail', rejection: apiError(404, undefined, DETAIL_URL) },
      { case: 'the mapper rejects the body', rejection: new Error(MAPPER_TEXT) },
    ])('shows the rooms message and leaks nothing on $case', ({ rejection }) => {
      hostels.detail = () => throwError(() => rejection);
      const el = render();
      expect(alerts(el)).toEqual(['hostBookings.theRoomsForThisProperty']);
      expectNoLeak(el, MAPPER_TEXT, DETAIL_URL);
    });

    it('says the server cannot be reached when the request never got there', () => {
      hostels.detail = () => throwError(() => apiError(0, undefined, DETAIL_URL));
      const el = render();
      expect(alerts(el)).toEqual(['common.cannotReachTheServer']);
    });
  });

  describe('when saving fails', () => {
    it.each([
      { case: 'a URL-bearing 403', rejection: apiError(403) },
      { case: 'a 500 with no envelope', rejection: apiError(500) },
      { case: 'a plain error from a mapper', rejection: new Error(MAPPER_TEXT) },
    ])('shows the generic message and leaks nothing on $case', ({ rejection }) => {
      const el = saveWith(rejection);
      expect(alerts(el)).toEqual(['hostBookings.couldNotSaveBooking']);
      expectNoLeak(el, MAPPER_TEXT, API_URL);
    });

    it.each([
      { text: 'This hostel does not accept bookings', key: 'hostBookings.notSetUpForBookings' },
      { text: 'Checkin date cannot be in the past', key: 'hostBookings.checkInCannotBeInPast' },
      { text: 'Deluxe Dorm is not available for booking', key: 'hostBookings.roomTypeNotBookable' },
      { text: 'Checkout date must be after check-in date', key: 'hostBookings.checkOutAfterCheckIn' },
    ])('shows $key, not the server text, for "$text"', ({ text, key }) => {
      const el = saveWith(apiError(422, [text]));
      expect(alerts(el)).toEqual([key]);
      expectNoLeak(el, text);
    });

    it('asks for a plan with bookings on a crm_required refusal', () => {
      const text = 'Your plan does not include the CRM';
      const el = saveWith(apiError(403, [text], API_URL, 'crm_required'));
      expect(alerts(el)).toEqual(['hostBookings.crmRequired']);
      expectNoLeak(el, text);
    });

    it('says the server cannot be reached on a network failure', () => {
      const el = saveWith(apiError(0));
      expect(alerts(el)).toEqual(['common.cannotReachTheServer']);
    });

    it('shows the renewal prompt, not an error message, when the subscription has lapsed', () => {
      const text = 'You need to subscribe to avail the services';
      const el = saveWith(apiError(400, [text]));
      expect(el.querySelectorAll('[role="alert"]')).toHaveLength(1);
      expect(alerts(el)[0]).not.toContain('hostBookings.couldNotSaveBooking');
      expect(el.querySelector('a[href$="/host/h1/subscription"]')).not.toBeNull();
      expectNoLeak(el, text);
    });
  });
});
