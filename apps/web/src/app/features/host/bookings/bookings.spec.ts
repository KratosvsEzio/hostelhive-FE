import { WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslocoService } from '@jsverse/transloco';
import { Observable, Subject, defer, of, throwError } from 'rxjs';
import { Invoice } from '@hostelhive/data-access';
import { HostPage, HostPageDeps, hostPageDeps, openHostPage } from '@app/testing/host-page';
import {
  HOSTEL_ID,
  apiError,
  bookingInvoice,
  bookingPage,
  hostBooking,
  occupancy,
} from '@app/testing/host-builders';
import { MoneyPipe } from '@app/shared/currency/money.pipe';
import { currencySymbol } from '@util/currencies';
import { bookingPath, invoicePath } from '@util/host-links';
import { buildInvoiceId, invoiceStatusLabel } from '@util/table-configs/invoice-table-cols';
import { AssignSelection } from './assign-rooms-panel';
import { BookingCalendar } from './booking-calendar';
import { BookingAction } from './booking-details-panel';
import { HostBookings } from './bookings';
import { HostBooking } from './host-bookings-api';

/** The page's protected surface, reached the way the template reaches it. */
interface Internals {
  openDetails(b: HostBooking): void;
  closeDetails(): void;
  closeDialog(): void;
  closeAssign(): void;
  onAct(e: { action: BookingAction; booking: HostBooking }): void;
  confirmDialog(): void;
  onAssign(sel: AssignSelection): void;
  onReleased(b: HostBooking): void;
  onSaved(): void;
  viewing(): HostBooking | null;
  rows(): HostBooking[];
  rowActions(b: HostBooking): readonly BookingAction[];
  invoices(): ReadonlyMap<string, Invoice | null>;
  busy(): boolean;
  dialog(): { action: BookingAction; booking: HostBooking } | null;
  assigning(): HostBooking | null;
  dialogError(): string;
  assignError(): string;
  viewError(): string;
  dialogReason: WritableSignal<string>;
  payInvoiceToo(): boolean;
}

type Page = HostPage<HostBookings>;

const LIST_URL = `/host/${HOSTEL_ID}/bookings`;
const QUIET = { suppressErrorToast: true };

/** The interceptor's shape: `message` carries the server's own wording. */
const refusal = (message: string, status = 422) => ({ ...apiError(status, [message]), message });

const MOVE_URL = `http://localhost/api/host/hostels/${HOSTEL_ID}/bookings/bk-i`;

/** A refusal whose `message` is Angular's, carrying the API URL — neither may reach the screen. */
const urlRefusal = (text: string, status = 422) => ({
  ...apiError(status, [text]),
  message: `Http failure response for ${MOVE_URL}: ${status} Unprocessable Entity`,
});

/** Everything the host could read: the page's text and every toast raised. */
function shownText(page: Page, deps: HostPageDeps): string {
  const toasts = deps.notifications.raised.map((t) => `${t.title} ${t.message ?? ''}`);
  return [page.el.textContent ?? '', ...toasts].join(' ');
}

function expectNoLeak(page: Page, deps: HostPageDeps, ...leaks: string[]): void {
  const shown = shownText(page, deps);
  expect(shown).not.toContain('Http failure');
  expect(shown).not.toContain('http://');
  for (const leak of leaks) expect(shown).not.toContain(leak);
}

/** Owes its whole total unless said. */
const checkedIn = (over: Partial<HostBooking> = {}) =>
  hostBooking('checked-in', { id: 'bk-i', ref: 'BK-I', ...over });
const settledOf = (b: HostBooking) => ({ ...b, paid: b.total, balanceDue: 0 });
const inv = (over: Partial<Invoice> = {}) => bookingInvoice({ id: 'rb-1', status: 'due', ...over });

interface OpenOptions {
  items?: HostBooking[];
  invoices?: [string, Invoice][];
  deps?: HostPageDeps;
  url?: string;
}

const api = (page: Page) => page.component as unknown as Internals;

async function settle(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) await page.settle();
}

async function open(o: OpenOptions = {}): Promise<Page> {
  const deps = o.deps ?? hostPageDeps();
  if (o.items) deps.bookings.list.mockReturnValue(of(bookingPage(o.items)));
  if (o.invoices) deps.ops.bookingInvoices.mockReturnValue(of(new Map(o.invoices)));
  const page = await openHostPage(o.url ?? LIST_URL, HostBookings, { bookings: HostBookings }, { deps });
  await settle(page);
  return page;
}

const textOf = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const panelText = (page: Page) => textOf(page.el.querySelector('hh-booking-details-panel'));
const modal = (page: Page) => page.el.querySelector<HTMLElement>('hh-confirm-modal');

async function showList(page: Page): Promise<void> {
  const tab = Array.from(page.el.querySelectorAll<HTMLButtonElement>('button[role="tab"]')).find((b) =>
    textOf(b).includes('hostBookings.listTab'),
  );
  tab!.click();
  await settle(page);
}

async function openMenu(page: Page, row = 0): Promise<void> {
  page.el.querySelectorAll<HTMLButtonElement>('button[aria-label="a11y.rowActions"]')[row].click();
  await settle(page);
}

const menuLabels = (page: Page) =>
  Array.from(page.el.querySelectorAll('hh-context-menu [role="menuitem"]')).map((b) => textOf(b));

async function pick(page: Page, label: string): Promise<void> {
  const items = page.el.querySelectorAll<HTMLButtonElement>('hh-context-menu [role="menuitem"]');
  const item = Array.from(items).find((b) => textOf(b) === label);
  item!.click();
  await settle(page);
}

/** List tab, row menu, then the named move. */
async function startFromMenu(page: Page, label: string, row = 0): Promise<void> {
  await showList(page);
  await openMenu(page, row);
  await pick(page, label);
}

const dialogButtons = (page: Page) => Array.from(modal(page)!.querySelectorAll<HTMLButtonElement>('button'));
const confirmButton = (page: Page) => dialogButtons(page).at(-1)!;
const cancelButton = (page: Page) => dialogButtons(page).at(-2)!;
const checkbox = (page: Page) => modal(page)?.querySelector<HTMLInputElement>('input[type="checkbox"]') ?? null;

async function confirmViaButton(page: Page): Promise<void> {
  confirmButton(page).click();
  await settle(page);
}

/** The translate calls the page and its pipes made for one key. */
function translations(spy: { mock: { calls: unknown[][] } }, key: string): unknown[][] {
  return spy.mock.calls.filter((c) => c[0] === key);
}

/** Queues what `get` answers, call by call; once the queue runs out it is the stub's `NEVER` again. */
function queueReads(deps: HostPageDeps, ...replies: Observable<HostBooking>[]): void {
  for (const reply of replies) deps.bookings.get.mockReturnValueOnce(reply);
}

/** The calendar the page mounts while its calendar tab is showing, which is the page's default. */
function calendarOf(page: Page): BookingCalendar {
  const found = page.harness.fixture.debugElement.query(By.directive(BookingCalendar));
  return found.componentInstance as BookingCalendar;
}

const panelFooterButtons = (page: Page) =>
  Array.from(page.el.querySelectorAll('hh-booking-details-panel footer button')).map((b) => textOf(b));
const panelFooterAlert = (page: Page) =>
  textOf(page.el.querySelector('hh-booking-details-panel footer [role="alert"]'));
const assignAlert = (page: Page) => textOf(page.el.querySelector('hh-assign-rooms-panel [role="alert"]'));
const dialogAlert = (page: Page) => textOf(modal(page)?.querySelector('[role="alert"]'));

/** The row menu's entry for each move that has one. */
const MENU_LABEL: Readonly<Partial<Record<BookingAction, string>>> = {
  checkIn: 'Check in',
  checkOut: 'Check out',
  cancel: 'Cancel booking',
  noShow: 'Mark no show',
  markPaid: 'Mark as paid',
  invoice: 'Generate invoice',
};

const ROOM_PICK = [{ roomId: 'r-101', roomNumber: '101', guests: 2 }];

/** Makes the server refuse the move with `err`. */
function refuseMove(deps: HostPageDeps, action: BookingAction, err: unknown): void {
  const refused = throwError(() => err);
  switch (action) {
    case 'confirm':
      deps.bookings.confirm.mockReturnValue(refused);
      return;
    case 'checkIn':
      deps.bookings.checkIn.mockReturnValue(refused);
      return;
    case 'checkOut':
      deps.bookings.checkOut.mockReturnValue(refused);
      return;
    case 'cancel':
      deps.bookings.cancel.mockReturnValue(refused);
      return;
    case 'noShow':
      deps.bookings.markNoShow.mockReturnValue(refused);
      return;
    case 'markPaid':
      deps.bookings.markPaid.mockReturnValue(refused);
      return;
    case 'invoice':
      deps.bookings.generateInvoice.mockReturnValue(refused);
      return;
    default:
      throw new Error(`${action} is not a move the server can refuse`);
  }
}

/** Row menu, then the move's entry: its dialog, or the room allocation for a check-in. */
const startMove = (page: Page, action: BookingAction) => startFromMenu(page, MENU_LABEL[action]!);

/** Sends the move that is open, as the allocation's or the dialog's button would. */
function submitMove(page: Page, action: BookingAction, booking: HostBooking): void {
  if (action === 'checkIn') {
    api(page).onAssign({ bookingId: booking.id, rooms: ROOM_PICK });
    return;
  }
  if (action === 'cancel') api(page).dialogReason.set('Guest asked to cancel');
  api(page).confirmDialog();
}

/** Opens the booking's details the way a click does, so the page reads it from the database once. */
async function openPanel(page: Page, booking: HostBooking): Promise<void> {
  api(page).openDetails(booking);
  await settle(page);
}

const arriving = (over: Partial<HostBooking> = {}) => hostBooking('confirmed', { id: 'bk-c', ...over });
const BOTH_ROOMS = [occupancy(), occupancy({ id: 'oc-2', roomId: 'r-102', roomNumber: '102', guests: 1 })];

/**
 * A stay move the server refused because the booking is not where the page shows it: `shown` is
 * the copy on screen and `fresh` the one the database holds. `done` means the move was already
 * made; `movedOn` that the booking left the stage the move starts from.
 */
interface MovedOnPair {
  name: string;
  action: BookingAction;
  kind: 'done' | 'movedOn';
  text: string;
  /** The translation key the host is shown. */
  key: string;
  shown: HostBooking;
  fresh: HostBooking;
  /** The details panel's buttons once it shows `fresh`; set for the dialog moves. */
  footer?: readonly string[];
}

const MOVED_ON: readonly MovedOnPair[] = [
  {
    name: 'a check-in of a booking already checked in',
    action: 'checkIn',
    kind: 'done',
    text: 'Booking is already checked in',
    key: 'hostBookings.alreadyCheckedIn',
    shown: arriving(),
    fresh: hostBooking('checked-in', { id: 'bk-c', occupancies: BOTH_ROOMS }),
  },
  {
    name: 'a check-in of a booking that was cancelled',
    action: 'checkIn',
    kind: 'movedOn',
    text: 'Only confirmed bookings can be checked in',
    key: 'hostBookings.bookingHasMovedOn',
    shown: arriving(),
    fresh: hostBooking('cancelled', { id: 'bk-c' }),
  },
  {
    name: 'a cancellation of a booking that can no longer be cancelled',
    action: 'cancel',
    kind: 'movedOn',
    text: 'This booking can no longer be cancelled',
    key: 'hostBookings.bookingHasMovedOn',
    shown: checkedIn(),
    fresh: hostBooking('cancelled', { id: 'bk-i', ref: 'BK-I' }),
    footer: ['Close'],
  },
  {
    name: 'a no-show of a booking that has checked in',
    action: 'noShow',
    kind: 'movedOn',
    text: 'Only confirmed bookings can be marked a no show',
    key: 'hostBookings.bookingHasMovedOn',
    shown: arriving(),
    fresh: hostBooking('checked-in', { id: 'bk-c' }),
    footer: ['Cancel booking', 'Generate invoice', 'Mark as paid', 'Check out'],
  },
  {
    name: 'a check-out of a booking that has checked out',
    action: 'checkOut',
    kind: 'movedOn',
    text: 'Only checked-in bookings can be checked out',
    key: 'hostBookings.bookingHasMovedOn',
    shown: checkedIn(),
    fresh: hostBooking('checked-out', { id: 'bk-i', ref: 'BK-I' }),
    footer: ['Mark as paid', 'Generate invoice'],
  },
  {
    name: 'a payment on a booking that was cancelled',
    action: 'markPaid',
    kind: 'movedOn',
    text: 'Only confirmed, checked-in, checked-out or no-show bookings can be marked paid',
    key: 'hostBookings.bookingHasMovedOn',
    shown: checkedIn(),
    fresh: hostBooking('cancelled', { id: 'bk-i', ref: 'BK-I' }),
    footer: ['Close'],
  },
  {
    name: 'an invoice for a booking that was cancelled',
    action: 'invoice',
    kind: 'movedOn',
    text: 'Only checked-in bookings can be invoiced',
    key: 'hostBookings.bookingHasMovedOn',
    shown: settledOf(checkedIn()),
    fresh: hostBooking('cancelled', { id: 'bk-i', ref: 'BK-I' }),
    footer: ['Close'],
  },
  {
    name: 'a payment on a booking already paid',
    action: 'markPaid',
    kind: 'done',
    text: 'This booking is already paid',
    key: 'hostBookings.bookingAlreadyPaid',
    shown: checkedIn(),
    fresh: settledOf(checkedIn()),
  },
];

/** The moves that free beds, so the rooms page is told when one of them is found already made. */
const ROOM_MOVES: readonly BookingAction[] = ['checkIn', 'checkOut', 'cancel'];
/** Every pair above uses current slugs, so a raw comparison tells the stage apart. */
const slugChanged = (m: MovedOnPair) => m.fresh.disposition.slug !== m.shown.disposition.slug;

