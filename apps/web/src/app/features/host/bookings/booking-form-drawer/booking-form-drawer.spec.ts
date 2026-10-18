import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { HostelsApi, HostPropertyStore } from '@services';
import type { Role } from '@core/auth/roles';
import { SessionStore } from '@core/auth/session-store';
import { CRM_REQUIRED_MESSAGE } from '@core/host-access/host-access';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import {
  CANCAN_403_BODY,
  CANCAN_MESSAGE,
  CRM_MESSAGE_ONLY_BODY,
  CRM_REQUIRED_BODY,
  RATE_LIMITED_BODY,
  RENDER_403_BODY,
  SUBSCRIBE_400_BODY,
  SUBSCRIBE_MESSAGE,
  interceptedError,
} from '@app/testing/backend-refusals';
import { sessionUser } from '@app/testing/host-builders';
import { HostBookingsApi } from '../host-bookings-api';
import { BookingFormDrawer } from './booking-form-drawer';

const API_URL = 'http://localhost/api/host/hostels/h1/bookings';
const POST_BOOKINGS = { method: 'POST', url: 'https://api.test/api/host/hostels/h1/bookings' };
const DETAIL_URL = 'http://localhost/public/hostel_detail/h1';
const MAPPER_TEXT = 'Hostel response did not include a hostel.';
const RENEWAL_LINK = 'a[href$="/host/h1/subscription"]';

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
  /** A reply the test settles itself, instead of one that arrives at once. */
  pending: Observable<unknown> | null = null;
  create = vi.fn(
    (): Observable<unknown> =>
      this.pending ?? (this.failure ? throwError(() => this.failure) : of({ id: 'b1' })),
  );
}

