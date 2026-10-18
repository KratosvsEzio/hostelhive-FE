import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { Observable, of, throwError } from 'rxjs';
import { Invoice } from '@hostelhive/data-access';
import { bookingInvoice, sessionUser } from '@app/testing/host-builders';
import type { Role } from '@core/auth/roles';
import { SessionStore } from '@core/auth/session-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import {
  ACTIONS_BY_LANE,
  BookingAction,
  BookingDetailsPanel,
  InvoiceLookup,
  actionsFor,
} from './booking-details-panel';
import { BookingOccupancy, HostBooking, HostBookingsApi } from './host-bookings-api';

const RELEASE_URL = 'http://localhost/api/host/hostels/MjvuEl/bookings/b1/occupancies/o1/mark_as_inactive';

/** A refused release the way the error interceptor rethrows it, with Angular's URL-bearing message. */
function releaseRefusal(text: string) {
  return {
    status: 422,
    code: 'unknown_error',
    message: `Http failure response for ${RELEASE_URL}: 422 Unprocessable Entity`,
    serverMessages: [text],
    method: 'PUT',
  };
}

/** A release the server refused with a 403, the way the error interceptor rethrows it; `code` is the server's own, if it sent one. */
function releaseForbidden(text: string, code = 'unknown_error') {
  return {
    status: 403,
    code,
    message: `Http failure response for ${RELEASE_URL}: 403 Forbidden`,
    serverMessages: [text],
    method: 'PUT',
  };
}

function expectNoLeak(el: HTMLElement, ...leaks: string[]): void {
  const shown = el.textContent ?? '';
  expect(shown).not.toContain('Http failure');
  expect(shown).not.toContain('http://');
  for (const leak of leaks) expect(shown).not.toContain(leak);
}

function booking(slug: string, over: Partial<HostBooking> = {}): HostBooking {
  return {
    id: 'b1',
    ref: 'HH-1',
    guest: { name: 'Ali Raza', phone: '923001234567', email: '' },
    checkIn: '2026-10-10',
    checkOut: '2026-10-13',
    nights: 3,
    guests: 6,
    roomType: { name: 'King size room', occupancyType: 'private_room', capacity: 4, price: 12000 },
    total: 67200,
    paid: 0,
    balanceDue: 67200,
    room: null,
    renter: null,
    status: { name: slug, slug },
    disposition: { name: slug, slug },
    notes: '',
    lines: [
      { roomTypeId: 'KGJwMC', name: 'King size room', shared: false, units: 2, guests: 4, subtotal: 60000 },
      { roomTypeId: 'MqVuEl', name: 'Dormitory', shared: true, units: 2, guests: 2, subtotal: 7200 },
    ],
    currency: 'PKR',
    cancellationReason: '',
    occupancies: [],
    source: '',
    createdAt: '2026-09-27',
    confirmationPdfUrl: '',
    ...over,
  };
}

class ApiStub {
  rows: BookingOccupancy[] = [];
  occupancies = vi.fn((): Observable<BookingOccupancy[]> => of(this.rows));
  releaseOccupancy = vi.fn((): Observable<void> => of(undefined));
}

@Component({
  imports: [BookingDetailsPanel],
  template: `<hh-booking-details-panel
    hostelId="MjvuEl"
    [booking]="booking()"
    [busy]="busy()"
    [invoice]="invoice()"
    [invoiceLookup]="invoiceLookup()"
    (act)="acted.push($event.action)"
    (released)="released.push($event)"
  />`,
})
class Host {
  readonly booking = signal<HostBooking | null>(null);
  readonly busy = signal(false);
  readonly invoice = signal<Invoice | null>(null);
  readonly invoiceLookup = signal<InvoiceLookup>('done');
  acted: BookingAction[] = [];
  released: HostBooking[] = [];
}

interface RenderOptions {
  invoice?: Invoice | null;
  lookup?: InvoiceLookup;
  rows?: BookingOccupancy[];
}