describe('HostBookings', () => {
  describe('looking up invoices for the page', () => {
    it('asks once per page, with the checked-in and checked-out bookings only', async () => {
      const deps = hostPageDeps();
      await open({
        deps,
        items: [
          hostBooking('pending', { id: 'bk-p' }),
          hostBooking('confirmed', { id: 'bk-c' }),
          checkedIn(),
          hostBooking('checked-out', { id: 'bk-o' }),
          hostBooking('cancelled', { id: 'bk-x' }),
          hostBooking('no-show', { id: 'bk-n' }),
        ],
      });

      expect(deps.ops.bookingInvoices).toHaveBeenCalledTimes(1);
      const [hostelId, ids] = deps.ops.bookingInvoices.mock.calls[0];
      expect(hostelId).toBe(HOSTEL_ID);
      expect([...ids].sort()).toEqual(['bk-i', 'bk-o']);
    });

    it('does not ask when no booking on the page can have an invoice', async () => {
      const deps = hostPageDeps();
      await open({
        deps,
        items: [hostBooking('pending', { id: 'bk-p' }), hostBooking('confirmed', { id: 'bk-c' })],
      });

      expect(deps.ops.bookingInvoices).not.toHaveBeenCalled();
    });

    it('does not ask when the page is empty', async () => {
      const deps = hostPageDeps();
      await open({ deps, items: [] });

      expect(deps.ops.bookingInvoices).not.toHaveBeenCalled();
    });
  });

  describe('the row menu', () => {
    it('offers View invoice once an invoice was found', async () => {
      const page = await open({ items: [settledOf(checkedIn())], invoices: [['bk-i', inv()]] });
      await showList(page);
      await openMenu(page);

      const labels = menuLabels(page);
      expect(labels).toContain('View invoice');
      expect(labels).not.toContain('Generate invoice');
    });

    it('offers Generate invoice when none was found', async () => {
      const page = await open({ items: [settledOf(checkedIn())] });
      await showList(page);
      await openMenu(page);

      const labels = menuLabels(page);
      expect(labels).toContain('Generate invoice');
      expect(labels).not.toContain('View invoice');
    });
  });

  describe('keeping what is known about an invoice', () => {
    /** Opens with `before` known, then lets a second page lookup answer with `found`. */
    async function relookup(before: Invoice | null, found: Invoice | null) {
      const deps = hostPageDeps();
      const page = await open({
        deps,
        items: [checkedIn()],
        invoices: before ? [['bk-i', before]] : [],
      });
      deps.ops.bookingInvoices.mockReturnValue(of(new Map<string, Invoice>(found ? [['bk-i', found]] : [])));
      api(page).onSaved();
      await settle(page);
      expect(deps.ops.bookingInvoices).toHaveBeenCalledTimes(2);
      return api(page).invoices().get('bk-i');
    }

    it('records a booking with no invoice as looked up, not as unknown', async () => {
      const page = await open({ items: [checkedIn()] });

      expect(api(page).invoices().has('bk-i')).toBe(true);
      expect(api(page).invoices().get('bk-i')).toBeNull();
    });

    it('never replaces a known invoice with null when a later lookup finds nothing', async () => {
      const known = inv();

      expect(await relookup(known, null)).toEqual(known);
    });

    it('keeps a paid invoice when a stale lookup returns the same bill still due', async () => {
      const result = await relookup(inv({ status: 'paid' }), inv({ status: 'due' }));

      expect(result?.id).toBe('rb-1');
      expect(result?.status).toBe('paid');
    });

    it('replaces a paid invoice with a different bill', async () => {
      const result = await relookup(inv({ status: 'paid' }), inv({ id: 'rb-9', status: 'due' }));

      expect(result?.id).toBe('rb-9');
      expect(result?.status).toBe('due');
    });

    it('replaces a paid invoice with a newer paid copy of it', async () => {
      const result = await relookup(inv({ status: 'paid', amount: 24000 }), inv({ status: 'paid', amount: 25000 }));

      expect(result?.status).toBe('paid');
      expect(result?.amount).toBe(25000);
    });

    it('takes the lookup copy when the known one was still due', async () => {
      const result = await relookup(inv({ status: 'due' }), inv({ status: 'paid' }));

      expect(result?.status).toBe('paid');
    });
  });

  describe('the page lookup against the panel lookup', () => {
    it('leaves the page-wide lookup loud, so its failure toast is not hidden', async () => {
      const deps = hostPageDeps();
      deps.ops.bookingInvoices.mockReturnValue(throwError(() => apiError(500)));
      await open({ deps, items: [checkedIn()] });

      expect(deps.ops.bookingInvoices.mock.calls[0][2]).toBeUndefined();
    });

    it('makes the lookup for a booking opened off the page quiet', async () => {
      const deps = hostPageDeps();
      const page = await open({ deps, items: [] });

      api(page).openDetails(checkedIn({ id: 'off-1' }));
      await settle(page);

      expect(deps.ops.bookingInvoices).toHaveBeenCalledTimes(1);
      expect(deps.ops.bookingInvoices.mock.calls[0][1]).toEqual(['off-1']);
      expect(deps.ops.bookingInvoices.mock.calls[0][2]).toEqual(QUIET);
    });

    it('shows the panel error state when the panel lookup fails', async () => {
      const deps = hostPageDeps();
      deps.ops.bookingInvoices.mockReturnValue(throwError(() => apiError(500)));
      const page = await open({ deps, items: [] });

      api(page).openDetails(checkedIn({ id: 'off-1' }));
      await settle(page);

      expect(panelText(page)).toContain('hostBookings.couldNotCheckInvoice');
      expect(deps.notifications.raised).toEqual([]);
    });
  });

  describe('opening a booking from off the page', () => {
    it('makes one lookup and no duplicate while the first is still out', async () => {
      const deps = hostPageDeps();
      const pending = new Subject<Map<string, Invoice>>();
      deps.ops.bookingInvoices.mockReturnValue(pending);
      const page = await open({ deps, items: [] });
      const off = checkedIn({ id: 'off-1' });

      api(page).openDetails(off);
      await settle(page);
      api(page).closeDetails();
      await settle(page);
      api(page).openDetails({ ...off });
      await settle(page);

      expect(deps.ops.bookingInvoices).toHaveBeenCalledTimes(1);
      expect(panelText(page)).toContain('hostBookings.checkingForInvoice');
    });

    it('shows the invoice once the lookup answers', async () => {
      const deps = hostPageDeps();
      deps.ops.bookingInvoices.mockReturnValue(of(new Map([['off-1', inv({ id: 'rb-7' })]])));
      const page = await open({ deps, items: [] });

      api(page).openDetails(checkedIn({ id: 'off-1' }));
      await settle(page);

      expect(panelText(page)).toContain(buildInvoiceId(inv({ id: 'rb-7' })));
    });

    it('makes no lookup for a booking that cannot have an invoice', async () => {
      const deps = hostPageDeps();
      const page = await open({ deps, items: [] });

      api(page).openDetails(hostBooking('confirmed', { id: 'off-2' }));
      api(page).openDetails(hostBooking('pending', { id: 'off-3' }));
      await settle(page);

      expect(deps.ops.bookingInvoices).not.toHaveBeenCalled();
    });
  });

  describe('generating an invoice', () => {
    it('sends it quiet, shows the returned bill with no second lookup, and raises one toast', async () => {
      const deps = hostPageDeps();
      const generated = inv({ id: 'rb-9', amount: 25000 });
      deps.bookings.generateInvoice.mockReturnValue(of(generated));
      const page = await open({ deps, items: [settledOf(checkedIn())] });

      await startFromMenu(page, 'Generate invoice');
      expect(modal(page)).not.toBeNull();
      await confirmViaButton(page);

      expect(deps.bookings.generateInvoice).toHaveBeenCalledWith(HOSTEL_ID, 'bk-i', QUIET);
      expect(deps.ops.bookingInvoices).toHaveBeenCalledTimes(1);
      expect(api(page).invoices().get('bk-i')).toEqual(generated);
      expect(modal(page)).toBeNull();

      expect(deps.notifications.raised).toHaveLength(1);
      const [toast] = deps.notifications.raised;
      expect(toast.kind).toBe('success');
      expect(toast.title).toBe('Invoice generated');
      const booking = api(page).rows()[0];
      expect(booking.total).not.toBe(generated.amount);
      const shown = TestBed.runInInjectionContext(() => new MoneyPipe().transform(generated.amount));
      expect(toast.message).toBe(`${buildInvoiceId(generated)} · ${currencySymbol(booking.currency)} ${shown}`);

      await openMenu(page);
      expect(menuLabels(page)).toContain('View invoice');
      expect(menuLabels(page)).not.toContain('Generate invoice');
    });

    it('closes the dialog, says so, and looks again when the server says one already exists', async () => {
      const deps = hostPageDeps();
      const text = 'An invoice already exists for this booking.';
      deps.bookings.generateInvoice.mockReturnValue(throwError(() => refusal(text)));
      const page = await open({ deps, items: [settledOf(checkedIn())] });

      await startFromMenu(page, 'Generate invoice');
      deps.ops.bookingInvoices.mockReturnValue(of(new Map([['bk-i', inv()]])));
      await confirmViaButton(page);

      expect(modal(page)).toBeNull();
      // Recognised from the server's text, but announced in translated copy rather than quoted.
      expect(deps.notifications.raised).toEqual([
        { kind: 'info', title: 'hostBookings.invoiceAlreadyExists', message: undefined },
      ]);
      expect(deps.ops.bookingInvoices).toHaveBeenCalledTimes(2);
      expect(deps.ops.bookingInvoices.mock.calls[1][1]).toEqual(['bk-i']);
      expect(api(page).invoices().get('bk-i')).toEqual(inv());
      // An invoice that exists is not a booking that moved, so the booking is not read again.
      expect(deps.bookings.get).not.toHaveBeenCalled();
    });

    it('looks again quietly when the panel is back on that booking to say so itself', async () => {
      const deps = hostPageDeps();
      deps.bookings.generateInvoice.mockReturnValue(
        throwError(() => refusal('An invoice already exists for this booking.')),
      );
      const booking = settledOf(checkedIn());
      const page = await open({ deps, items: [booking] });

      api(page).openDetails(booking);
      await settle(page);
      api(page).onAct({ action: 'invoice', booking });
      await settle(page);
      api(page).confirmDialog();
      await settle(page);

      expect(api(page).viewing()?.id).toBe('bk-i');
      expect(deps.ops.bookingInvoices).toHaveBeenCalledTimes(2);
      expect(deps.ops.bookingInvoices.mock.calls[1][2]).toEqual(QUIET);
    });

    it('keeps the dialog open for any other refusal, and does not look again', async () => {
      const deps = hostPageDeps();
      const text = 'Disposition is invalid';
      deps.bookings.generateInvoice.mockReturnValue(throwError(() => refusal(text)));
      const page = await open({ deps, items: [settledOf(checkedIn())] });

      await startFromMenu(page, 'Generate invoice');
      await confirmViaButton(page);

      expect(modal(page)).not.toBeNull();
      expect(textOf(modal(page)!.querySelector('[role="alert"]'))).toBe('hostBookings.moveNotAccepted');
      expect(api(page).dialogError()).toBe('hostBookings.moveNotAccepted');
      expectNoLeak(page, deps, text);
      expect(deps.ops.bookingInvoices).toHaveBeenCalledTimes(1);
      expect(deps.bookings.get).not.toHaveBeenCalled();
      expect(deps.notifications.raised).toEqual([]);
      expect(api(page).busy()).toBe(false);
    });
  });

  describe('the cross-pay checkbox', () => {
    it('shows only in the mark-as-paid dialog, ticked, while the invoice is unpaid', async () => {
      const page = await open({ items: [checkedIn()], invoices: [['bk-i', inv()]] });

      await startFromMenu(page, 'Mark as paid');

      expect(checkbox(page)).not.toBeNull();
      expect(checkbox(page)!.checked).toBe(true);
      expect(api(page).payInvoiceToo()).toBe(true);
    });

    it('is ticked again on reopen after the host unticked it', async () => {
      const page = await open({ items: [checkedIn()], invoices: [['bk-i', inv()]] });

      await startFromMenu(page, 'Mark as paid');
      checkbox(page)!.click();
      await settle(page);
      expect(checkbox(page)!.checked).toBe(false);
      expect(api(page).payInvoiceToo()).toBe(false);

      cancelButton(page).click();
      await settle(page);
      expect(modal(page)).toBeNull();

      await openMenu(page);
      await pick(page, 'Mark as paid');
      expect(checkbox(page)!.checked).toBe(true);
      expect(api(page).payInvoiceToo()).toBe(true);
    });

    it('names the invoice in the checkbox label', async () => {
      const page = await open({ items: [checkedIn()], invoices: [['bk-i', inv()]] });
      const translate = vi.spyOn(TestBed.inject(TranslocoService), 'translate');

      await startFromMenu(page, 'Mark as paid');

      const calls = translations(translate, 'hostBookings.alsoMarkInvoicePaid');
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.some((c) => (c[1] as { invoice?: string })?.invoice === buildInvoiceId(inv()))).toBe(true);
    });

    it('is absent from the other dialogs even when the invoice is unpaid', async () => {
      const page = await open({ items: [checkedIn()], invoices: [['bk-i', inv()]] });

      await startFromMenu(page, 'Check out');

      expect(modal(page)).not.toBeNull();
      expect(checkbox(page)).toBeNull();
    });

    it('is absent when the invoice is already paid', async () => {
      const page = await open({ items: [checkedIn()], invoices: [['bk-i', inv({ status: 'paid' })]] });

      await startFromMenu(page, 'Mark as paid');

      expect(modal(page)).not.toBeNull();
      expect(checkbox(page)).toBeNull();
    });

    it('is absent when the booking has no invoice', async () => {
      const page = await open({ items: [checkedIn()] });

      await startFromMenu(page, 'Mark as paid');

      expect(modal(page)).not.toBeNull();
      expect(checkbox(page)).toBeNull();
    });
  });

  describe('marking a booking paid', () => {
    it('pays the booking, then its invoice, both quiet, and raises one toast', async () => {
      const deps = hostPageDeps();
      const booking = checkedIn();
      deps.bookings.markPaid.mockReturnValue(of(settledOf(booking)));
      deps.ops.markInvoicePaid.mockReturnValue(of(inv({ status: 'paid' })));
      const page = await open({ deps, items: [booking], invoices: [['bk-i', inv()]] });

      await startFromMenu(page, 'Mark as paid');
      await confirmViaButton(page);

      expect(deps.bookings.markPaid).toHaveBeenCalledWith(HOSTEL_ID, 'bk-i', QUIET);
      expect(deps.ops.markInvoicePaid).toHaveBeenCalledWith(HOSTEL_ID, 'rb-1', QUIET);
      expect(deps.bookings.markPaid.mock.invocationCallOrder[0]).toBeLessThan(
        deps.ops.markInvoicePaid.mock.invocationCallOrder[0],
      );
      expect(deps.notifications.raised).toEqual([
        { kind: 'success', title: 'hostBookings.bookingAndInvoicePaid', message: undefined },
      ]);
      expect(modal(page)).toBeNull();
      expect(api(page).rows()[0].balanceDue).toBe(0);

      api(page).openDetails(api(page).rows()[0]);
      await settle(page);
      expect(api(page).invoices().get('bk-i')?.status).toBe('paid');
      const pills = Array.from(page.el.querySelectorAll('hh-booking-details-panel hh-status-pill'));
      const invoicePill = pills.find((p) => p.closest('span.flex')?.textContent?.includes(buildInvoiceId(inv())));
      expect(invoicePill).toBeDefined();
      expect(textOf(invoicePill)).toBe(invoiceStatusLabel('paid'));
      expect(textOf(invoicePill)).not.toBe(invoiceStatusLabel('due'));
    });

    it('still updates the booking row when the invoice is refused, and gives a translated reason', async () => {
      const deps = hostPageDeps();
      const booking = checkedIn();
      deps.bookings.markPaid.mockReturnValue(of(settledOf(booking)));
      deps.ops.markInvoicePaid.mockReturnValue(throwError(() => refusal('The invoice is locked.')));
      const page = await open({ deps, items: [booking], invoices: [['bk-i', inv()]] });
      const translate = vi.spyOn(TestBed.inject(TranslocoService), 'translate');

      await startFromMenu(page, 'Mark as paid');
      await confirmViaButton(page);

      expect(api(page).rows()[0].balanceDue).toBe(0);
      expect(modal(page)).toBeNull();
      expect(api(page).invoices().get('bk-i')?.status).toBe('due');
      expect(deps.notifications.raised).toEqual([
        { kind: 'error', title: 'hostBookings.invoiceNotPaid', message: undefined },
      ]);
      // The reason is translated copy (keys resolve to themselves here), never the server's text.
      expect(translations(translate, 'hostBookings.invoiceNotPaid').map((c) => c[1])).toContainEqual({
        reason: 'hostBookings.payTheInvoiceOnItsOwn',
      });
    });

    it('says the invoice is gone when its request answers 404', async () => {
      const deps = hostPageDeps();
      const booking = checkedIn();
      deps.bookings.markPaid.mockReturnValue(of(settledOf(booking)));
      deps.ops.markInvoicePaid.mockReturnValue(throwError(() => apiError(404, ['Not Found'])));
      const page = await open({ deps, items: [booking], invoices: [['bk-i', inv()]] });
      const translate = vi.spyOn(TestBed.inject(TranslocoService), 'translate');

      await startFromMenu(page, 'Mark as paid');
      await confirmViaButton(page);

      const [params] = translations(translate, 'hostBookings.invoiceNotPaid').map((c) => c[1]);
      expect(params).toEqual({ reason: 'hostBookings.invoiceNoLongerExists' });
    });

    it('falls back to a generic translated reason when the invoice refusal carries no message', async () => {
      const deps = hostPageDeps();
      const booking = checkedIn();
      deps.bookings.markPaid.mockReturnValue(of(settledOf(booking)));
      deps.ops.markInvoicePaid.mockReturnValue(throwError(() => ({})));
      const page = await open({ deps, items: [booking], invoices: [['bk-i', inv()]] });
      const translate = vi.spyOn(TestBed.inject(TranslocoService), 'translate');

      await startFromMenu(page, 'Mark as paid');
      await confirmViaButton(page);

      const [params] = translations(translate, 'hostBookings.invoiceNotPaid').map((c) => c[1]);
      expect(params).toEqual({ reason: 'hostBookings.payTheInvoiceOnItsOwn' });
      expect(deps.notifications.raised).toHaveLength(1);
      expect(deps.notifications.raised[0].kind).toBe('error');
    });

    it('lets no invoice server text or API URL reach the screen or the toast', async () => {
      const deps = hostPageDeps();
      const booking = checkedIn();
      const text = 'Status is invalid';
      deps.bookings.markPaid.mockReturnValue(of(settledOf(booking)));
      deps.ops.markInvoicePaid.mockReturnValue(throwError(() => urlRefusal(text)));
      const page = await open({ deps, items: [booking], invoices: [['bk-i', inv()]] });
      const translate = vi.spyOn(TestBed.inject(TranslocoService), 'translate');

      await startFromMenu(page, 'Mark as paid');
      await confirmViaButton(page);

      expect(deps.notifications.raised).toHaveLength(1);
      expectNoLeak(page, deps, text);
      const params = JSON.stringify(translations(translate, 'hostBookings.invoiceNotPaid'));
      expect(params).not.toContain(text);
      expect(params).not.toContain('http');
    });

    it('never sends the invoice request when the booking is refused, and shows why in the dialog', async () => {
      const deps = hostPageDeps();
      const text = 'Disposition is invalid';
      deps.bookings.markPaid.mockReturnValue(throwError(() => refusal(text)));
      const page = await open({ deps, items: [checkedIn()], invoices: [['bk-i', inv()]] });

      await startFromMenu(page, 'Mark as paid');
      await confirmViaButton(page);

      expect(deps.ops.markInvoicePaid).not.toHaveBeenCalled();
      expect(modal(page)).not.toBeNull();
      expect(textOf(modal(page)!.querySelector('[role="alert"]'))).toBe('hostBookings.moveNotAccepted');
      expectNoLeak(page, deps, text);
      expect(deps.bookings.get).not.toHaveBeenCalled();
      expect(deps.notifications.raised).toEqual([]);
      expect(api(page).busy()).toBe(false);
      expect(api(page).rows()[0].balanceDue).toBe(24000);
    });

    it('sends only the booking request, with the plain toast, when the box is unticked', async () => {
      const deps = hostPageDeps();
      const booking = checkedIn();
      deps.bookings.markPaid.mockReturnValue(of(settledOf(booking)));
      const page = await open({ deps, items: [booking], invoices: [['bk-i', inv()]] });

      await startFromMenu(page, 'Mark as paid');
      checkbox(page)!.click();
      await settle(page);
      await confirmViaButton(page);

      expect(deps.bookings.markPaid).toHaveBeenCalledTimes(1);
      expect(deps.ops.markInvoicePaid).not.toHaveBeenCalled();
      expect(deps.notifications.raised).toEqual([
        { kind: 'success', title: 'Marked as paid', message: 'Nothing is left due on this booking.' },
      ]);
      expect(api(page).invoices().get('bk-i')?.status).toBe('due');
    });

    it('sends only the booking request when there is no invoice', async () => {
      const deps = hostPageDeps();
      const booking = checkedIn();
      deps.bookings.markPaid.mockReturnValue(of(settledOf(booking)));
      const page = await open({ deps, items: [booking] });

      await startFromMenu(page, 'Mark as paid');
      await confirmViaButton(page);

      expect(deps.ops.markInvoicePaid).not.toHaveBeenCalled();
      expect(deps.notifications.raised).toHaveLength(1);
      expect(deps.notifications.raised[0].title).toBe('Marked as paid');
    });

    it('holds busy across both requests, so a second confirm or another move does nothing', async () => {
      const deps = hostPageDeps();
      const booking = checkedIn();
      const pendingBooking = hostBooking('pending', { id: 'bk-p' });
      const first = new Subject<HostBooking>();
      const second = new Subject<Invoice>();
      deps.bookings.markPaid.mockReturnValue(first);
      deps.ops.markInvoicePaid.mockReturnValue(second);
      const page = await open({ deps, items: [booking, pendingBooking], invoices: [['bk-i', inv()]] });

      await startFromMenu(page, 'Mark as paid');
      await confirmViaButton(page);
      expect(api(page).busy()).toBe(true);
      expect(confirmButton(page).disabled).toBe(true);
      expect(checkbox(page)!.disabled).toBe(true);

      api(page).confirmDialog();
      api(page).onAct({ action: 'confirm', booking: pendingBooking });
      expect(deps.bookings.markPaid).toHaveBeenCalledTimes(1);
      expect(deps.bookings.confirm).not.toHaveBeenCalled();

      first.next(settledOf(booking));
      first.complete();
      await settle(page);
      expect(deps.ops.markInvoicePaid).toHaveBeenCalledTimes(1);
      expect(api(page).busy()).toBe(true);

      api(page).confirmDialog();
      api(page).onAct({ action: 'confirm', booking: pendingBooking });
      expect(deps.bookings.markPaid).toHaveBeenCalledTimes(1);
      expect(deps.ops.markInvoicePaid).toHaveBeenCalledTimes(1);
      expect(deps.bookings.confirm).not.toHaveBeenCalled();

      second.next(inv({ status: 'paid' }));
      second.complete();
      await settle(page);
      expect(api(page).busy()).toBe(false);
      expect(modal(page)).toBeNull();
    });
  });

  describe('cancelling with an open invoice', () => {
    it('warns with the invoice number when the invoice is unpaid', async () => {
      const page = await open({ items: [checkedIn()], invoices: [['bk-i', inv()]] });
      const translate = vi.spyOn(TestBed.inject(TranslocoService), 'translate');

      await startFromMenu(page, 'Cancel booking');

      const note = modal(page)!.querySelector('[role="note"]');
      expect(textOf(note)).toContain('hostBookings.cancelOpenInvoiceWarning');
      const params = translations(translate, 'hostBookings.cancelOpenInvoiceWarning').map((c) => c[1]);
      expect(params).toContainEqual({ invoice: buildInvoiceId(inv()) });
    });

    it('does not warn when the invoice is paid', async () => {
      const page = await open({ items: [checkedIn()], invoices: [['bk-i', inv({ status: 'paid' })]] });

      await startFromMenu(page, 'Cancel booking');

      expect(modal(page)).not.toBeNull();
      expect(modal(page)!.querySelector('[role="note"]')).toBeNull();
    });

    it('does not warn when the booking has no invoice', async () => {
      const page = await open({ items: [checkedIn()] });

      await startFromMenu(page, 'Cancel booking');

      expect(modal(page)).not.toBeNull();
      expect(modal(page)!.querySelector('[role="note"]')).toBeNull();
    });

    it('does not warn in the other dialogs', async () => {
      const page = await open({ items: [checkedIn()], invoices: [['bk-i', inv()]] });

      await startFromMenu(page, 'Check out');

      expect(modal(page)).not.toBeNull();
      expect(modal(page)!.querySelector('[role="note"]')).toBeNull();
    });
  });

  describe('which requests opt out of the global error toast', () => {
    const pending = () => hostBooking('pending', { id: 'bk-p' });
    const confirmed = () => hostBooking('confirmed', { id: 'bk-c' });

    it('cancel sends it', async () => {
      const deps = hostPageDeps();
      const page = await open({ deps, items: [checkedIn()] });

      api(page).onAct({ action: 'cancel', booking: checkedIn() });
      api(page).dialogReason.set('Guest asked to cancel');
      api(page).confirmDialog();

      expect(deps.bookings.cancel).toHaveBeenCalledWith(HOSTEL_ID, 'bk-i', 'Guest asked to cancel', QUIET);
    });

    it('no-show sends it', async () => {
      const deps = hostPageDeps();
      const page = await open({ deps, items: [confirmed()] });

      api(page).onAct({ action: 'noShow', booking: confirmed() });
      api(page).dialogReason.set('Never arrived');
      api(page).confirmDialog();

      expect(deps.bookings.markNoShow).toHaveBeenCalledWith(HOSTEL_ID, 'bk-c', 'Never arrived', QUIET);
    });

    it('check-out sends it', async () => {
      const deps = hostPageDeps();
      const page = await open({ deps, items: [checkedIn()] });

      api(page).onAct({ action: 'checkOut', booking: checkedIn() });
      api(page).confirmDialog();

      expect(deps.bookings.checkOut).toHaveBeenCalledWith(HOSTEL_ID, 'bk-i', QUIET);
    });

    it('mark-paid sends it on the booking and on the invoice', async () => {
      const deps = hostPageDeps();
      deps.bookings.markPaid.mockReturnValue(of(settledOf(checkedIn())));
      const page = await open({ deps, items: [checkedIn()], invoices: [['bk-i', inv()]] });

      api(page).onAct({ action: 'markPaid', booking: checkedIn() });
      api(page).confirmDialog();

      expect(deps.bookings.markPaid).toHaveBeenCalledWith(HOSTEL_ID, 'bk-i', QUIET);
      expect(deps.ops.markInvoicePaid).toHaveBeenCalledWith(HOSTEL_ID, 'rb-1', QUIET);
    });

    it('generate sends it', async () => {
      const deps = hostPageDeps();
      const page = await open({ deps, items: [checkedIn()] });

      api(page).onAct({ action: 'invoice', booking: checkedIn() });
      api(page).confirmDialog();

      expect(deps.bookings.generateInvoice).toHaveBeenCalledWith(HOSTEL_ID, 'bk-i', QUIET);
    });

    it('check-in sends it', async () => {
      const deps = hostPageDeps();
      const page = await open({ deps, items: [confirmed()] });

      api(page).onAct({ action: 'checkIn', booking: confirmed() });
      api(page).onAssign({ bookingId: 'bk-c', rooms: [{ roomId: 'r-101', roomNumber: '101', guests: 2 }] });

      expect(deps.bookings.checkIn).toHaveBeenCalledWith(
        HOSTEL_ID,
        'bk-c',
        [{ roomId: 'r-101', guests: 2 }],
        QUIET,
      );
    });

    it('a row-menu confirm does not, so its failure still toasts', async () => {
      const deps = hostPageDeps();
      const page = await open({ deps, items: [pending()] });

      await startFromMenu(page, 'Confirm booking');

      expect(deps.bookings.confirm).toHaveBeenCalledTimes(1);
      expect(deps.bookings.confirm.mock.calls[0]).toEqual([HOSTEL_ID, 'bk-p']);
    });
  });

  describe('checking in', () => {
    it('shows a refusal in the assign footer and stays open', async () => {
      const deps = hostPageDeps();
      const text = 'Room 101 has only 1 bed(s) available';
      deps.bookings.checkIn.mockReturnValue(throwError(() => refusal(text)));
      const booking = hostBooking('confirmed', { id: 'bk-c' });
      const page = await open({ deps, items: [booking] });

      api(page).onAct({ action: 'checkIn', booking });
      await settle(page);
      api(page).onAssign({ bookingId: 'bk-c', rooms: [{ roomId: 'r-101', roomNumber: '101', guests: 2 }] });
      await settle(page);

      // The server's capacity refusal is classified and shown as translated copy, not quoted.
      expect(api(page).assignError()).toBe('hostBookings.notEnoughBedsFree');
      expect(textOf(page.el.querySelector('hh-assign-rooms-panel [role="alert"]'))).toBe(
        'hostBookings.notEnoughBedsFree',
      );
      expect(api(page).assigning()?.id).toBe('bk-c');
      expect(api(page).busy()).toBe(false);
      expect(deps.notifications.raised).toEqual([]);
    });

    it.each([
      { text: 'Room 101 has only 1 bed(s) available', key: 'hostBookings.notEnoughBedsFree' },
      { text: 'Invalid room ID', key: 'hostBookings.checkTheRoomsPicked' },
      { text: 'Something the page has never seen', key: 'hostBookings.moveNotAccepted' },
    ])('lets no server text or API URL reach the screen on "$text"', async ({ text, key }) => {
      const deps = hostPageDeps();
      deps.bookings.checkIn.mockReturnValue(throwError(() => urlRefusal(text)));
      const booking = hostBooking('confirmed', { id: 'bk-c' });
      const page = await open({ deps, items: [booking] });

      api(page).onAct({ action: 'checkIn', booking });
      await settle(page);
      api(page).onAssign({ bookingId: 'bk-c', rooms: [{ roomId: 'r-101', roomNumber: '101', guests: 2 }] });
      await settle(page);

      expect(textOf(page.el.querySelector('hh-assign-rooms-panel [role="alert"]'))).toBe(key);
      expectNoLeak(page, deps, text);
    });

    it('says the server cannot be reached when the check-in never got there', async () => {
      const deps = hostPageDeps();
      deps.bookings.checkIn.mockReturnValue(throwError(() => apiError(0)));
      const booking = hostBooking('confirmed', { id: 'bk-c' });
      const page = await open({ deps, items: [booking] });

      api(page).onAct({ action: 'checkIn', booking });
      await settle(page);
      api(page).onAssign({ bookingId: 'bk-c', rooms: [{ roomId: 'r-101', roomNumber: '101', guests: 2 }] });
      await settle(page);

      expect(api(page).assignError()).toBe('common.cannotReachTheServer');
    });

    it('closes the allocation and returns to the list URL on success', async () => {
      const deps = hostPageDeps();
      const booking = hostBooking('confirmed', { id: 'bk-c' });
      deps.bookings.checkIn.mockReturnValue(of(hostBooking('checked-in', { id: 'bk-c' })));
      const page = await open({ deps, items: [booking] });

      api(page).openDetails(booking);
      await settle(page);
      expect(page.url()).toBe(bookingPath(HOSTEL_ID, 'bk-c'));

      api(page).onAct({ action: 'checkIn', booking });
      await settle(page);
      api(page).onAssign({ bookingId: 'bk-c', rooms: [{ roomId: 'r-101', roomNumber: '101', guests: 2 }] });
      await settle(page);

      expect(api(page).assigning()).toBeNull();
      expect(api(page).assignError()).toBe('');
      expect(page.url()).toBe(LIST_URL);
      expect(api(page).rows()[0].disposition.slug).toBe('checked-in');
      expect(deps.notifications.raised).toEqual([
        { kind: 'success', title: 'Checked in', message: 'Room 101 × 2' },
      ]);
    });
  });

  describe('telling the rooms page its numbers moved', () => {
    const reply = (b: HostBooking) => of({ ...b });
    const confirmedBk = () => hostBooking('confirmed', { id: 'bk-c' });

    it('tracks /rooms after a check-in', async () => {
      const deps = hostPageDeps();
      deps.bookings.checkIn.mockReturnValue(reply(confirmedBk()));
      const page = await open({ deps, items: [confirmedBk()] });

      api(page).onAct({ action: 'checkIn', booking: confirmedBk() });
      api(page).onAssign({ bookingId: 'bk-c', rooms: [{ roomId: 'r-101', roomNumber: '101', guests: 2 }] });

      expect(deps.refetch.track).toHaveBeenCalledTimes(1);
      expect(deps.refetch.track).toHaveBeenCalledWith('/rooms');
    });

    it('tracks /rooms after a check-out', async () => {
      const deps = hostPageDeps();
      deps.bookings.checkOut.mockReturnValue(reply(checkedIn()));
      const page = await open({ deps, items: [checkedIn()] });

      api(page).onAct({ action: 'checkOut', booking: checkedIn() });
      api(page).confirmDialog();

      expect(deps.refetch.track).toHaveBeenCalledWith('/rooms');
    });

    it('tracks /rooms after a cancel', async () => {
      const deps = hostPageDeps();
      deps.bookings.cancel.mockReturnValue(reply(checkedIn()));
      const page = await open({ deps, items: [checkedIn()] });

      api(page).onAct({ action: 'cancel', booking: checkedIn() });
      api(page).dialogReason.set('Guest asked to cancel');
      api(page).confirmDialog();

      expect(deps.refetch.track).toHaveBeenCalledWith('/rooms');
    });

    it('tracks /rooms after a release', async () => {
      const deps = hostPageDeps();
      deps.bookings.get.mockReturnValue(reply(checkedIn()));
      const page = await open({ deps, items: [checkedIn()] });

      api(page).onReleased(checkedIn());

      expect(deps.refetch.track).toHaveBeenCalledWith('/rooms');
    });

    it('does not track after a confirm', async () => {
      const deps = hostPageDeps();
      const pending = hostBooking('pending', { id: 'bk-p' });
      deps.bookings.confirm.mockReturnValue(reply(confirmedBk()));
      const page = await open({ deps, items: [pending] });

      api(page).onAct({ action: 'confirm', booking: pending });

      expect(deps.bookings.confirm).toHaveBeenCalledTimes(1);
      expect(deps.refetch.track).not.toHaveBeenCalled();
    });

    it('does not track after a no-show', async () => {
      const deps = hostPageDeps();
      deps.bookings.markNoShow.mockReturnValue(reply(confirmedBk()));
      const page = await open({ deps, items: [confirmedBk()] });

      api(page).onAct({ action: 'noShow', booking: confirmedBk() });
      api(page).confirmDialog();

      expect(deps.bookings.markNoShow).toHaveBeenCalledTimes(1);
      expect(deps.refetch.track).not.toHaveBeenCalled();
    });

    it('does not track after a mark-paid', async () => {
      const deps = hostPageDeps();
      deps.bookings.markPaid.mockReturnValue(reply(settledOf(checkedIn())));
      const page = await open({ deps, items: [checkedIn()] });

      api(page).onAct({ action: 'markPaid', booking: checkedIn() });
      api(page).confirmDialog();

      expect(deps.bookings.markPaid).toHaveBeenCalledTimes(1);
      expect(deps.refetch.track).not.toHaveBeenCalled();
    });

    it('does not track when the move is refused', async () => {
      const deps = hostPageDeps();
      deps.bookings.checkOut.mockReturnValue(throwError(() => refusal('Nope')));
      const page = await open({ deps, items: [checkedIn()] });

      api(page).onAct({ action: 'checkOut', booking: checkedIn() });
      api(page).confirmDialog();

      expect(deps.bookings.checkOut).toHaveBeenCalledTimes(1);
      expect(deps.refetch.track).not.toHaveBeenCalled();
    });
  });

  describe('releasing a room', () => {
    async function openCheckedInPanel(deps: HostPageDeps) {
      const booking = checkedIn({ occupancies: [occupancy()] });
      deps.bookings.occupancies.mockReturnValue(of([occupancy()]));
      // Opening reads the booking from the database first; it answers what the list holds.
      deps.bookings.get.mockReturnValueOnce(of(booking));
      const page = await open({ deps, items: [booking] });
      api(page).openDetails(booking);
      await settle(page);
      return page;
    }

    async function clickRelease(page: Page): Promise<void> {
      const buttons = page.el.querySelectorAll<HTMLButtonElement>('hh-booking-details-panel button');
      const button = Array.from(buttons).find((b) => textOf(b) === 'Release');
      button!.click();
      await settle(page);
    }

    it('swaps the server copy into the row and the open panel', async () => {
      const deps = hostPageDeps();
      deps.bookings.releaseOccupancy.mockReturnValue(of(undefined));
      deps.bookings.get.mockReturnValue(of(checkedIn({ guests: 1, occupancies: [] })));
      const page = await openCheckedInPanel(deps);

      await clickRelease(page);

      expect(deps.bookings.releaseOccupancy).toHaveBeenCalledWith(HOSTEL_ID, 'bk-i', 'oc-1', QUIET);
      expect(deps.bookings.get.mock.calls).toEqual([
        [HOSTEL_ID, 'bk-i', QUIET],
        [HOSTEL_ID, 'bk-i'],
      ]);
      expect(api(page).rows()[0].guests).toBe(1);
      expect(api(page).viewing()?.guests).toBe(1);
      expect(deps.refetch.track).toHaveBeenCalledWith('/rooms');
    });

    // The rooms endpoint reads a search index that still says "active" just after a release;
    // the stubbed occupancies() keeps answering that, as the live server did.
    it('shows the room released in the panel and drops it from the row, though the index lags', async () => {
      const deps = hostPageDeps();
      deps.bookings.releaseOccupancy.mockReturnValue(of(undefined));
      deps.bookings.get.mockReturnValue(of(checkedIn({ occupancies: [occupancy({ active: false })] })));
      const page = await openCheckedInPanel(deps);
      expect(panelText(page)).not.toContain('hostBookings.released');

      await clickRelease(page);

      expect(panelText(page)).toContain('Room 101 · 2 guests hostBookings.released');
      const buttons = Array.from(page.el.querySelectorAll('hh-booking-details-panel button'));
      expect(buttons.some((b) => textOf(b) === 'Release')).toBe(false);
      expect(api(page).rows()[0].occupancies.every((o) => !o.active)).toBe(true);
    });

    it('shows the room released on a booking opened from its link, off the loaded page', async () => {
      const deps = hostPageDeps();
      const room = occupancy({ id: 'oc-7', roomNumber: '102', guests: 1 });
      const linked = checkedIn({ id: 'zz-9', ref: 'BK-Z', occupancies: [room] });
      deps.bookings.occupancies.mockReturnValue(of([room]));
      deps.bookings.releaseOccupancy.mockReturnValue(of(undefined));
      deps.bookings.get
        .mockReturnValueOnce(of(linked))
        .mockReturnValueOnce(of({ ...linked, occupancies: [{ ...room, active: false }] }));
      const page = await open({ deps, items: [checkedIn()] });
      await page.navigate(bookingPath(HOSTEL_ID, 'zz-9'));
      await settle(page);
      expect(panelText(page)).toContain('Room 102 · 1 guest Release');

      await clickRelease(page);

      expect(deps.bookings.releaseOccupancy).toHaveBeenCalledWith(HOSTEL_ID, 'zz-9', 'oc-7', QUIET);
      expect(panelText(page)).toContain('Room 102 · 1 guest hostBookings.released');
      expect(api(page).viewing()?.occupancies[0].active).toBe(false);
    });

    it('refetches the list when the re-read fails', async () => {
      const deps = hostPageDeps();
      deps.bookings.releaseOccupancy.mockReturnValue(of(undefined));
      deps.bookings.get.mockReturnValue(throwError(() => apiError(500, [], 'GET')));
      const page = await openCheckedInPanel(deps);
      const before = deps.bookings.list.mock.calls.length;

      await clickRelease(page);

      expect(deps.bookings.get.mock.calls).toEqual([
        [HOSTEL_ID, 'bk-i', QUIET],
        [HOSTEL_ID, 'bk-i'],
      ]);
      expect(deps.bookings.list.mock.calls.length).toBe(before + 1);
    });

    it('marks the room released and re-reads the booking when the server says it was already released', async () => {
      const deps = hostPageDeps();
      deps.bookings.releaseOccupancy.mockReturnValue(throwError(() => refusal('Occupancy is already inactive')));
      deps.bookings.get.mockReturnValue(of(checkedIn({ occupancies: [occupancy({ active: false })] })));
      const page = await openCheckedInPanel(deps);

      await clickRelease(page);

      expect(deps.bookings.get.mock.calls).toEqual([
        [HOSTEL_ID, 'bk-i', QUIET],
        [HOSTEL_ID, 'bk-i'],
      ]);
      expect(api(page).rows()[0].occupancies.every((o) => !o.active)).toBe(true);
      expect(panelText(page)).toContain('Room 101 · 2 guests hostBookings.released');
      const buttons = Array.from(page.el.querySelectorAll('hh-booking-details-panel button'));
      expect(buttons.some((b) => textOf(b) === 'Release')).toBe(false);
      expect(panelText(page)).toContain('hostBookings.roomAlreadyReleased');
      expect(deps.refetch.track).toHaveBeenCalledWith('/rooms');
    });

    it('refetches the list and keeps the room released when the re-read after an already-released refusal fails', async () => {
      const deps = hostPageDeps();
      deps.bookings.releaseOccupancy.mockReturnValue(throwError(() => refusal('Occupancy is already inactive')));
      deps.bookings.get.mockReturnValue(throwError(() => apiError(500, [], 'GET')));
      const page = await openCheckedInPanel(deps);
      const before = deps.bookings.list.mock.calls.length;

      await clickRelease(page);

      expect(deps.bookings.list.mock.calls.length).toBe(before + 1);
      expect(panelText(page)).toContain('Room 101 · 2 guests hostBookings.released');
      const buttons = Array.from(page.el.querySelectorAll('hh-booking-details-panel button'));
      expect(buttons.some((b) => textOf(b) === 'Release')).toBe(false);
    });
  });

  describe('following the URL', () => {
    it('opens a booking already on the page at once, and reads it again quietly once', async () => {
      const deps = hostPageDeps();
      const page = await open({ deps, items: [checkedIn()] });

      await page.navigate(bookingPath(HOSTEL_ID, 'bk-i'));

      expect(deps.bookings.get.mock.calls).toEqual([[HOSTEL_ID, 'bk-i', QUIET]]);
      expect(api(page).viewing()).toBe(api(page).rows()[0]);
      expect(panelText(page)).toContain('Ali Raza');
    });

    it('reads a booking that is off the page quietly, then opens it', async () => {
      const deps = hostPageDeps();
      deps.bookings.get.mockReturnValue(of(checkedIn({ id: 'zz-9', ref: 'BK-Z' })));
      const page = await open({ deps, items: [checkedIn()] });

      await page.navigate(bookingPath(HOSTEL_ID, 'zz-9'));

      expect(deps.bookings.get).toHaveBeenCalledTimes(1);
      expect(deps.bookings.get).toHaveBeenCalledWith(HOSTEL_ID, 'zz-9', QUIET);
      expect(api(page).viewing()?.id).toBe('zz-9');
    });

    it('reads a booking quietly on a cold start at its URL', async () => {
      const deps = hostPageDeps();
      deps.bookings.get.mockReturnValue(of(checkedIn({ id: 'zz-9' })));
      const page = await open({ deps, items: [], url: bookingPath(HOSTEL_ID, 'zz-9') });

      expect(deps.bookings.get).toHaveBeenCalledWith(HOSTEL_ID, 'zz-9', QUIET);
      expect(api(page).viewing()?.id).toBe('zz-9');
    });

    it('says the booking was not found and returns to the list when the read fails', async () => {
      const deps = hostPageDeps();
      deps.bookings.get.mockReturnValue(throwError(() => apiError(404, [], 'GET')));
      const page = await open({ deps, items: [checkedIn()] });

      await page.navigate(bookingPath(HOSTEL_ID, 'zz-9'));
      await settle(page);

      expect(deps.notifications.error).toHaveBeenCalledTimes(1);
      expect(deps.notifications.error).toHaveBeenCalledWith('hostBookings.bookingNotFound');
      expect(api(page).viewing()).toBeNull();
      expect(page.url()).toBe(LIST_URL);
    });

    it('opens no panel when the URL moved on before the read answered', async () => {
      const deps = hostPageDeps();
      const late = new Subject<HostBooking>();
      deps.bookings.get.mockReturnValue(late);
      const page = await open({ deps, items: [checkedIn()] });

      await page.navigate(bookingPath(HOSTEL_ID, 'zz-9'));
      await page.navigate(LIST_URL);
      late.next(checkedIn({ id: 'zz-9' }));
      late.complete();
      await settle(page);

      expect(api(page).viewing()).toBeNull();
      expect(page.url()).toBe(LIST_URL);
    });

    it('gives no toast and no navigation for a failure that arrives after the URL moved on', async () => {
      const deps = hostPageDeps();
      const late = new Subject<HostBooking>();
      deps.bookings.get.mockReturnValue(late);
      const page = await open({ deps, items: [checkedIn()] });

      await page.navigate(bookingPath(HOSTEL_ID, 'zz-9'));
      await page.navigate(LIST_URL);
      late.error(apiError(404, [], 'GET'));
      await settle(page);

      expect(deps.notifications.raised).toEqual([]);
      expect(api(page).viewing()).toBeNull();
      expect(page.url()).toBe(LIST_URL);
    });

    it('does nothing for a URL naming the booking already open', async () => {
      const deps = hostPageDeps();
      const page = await open({ deps, items: [] });
      const shown = checkedIn({ id: 'off-1', guests: 5 });

      api(page).openDetails(shown);
      await settle(page);

      // The open's own quiet read, and nothing more for the URL it moved to.
      expect(deps.bookings.get.mock.calls).toEqual([[HOSTEL_ID, 'off-1', QUIET]]);
      expect(api(page).viewing()).toBe(shown);
      expect(page.url()).toBe(bookingPath(HOSTEL_ID, 'off-1'));
    });

    it('does nothing for a URL naming the booking a dialog is asking about', async () => {
      const deps = hostPageDeps();
      const page = await open({ deps, items: [] });
      const asked = checkedIn({ id: 'off-1' });

      api(page).onAct({ action: 'checkOut', booking: asked });
      await settle(page);
      await page.navigate(bookingPath(HOSTEL_ID, 'off-1'));

      expect(deps.bookings.get).not.toHaveBeenCalled();
      expect(api(page).viewing()).toBeNull();
      expect(api(page).dialog()?.booking.id).toBe('off-1');
    });

    it('does nothing for a URL naming the booking being checked in', async () => {
      const deps = hostPageDeps();
      const page = await open({ deps, items: [] });
      const arriving = hostBooking('confirmed', { id: 'off-2' });

      api(page).onAct({ action: 'checkIn', booking: arriving });
      await settle(page);
      await page.navigate(bookingPath(HOSTEL_ID, 'off-2'));

      expect(deps.bookings.get).not.toHaveBeenCalled();
      expect(api(page).viewing()).toBeNull();
      expect(api(page).assigning()?.id).toBe('off-2');
    });
  });

  describe('opening and closing the details', () => {
    it('goes to the booking URL on open and back to the list on close, without refetching the list', async () => {
      const deps = hostPageDeps();
      const booking = checkedIn();
      const page = await open({ deps, items: [booking] });
      const lists = deps.bookings.list.mock.calls.length;

      api(page).openDetails(booking);
      await settle(page);
      expect(page.url()).toBe(bookingPath(HOSTEL_ID, 'bk-i'));
      expect(api(page).viewing()?.id).toBe('bk-i');
      expect(panelText(page)).toContain('Ali Raza');

      api(page).closeDetails();
      await settle(page);
      expect(page.url()).toBe(LIST_URL);
      expect(api(page).viewing()).toBeNull();

      api(page).openDetails(booking);
      await settle(page);
      await page.navigate(LIST_URL);

      expect(api(page).viewing()).toBeNull();
      expect(deps.bookings.list.mock.calls.length).toBe(lists);
    });

    it('opens from the row menu to the booking URL', async () => {
      const deps = hostPageDeps();
      const page = await open({ deps, items: [checkedIn()] });
      const lists = deps.bookings.list.mock.calls.length;

      await startFromMenu(page, 'common.viewDetails');

      expect(page.url()).toBe(bookingPath(HOSTEL_ID, 'bk-i'));
      expect(api(page).viewing()?.id).toBe('bk-i');
      expect(deps.bookings.list.mock.calls.length).toBe(lists);
    });

    it('ignores close and browser back while a move is out', async () => {
      const deps = hostPageDeps();
      const pending = hostBooking('pending', { id: 'bk-p' });
      const inFlight = new Subject<HostBooking>();
      deps.bookings.confirm.mockReturnValue(inFlight);
      const page = await open({ deps, items: [pending] });
      const lists = deps.bookings.list.mock.calls.length;

      api(page).openDetails(pending);
      await settle(page);
      api(page).onAct({ action: 'confirm', booking: pending });
      expect(api(page).busy()).toBe(true);

      api(page).closeDetails();
      await settle(page);
      expect(api(page).viewing()?.id).toBe('bk-p');
      expect(page.url()).toBe(bookingPath(HOSTEL_ID, 'bk-p'));

      await page.navigate(LIST_URL);
      expect(api(page).viewing()?.id).toBe('bk-p');

      inFlight.next(hostBooking('confirmed', { id: 'bk-p' }));
      inFlight.complete();
      await settle(page);
      expect(api(page).busy()).toBe(false);
      expect(api(page).viewing()?.disposition.slug).toBe('confirmed');
      expect(deps.bookings.list.mock.calls.length).toBe(lists);
    });

    it('closes the panel on browser back when nothing is in flight', async () => {
      const deps = hostPageDeps();
      const page = await open({ deps, items: [checkedIn()] });
      const lists = deps.bookings.list.mock.calls.length;

      await page.navigate(bookingPath(HOSTEL_ID, 'bk-i'));
      expect(api(page).viewing()?.id).toBe('bk-i');
      await page.navigate(LIST_URL);

      expect(api(page).viewing()).toBeNull();
      expect(deps.bookings.list.mock.calls.length).toBe(lists);
    });
  });

  // The list and the calendar answer from a search index that can lag the database by minutes;
  // `get` reads the database, so an opened booking is read again from it.
  describe('reading an opened booking again from the database', () => {
    const footerButtons = (page: Page) =>
      Array.from(page.el.querySelectorAll('hh-booking-details-panel footer button')).map((b) => textOf(b));
    const stale = (id = 'bk-s') => hostBooking('confirmed', { id });
    const fresh = (id = 'bk-s') =>
      hostBooking('checked-in', {
        id,
        occupancies: [occupancy(), occupancy({ id: 'oc-2', roomId: 'r-102', roomNumber: '102', guests: 1 })],
      });

    it('shows the database copy in the panel and the row when the list copy lags behind it', async () => {
      const deps = hostPageDeps();
      deps.bookings.get.mockReturnValue(of(fresh()));
      const page = await open({ deps, items: [stale()] });

      api(page).openDetails(stale());
      await settle(page);

      expect(deps.bookings.get).toHaveBeenCalledTimes(1);
      expect(deps.bookings.get).toHaveBeenCalledWith(HOSTEL_ID, 'bk-s', QUIET);
      expect(api(page).viewing()?.disposition.slug).toBe('checked-in');
      expect(footerButtons(page)).toContain('Check out');
      expect(footerButtons(page)).not.toContain('Check in');
      expect(footerButtons(page)).not.toContain('Mark no show');
      // The rooms endpoint reads the lagging index too and answers none; the database copy's stand.
      expect(panelText(page)).toContain('Room 101 · 2 guests');
      expect(panelText(page)).toContain('Room 102 · 1 guest');
      expect(api(page).rows()[0].disposition.slug).toBe('checked-in');
      expect(api(page).rowActions(api(page).rows()[0])).toContain('checkOut');
    });

    it('looks up the invoice for the lane the database copy is in', async () => {
      const deps = hostPageDeps();
      deps.bookings.get.mockReturnValue(of(fresh()));
      const page = await open({ deps, items: [stale()] });
      expect(deps.ops.bookingInvoices).not.toHaveBeenCalled();

      api(page).openDetails(stale());
      await settle(page);

      expect(deps.ops.bookingInvoices).toHaveBeenCalledTimes(1);
      expect(deps.ops.bookingInvoices.mock.calls[0][1]).toEqual(['bk-s']);
      expect(deps.ops.bookingInvoices.mock.calls[0][2]).toEqual(QUIET);
    });

    it('reads it again when opened from the row menu', async () => {
      const deps = hostPageDeps();
      deps.bookings.get.mockReturnValue(of(fresh()));
      const page = await open({ deps, items: [stale()] });

      await startFromMenu(page, 'common.viewDetails');

      expect(deps.bookings.get).toHaveBeenCalledTimes(1);
      expect(deps.bookings.get).toHaveBeenCalledWith(HOSTEL_ID, 'bk-s', QUIET);
      expect(api(page).viewing()?.disposition.slug).toBe('checked-in');
      expect(api(page).rows()[0].disposition.slug).toBe('checked-in');
    });

    it('reads it again when its URL opens it from the loaded page', async () => {
      const deps = hostPageDeps();
      deps.bookings.get.mockReturnValue(of(fresh()));
      const page = await open({ deps, items: [stale()] });

      await page.navigate(bookingPath(HOSTEL_ID, 'bk-s'));
      await settle(page);

      expect(deps.bookings.get).toHaveBeenCalledTimes(1);
      expect(deps.bookings.get).toHaveBeenCalledWith(HOSTEL_ID, 'bk-s', QUIET);
      expect(api(page).viewing()?.disposition.slug).toBe('checked-in');
      expect(api(page).rows()[0].disposition.slug).toBe('checked-in');
    });

    it('reads a booking opened from off the page once, by its URL, not again for the panel', async () => {
      const deps = hostPageDeps();
      deps.bookings.get.mockReturnValue(of(fresh('zz-9')));
      const page = await open({ deps, items: [stale()] });

      await page.navigate(bookingPath(HOSTEL_ID, 'zz-9'));
      await settle(page);

      expect(deps.bookings.get).toHaveBeenCalledTimes(1);
      expect(api(page).viewing()?.disposition.slug).toBe('checked-in');
    });

    it('keeps the list copy, with no toast and no error, when the read fails', async () => {
      const deps = hostPageDeps();
      deps.bookings.get.mockReturnValue(throwError(() => apiError(500, [], 'GET')));
      const page = await open({ deps, items: [stale()] });
      const lists = deps.bookings.list.mock.calls.length;
      const shown = api(page).rows()[0];

      api(page).openDetails(shown);
      await settle(page);

      expect(deps.bookings.get).toHaveBeenCalledWith(HOSTEL_ID, 'bk-s', QUIET);
      expect(api(page).viewing()).toBe(shown);
      expect(api(page).rows()[0]).toBe(shown);
      expect(api(page).viewError()).toBe('');
      expect(deps.notifications.raised).toEqual([]);
      expect(deps.bookings.list.mock.calls.length).toBe(lists);
      expect(footerButtons(page)).toContain('Check in');
    });

    it('drops an answer for a booking the panel has moved on from', async () => {
      const deps = hostPageDeps();
      const forA = new Subject<HostBooking>();
      const forB = new Subject<HostBooking>();
      deps.bookings.get.mockReturnValueOnce(forA).mockReturnValueOnce(forB);
      const page = await open({ deps, items: [stale('bk-a'), stale('bk-b')] });

      api(page).openDetails(stale('bk-a'));
      await settle(page);
      api(page).openDetails(stale('bk-b'));
      await settle(page);
      forA.next(fresh('bk-a'));
      forA.complete();
      await settle(page);

      expect(api(page).viewing()?.id).toBe('bk-b');
      expect(api(page).viewing()?.disposition.slug).toBe('confirmed');
      expect(api(page).rows()[0].disposition.slug).toBe('confirmed');

      forB.next(fresh('bk-b'));
      forB.complete();
      await settle(page);
      expect(api(page).viewing()?.disposition.slug).toBe('checked-in');
      expect(api(page).rows()[1].disposition.slug).toBe('checked-in');
    });

    it('drops an answer that arrives after the panel closed', async () => {
      const deps = hostPageDeps();
      const late = new Subject<HostBooking>();
      deps.bookings.get.mockReturnValue(late);
      const page = await open({ deps, items: [stale()] });

      api(page).openDetails(stale());
      await settle(page);
      api(page).closeDetails();
      await settle(page);
      late.next(fresh());
      late.complete();
      await settle(page);

      expect(api(page).viewing()).toBeNull();
      expect(api(page).rows()[0].disposition.slug).toBe('confirmed');
    });

    it("keeps a move's reply over a read that answers after it", async () => {
      const deps = hostPageDeps();
      const pending = hostBooking('pending', { id: 'bk-p' });
      const read = new Subject<HostBooking>();
      const move = new Subject<HostBooking>();
      deps.bookings.get.mockReturnValue(read);
      deps.bookings.confirm.mockReturnValue(move);
      const page = await open({ deps, items: [pending] });

      api(page).openDetails(pending);
      await settle(page);
      api(page).onAct({ action: 'confirm', booking: pending });
      move.next(hostBooking('confirmed', { id: 'bk-p' }));
      move.complete();
      await settle(page);
      // Read before the move landed: the database still said pending.
      read.next(hostBooking('pending', { id: 'bk-p' }));
      read.complete();
      await settle(page);

      expect(api(page).viewing()?.disposition.slug).toBe('confirmed');
      expect(api(page).rows()[0].disposition.slug).toBe('confirmed');
    });

    it('does not let a read land while a move is out', async () => {
      const deps = hostPageDeps();
      const pending = hostBooking('pending', { id: 'bk-p' });
      const read = new Subject<HostBooking>();
      const move = new Subject<HostBooking>();
      deps.bookings.get.mockReturnValue(read);
      deps.bookings.confirm.mockReturnValue(move);
      const page = await open({ deps, items: [pending] });

      api(page).openDetails(pending);
      await settle(page);
      api(page).onAct({ action: 'confirm', booking: pending });
      read.next(hostBooking('pending', { id: 'bk-p', guests: 9 }));
      read.complete();
      await settle(page);
      expect(api(page).viewing()?.guests).toBe(2);

      move.next(hostBooking('confirmed', { id: 'bk-p' }));
      move.complete();
      await settle(page);
      expect(api(page).viewing()?.disposition.slug).toBe('confirmed');
      expect(api(page).viewing()?.guests).toBe(2);
    });

    it('brings the panel back with the database copy after it stepped aside for a dialog', async () => {
      const deps = hostPageDeps();
      const late = new Subject<HostBooking>();
      deps.bookings.get.mockReturnValue(late);
      const page = await open({ deps, items: [stale()] });

      api(page).openDetails(stale());
      await settle(page);
      api(page).onAct({ action: 'noShow', booking: stale() });
      await settle(page);
      late.next(fresh());
      late.complete();
      await settle(page);
      api(page).closeDialog();
      await settle(page);

      expect(api(page).viewing()?.disposition.slug).toBe('checked-in');
      expect(api(page).rows()[0].disposition.slug).toBe('checked-in');
    });
  });

  describe('viewing an invoice', () => {
    it('navigates to the invoice preview', async () => {
      const booking = settledOf(checkedIn());
      const page = await open({ items: [booking], invoices: [['bk-i', inv()]] });

      api(page).onAct({ action: 'viewInvoice', booking });
      await settle(page);

      expect(page.router.url).toBe(invoicePath(HOSTEL_ID, 'rb-1'));
    });

    it('stays where it is when no invoice is known', async () => {
      const booking = settledOf(checkedIn());
      const page = await open({ items: [booking] });

      api(page).onAct({ action: 'viewInvoice', booking });
      await settle(page);

      expect(page.router.url).toBe(LIST_URL);
    });
  });

  describe('dialog copy', () => {
    it('does not mention an invoice in the no-show dialog', async () => {
      const page = await open({ items: [hostBooking('confirmed', { id: 'bk-c' })] });

      await startFromMenu(page, 'Mark no show');

      expect(modal(page)).not.toBeNull();
      expect(textOf(modal(page))).not.toMatch(/invoice/i);
    });

    it('does not mention an invoice in the mark-as-paid dialog when the booking has none', async () => {
      const page = await open({ items: [hostBooking('confirmed', { id: 'bk-c' })] });

      await startFromMenu(page, 'Mark as paid');

      expect(modal(page)).not.toBeNull();
      expect(textOf(modal(page))).not.toMatch(/invoice/i);
    });
  });

  describe('a refused move in its dialog', () => {
    it('asks for a reason in translated copy before sending a cancellation', async () => {
      const deps = hostPageDeps();
      const page = await open({ deps, items: [checkedIn()] });

      await startFromMenu(page, 'Cancel booking');
      api(page).confirmDialog();
      await settle(page);

      expect(deps.bookings.cancel).not.toHaveBeenCalled();
      expect(textOf(modal(page)!.querySelector('[role="alert"]'))).toBe('hostBookings.giveTheGuestAReason');
    });

    it('lets no server text or API URL reach the screen on a refusal it does not recognise', async () => {
      const text = 'Disposition is invalid';
      const deps = hostPageDeps();
      deps.bookings.checkOut.mockReturnValue(throwError(() => urlRefusal(text)));
      const page = await open({ deps, items: [checkedIn()] });

      await startFromMenu(page, 'Check out');
      await confirmViaButton(page);

      expect(modal(page)).not.toBeNull();
      expect(textOf(modal(page)!.querySelector('[role="alert"]'))).toBe('hostBookings.moveNotAccepted');
      expectNoLeak(page, deps, text);
    });

    it('shows a refused row-menu move in the open panel as translated copy', async () => {
      const deps = hostPageDeps();
      const booking = hostBooking('pending', { id: 'bk-p' });
      deps.bookings.confirm.mockReturnValue(throwError(() => urlRefusal('Disposition is invalid')));
      const page = await open({ deps, items: [booking] });

      api(page).openDetails(booking);
      await settle(page);
      api(page).onAct({ action: 'confirm', booking });
      await settle(page);

      expect(api(page).viewError()).toBe('hostBookings.moveNotAccepted');
      expect(textOf(page.el.querySelector('hh-booking-details-panel footer [role="alert"]'))).toBe(
        'hostBookings.moveNotAccepted',
      );
      expectNoLeak(page, deps, 'Disposition is invalid');
    });
  });

  // A move is refused as already made, or as impossible now, when another tab or the search index's
  // lag left the page on a stage the booking has left. The database's copy is read back and shown.
  describe('a stay move refused because the booking is not where the page shows it', () => {
    const info = (key: string) => ({ kind: 'info', title: key, message: undefined });
    const errorToast = (key: string) => ({ kind: 'error', title: key, message: undefined });
    const dialogMoves = MOVED_ON.filter((m) => m.kind === 'movedOn' && m.action !== 'checkIn');

    describe('a check-in', () => {
      const alreadyIn = hostBooking('checked-in', { id: 'bk-c', occupancies: BOTH_ROOMS });
      const cancelled = hostBooking('cancelled', { id: 'bk-c' });

      it('closes the allocation and opens the booking checked in with its rooms, from the row menu', async () => {
        const deps = hostPageDeps();
        refuseMove(deps, 'checkIn', refusal('Booking is already checked in'));
        queueReads(deps, of(alreadyIn));
        const page = await open({ deps, items: [arriving()] });

        await startMove(page, 'checkIn');
        submitMove(page, 'checkIn', arriving());
        await settle(page);

        expect(deps.bookings.get.mock.calls).toEqual([[HOSTEL_ID, 'bk-c', QUIET]]);
        expect(api(page).assigning()).toBeNull();
        expect(api(page).assignError()).toBe('');
        expect(api(page).viewing()).toBe(alreadyIn);
        expect(panelText(page)).toContain('Room 101 · 2 guests');
        expect(panelText(page)).toContain('Room 102 · 1 guest');
        expect(page.url()).toBe(bookingPath(HOSTEL_ID, 'bk-c'));
        expect(deps.notifications.raised).toEqual([info('hostBookings.alreadyCheckedIn')]);
        expect(api(page).viewError()).toBe('');
        expect(api(page).rows()[0].disposition.slug).toBe('checked-in');
        expect(api(page).busy()).toBe(false);
      });

      it('does the same from the open panel, reading the booking twice and not navigating again', async () => {
        const deps = hostPageDeps();
        const booking = arriving();
        refuseMove(deps, 'checkIn', refusal('Booking is already checked in'));
        queueReads(deps, of(booking), of(alreadyIn));
        const page = await open({ deps, items: [booking] });
        await openPanel(page, booking);
        const navigate = vi.spyOn(page.router, 'navigateByUrl');

        api(page).onAct({ action: 'checkIn', booking });
        await settle(page);
        submitMove(page, 'checkIn', booking);
        await settle(page);

        expect(deps.bookings.get.mock.calls).toEqual([
          [HOSTEL_ID, 'bk-c', QUIET],
          [HOSTEL_ID, 'bk-c', QUIET],
        ]);
        expect(api(page).assigning()).toBeNull();
        expect(api(page).viewing()).toBe(alreadyIn);
        expect(panelText(page)).toContain('Room 101 · 2 guests');
        expect(navigate).not.toHaveBeenCalled();
        expect(page.url()).toBe(bookingPath(HOSTEL_ID, 'bk-c'));
        expect(deps.notifications.raised).toEqual([info('hostBookings.alreadyCheckedIn')]);
        expect(api(page).viewError()).toBe('');
        expect(api(page).busy()).toBe(false);
      });

      it('shows the booking as it now is with a red footer and no toast when it moved on, from the row menu', async () => {
        const deps = hostPageDeps();
        refuseMove(deps, 'checkIn', refusal('Only confirmed bookings can be checked in'));
        queueReads(deps, of(cancelled));
        const page = await open({ deps, items: [arriving()] });

        await startMove(page, 'checkIn');
        submitMove(page, 'checkIn', arriving());
        await settle(page);

        expect(api(page).assigning()).toBeNull();
        expect(api(page).viewing()).toBe(cancelled);
        expect(api(page).viewError()).toBe('hostBookings.bookingHasMovedOn');
        expect(panelFooterAlert(page)).toBe('hostBookings.bookingHasMovedOn');
        expect(deps.notifications.raised).toEqual([]);
        expect(page.url()).toBe(bookingPath(HOSTEL_ID, 'bk-c'));
      });

      it('does the same from the open panel, without navigating again', async () => {
        const deps = hostPageDeps();
        const booking = arriving();
        refuseMove(deps, 'checkIn', refusal('Only confirmed bookings can be checked in'));
        queueReads(deps, of(booking), of(cancelled));
        const page = await open({ deps, items: [booking] });
        await openPanel(page, booking);
        const navigate = vi.spyOn(page.router, 'navigateByUrl');

        api(page).onAct({ action: 'checkIn', booking });
        await settle(page);
        submitMove(page, 'checkIn', booking);
        await settle(page);

        expect(deps.bookings.get).toHaveBeenCalledTimes(2);
        expect(api(page).assigning()).toBeNull();
        expect(api(page).viewing()).toBe(cancelled);
        expect(panelFooterAlert(page)).toBe('hostBookings.bookingHasMovedOn');
        expect(deps.notifications.raised).toEqual([]);
        expect(navigate).not.toHaveBeenCalled();
        expect(page.url()).toBe(bookingPath(HOSTEL_ID, 'bk-c'));
      });
    });

    describe('a move in a dialog', () => {
      it.each(dialogMoves)('closes the dialog from the row menu and raises one error toast for $name', async (m) => {
        const deps = hostPageDeps();
        refuseMove(deps, m.action, refusal(m.text));
        queueReads(deps, of(m.fresh));
        const page = await open({ deps, items: [m.shown] });

        await startMove(page, m.action);
        submitMove(page, m.action, m.shown);
        await settle(page);

        expect(modal(page)).toBeNull();
        expect(api(page).dialog()).toBeNull();
        expect(api(page).dialogError()).toBe('');
        expect(deps.notifications.raised).toEqual([errorToast('hostBookings.bookingHasMovedOn')]);
        expect(api(page).viewing()).toBeNull();
        expect(panelText(page)).toBe('');
        expect(page.url()).toBe(LIST_URL);
        expect(api(page).rows()[0]).toBe(m.fresh);
        expect(deps.bookings.get.mock.calls).toEqual([[HOSTEL_ID, m.shown.id, QUIET]]);
        expect(api(page).busy()).toBe(false);
        expectNoLeak(page, deps, m.text);
      });

      it.each(dialogMoves)(
        'closes the dialog and brings the panel back on the booking as it now is, with a red footer, for $name',
        async (m) => {
          const deps = hostPageDeps();
          refuseMove(deps, m.action, refusal(m.text));
          queueReads(deps, of(m.shown), of(m.fresh));
          const page = await open({ deps, items: [m.shown] });
          await openPanel(page, m.shown);

          api(page).onAct({ action: m.action, booking: m.shown });
          await settle(page);
          submitMove(page, m.action, m.shown);
          await settle(page);

          expect(modal(page)).toBeNull();
          expect(api(page).dialog()).toBeNull();
          expect(api(page).viewing()).toBe(m.fresh);
          expect(api(page).viewError()).toBe('hostBookings.bookingHasMovedOn');
          expect(panelFooterAlert(page)).toBe('hostBookings.bookingHasMovedOn');
          expect(panelFooterButtons(page)).toEqual(m.footer);
          expect(deps.notifications.raised).toEqual([]);
          expect(api(page).rows()[0]).toBe(m.fresh);
          expect(page.url()).toBe(bookingPath(HOSTEL_ID, m.shown.id));
          expect(deps.bookings.get.mock.calls).toEqual([
            [HOSTEL_ID, m.shown.id, QUIET],
            [HOSTEL_ID, m.shown.id, QUIET],
          ]);
          expect(api(page).busy()).toBe(false);
        },
      );
    });

    describe('a payment on a booking already paid', () => {
      const text = 'This booking is already paid';
      const paid = settledOf(checkedIn());

      it('closes the dialog with an info toast and opens no panel, from the row menu', async () => {
        const deps = hostPageDeps();
        refuseMove(deps, 'markPaid', refusal(text));
        queueReads(deps, of(paid));
        const page = await open({ deps, items: [checkedIn()] });

        await startMove(page, 'markPaid');
        submitMove(page, 'markPaid', checkedIn());
        await settle(page);

        expect(modal(page)).toBeNull();
        expect(deps.notifications.raised).toEqual([info('hostBookings.bookingAlreadyPaid')]);
        expect(api(page).viewing()).toBeNull();
        expect(page.url()).toBe(LIST_URL);
        expect(api(page).rows()[0]).toBe(paid);
        expect(api(page).rows()[0].balanceDue).toBe(0);
        expect(deps.bookings.get.mock.calls).toEqual([[HOSTEL_ID, 'bk-i', QUIET]]);
      });

      it('brings the panel back on the settled booking, with no red footer, from the open panel', async () => {
        const deps = hostPageDeps();
        const booking = checkedIn();
        refuseMove(deps, 'markPaid', refusal(text));
        queueReads(deps, of(booking), of(paid));
        const page = await open({ deps, items: [booking] });
        await openPanel(page, booking);

        api(page).onAct({ action: 'markPaid', booking });
        await settle(page);
        submitMove(page, 'markPaid', booking);
        await settle(page);

        expect(modal(page)).toBeNull();
        expect(api(page).viewing()).toBe(paid);
        expect(api(page).viewError()).toBe('');
        expect(page.el.querySelector('hh-booking-details-panel footer [role="alert"]')).toBeNull();
        expect(panelText(page)).toContain('Nothing outstanding');
        expect(deps.notifications.raised).toEqual([info('hostBookings.bookingAlreadyPaid')]);
      });

      it('leaves the invoice alone when the host unticked its box', async () => {
        const deps = hostPageDeps();
        refuseMove(deps, 'markPaid', refusal(text));
        queueReads(deps, of(paid));
        const page = await open({ deps, items: [checkedIn()], invoices: [['bk-i', inv()]] });

        await startMove(page, 'markPaid');
        checkbox(page)!.click();
        await settle(page);
        submitMove(page, 'markPaid', checkedIn());
        await settle(page);

        expect(modal(page)).toBeNull();
        expect(deps.notifications.raised).toEqual([info('hostBookings.bookingAlreadyPaid')]);
        expect(deps.bookings.get.mock.calls).toEqual([[HOSTEL_ID, 'bk-i', QUIET]]);
        expect(deps.ops.markInvoicePaid).not.toHaveBeenCalled();
        expect(api(page).invoices().get('bk-i')?.status).toBe('due');
      });
    });

    describe('while the booking is read back', () => {
      it('holds the dialog and every other move until the read answers', async () => {
        const deps = hostPageDeps();
        const read = new Subject<HostBooking>();
        const other = hostBooking('pending', { id: 'bk-p' });
        refuseMove(deps, 'checkOut', refusal('Only checked-in bookings can be checked out'));
        queueReads(deps, read);
        const page = await open({ deps, items: [checkedIn(), other] });

        await startMove(page, 'checkOut');
        await confirmViaButton(page);

        expect(api(page).busy()).toBe(true);
        expect(api(page).dialogError()).toBe('hostBookings.bookingHasMovedOn');
        expect(dialogAlert(page)).toBe('hostBookings.bookingHasMovedOn');
        expect(confirmButton(page).disabled).toBe(true);

        api(page).closeDialog();
        api(page).confirmDialog();
        api(page).onAct({ action: 'confirm', booking: other });
        expect(api(page).dialog()).not.toBeNull();
        expect(deps.bookings.checkOut).toHaveBeenCalledTimes(1);
        expect(deps.bookings.confirm).not.toHaveBeenCalled();

        read.next(hostBooking('checked-out', { id: 'bk-i', ref: 'BK-I' }));
        read.complete();
        await settle(page);

        expect(api(page).busy()).toBe(false);
        expect(modal(page)).toBeNull();
      });

      it('holds the allocation until the read answers, then opens the booking', async () => {
        const deps = hostPageDeps();
        const read = new Subject<HostBooking>();
        refuseMove(deps, 'checkIn', refusal('Booking is already checked in'));
        queueReads(deps, read);
        const page = await open({ deps, items: [arriving()] });

        await startMove(page, 'checkIn');
        submitMove(page, 'checkIn', arriving());
        await settle(page);

        expect(api(page).busy()).toBe(true);
        expect(assignAlert(page)).toBe('hostBookings.alreadyCheckedIn');
        api(page).closeAssign();
        expect(api(page).assigning()).not.toBeNull();

        read.next(hostBooking('checked-in', { id: 'bk-c' }));
        read.complete();
        await settle(page);

        expect(api(page).busy()).toBe(false);
        expect(api(page).assigning()).toBeNull();
        expect(api(page).viewing()?.id).toBe('bk-c');
      });
    });

    describe('telling the rooms page its numbers moved', () => {
      const roomMoves = MOVED_ON.filter((m) => ROOM_MOVES.includes(m.action) && slugChanged(m));
      const otherMoves = MOVED_ON.filter((m) => !ROOM_MOVES.includes(m.action) && slugChanged(m));

      it.each(roomMoves)('tracks /rooms once when $name changed the stage', async (m) => {
        const deps = hostPageDeps();
        refuseMove(deps, m.action, refusal(m.text));
        queueReads(deps, of(m.fresh));
        const page = await open({ deps, items: [m.shown] });

        api(page).onAct({ action: m.action, booking: m.shown });
        submitMove(page, m.action, m.shown);
        await settle(page);

        expect(deps.refetch.track).toHaveBeenCalledTimes(1);
        expect(deps.refetch.track).toHaveBeenCalledWith('/rooms');
      });

      it.each(otherMoves)('does not track /rooms for $name, even though the stage changed', async (m) => {
        const deps = hostPageDeps();
        refuseMove(deps, m.action, refusal(m.text));
        queueReads(deps, of(m.fresh));
        const page = await open({ deps, items: [m.shown] });

        api(page).onAct({ action: m.action, booking: m.shown });
        submitMove(page, m.action, m.shown);
        await settle(page);

        expect(deps.bookings.get).toHaveBeenCalledTimes(1);
        expect(deps.refetch.track).not.toHaveBeenCalled();
      });

      it.each([
        { name: 'the read shows no change', reply: () => of(checkedIn({ guests: 3 })) },
        { name: 'the read fails', reply: () => throwError(() => apiError(500, [], 'GET')) },
      ])('does not track /rooms for a refused check-out when $name', async ({ reply }) => {
        const deps = hostPageDeps();
        refuseMove(deps, 'checkOut', refusal('Only checked-in bookings can be checked out'));
        queueReads(deps, reply());
        const page = await open({ deps, items: [checkedIn()] });

        api(page).onAct({ action: 'checkOut', booking: checkedIn() });
        api(page).confirmDialog();
        await settle(page);

        expect(deps.bookings.get).toHaveBeenCalledTimes(1);
        expect(deps.refetch.track).not.toHaveBeenCalled();
      });

      // Only a booking in a confirmed or pending lane carries a legacy slug, so no check-out can reach this.
      it.each([
        {
          name: 'a check-in of a booking shown as room-assigned',
          action: 'checkIn' as const,
          shown: hostBooking('room-assigned', { id: 'bk-c' }),
          fresh: arriving({ guests: 3 }),
          text: 'Only confirmed bookings can be checked in',
        },
        {
          name: 'a cancellation of a booking shown as pending-allotment',
          action: 'cancel' as const,
          shown: hostBooking('pending-allotment', { id: 'bk-p' }),
          fresh: hostBooking('pending', { id: 'bk-p', guests: 3 }),
          text: 'This booking can no longer be cancelled',
        },
      ])('does not track /rooms for $name when the copy is that stage under its current name', async (c) => {
        const deps = hostPageDeps();
        refuseMove(deps, c.action, refusal(c.text));
        queueReads(deps, of(c.fresh));
        const page = await open({ deps, items: [c.shown] });

        api(page).onAct({ action: c.action, booking: c.shown });
        submitMove(page, c.action, c.shown);
        await settle(page);

        expect(deps.bookings.get).toHaveBeenCalledTimes(1);
        expect(deps.refetch.track).not.toHaveBeenCalled();
        // The booking has not moved on, so the refused move stays open on the copy with the generic message.
        expect(c.action === 'checkIn' ? assignAlert(page) : dialogAlert(page)).toBe('hostBookings.moveNotAccepted');
        expect(api(page).rows()[0]).toBe(c.fresh);
        expect(deps.notifications.raised).toEqual([]);
      });

      it('tracks /rooms once for a check-in of a booking shown as room-assigned that is now checked in', async () => {
        const deps = hostPageDeps();
        refuseMove(deps, 'checkIn', refusal('Booking is already checked in'));
        queueReads(deps, of(hostBooking('checked-in', { id: 'bk-c' })));
        const page = await open({ deps, items: [hostBooking('room-assigned', { id: 'bk-c' })] });

        api(page).onAct({ action: 'checkIn', booking: hostBooking('room-assigned', { id: 'bk-c' }) });
        submitMove(page, 'checkIn', hostBooking('room-assigned', { id: 'bk-c' }));
        await settle(page);

        expect(deps.refetch.track).toHaveBeenCalledTimes(1);
        expect(deps.refetch.track).toHaveBeenCalledWith('/rooms');
      });
    });

    describe('the calendar and the invoice lookup', () => {
      it('swaps the database copy into the calendar once', async () => {
        const deps = hostPageDeps();
        const shown = checkedIn();
        const fresh = hostBooking('checked-out', { id: 'bk-i', ref: 'BK-I' });
        refuseMove(deps, 'checkOut', refusal('Only checked-in bookings can be checked out'));
        queueReads(deps, of(fresh));
        const page = await open({ deps, items: [shown] });
        const applyChange = vi.spyOn(calendarOf(page), 'applyChange');

        api(page).onAct({ action: 'checkOut', booking: shown });
        api(page).confirmDialog();
        await settle(page);

        expect(applyChange).toHaveBeenCalledTimes(1);
        expect(applyChange.mock.calls[0][0]).toBe(shown);
        expect(applyChange.mock.calls[0][1]).toBe(fresh);
      });

      it('looks up the invoice of a booking found checked in, so the row menu offers to generate one', async () => {
        const deps = hostPageDeps();
        const fresh = hostBooking('checked-in', { id: 'bk-c' });
        refuseMove(deps, 'noShow', refusal('Only confirmed bookings can be marked a no show'));
        queueReads(deps, of(fresh));
        const page = await open({ deps, items: [arriving()] });
        expect(deps.ops.bookingInvoices).not.toHaveBeenCalled();

        await startMove(page, 'noShow');
        submitMove(page, 'noShow', arriving());
        await settle(page);

        expect(deps.ops.bookingInvoices).toHaveBeenCalledTimes(1);
        expect(deps.ops.bookingInvoices).toHaveBeenCalledWith(HOSTEL_ID, ['bk-c'], QUIET);
        await openMenu(page);
        expect(menuLabels(page)).toContain('Generate invoice');
      });
    });

    describe('when the database shows the booking unchanged', () => {
      it('keeps an invoice dialog open on the database copy with the generic message', async () => {
        const deps = hostPageDeps();
        const shown = hostBooking('checked-out', { id: 'bk-o', ref: 'BK-O', paid: 24000, balanceDue: 0 });
        const fresh = { ...shown, guests: 3 };
        refuseMove(deps, 'invoice', refusal('Only checked-in bookings can be invoiced'));
        queueReads(deps, of(fresh));
        const page = await open({ deps, items: [shown] });

        await startMove(page, 'invoice');
        expect(textOf(modal(page))).toContain('3 nights · 2 guests');
        submitMove(page, 'invoice', shown);
        await settle(page);

        expect(modal(page)).not.toBeNull();
        expect(dialogAlert(page)).toBe('hostBookings.moveNotAccepted');
        expect(textOf(modal(page))).toContain('3 nights · 3 guests');
        expect(api(page).rows()[0]).toBe(fresh);
        expect(deps.notifications.raised).toEqual([]);
        expect(deps.refetch.track).not.toHaveBeenCalled();
      });

      it('keeps the allocation open on the database copy with the generic message', async () => {
        const deps = hostPageDeps();
        const fresh = arriving({ guests: 3 });
        refuseMove(deps, 'checkIn', refusal('Booking is already checked in'));
        queueReads(deps, of(fresh));
        const page = await open({ deps, items: [arriving()] });

        await startMove(page, 'checkIn');
        submitMove(page, 'checkIn', arriving());
        await settle(page);

        expect(api(page).assigning()).toBe(fresh);
        expect(api(page).assignError()).toBe('hostBookings.moveNotAccepted');
        expect(assignAlert(page)).toBe('hostBookings.moveNotAccepted');
        expect(api(page).viewing()).toBeNull();
        expect(page.url()).toBe(LIST_URL);
        expect(api(page).rows()[0]).toBe(fresh);
        expect(deps.notifications.raised).toEqual([]);
      });

      it('keeps a payment dialog open on the database copy when the booking still owes', async () => {
        const deps = hostPageDeps();
        const fresh = checkedIn({ guests: 3 });
        refuseMove(deps, 'markPaid', refusal('This booking is already paid'));
        queueReads(deps, of(fresh));
        const page = await open({ deps, items: [checkedIn()] });

        await startMove(page, 'markPaid');
        submitMove(page, 'markPaid', checkedIn());
        await settle(page);

        expect(modal(page)).not.toBeNull();
        expect(dialogAlert(page)).toBe('hostBookings.moveNotAccepted');
        expect(api(page).dialog()?.booking).toBe(fresh);
        expect(api(page).rows()[0]).toBe(fresh);
        expect(deps.notifications.raised).toEqual([]);
      });

      it('brings the panel back on the database copy when the dialog is closed', async () => {
        const deps = hostPageDeps();
        const shown = checkedIn();
        const fresh = checkedIn({ guests: 3 });
        refuseMove(deps, 'checkOut', refusal('Only checked-in bookings can be checked out'));
        queueReads(deps, of(shown), of(fresh));
        const page = await open({ deps, items: [shown] });
        await openPanel(page, shown);

        api(page).onAct({ action: 'checkOut', booking: shown });
        await settle(page);
        submitMove(page, 'checkOut', shown);
        await settle(page);
        expect(dialogAlert(page)).toBe('hostBookings.moveNotAccepted');

        api(page).closeDialog();
        await settle(page);

        expect(modal(page)).toBeNull();
        expect(api(page).viewing()).toBe(fresh);
        expect(panelText(page)).toContain('3 guests · Dormitory');
        expect(api(page).rows()[0]).toBe(fresh);
      });
    });

    describe('when the booking cannot be read back', () => {
      const gone = () => throwError(() => apiError(404, [], 'GET'));

      it('closes every surface, leaves the booking URL and tells the host when it is gone, from the panel', async () => {
        const deps = hostPageDeps();
        const booking = arriving();
        refuseMove(deps, 'checkIn', refusal('Booking is already checked in'));
        queueReads(deps, of(booking), gone());
        const page = await open({ deps, items: [booking] });
        await openPanel(page, booking);
        api(page).onAct({ action: 'checkIn', booking });
        await settle(page);
        const lists = deps.bookings.list.mock.calls.length;

        submitMove(page, 'checkIn', booking);
        await settle(page);

        expect(api(page).assigning()).toBeNull();
        expect(api(page).assignError()).toBe('');
        expect(api(page).dialog()).toBeNull();
        expect(api(page).viewing()).toBeNull();
        expect(api(page).viewError()).toBe('');
        expect(page.url()).toBe(LIST_URL);
        expect(deps.notifications.raised).toEqual([errorToast('hostBookings.bookingNotFound')]);
        expect(deps.bookings.list.mock.calls.length).toBe(lists + 1);
        expect(api(page).busy()).toBe(false);
      });

      it('closes the dialog and tells the host when a cancelled booking is gone, from the row menu', async () => {
        const deps = hostPageDeps();
        refuseMove(deps, 'cancel', refusal('This booking can no longer be cancelled'));
        queueReads(deps, gone());
        const page = await open({ deps, items: [checkedIn()] });
        const lists = deps.bookings.list.mock.calls.length;

        await startMove(page, 'cancel');
        submitMove(page, 'cancel', checkedIn());
        await settle(page);

        expect(modal(page)).toBeNull();
        expect(api(page).dialog()).toBeNull();
        expect(page.url()).toBe(LIST_URL);
        expect(deps.notifications.raised).toEqual([errorToast('hostBookings.bookingNotFound')]);
        expect(deps.bookings.list.mock.calls.length).toBe(lists + 1);
        expect(api(page).busy()).toBe(false);
      });

      it.each([{ status: 500 }, { status: 0 }])(
        'keeps the dialog and its message, and refreshes the list, when the read fails with $status',
        async ({ status }) => {
          const deps = hostPageDeps();
          const shown = checkedIn();
          refuseMove(deps, 'checkOut', refusal('Only checked-in bookings can be checked out'));
          queueReads(deps, throwError(() => apiError(status, [], 'GET')));
          const page = await open({ deps, items: [shown] });
          const lists = deps.bookings.list.mock.calls.length;

          await startMove(page, 'checkOut');
          submitMove(page, 'checkOut', shown);
          await settle(page);

          expect(modal(page)).not.toBeNull();
          expect(dialogAlert(page)).toBe('hostBookings.bookingHasMovedOn');
          expect(deps.notifications.raised).toEqual([]);
          expect(deps.bookings.list.mock.calls.length).toBe(lists + 1);
          expect(api(page).rows()[0]).toBe(shown);
          expect(api(page).busy()).toBe(false);
        },
      );

      it('keeps the allocation and its message, with no panel, and refreshes the list when the read fails', async () => {
        const deps = hostPageDeps();
        refuseMove(deps, 'checkIn', refusal('Booking is already checked in'));
        queueReads(deps, throwError(() => apiError(500, [], 'GET')));
        const page = await open({ deps, items: [arriving()] });
        const lists = deps.bookings.list.mock.calls.length;

        await startMove(page, 'checkIn');
        submitMove(page, 'checkIn', arriving());
        await settle(page);

        expect(api(page).assigning()?.id).toBe('bk-c');
        expect(assignAlert(page)).toBe('hostBookings.alreadyCheckedIn');
        expect(api(page).viewing()).toBeNull();
        expect(deps.notifications.raised).toEqual([]);
        expect(deps.bookings.list.mock.calls.length).toBe(lists + 1);
        expect(api(page).busy()).toBe(false);
      });
    });

    // The refused surface stays open beside whatever the host opened meanwhile; that is not asserted.
    describe('when the host moved on while the booking was read back', () => {
      const bkB = hostBooking('confirmed', { id: 'bk-b', ref: 'BK-B' });

      it('keeps the panel and URL the host went to, and still swaps the row and tracks /rooms', async () => {
        const deps = hostPageDeps();
        const read = new Subject<HostBooking>();
        const fresh = hostBooking('checked-out', { id: 'bk-i', ref: 'BK-I' });
        refuseMove(deps, 'checkOut', refusal('Only checked-in bookings can be checked out'));
        queueReads(deps, read, of(bkB));
        const page = await open({ deps, items: [checkedIn(), bkB] });

        await startMove(page, 'checkOut');
        submitMove(page, 'checkOut', checkedIn());
        await page.navigate(bookingPath(HOSTEL_ID, 'bk-b'));
        read.next(fresh);
        read.complete();
        await settle(page);

        expect(api(page).viewing()?.id).toBe('bk-b');
        expect(page.url()).toBe(bookingPath(HOSTEL_ID, 'bk-b'));
        expect(deps.notifications.raised).toEqual([]);
        expect(api(page).rows()[0]).toBe(fresh);
        expect(deps.refetch.track).toHaveBeenCalledTimes(1);
        expect(deps.refetch.track).toHaveBeenCalledWith('/rooms');
        expect(api(page).busy()).toBe(false);
      });

      it('opens no panel and navigates nowhere for a check-in when the host opened another booking', async () => {
        const deps = hostPageDeps();
        const read = new Subject<HostBooking>();
        const fresh = hostBooking('checked-in', { id: 'bk-c' });
        refuseMove(deps, 'checkIn', refusal('Booking is already checked in'));
        queueReads(deps, read, of(bkB));
        const page = await open({ deps, items: [arriving(), bkB] });

        await startMove(page, 'checkIn');
        submitMove(page, 'checkIn', arriving());
        const navigate = vi.spyOn(page.router, 'navigateByUrl');
        api(page).openDetails(bkB);
        await settle(page);
        read.next(fresh);
        read.complete();
        await settle(page);

        expect(navigate.mock.calls.map((c) => c[0])).not.toContain(bookingPath(HOSTEL_ID, 'bk-c'));
        expect(api(page).viewing()?.id).toBe('bk-b');
        expect(page.url()).toBe(bookingPath(HOSTEL_ID, 'bk-b'));
        expect(deps.notifications.raised).toEqual([]);
        expect(api(page).rows()[0]).toBe(fresh);
        expect(api(page).busy()).toBe(false);
      });

      it('raises no toast and closes nothing when the read then reports the booking gone', async () => {
        const deps = hostPageDeps();
        const read = new Subject<HostBooking>();
        refuseMove(deps, 'checkIn', refusal('Booking is already checked in'));
        queueReads(deps, read, of(bkB));
        const page = await open({ deps, items: [arriving(), bkB] });
        const lists = deps.bookings.list.mock.calls.length;

        await startMove(page, 'checkIn');
        submitMove(page, 'checkIn', arriving());
        api(page).openDetails(bkB);
        await settle(page);
        read.error(apiError(404, [], 'GET'));
        await settle(page);

        expect(api(page).viewing()?.id).toBe('bk-b');
        expect(page.url()).toBe(bookingPath(HOSTEL_ID, 'bk-b'));
        expect(deps.notifications.raised).toEqual([]);
        expect(deps.bookings.list.mock.calls.length).toBe(lists + 1);
        expect(api(page).busy()).toBe(false);
      });

      it('opens nothing and raises no toast when the host switched hostel', async () => {
        const deps = hostPageDeps();
        const read = new Subject<HostBooking>();
        refuseMove(deps, 'checkIn', refusal('Booking is already checked in'));
        queueReads(deps, read);
        const page = await open({ deps, items: [arriving()] });

        await startMove(page, 'checkIn');
        submitMove(page, 'checkIn', arriving());
        await page.navigate('/host/h2/bookings');
        read.next(hostBooking('checked-in', { id: 'bk-c' }));
        read.complete();
        await settle(page);

        expect(api(page).viewing()).toBeNull();
        expect(page.url()).toBe('/host/h2/bookings');
        expect(deps.notifications.raised).toEqual([]);
        expect(api(page).busy()).toBe(false);
      });

      it('stays on the list, with no panel and no toast, when the host went back during a panel check-in', async () => {
        const deps = hostPageDeps();
        const booking = arriving();
        const read = new Subject<HostBooking>();
        const fresh = hostBooking('checked-in', { id: 'bk-c', occupancies: BOTH_ROOMS });
        refuseMove(deps, 'checkIn', refusal('Booking is already checked in'));
        queueReads(deps, of(booking), read);
        const page = await open({ deps, items: [booking] });
        await openPanel(page, booking);
        api(page).onAct({ action: 'checkIn', booking });
        await settle(page);
        submitMove(page, 'checkIn', booking);
        await settle(page);

        await page.navigate(LIST_URL);
        const navigate = vi.spyOn(page.router, 'navigateByUrl');
        read.next(fresh);
        read.complete();
        await settle(page);

        expect(page.url()).toBe(LIST_URL);
        expect(api(page).viewing()).toBeNull();
        expect(navigate.mock.calls.map((c) => c[0])).not.toContain(bookingPath(HOSTEL_ID, 'bk-c'));
        expect(deps.notifications.raised).toEqual([]);
        expect(api(page).rows()[0]).toBe(fresh);
        expect(api(page).busy()).toBe(false);
      });

      it('opens nothing and raises no toast when the host opens another booking just as the read answers', async () => {
        const deps = hostPageDeps();
        const read = new Subject<HostBooking>();
        const fresh = hostBooking('checked-in', { id: 'bk-c' });
        refuseMove(deps, 'checkIn', refusal('Booking is already checked in'));
        queueReads(deps, read, of(bkB));
        const page = await open({ deps, items: [arriving(), bkB] });

        await startMove(page, 'checkIn');
        submitMove(page, 'checkIn', arriving());
        await settle(page);
        const navigate = vi.spyOn(page.router, 'navigateByUrl');
        // No settle between the two: the URL has not moved yet, so only the open itself marks the read stale.
        api(page).openDetails(bkB);
        read.next(fresh);
        read.complete();
        await settle(page);

        expect(deps.notifications.raised).toEqual([]);
        expect(navigate.mock.calls.map((c) => c[0])).not.toContain(bookingPath(HOSTEL_ID, 'bk-c'));
        expect(api(page).viewing()?.id).toBe('bk-b');
        expect(page.url()).toBe(bookingPath(HOSTEL_ID, 'bk-b'));
        expect(api(page).rows()[0]).toBe(fresh);
        expect(api(page).busy()).toBe(false);
      });
    });

    describe('paying the invoice of a booking already paid', () => {
      const text = 'This booking is already paid';
      const paid = () => settledOf(checkedIn());
      const callOrder = (fn: { mock: { invocationCallOrder: number[] } }) => fn.mock.invocationCallOrder[0];
      const paidToast = { kind: 'info', title: 'hostBookings.bookingAlreadyPaid', message: undefined };
      const crossPaidToast = { kind: 'success', title: 'hostBookings.alreadyPaidInvoicePaid', message: undefined };

      /** The open panel's status pill for the booking's invoice. */
      const invoicePill = (page: Page) =>
        Array.from(page.el.querySelectorAll('hh-booking-details-panel hh-status-pill')).find((p) =>
          p.closest('span.flex')?.textContent?.includes(buildInvoiceId(inv())),
        );

      interface SentPayment {
        args: unknown[];
        /** How many times the bill had been read on its own when the payment went out. */
        billReads: number;
      }

      /** `rb-1` paid quietly, once the bill's own read was made. */
      const PAID_AFTER_CHECK: SentPayment = { args: [HOSTEL_ID, 'rb-1', QUIET], billReads: 1 };

      /**
       * Answers the invoice payment with `reply` and returns every payment the page actually sent.
       * Building the request sends nothing, as with `HttpClient`; only subscribing to it does.
       */
      function sentPayments(
        deps: HostPageDeps,
        reply: () => Observable<Invoice> = () => of(inv({ status: 'paid' })),
      ): SentPayment[] {
        const sent: SentPayment[] = [];
        deps.ops.markInvoicePaid.mockImplementation((hostelId, billId, opts) =>
          defer(() => {
            sent.push({ args: [hostelId, billId, opts], billReads: deps.ops.invoice.mock.calls.length });
            return reply();
          }),
        );
        return sent;
      }

      /**
       * Row menu, Mark as paid on `bk-i`, whose invoice is due and whose box is ticked; the server says it is paid.
       * `invoiceRead` is what the bill's own read answers, still due unless said.
       */
      async function openRefusedPayment(deps: HostPageDeps, invoiceRead: Observable<Invoice> = of(inv())): Promise<Page> {
        refuseMove(deps, 'markPaid', urlRefusal(text));
        deps.ops.invoice.mockReturnValue(invoiceRead);
        const page = await open({ deps, items: [checkedIn()], invoices: [['bk-i', inv()]] });
        await startMove(page, 'markPaid');
        return page;
      }

      it('pays the invoice once the database confirms the booking is settled, and names it in the toast', async () => {
        const deps = hostPageDeps();
        const sent = sentPayments(deps);
        queueReads(deps, of(paid()));
        const page = await openRefusedPayment(deps);
        const translate = vi.spyOn(TestBed.inject(TranslocoService), 'translate');

        await confirmViaButton(page);

        expect(deps.bookings.get.mock.calls).toEqual([[HOSTEL_ID, 'bk-i', QUIET]]);
        expect(deps.ops.invoice.mock.calls).toEqual([[HOSTEL_ID, 'rb-1', QUIET]]);
        expect(sent).toEqual([PAID_AFTER_CHECK]);
        expect(callOrder(deps.bookings.markPaid)).toBeLessThan(callOrder(deps.bookings.get));
        expect(callOrder(deps.bookings.get)).toBeLessThan(callOrder(deps.ops.invoice));
        expect(deps.notifications.raised).toEqual([
          { kind: 'success', title: 'hostBookings.alreadyPaidInvoicePaid', message: undefined },
        ]);
        expect(translations(translate, 'hostBookings.alreadyPaidInvoicePaid').map((c) => c[1])).toContainEqual({
          invoice: buildInvoiceId(inv()),
        });
        expect(api(page).invoices().get('bk-i')?.status).toBe('paid');
        expect(modal(page)).toBeNull();
        expect(api(page).rows()[0].balanceDue).toBe(0);
        expectNoLeak(page, deps, text);
      });

      it('reports the invoice on its own when it refuses, with the booking shown settled', async () => {
        const deps = hostPageDeps();
        deps.ops.markInvoicePaid.mockReturnValue(throwError(() => refusal('The invoice is locked.')));
        queueReads(deps, of(paid()));
        const page = await openRefusedPayment(deps);
        const translate = vi.spyOn(TestBed.inject(TranslocoService), 'translate');

        await confirmViaButton(page);

        expect(deps.notifications.raised).toEqual([
          { kind: 'error', title: 'hostBookings.invoiceNotPaid', message: undefined },
        ]);
        expect(translations(translate, 'hostBookings.invoiceNotPaid').map((c) => c[1])).toContainEqual({
          reason: 'hostBookings.payTheInvoiceOnItsOwn',
        });
        expect(deps.ops.invoice).toHaveBeenCalledTimes(1);
        expect(api(page).rows()[0].balanceDue).toBe(0);
        expect(api(page).invoices().get('bk-i')?.status).toBe('due');
        expect(modal(page)).toBeNull();
      });

      it('does not pay the invoice when the database still shows the booking owing', async () => {
        const deps = hostPageDeps();
        const owing = checkedIn({ guests: 3 });
        queueReads(deps, of(owing), of(owing));
        const page = await openRefusedPayment(deps);

        await confirmViaButton(page);

        expect(deps.ops.markInvoicePaid).not.toHaveBeenCalled();
        expect(deps.bookings.get).toHaveBeenCalledTimes(2);
        expect(modal(page)).not.toBeNull();
        expect(dialogAlert(page)).toBe('hostBookings.moveNotAccepted');
        expect(deps.notifications.raised).toEqual([]);
      });

      it('does not pay the invoice when the booking cannot be read, and refreshes the list', async () => {
        const deps = hostPageDeps();
        queueReads(deps, throwError(() => apiError(500, [], 'GET')), throwError(() => apiError(500, [], 'GET')));
        const page = await openRefusedPayment(deps);
        const lists = deps.bookings.list.mock.calls.length;

        await confirmViaButton(page);

        expect(deps.ops.markInvoicePaid).not.toHaveBeenCalled();
        expect(deps.bookings.get).toHaveBeenCalledTimes(2);
        expect(dialogAlert(page)).toBe('hostBookings.bookingAlreadyPaid');
        expect(deps.notifications.raised).toEqual([]);
        expect(deps.bookings.list.mock.calls.length).toBe(lists + 1);
      });

      it('leaves the invoice due when only the second read shows the booking settled', async () => {
        const deps = hostPageDeps();
        queueReads(deps, throwError(() => apiError(500, [], 'GET')), of(paid()));
        const page = await openRefusedPayment(deps);

        await confirmViaButton(page);

        expect(deps.bookings.get).toHaveBeenCalledTimes(2);
        expect(deps.ops.markInvoicePaid).not.toHaveBeenCalled();
        expect(deps.notifications.raised).toEqual([
          { kind: 'info', title: 'hostBookings.bookingAlreadyPaid', message: undefined },
        ]);
        expect(api(page).invoices().get('bk-i')?.status).toBe('due');
        expect(modal(page)).toBeNull();
      });

      it('never pays the invoice for a booking that moved on, and tells the host so', async () => {
        const deps = hostPageDeps();
        const wrongStage = 'Only confirmed, checked-in, checked-out or no-show bookings can be marked paid';
        refuseMove(deps, 'markPaid', urlRefusal(wrongStage));
        queueReads(deps, of(hostBooking('cancelled', { id: 'bk-i', ref: 'BK-I' })));
        const page = await open({ deps, items: [checkedIn()], invoices: [['bk-i', inv()]] });

        await startMove(page, 'markPaid');
        await confirmViaButton(page);

        expect(deps.ops.markInvoicePaid).not.toHaveBeenCalled();
        expect(deps.bookings.get).toHaveBeenCalledTimes(1);
        expect(deps.notifications.raised).toEqual([errorToast('hostBookings.bookingHasMovedOn')]);
        expect(modal(page)).toBeNull();
      });

      it('settles the open panel and shows its invoice paid', async () => {
        const deps = hostPageDeps();
        const booking = checkedIn();
        const settledCopy = paid();
        refuseMove(deps, 'markPaid', urlRefusal(text));
        deps.ops.invoice.mockReturnValue(of(inv()));
        const sent = sentPayments(deps);
        queueReads(deps, of(booking), of(settledCopy));
        const page = await open({ deps, items: [booking], invoices: [['bk-i', inv()]] });
        await openPanel(page, booking);

        api(page).onAct({ action: 'markPaid', booking });
        await settle(page);
        await confirmViaButton(page);

        expect(deps.ops.invoice.mock.calls).toEqual([[HOSTEL_ID, 'rb-1', QUIET]]);
        expect(sent).toEqual([PAID_AFTER_CHECK]);
        expect(api(page).viewing()).toBe(settledCopy);
        expect(panelText(page)).toContain('Nothing outstanding');
        expect(invoicePill(page)).toBeDefined();
        expect(textOf(invoicePill(page))).toBe(invoiceStatusLabel('paid'));
        expect(deps.notifications.raised).toEqual([
          { kind: 'success', title: 'hostBookings.alreadyPaidInvoicePaid', message: undefined },
        ]);
      });

      it('holds busy across the read, the invoice check and the invoice request, so nothing else sends', async () => {
        const deps = hostPageDeps();
        const read = new Subject<HostBooking>();
        const check = new Subject<Invoice>();
        const payment = new Subject<Invoice>();
        const other = hostBooking('pending', { id: 'bk-p' });
        refuseMove(deps, 'markPaid', urlRefusal(text));
        deps.ops.invoice.mockReturnValue(check);
        const sent = sentPayments(deps, () => payment);
        queueReads(deps, read);
        const page = await open({ deps, items: [checkedIn(), other], invoices: [['bk-i', inv()]] });
        await startMove(page, 'markPaid');
        await confirmViaButton(page);
        const tryAnotherMove = () => {
          api(page).confirmDialog();
          api(page).onAct({ action: 'confirm', booking: other });
        };

        expect(api(page).busy()).toBe(true);
        expect(confirmButton(page).disabled).toBe(true);
        tryAnotherMove();
        expect(deps.bookings.markPaid).toHaveBeenCalledTimes(1);
        expect(deps.bookings.confirm).not.toHaveBeenCalled();
        expect(deps.ops.invoice).not.toHaveBeenCalled();
        expect(sent).toEqual([]);

        read.next(paid());
        read.complete();
        await settle(page);

        expect(api(page).busy()).toBe(true);
        expect(deps.ops.invoice).toHaveBeenCalledTimes(1);
        expect(sent).toEqual([]);
        tryAnotherMove();
        expect(deps.bookings.markPaid).toHaveBeenCalledTimes(1);
        expect(deps.bookings.confirm).not.toHaveBeenCalled();
        expect(deps.bookings.get).toHaveBeenCalledTimes(1);
        expect(deps.ops.invoice).toHaveBeenCalledTimes(1);
        expect(sent).toEqual([]);

        check.next(inv());
        check.complete();
        await settle(page);

        expect(api(page).busy()).toBe(true);
        expect(sent).toEqual([PAID_AFTER_CHECK]);
        tryAnotherMove();
        expect(deps.bookings.markPaid).toHaveBeenCalledTimes(1);
        expect(deps.bookings.confirm).not.toHaveBeenCalled();
        expect(deps.bookings.get).toHaveBeenCalledTimes(1);
        expect(deps.ops.invoice).toHaveBeenCalledTimes(1);
        expect(sent).toEqual([PAID_AFTER_CHECK]);

        payment.next(inv({ status: 'paid' }));
        payment.complete();
        await settle(page);

        expect(api(page).busy()).toBe(false);
        expect(modal(page)).toBeNull();
      });

      it('records the invoice paid without paying it again when it was paid elsewhere too, from the row menu', async () => {
        const deps = hostPageDeps();
        const sent = sentPayments(deps);
        queueReads(deps, of(paid()));
        const page = await openRefusedPayment(deps, of(inv({ status: 'paid' })));
        const lookups = deps.ops.bookingInvoices.mock.calls.length;

        await confirmViaButton(page);

        expect(sent).toEqual([]);
        expect(deps.ops.invoice.mock.calls).toEqual([[HOSTEL_ID, 'rb-1', QUIET]]);
        expect(deps.notifications.raised).toEqual([paidToast]);
        expect(api(page).invoices().get('bk-i')?.status).toBe('paid');
        expect(deps.ops.bookingInvoices).toHaveBeenCalledTimes(lookups);
        expect(modal(page)).toBeNull();
        expect(api(page).rows()[0].balanceDue).toBe(0);
        expect(api(page).busy()).toBe(false);
        expectNoLeak(page, deps, text);
      });

      it('records the invoice paid without paying it again when it was paid elsewhere too, from the open panel', async () => {
        const deps = hostPageDeps();
        const booking = checkedIn();
        const settledCopy = paid();
        refuseMove(deps, 'markPaid', urlRefusal(text));
        deps.ops.invoice.mockReturnValue(of(inv({ status: 'paid' })));
        const sent = sentPayments(deps);
        queueReads(deps, of(booking), of(settledCopy));
        const page = await open({ deps, items: [booking], invoices: [['bk-i', inv()]] });
        await openPanel(page, booking);

        api(page).onAct({ action: 'markPaid', booking });
        await settle(page);
        await confirmViaButton(page);

        expect(sent).toEqual([]);
        expect(deps.ops.invoice).toHaveBeenCalledTimes(1);
        expect(deps.notifications.raised).toEqual([paidToast]);
        expect(modal(page)).toBeNull();
        expect(api(page).viewing()).toBe(settledCopy);
        expect(invoicePill(page)).toBeDefined();
        expect(textOf(invoicePill(page))).toBe(invoiceStatusLabel('paid'));
        expect(api(page).rows()[0].balanceDue).toBe(0);
        expectNoLeak(page, deps, text);
      });

      it.each([
        { name: 'answers 500', reply: () => throwError(() => apiError(500, [], 'GET')) },
        { name: 'answers 404', reply: () => throwError(() => apiError(404, [], 'GET')) },
        { name: 'never reaches the server', reply: () => throwError(() => apiError(0, [], 'GET')) },
        { name: 'answers with no bill', reply: () => of(inv({ id: '' })) },
      ])('never pays the invoice blind when its own read $name, and looks it up again', async ({ reply }) => {
        const deps = hostPageDeps();
        const sent = sentPayments(deps);
        queueReads(deps, of(paid()));
        const page = await openRefusedPayment(deps, reply());
        const lookups = deps.ops.bookingInvoices.mock.calls.length;

        await confirmViaButton(page);

        expect(deps.ops.invoice).toHaveBeenCalledTimes(1);
        expect(sent).toEqual([]);
        expect(deps.notifications.raised).toEqual([paidToast]);
        expect(deps.ops.bookingInvoices.mock.calls.slice(lookups)).toEqual([[HOSTEL_ID, ['bk-i'], QUIET]]);
        expect(api(page).invoices().get('bk-i')?.status).toBe('due');
        expect(modal(page)).toBeNull();
        expect(api(page).rows()[0].balanceDue).toBe(0);
        expect(api(page).busy()).toBe(false);
      });

      it.each(['cancelled', 'no-show', 'pending'])(
        'leaves the invoice alone when the settled booking is now %s, and says it was already paid',
        async (slug) => {
          const deps = hostPageDeps();
          const gone = settledOf(hostBooking(slug, { id: 'bk-i', ref: 'BK-I' }));
          queueReads(deps, of(gone), of(gone));
          const page = await openRefusedPayment(deps);

          await confirmViaButton(page);

          expect(deps.ops.invoice).not.toHaveBeenCalled();
          expect(deps.ops.markInvoicePaid).not.toHaveBeenCalled();
          expect(deps.bookings.get.mock.calls).toEqual([
            [HOSTEL_ID, 'bk-i', QUIET],
            [HOSTEL_ID, 'bk-i', QUIET],
          ]);
          expect(deps.notifications.raised).toEqual([paidToast]);
          expect(api(page).invoices().get('bk-i')?.status).toBe('due');
          expect(modal(page)).toBeNull();
          expect(api(page).rows()[0]).toBe(gone);
          expect(api(page).busy()).toBe(false);
        },
      );

      it.each(['checked-out', 'confirmed'])('pays the invoice when the settled booking is now %s', async (slug) => {
        const deps = hostPageDeps();
        const sent = sentPayments(deps);
        queueReads(deps, of(settledOf(hostBooking(slug, { id: 'bk-i', ref: 'BK-I' }))));
        const page = await openRefusedPayment(deps);

        await confirmViaButton(page);

        expect(deps.bookings.get).toHaveBeenCalledTimes(1);
        expect(deps.ops.invoice).toHaveBeenCalledTimes(1);
        expect(sent).toEqual([PAID_AFTER_CHECK]);
        expect(deps.notifications.raised).toEqual([crossPaidToast]);
        expect(api(page).invoices().get('bk-i')?.status).toBe('paid');
      });

      it('still pays an invoice the re-check finds overdue', async () => {
        const deps = hostPageDeps();
        const sent = sentPayments(deps);
        queueReads(deps, of(paid()));
        const page = await openRefusedPayment(deps, of(inv({ status: 'over-due' })));

        await confirmViaButton(page);

        expect(deps.ops.invoice).toHaveBeenCalledTimes(1);
        expect(sent).toEqual([PAID_AFTER_CHECK]);
        expect(deps.notifications.raised).toEqual([crossPaidToast]);
        expect(api(page).invoices().get('bk-i')?.status).toBe('paid');
        expect(modal(page)).toBeNull();
      });
    });

    describe('every other refusal', () => {
      const cases = [
        {
          name: 'too few beds in a room on check-in',
          action: 'checkIn' as const,
          shown: arriving(),
          err: refusal('Room 101 has only 1 bed(s) available'),
          key: 'hostBookings.notEnoughBedsFree',
        },
        {
          name: 'an unknown room on check-in',
          action: 'checkIn' as const,
          shown: arriving(),
          err: refusal('Invalid room ID'),
          key: 'hostBookings.checkTheRoomsPicked',
        },
        {
          name: 'a cancellation the server wants a reason for',
          action: 'cancel' as const,
          shown: checkedIn(),
          err: refusal('A cancellation reason is required'),
          key: 'hostBookings.giveTheGuestAReason',
        },
        {
          name: 'a refusal on check-out the page does not recognise',
          action: 'checkOut' as const,
          shown: checkedIn(),
          err: refusal('Disposition is invalid'),
          key: 'hostBookings.moveNotAccepted',
        },
        {
          name: 'a check-out that never reached the server',
          action: 'checkOut' as const,
          shown: checkedIn(),
          err: apiError(0),
          key: 'common.cannotReachTheServer',
        },
        {
          name: 'a check-out of a booking the server does not know',
          action: 'checkOut' as const,
          shown: checkedIn(),
          err: apiError(404, ['Not Found']),
          key: 'hostBookings.bookingNotFound',
        },
      ];

      it.each(cases)('is shown where it was sent and not read back for $name', async (c) => {
        const deps = hostPageDeps();
        refuseMove(deps, c.action, c.err);
        const page = await open({ deps, items: [c.shown] });
        const lists = deps.bookings.list.mock.calls.length;

        await startMove(page, c.action);
        submitMove(page, c.action, c.shown);
        expect(api(page).busy()).toBe(false);
        await settle(page);

        expect(c.action === 'checkIn' ? assignAlert(page) : dialogAlert(page)).toBe(c.key);
        expect(deps.bookings.get).not.toHaveBeenCalled();
        expect(deps.notifications.raised).toEqual([]);
        expect(deps.bookings.list.mock.calls.length).toBe(lists);
        expect(api(page).busy()).toBe(false);
      });
    });

    describe('confirming from the panel', () => {
      const pending = hostBooking('pending', { id: 'bk-p' });

      async function confirmRefused(deps: HostPageDeps, text: string): Promise<Page> {
        refuseMove(deps, 'confirm', refusal(text));
        const page = await open({ deps, items: [pending] });
        await openPanel(page, pending);
        api(page).onAct({ action: 'confirm', booking: pending });
        await settle(page);
        return page;
      }

      it('shows the booking as it now is with a red footer when it had already been confirmed', async () => {
        const deps = hostPageDeps();
        const moved = hostBooking('confirmed', { id: 'bk-p' });
        queueReads(deps, of(pending), of(moved));

        const page = await confirmRefused(deps, 'Only pending bookings can be confirmed');

        expect(deps.bookings.get).toHaveBeenCalledTimes(2);
        expect(api(page).viewing()).toBe(moved);
        expect(api(page).viewError()).toBe('hostBookings.bookingHasMovedOn');
        expect(panelFooterAlert(page)).toBe('hostBookings.bookingHasMovedOn');
        expect(panelFooterButtons(page)).toContain('Check in');
        expect(panelFooterButtons(page)).not.toContain('Confirm');
        expect(deps.notifications.raised).toEqual([]);
        expect(api(page).busy()).toBe(false);
      });

      it('keeps the generic message when the database still shows the booking pending', async () => {
        const deps = hostPageDeps();
        const same = hostBooking('pending', { id: 'bk-p', guests: 3 });
        queueReads(deps, of(pending), of(same));

        const page = await confirmRefused(deps, 'Only pending bookings can be confirmed');

        expect(api(page).viewing()).toBe(same);
        expect(api(page).viewError()).toBe('hostBookings.moveNotAccepted');
        expect(panelFooterAlert(page)).toBe('hostBookings.moveNotAccepted');
        expect(panelFooterButtons(page)).toContain('Confirm');
        expect(api(page).busy()).toBe(false);
      });

      it('reads nothing back when the hostel is not set up for bookings', async () => {
        const deps = hostPageDeps();
        queueReads(deps, of(pending));

        const page = await confirmRefused(deps, 'This hostel does not accept bookings');

        expect(deps.bookings.get.mock.calls).toEqual([[HOSTEL_ID, 'bk-p', QUIET]]);
        expect(api(page).viewError()).toBe('hostBookings.notSetUpForBookings');
        expect(panelFooterAlert(page)).toBe('hostBookings.notSetUpForBookings');
        expect(deps.notifications.raised).toEqual([]);
        expect(api(page).busy()).toBe(false);
      });
    });

    describe('what the host can read', () => {
      it.each(MOVED_ON)('shows no server text or API URL, while reading back or after, for $name', async (m) => {
        const deps = hostPageDeps();
        const read = new Subject<HostBooking>();
        refuseMove(deps, m.action, urlRefusal(m.text));
        queueReads(deps, read);
        const page = await open({ deps, items: [m.shown] });

        await startMove(page, m.action);
        submitMove(page, m.action, m.shown);
        await settle(page);
        expectNoLeak(page, deps, m.text);
        expect(shownText(page, deps)).toContain(m.key);

        read.next(m.fresh);
        read.complete();
        await settle(page);
        expectNoLeak(page, deps, m.text);
        expect(shownText(page, deps)).toContain(m.key);
      });
    });
  });
});