/** The drawer's protected surface, read the way the template reads it. */
interface DrawerInternals {
  guestName: { (): string; set(v: string): void };
  guestPhone: { (): string; set(v: string): void };
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
        { provide: HostPropertyStore, useValue: { timeZoneOf: () => of(null) } },
      ],
    });
    fixture = TestBed.createComponent(BookingFormDrawer);
    fixture.componentRef.setInput('hostelId', 'h1');
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const internals = () => fixture.componentInstance as unknown as DrawerInternals;

  /** Renders the drawer with a guest and a room picked, ready to save. */
  function fill(): HTMLElement {
    const el = render();
    const drawer = internals();
    drawer.guestName.set('Ali Raza');
    drawer.guestPhone.set('923001234567');
    drawer.onRoomsPicked(['rt1']);
    fixture.detectChanges();
    return el;
  }

  /** Signs in on the session the drawer shares; after `render`, which is what configures the test module. */
  function signIn(role: Role): void {
    TestBed.inject(SessionStore).setSession(sessionUser(role), 'tok');
  }

  /** Saves with the server refusing as `failure`, signed in as `role` (signed out when omitted). */
  function saveWith(failure: unknown, role?: Role): HTMLElement {
    bookings.failure = failure;
    const el = fill();
    if (role) signIn(role);
    internals().save();
    fixture.detectChanges();
    return el;
  }

  const alerts = (el: HTMLElement) =>
    [...el.querySelectorAll('[role="alert"]')].map((a) => a.textContent?.trim() ?? '');

  const renewalLink = (el: HTMLElement) => el.querySelector(RENEWAL_LINK);

  const saveButton = (el: HTMLElement) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('hostBookings.saveBooking'));

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

  afterEach(() => TestBed.inject(SessionStore).clear());

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

    describe('when the role lacks the permission to record a booking', () => {
      const permissionRefusals = [
        { case: 'a URL-bearing 403', rejection: apiError(403) },
        { case: 'a 403 carrying the CanCan text', rejection: apiError(403, [CANCAN_MESSAGE]) },
        { case: "CanCan's own body", rejection: interceptedError(403, CANCAN_403_BODY, POST_BOOKINGS) },
        { case: "render_403's body", rejection: interceptedError(403, RENDER_403_BODY, POST_BOOKINGS) },
      ];

      it.each(permissionRefusals)('tells staff to ask the owner, and leaks nothing, on $case', ({ rejection }) => {
        const el = saveWith(rejection, 'manager');
        expect(alerts(el)).toEqual(['hostBookings.notAllowed']);
        expect(renewalLink(el)).toBeNull();
        expectNoLeak(el, CANCAN_MESSAGE, API_URL, '/api/host/hostels/h1/bookings');
      });

      it.each(permissionRefusals)('tells the owner to contact support, and leaks nothing, on $case', ({ rejection }) => {
        const el = saveWith(rejection, 'host');
        expect(alerts(el)).toEqual(['hostBookings.notAllowedOwner']);
        expect(renewalLink(el)).toBeNull();
        expectNoLeak(el, CANCAN_MESSAGE, API_URL, '/api/host/hostels/h1/bookings');
      });

      it('keeps what the host typed and the Save button usable', () => {
        const el = saveWith(apiError(403, [CANCAN_MESSAGE]), 'manager');
        expect(internals().guestName()).toBe('Ali Raza');
        expect(internals().guestPhone()).toBe('923001234567');
        expect(el.querySelector<HTMLInputElement>('input[aria-label="How many of Deluxe Dorm"]')?.value).toBe('1');
        expect(saveButton(el)?.disabled).toBe(false);
      });

      it.each([
        { from: 'manager', to: 'host', key: 'hostBookings.notAllowedOwner' },
        { from: 'host', to: 'manager', key: 'hostBookings.notAllowed' },
      ] as const)('is worded for the role signed in when the reply lands, $from then $to', ({ from, to, key }) => {
        const reply = new Subject<never>();
        bookings.pending = reply;
        const el = fill();
        signIn(from);
        internals().save();
        expect(bookings.create).toHaveBeenCalledTimes(1);

        signIn(to);
        reply.error(interceptedError(403, CANCAN_403_BODY, POST_BOOKINGS));
        fixture.detectChanges();

        expect(alerts(el)).toEqual([key]);
      });

      it('replaces a renewal prompt from the save before it', () => {
        const el = saveWith(interceptedError(400, SUBSCRIBE_400_BODY, POST_BOOKINGS), 'manager');
        expect(renewalLink(el)).not.toBeNull();

        bookings.failure = interceptedError(403, CANCAN_403_BODY, POST_BOOKINGS);
        internals().save();
        fixture.detectChanges();

        expect(alerts(el)).toEqual(['hostBookings.notAllowed']);
        expect(renewalLink(el)).toBeNull();
      });
    });

    describe('when the plan lacks CRM', () => {
      it.each([
        { case: 'its message alone', rejection: apiError(403, [CRM_REQUIRED_MESSAGE]) },
        {
          case: 'its message alone, through the interceptor',
          rejection: interceptedError(403, CRM_MESSAGE_ONLY_BODY, POST_BOOKINGS),
        },
        { case: 'its code, through the interceptor', rejection: interceptedError(403, CRM_REQUIRED_BODY, POST_BOOKINGS) },
      ])('asks for a plan with bookings, not a renewal, on $case', ({ rejection }) => {
        const el = saveWith(rejection, 'host');
        expect(alerts(el)).toEqual(['hostBookings.crmRequired']);
        expect(renewalLink(el)).toBeNull();
        expectNoLeak(el, CRM_REQUIRED_MESSAGE);
      });
    });

    describe('when the hostel has no live plan', () => {
      it.each([
        { case: 'a 402', rejection: apiError(402) },
        { case: 'a 402, through the interceptor', rejection: interceptedError(402, null, POST_BOOKINGS) },
        {
          case: 'the 400 the host API sends, through the interceptor',
          rejection: interceptedError(400, SUBSCRIBE_400_BODY, POST_BOOKINGS),
        },
      ])('shows the renewal prompt with its link and no error message on $case', ({ rejection }) => {
        const el = saveWith(rejection, 'host');
        expect(el.querySelector(`div[role="alert"] ${RENEWAL_LINK}`)).not.toBeNull();
        expect(el.querySelector('p[role="alert"]')).toBeNull();
        expectNoLeak(el, SUBSCRIBE_MESSAGE);
      });
    });

    describe('when the server refuses with a code of its own', () => {
      it.each([
        { case: 'a coded 403', rejection: apiError(403, ['Forbidden'], API_URL, 'forbidden') },
        { case: 'a coded 403 carrying the CanCan text', rejection: apiError(403, [CANCAN_MESSAGE], API_URL, 'forbidden') },
        {
          case: "the rate limiter's body, through the interceptor",
          rejection: interceptedError(403, RATE_LIMITED_BODY, POST_BOOKINGS),
        },
      ])('shows the generic message, not a permission or a renewal, on $case', ({ rejection }) => {
        const el = saveWith(rejection, 'host');
        expect(alerts(el)).toEqual(['hostBookings.couldNotSaveBooking']);
        expect(renewalLink(el)).toBeNull();
        expectNoLeak(el, 'Forbidden', CANCAN_MESSAGE);
      });
    });
  });
});