describe('BookingDetailsPanel', () => {
  let fixture: ComponentFixture<Host>;
  let api: ApiStub;

  function render(b: HostBooking, opts: RenderOptions = {}): HTMLElement {
    api = new ApiStub();
    if (opts.rows) api.rows = opts.rows;
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideI18nTesting(), provideRouter([]), { provide: HostBookingsApi, useValue: api }],
    });
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.booking.set(b);
    fixture.componentInstance.invoice.set(opts.invoice ?? null);
    fixture.componentInstance.invoiceLookup.set(opts.lookup ?? 'done');
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  const buttons = (el: HTMLElement) =>
    [...el.querySelectorAll<HTMLButtonElement>('footer button')].map((b) => b.textContent?.trim());

  it('offers each stage only the moves the lifecycle allows', () => {
    expect(ACTIONS_BY_LANE).toEqual({
      pending: ['cancel', 'confirm'],
      confirmed: ['cancel', 'noShow', 'checkIn'],
      'checked-in': ['cancel', 'invoice', 'checkOut'],
      'checked-out': ['invoice'],
      'no-show': [],
      cancelled: [],
    });
  });

  it('never offers confirm off pending, nor check-in off confirmed — the server does not guard either', () => {
    for (const [lane, actions] of Object.entries(ACTIONS_BY_LANE)) {
      if (lane !== 'pending') expect(actions).not.toContain('confirm');
      if (lane !== 'confirmed') expect(actions).not.toContain('checkIn');
    }
  });

  it('draws the moves for a pending booking, confirm last', () => {
    expect(buttons(render(booking('pending')))).toEqual(['Cancel booking', 'Confirm']);
  });

  it('treats an older pending-allotment record as pending', () => {
    expect(buttons(render(booking('pending-allotment')))).toEqual(['Cancel booking', 'Confirm']);
  });

  it('draws check-in and no-show for a confirmed booking', () => {
    expect(buttons(render(booking('confirmed', { paid: 67200, balanceDue: 0 })))).toEqual([
      'Cancel booking',
      'Mark no show',
      'Check in',
    ]);
  });

  // Mark as paid (Trello #81): only on a payable stage, only while money is owed, and never
  // displacing the stage's own finishing move from the end.
  it('offers mark as paid on a confirmed booking with a balance, before check-in', () => {
    expect(buttons(render(booking('confirmed')))).toEqual(['Cancel booking', 'Mark no show', 'Mark as paid', 'Check in']);
  });

  it('does not offer mark as paid once nothing is owed', () => {
    expect(buttons(render(booking('checked-out', { paid: 67200, balanceDue: 0 })))).toEqual(['Generate invoice']);
  });

  it('does not offer mark as paid on a booking the hostel has not confirmed', () => {
    expect(buttons(render(booking('pending')))).not.toContain('Mark as paid');
  });

  it('offers nothing on a no-show, even one that still owes — it can be neither paid nor invoiced', () => {
    expect(buttons(render(booking('no-show')))).toEqual(['Close']);
  });

  it('offers only a Close on a cancelled booking', () => {
    expect(buttons(render(booking('cancelled')))).toEqual(['Close']);
  });

  it('emits the move rather than making it', () => {
    const el = render(booking('pending'));
    [...el.querySelectorAll<HTMLButtonElement>('footer button')].find((b) => b.textContent?.includes('Confirm'))?.click();
    expect(fixture.componentInstance.acted).toEqual(['confirm']);
  });

  it('holds every move while one is in flight', () => {
    const el = render(booking('pending'));
    fixture.componentInstance.busy.set(true);
    fixture.detectChanges();
    const all = [...el.querySelectorAll<HTMLButtonElement>('footer button')];
    expect(all.every((b) => b.disabled)).toBe(true);
  });

  it('lists what was booked, line by line, in the booking currency', () => {
    const text = render(booking('pending')).textContent ?? '';
    expect(text).toContain('2 rooms · King size room');
    expect(text).toContain('2 beds · Dormitory');
    expect(text).toContain('Rs 67,200');
  });

  it('shows what is still due at the property, and no deposit', () => {
    const text = render(booking('confirmed', { paid: 20000, balanceDue: 47200 })).textContent ?? '';
    expect(text).toContain('Rs 47,200');
    expect(text).toContain('At the property');
    expect(text).not.toContain('Deposit');
    expect(text).not.toContain('Paid online');
  });

  it('marks the stay paid once nothing is left due', () => {
    const text = render(booking('checked-out', { paid: 67200, balanceDue: 0 })).textContent ?? '';
    expect(text).toContain('Paid');
    expect(text).not.toContain('At the property');
  });

  it('shows who is in which room once checked in, and releases one', () => {
    const b = booking('checked-in');
    api = new ApiStub();
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideI18nTesting(), { provide: HostBookingsApi, useValue: api }],
    });
    api.rows = [
      { id: 'o1', roomId: 'r1', roomNumber: '101', guests: 2, active: true },
      { id: 'o2', roomId: 'r2', roomNumber: '102', guests: 1, active: false },
    ];
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.booking.set(b);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(api.occupancies).toHaveBeenCalledWith('MjvuEl', 'b1');
    expect(el.textContent).toContain('Room 101 · 2 guests');
    expect(el.textContent).toContain('hostBookings.released');

    [...el.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.textContent?.trim() === 'Release')?.click();
    expect(api.releaseOccupancy).toHaveBeenCalledWith('MjvuEl', 'b1', 'o1', { suppressErrorToast: true });
    fixture.detectChanges();
    // The endpoint reads a search index that still answers "active" for a moment after the
    // release, so the panel shows what the server confirmed rather than reading it again.
    expect(api.occupancies).toHaveBeenCalledTimes(1);
    expect([...el.querySelectorAll('button')].some((x) => x.textContent?.trim() === 'Release')).toBe(false);
    expect(el.textContent?.split('hostBookings.released').length).toBe(3);
  });

  it('shows a released room as released at once, though the rooms endpoint still lists it active', () => {
    const b = booking('checked-in');
    const lagging = [
      { id: 'o1', roomId: 'r1', roomNumber: '101', guests: 2, active: true },
      { id: 'o2', roomId: 'r2', roomNumber: '102', guests: 1, active: true },
    ];
    const el = render(b, { rows: lagging });
    const releaseButtons = () =>
      [...el.querySelectorAll<HTMLButtonElement>('button')].filter((x) => x.textContent?.trim() === 'Release');
    expect(releaseButtons()).toHaveLength(2);

    releaseButtons()[1].click();
    fixture.detectChanges();

    const rooms = [...el.querySelectorAll('li')].filter((li) => li.textContent?.trim().startsWith('Room'));
    expect(rooms.map((li) => li.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Room 101 · 2 guests Release',
      'Room 102 · 1 guest hostBookings.released',
    ]);
    expect(rooms[1].querySelector('span')?.className).toContain('line-through');
    expect(api.occupancies).toHaveBeenCalledTimes(1);
  });

  it("takes a room as released when the page's re-read booking says so, over the index's stale answer", () => {
    const b = booking('checked-in', {
      occupancies: [{ id: 'o1', roomId: 'r1', roomNumber: '101', guests: 2, active: true }],
    });
    const el = render(b, { rows: [{ id: 'o1', roomId: 'r1', roomNumber: '101', guests: 2, active: true }] });
    expect(el.textContent).not.toContain('hostBookings.released');

    // The page's get() reads the database: the same booking, with the room now inactive.
    fixture.componentInstance.booking.set({
      ...b,
      occupancies: [{ id: 'o1', roomId: 'r1', roomNumber: '101', guests: 2, active: false }],
    });
    fixture.detectChanges();

    expect(el.textContent).toContain('hostBookings.released');
    expect([...el.querySelectorAll('button')].some((x) => x.textContent?.trim() === 'Release')).toBe(false);
    expect(api.occupancies).toHaveBeenCalledTimes(1);
  });

  it("keeps the rooms the page's re-read booking carries when the index does not list them yet", () => {
    const carried = [
      { id: 'o1', roomId: 'r1', roomNumber: '101', guests: 2, active: true },
      { id: 'o2', roomId: 'r2', roomNumber: '102', guests: 1, active: true },
    ];
    const el = render(booking('checked-in', { occupancies: carried }), { rows: [carried[0]] });

    const rooms = [...el.querySelectorAll('li')].filter((li) => li.textContent?.trim().startsWith('Room'));
    expect(rooms.map((li) => li.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Room 101 · 2 guests Release',
      'Room 102 · 1 guest Release',
    ]);
  });

  it('shows the carried rooms, not "no rooms", when the index answers none', () => {
    const carried = [{ id: 'o1', roomId: 'r1', roomNumber: '101', guests: 2, active: true }];
    const text = render(booking('checked-in', { occupancies: carried }), { rows: [] }).textContent ?? '';

    expect(text).toContain('Room 101 · 2 guests');
    expect(text).not.toContain('No rooms recorded yet.');
  });

  it('forgets a release when it moves on to another booking', () => {
    const rows = [{ id: 'o1', roomId: 'r1', roomNumber: '101', guests: 2, active: true }];
    const el = render(booking('checked-in'), { rows });
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.textContent?.trim() === 'Release')?.click();
    fixture.detectChanges();
    expect(el.textContent).toContain('hostBookings.released');

    fixture.componentInstance.booking.set(booking('checked-in', { id: 'b2' }));
    fixture.detectChanges();

    expect(api.occupancies).toHaveBeenLastCalledWith('MjvuEl', 'b2');
    expect(el.textContent).not.toContain('hostBookings.released');
  });

  it('drops a release error when it moves on to another booking', () => {
    const rows = [{ id: 'o1', roomId: 'r1', roomNumber: '101', guests: 2, active: true }];
    const el = render(booking('checked-in'), { rows });
    api.releaseOccupancy.mockReturnValue(throwError(() => releaseRefusal('Room 101 is locked.')));
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.textContent?.trim() === 'Release')?.click();
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent?.trim()).toBe('hostBookings.couldNotReleaseRoom');

    fixture.componentInstance.booking.set(booking('checked-in', { id: 'b2' }));
    fixture.detectChanges();

    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('does not re-read the rooms when the same booking comes back marked paid', () => {
    const b = booking('checked-in');
    api = new ApiStub();
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideI18nTesting(), { provide: HostBookingsApi, useValue: api }],
    });
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.booking.set(b);
    fixture.detectChanges();
    expect(api.occupancies).toHaveBeenCalledTimes(1);

    // The page swaps in the server's reply to mark_as_paid: same booking, now settled.
    fixture.componentInstance.booking.set({ ...b, paid: b.total, balanceDue: 0 });
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(api.occupancies).toHaveBeenCalledTimes(1);
    expect(text).not.toContain('Mark as paid');
  });

  it('does not ask for rooms on a booking that is not checked in', () => {
    render(booking('confirmed'));
    expect(api.occupancies).not.toHaveBeenCalled();
  });

  it("shows the host's reason on a cancelled booking when the server sends one", () => {
    const text = render(booking('cancelled', { cancellationReason: 'Water leak in dorm' })).textContent ?? '';
    expect(text).toContain('Water leak in dorm');
  });

  describe('the confirmation download', () => {
    const URL = 'https://img.example.test/unprocessed/ns-2/documents/3ec81f07-host-stay.pdf';
    const link = (el: HTMLElement) => el.querySelector<HTMLAnchorElement>('[data-testid="download-confirmation"]');

    it('links to the stored PDF in a new tab once the booking is confirmed', () => {
      const el = render(booking('confirmed', { confirmationPdfUrl: URL }));

      const a = link(el);
      expect(a?.getAttribute('href')).toBe(URL);
      expect(a?.getAttribute('target')).toBe('_blank');
      expect(a?.getAttribute('rel')).toBe('noopener noreferrer');
      expect(a?.textContent).toContain('hostBookings.downloadConfirmation');
      expect(a?.textContent).toContain('userBookings.opensInNewTab');
      expect(a?.querySelector('i')?.getAttribute('aria-hidden')).toBe('true');
      expect(el.textContent).toContain('hostBookings.confirmation');
    });

    it.each(['checked-in', 'checked-out', 'room-assigned'])('keeps the link while the booking is %s', (slug) => {
      expect(link(render(booking(slug, { confirmationPdfUrl: URL })))?.getAttribute('href')).toBe(URL);
    });

    it('shows no section at all while the PDF is not stored', () => {
      const el = render(booking('confirmed', { confirmationPdfUrl: '' }));

      expect(link(el)).toBeNull();
      expect(el.textContent).not.toContain('hostBookings.confirmation');
    });

    it.each(['pending', 'pending-allotment', 'cancelled', 'no-show'])('hides a PDF the booking still carries while it is %s', (slug) => {
      const el = render(booking(slug, { confirmationPdfUrl: URL }));

      expect(link(el)).toBeNull();
      expect(el.textContent).not.toContain('hostBookings.confirmation');
    });

    it('shows the section when a re-read of the same booking brings a PDF', () => {
      const FRESH = 'https://img.example.test/unprocessed/ns-2/documents/d2b6f4a9-fresh-host.pdf';
      const el = render(booking('confirmed', { confirmationPdfUrl: '' }));
      expect(link(el)).toBeNull();

      fixture.componentInstance.booking.set(booking('confirmed', { confirmationPdfUrl: FRESH }));
      fixture.detectChanges();

      expect(link(el)?.getAttribute('href')).toBe(FRESH);
      expect(el.textContent).toContain('hostBookings.confirmation');
    });

    it('removes the section when the same booking moves to cancelled with its PDF kept', () => {
      const KEPT = 'https://img.example.test/unprocessed/ns-2/documents/e8c1a7b3-kept-host.pdf';
      const el = render(booking('confirmed', { confirmationPdfUrl: KEPT }));
      expect(link(el)?.getAttribute('href')).toBe(KEPT);

      fixture.componentInstance.booking.set(booking('cancelled', { confirmationPdfUrl: KEPT }));
      fixture.detectChanges();

      expect(link(el)).toBeNull();
      expect(el.textContent).not.toContain('hostBookings.confirmation');
    });
  });

  describe('the booking invoice', () => {
    const settled = { paid: 67200, balanceDue: 0 };
    const labels = (el: HTMLElement) => [...el.querySelectorAll('p')].map((p) => p.textContent?.trim());
    const footerButton = (el: HTMLElement, text: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('footer button')].find((b) => b.textContent?.trim() === text);
    const occupancy = (id: string, roomNumber: string, guests: number, active: boolean): BookingOccupancy => ({
      id,
      roomId: `r-${id}`,
      roomNumber,
      guests,
      active,
    });
    const releaseButtons = (el: HTMLElement) =>
      [...el.querySelectorAll<HTMLButtonElement>('button')].filter((x) => x.textContent?.trim() === 'Release');
    const roomRows = (el: HTMLElement) =>
      [...el.querySelectorAll('li')]
        .filter((li) => li.textContent?.trim().startsWith('Room'))
        .map((li) =>
          [...li.children]
            .map((child) => child.textContent?.replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .join(' '),
        );
    const roomLi = (el: HTMLElement, room: string) =>
      [...el.querySelectorAll('li')].find((li) => li.textContent?.trim().startsWith(`Room ${room}`));

    it('turns Generate invoice into View invoice in the same slot once the invoice is known', () => {
      const checkedIn = booking('checked-in', settled);
      expect(actionsFor(checkedIn)).toEqual(['cancel', 'invoice', 'checkOut']);
      expect(actionsFor(checkedIn, bookingInvoice())).toEqual(['cancel', 'viewInvoice', 'checkOut']);

      const checkedOut = booking('checked-out', settled);
      expect(actionsFor(checkedOut)).toEqual(['invoice']);
      expect(actionsFor(checkedOut, bookingInvoice())).toEqual(['viewInvoice']);
    });

    it('keeps Mark as paid ahead of View invoice on a checked-out stay that still owes', () => {
      const owing = booking('checked-out');
      expect(actionsFor(owing, bookingInvoice())).toEqual(['markPaid', 'viewInvoice']);
      expect(actionsFor(owing)).toEqual(['markPaid', 'invoice']);
    });

    it('offers nothing on a no-show or a cancelled booking, even one that owes and has an invoice', () => {
      expect(actionsFor(booking('no-show'), bookingInvoice())).toEqual([]);
      expect(actionsFor(booking('cancelled'), bookingInvoice())).toEqual([]);
      expect(actionsFor(booking('no-show'))).toEqual([]);
      expect(actionsFor(booking('cancelled'))).toEqual([]);
    });

    it('never draws View invoice as the filled primary button', () => {
      const el = render(booking('checked-out', settled), { invoice: bookingInvoice() });
      const view = footerButton(el, 'View invoice');
      expect(view).toBeTruthy();
      expect(view?.classList.contains('bg-brand-500')).toBe(false);
      expect(view?.classList.contains('border-ink-300')).toBe(true);

      TestBed.resetTestingModule();
      const owing = render(booking('checked-out'), { invoice: bookingInvoice() });
      expect(footerButton(owing, 'View invoice')?.classList.contains('bg-brand-500')).toBe(false);
      expect(footerButton(owing, 'Mark as paid')?.classList.contains('bg-brand-500')).toBe(false);
    });

    it('shows the Invoice section only on checked-in and checked-out bookings', () => {
      for (const slug of ['checked-in', 'checked-out']) {
        TestBed.resetTestingModule();
        expect(labels(render(booking(slug, settled)))).toContain('hostBookings.invoice');
      }
      for (const slug of ['pending', 'confirmed', 'no-show', 'cancelled']) {
        TestBed.resetTestingModule();
        expect(labels(render(booking(slug)))).not.toContain('hostBookings.invoice');
      }
    });

    it('says it is checking while the invoice lookup is pending', () => {
      const el = render(booking('checked-out', settled), { lookup: 'loading' });
      expect(el.textContent).toContain('hostBookings.checkingForInvoice');
      expect(el.textContent).not.toContain('hostBookings.noInvoiceYet');
      expect(el.textContent).not.toContain('hostBookings.couldNotCheckInvoice');
    });

    it('says the check failed when the invoice lookup errored', () => {
      const el = render(booking('checked-out', settled), { lookup: 'error' });
      expect(el.textContent).toContain('hostBookings.couldNotCheckInvoice');
      expect(el.textContent).not.toContain('hostBookings.noInvoiceYet');
      expect(el.textContent).not.toContain('hostBookings.checkingForInvoice');
    });

    it('says there is no invoice yet once the lookup finished empty', () => {
      const el = render(booking('checked-out', settled), { lookup: 'done' });
      expect(el.textContent).toContain('hostBookings.noInvoiceYet');
      expect(el.querySelector('a[href*="/invoices/view/"]')).toBeNull();
    });

    it('shows the invoice number, amount, status and a link to it when one exists', () => {
      const inv = bookingInvoice({ id: 'rb-9', amount: 24000, status: 'over-due', issued: '2026-10-10' });
      const el = render(booking('checked-out', settled), { invoice: inv });
      const text = el.textContent ?? '';

      expect(text).toContain('Invo-1026-rb-9');
      expect(text).toMatch(/24,?000/);
      expect(text).toContain('Overdue');
      expect(text).not.toContain('hostBookings.noInvoiceYet');
      const link = el.querySelector<HTMLAnchorElement>('a[href*="/invoices/view/"]');
      expect(link?.getAttribute('href')).toMatch(/\/host\/MjvuEl\/invoices\/view\/rb-9$/);
      expect(link?.textContent?.trim()).toBe('hostBookings.viewInvoice');
    });

    it('prefers a present invoice over a stale loading or error state', () => {
      for (const lookup of ['loading', 'error'] as const) {
        TestBed.resetTestingModule();
        const el = render(booking('checked-out', settled), { invoice: bookingInvoice({ id: 'rb-3' }), lookup });
        expect(el.textContent).toContain('rb-3');
        expect(el.textContent).not.toContain('hostBookings.checkingForInvoice');
        expect(el.textContent).not.toContain('hostBookings.couldNotCheckInvoice');
      }
    });

    it('swaps the checking line for the invoice as soon as the page finds it', () => {
      const el = render(booking('checked-out', settled), { lookup: 'loading' });
      expect(el.textContent).toContain('hostBookings.checkingForInvoice');

      fixture.componentInstance.invoice.set(bookingInvoice({ id: 'rb-4' }));
      fixture.detectChanges();

      expect(el.textContent).toContain('rb-4');
      expect(el.textContent).not.toContain('hostBookings.checkingForInvoice');
    });

    it('lists every room a checked-out stay used as checked out, with no Release and no rooms request', () => {
      const rooms = [occupancy('o1', '101', 2, false), occupancy('o2', '102', 1, true)];
      const el = render(booking('checked-out', { ...settled, occupancies: rooms }));
      const text = el.textContent ?? '';

      expect(labels(el)).toContain('hostBookings.stayedIn');
      expect(text).toContain('Room 101 · 2 guests');
      expect(text).toContain('Room 102 · 1 guest');
      expect(text.split('hostBookings.checkedOut').length - 1).toBe(2);
      expect(text).not.toContain('hostBookings.released');
      expect(text).not.toContain('Release');
      expect(labels(el)).not.toContain('In rooms');
      expect(api.occupancies).not.toHaveBeenCalled();
    });

    it('lists the rooms of a cancelled booking as history too, without asking for them', () => {
      const el = render(booking('cancelled', { occupancies: [occupancy('o1', '201', 3, true)] }));

      expect(labels(el)).toContain('hostBookings.stayedIn');
      expect(roomRows(el)).toEqual(['Room 201 · 3 guests hostBookings.released']);
      expect(el.textContent).not.toContain('hostBookings.checkedOut');
      expect(releaseButtons(el)).toHaveLength(0);
      expect(api.occupancies).not.toHaveBeenCalled();
    });

    it('labels every room of a cancelled stay released, never checked out', () => {
      const rooms = [occupancy('o1', '201', 3, true), occupancy('o2', '202', 1, false)];
      const el = render(booking('cancelled', { occupancies: rooms }));
      const text = el.textContent ?? '';

      expect(labels(el)).toContain('hostBookings.stayedIn');
      expect(roomRows(el)).toEqual([
        'Room 201 · 3 guests hostBookings.released',
        'Room 202 · 1 guest hostBookings.released',
      ]);
      expect(text.split('hostBookings.released').length - 1).toBe(2);
      expect(text).not.toContain('hostBookings.checkedOut');
    });

    it('has no stayed-in section for a cancelled booking with no rooms recorded', () => {
      const el = render(booking('cancelled', { occupancies: [] }));

      expect(labels(el)).not.toContain('hostBookings.stayedIn');
      expect(el.textContent).not.toContain('hostBookings.checkedOut');
      expect(el.textContent).not.toContain('hostBookings.released');
    });

    it('shows the live rooms block, not the history, while checked in', () => {
      const el = render(booking('checked-in', settled), { rows: [occupancy('o1', '101', 2, true)] });

      expect(api.occupancies).toHaveBeenCalledWith('MjvuEl', 'b1');
      expect(labels(el)).toContain('In rooms');
      expect(labels(el)).not.toContain('hostBookings.stayedIn');
      expect([...el.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Release')).toBe(true);
    });

    it('has no stayed-in section for a finished stay with no rooms recorded', () => {
      const el = render(booking('checked-out', settled));
      expect(labels(el)).not.toContain('hostBookings.stayedIn');
      expect(el.textContent).not.toContain('hostBookings.checkedOut');
    });

    it('announces a successful release with the booking it belongs to', () => {
      const b = booking('checked-in', settled);
      const el = render(b, { rows: [occupancy('o1', '101', 2, true)] });

      [...el.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.textContent?.trim() === 'Release')?.click();
      fixture.detectChanges();

      expect(api.releaseOccupancy).toHaveBeenCalledWith('MjvuEl', 'b1', 'o1', { suppressErrorToast: true });
      expect(fixture.componentInstance.released).toEqual([b]);
      expect(el.querySelector('[role="alert"]')).toBeNull();
    });

    describe('when a release is refused because the room was already released', () => {
      const alreadyReleased = () => throwError(() => releaseRefusal('Occupancy is already inactive'));

      it('draws the room struck through and released, with no button', () => {
        const el = render(booking('checked-in', settled), { rows: [occupancy('o1', '101', 2, true)] });
        api.releaseOccupancy.mockReturnValue(alreadyReleased());

        releaseButtons(el)[0].click();
        fixture.detectChanges();

        expect(roomRows(el)).toEqual(['Room 101 · 2 guests hostBookings.released']);
        expect(roomLi(el, '101')?.querySelector('span')?.className).toContain('line-through');
        expect(releaseButtons(el)).toHaveLength(0);
      });

      it('shows translated copy naming the room, not the server text', () => {
        const el = render(booking('checked-in', settled), { rows: [occupancy('o1', '101', 2, true)] });
        api.releaseOccupancy.mockReturnValue(alreadyReleased());
        const translate = vi.spyOn(TestBed.inject(TranslocoService), 'translate');

        releaseButtons(el)[0].click();
        fixture.detectChanges();

        expect(el.querySelector('[role="alert"]')?.textContent?.trim()).toBe('hostBookings.roomAlreadyReleased');
        expect(translate.mock.calls.filter((c) => c[0] === 'hostBookings.roomAlreadyReleased').map((c) => c[1])).toContainEqual({
          room: '101',
        });
        expectNoLeak(el, 'Occupancy is already inactive');
      });

      it('announces the booking once so the page can read it again', () => {
        const b = booking('checked-in', settled);
        const el = render(b, { rows: [occupancy('o1', '101', 2, true)] });
        api.releaseOccupancy.mockReturnValue(alreadyReleased());

        releaseButtons(el)[0].click();
        fixture.detectChanges();

        expect(fixture.componentInstance.released).toEqual([b]);
      });

      it('does not read the rooms again', () => {
        const el = render(booking('checked-in', settled), { rows: [occupancy('o1', '101', 2, true)] });
        api.releaseOccupancy.mockReturnValue(alreadyReleased());

        releaseButtons(el)[0].click();
        fixture.detectChanges();

        expect(api.occupancies).toHaveBeenCalledTimes(1);
      });

      it('leaves the other rooms releasable', () => {
        const rows = [occupancy('o1', '101', 2, true), occupancy('o2', '102', 1, true)];
        const el = render(booking('checked-in', settled), { rows });
        api.releaseOccupancy.mockReturnValue(alreadyReleased());

        releaseButtons(el)[1].click();
        fixture.detectChanges();

        expect(roomRows(el)).toEqual(['Room 101 · 2 guests Release', 'Room 102 · 1 guest hostBookings.released']);
        const remaining = releaseButtons(el);
        expect(remaining).toHaveLength(1);
        expect(remaining[0].disabled).toBe(false);
        expect(roomLi(el, '101')?.querySelector('span')?.className).not.toContain('line-through');
      });

      it('keeps the message and the released room when the page swaps in the re-read booking', () => {
        const b = booking('checked-in', settled);
        const el = render(b, { rows: [occupancy('o1', '101', 2, true)] });
        api.releaseOccupancy.mockReturnValue(alreadyReleased());

        releaseButtons(el)[0].click();
        fixture.detectChanges();
        fixture.componentInstance.booking.set({ ...b, occupancies: [occupancy('o1', '101', 2, false)] });
        fixture.detectChanges();

        expect(el.querySelector('[role="alert"]')?.textContent?.trim()).toBe('hostBookings.roomAlreadyReleased');
        expect(roomRows(el)).toEqual(['Room 101 · 2 guests hostBookings.released']);
        expect(releaseButtons(el)).toHaveLength(0);
        expect(api.occupancies).toHaveBeenCalledTimes(1);
      });

      it('clears the message once another room is released', () => {
        const rows = [occupancy('o1', '101', 2, true), occupancy('o2', '102', 1, true)];
        const el = render(booking('checked-in', settled), { rows });
        api.releaseOccupancy.mockReturnValueOnce(alreadyReleased());

        releaseButtons(el)[1].click();
        fixture.detectChanges();
        expect(el.querySelector('[role="alert"]')).not.toBeNull();

        releaseButtons(el)[0].click();
        fixture.detectChanges();

        expect(el.querySelector('[role="alert"]')).toBeNull();
        expect(roomRows(el)).toEqual([
          'Room 101 · 2 guests hostBookings.released',
          'Room 102 · 1 guest hostBookings.released',
        ]);
      });
    });

    describe('when a release is refused for lack of permission', () => {
      const CANCAN = 'You are not authorized to access this page.';
      const alertText = (el: HTMLElement) => el.querySelector('[role="alert"]')?.textContent?.trim();

      afterEach(() => TestBed.inject(SessionStore).clear());

      /** Signs in as `role`, then presses Release on room 101 of a checked-in stay, which the server refuses with `failure`. */
      function pressRelease(role: Role, failure: unknown): HTMLElement {
        const el = render(booking('checked-in', settled), { rows: [occupancy('o1', '101', 2, true)] });
        TestBed.inject(SessionStore).setSession(sessionUser(role), 'tok');
        api.releaseOccupancy.mockReturnValue(throwError(() => failure));

        releaseButtons(el)[0].click();
        fixture.detectChanges();
        return el;
      }

      it('tells staff they lack permission and leaves the room active with its Release button', () => {
        const el = pressRelease('manager', releaseForbidden(CANCAN));

        expect(alertText(el)).toBe('hostBookings.notAllowed');
        expect(roomRows(el)).toEqual(['Room 101 · 2 guests Release']);
        expect(roomLi(el, '101')?.querySelector('span')?.className).not.toContain('line-through');
        expect(releaseButtons(el)[0].disabled).toBe(false);
        expect(fixture.componentInstance.released).toEqual([]);
        expect(api.releaseOccupancy).toHaveBeenCalledTimes(1);
        expect(api.occupancies).toHaveBeenCalledTimes(1);
        expectNoLeak(el, CANCAN);
      });

      it('tells the owner their account lacks permission and to contact support', () => {
        const el = pressRelease('host', releaseForbidden(CANCAN));

        expect(alertText(el)).toBe('hostBookings.notAllowedOwner');
        expect(roomRows(el)).toEqual(['Room 101 · 2 guests Release']);
        expect(fixture.componentInstance.released).toEqual([]);
        expectNoLeak(el, CANCAN);
      });

      it.each<Role>(['manager', 'host'])('says the plan has no CRM, whoever is signed in as %s', (role) => {
        const el = pressRelease(role, releaseForbidden('Your plan does not include CRM', 'crm_required'));

        expect(alertText(el)).toBe('hostBookings.planHasNoCrm');
        expect(roomRows(el)).toEqual(['Room 101 · 2 guests Release']);
        expect(fixture.componentInstance.released).toEqual([]);
        expectNoLeak(el, 'Your plan does not include CRM');
      });

      it('never reads a 403 as the room being already released, whatever text it carries', () => {
        const el = pressRelease('manager', releaseForbidden('Occupancy is already inactive'));

        expect(alertText(el)).toBe('hostBookings.notAllowed');
        expect(roomRows(el)).toEqual(['Room 101 · 2 guests Release']);
        expect(roomLi(el, '101')?.querySelector('span')?.className).not.toContain('line-through');
        expect(releaseButtons(el)).toHaveLength(1);
        expect(fixture.componentInstance.released).toEqual([]);
        expectNoLeak(el, 'Occupancy is already inactive');
      });
    });

    it.each([
      { case: 'an unrecognised refusal', rejection: releaseRefusal('Room 101 is locked.') },
      { case: 'a rejection with nothing in it', rejection: null },
      { case: 'a plain error', rejection: new Error('Room 101 is locked.') },
    ])('falls back to the generic message naming the room on $case', ({ rejection }) => {
      const el = render(booking('checked-in', settled), { rows: [occupancy('o1', '101', 2, true)] });
      api.releaseOccupancy.mockReturnValue(throwError(() => rejection));
      const translate = vi.spyOn(TestBed.inject(TranslocoService), 'translate');

      [...el.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.textContent?.trim() === 'Release')?.click();
      fixture.detectChanges();

      expect(fixture.componentInstance.released).toEqual([]);
      expect(roomRows(el)).toEqual(['Room 101 · 2 guests Release']);
      expect(roomLi(el, '101')?.querySelector('span')?.className).not.toContain('line-through');
      expect(el.querySelector('[role="alert"]')?.textContent?.trim()).toBe('hostBookings.couldNotReleaseRoom');
      expect(translate.mock.calls.filter((c) => c[0] === 'hostBookings.couldNotReleaseRoom').map((c) => c[1])).toContainEqual({
        room: '101',
      });
      expectNoLeak(el, 'Room 101 is locked');
    });

    it('says the server cannot be reached when the release never got there', () => {
      const el = render(booking('checked-in', settled), { rows: [occupancy('o1', '101', 2, true)] });
      api.releaseOccupancy.mockReturnValue(throwError(() => ({ status: 0, serverMessages: [], message: 'Http failure response for (unknown url): 0 Unknown Error' })));

      [...el.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.textContent?.trim() === 'Release')?.click();
      fixture.detectChanges();

      expect(fixture.componentInstance.released).toEqual([]);
      expect(releaseButtons(el)).toHaveLength(1);
      expect(el.querySelector('[role="alert"]')?.textContent?.trim()).toBe('common.cannotReachTheServer');
      expectNoLeak(el);
    });

    it('says a checked-out stay has been invoiced once it has an invoice, and that one can be raised otherwise', () => {
      const withInvoice = render(booking('checked-out', settled), { invoice: bookingInvoice() });
      expect(withInvoice.querySelector('footer')?.textContent).toContain('This stay has been invoiced.');

      TestBed.resetTestingModule();
      const without = render(booking('checked-out', settled));
      expect(without.querySelector('footer')?.textContent).toContain('An invoice can be raised once per booking.');
      expect(without.querySelector('footer')?.textContent).not.toContain('This stay has been invoiced.');
    });

    it('explains a no-show as a closed booking where the guest never arrived', () => {
      const el = render(booking('no-show'));
      expect(el.querySelector('footer')?.textContent).toContain('The guest never arrived, so this booking is closed.');
    });

    it('emits viewInvoice from the footer button rather than navigating itself', () => {
      const b = booking('checked-out', settled);
      const el = render(b, { invoice: bookingInvoice() });

      footerButton(el, 'View invoice')?.click();

      expect(fixture.componentInstance.acted).toEqual(['viewInvoice']);
    });
  });
});
