import { WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { Subject, of, throwError } from 'rxjs';
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
      const text = 'Only checked-in bookings can be invoiced';
      deps.bookings.generateInvoice.mockReturnValue(throwError(() => refusal(text)));
      const page = await open({ deps, items: [settledOf(checkedIn())] });

      await startFromMenu(page, 'Generate invoice');
      await confirmViaButton(page);

      expect(modal(page)).not.toBeNull();
      expect(textOf(modal(page)!.querySelector('[role="alert"]'))).toBe('hostBookings.bookingHasMovedOn');
      expect(api(page).dialogError()).toBe('hostBookings.bookingHasMovedOn');
      expectNoLeak(page, deps, text);
      expect(deps.ops.bookingInvoices).toHaveBeenCalledTimes(1);
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
      const text = 'This booking is already paid';
      deps.bookings.markPaid.mockReturnValue(throwError(() => refusal(text)));
      const page = await open({ deps, items: [checkedIn()], invoices: [['bk-i', inv()]] });

      await startFromMenu(page, 'Mark as paid');
      await confirmViaButton(page);

      expect(deps.ops.markInvoicePaid).not.toHaveBeenCalled();
      expect(modal(page)).not.toBeNull();
      expect(textOf(modal(page)!.querySelector('[role="alert"]'))).toBe('hostBookings.bookingAlreadyPaid');
      expectNoLeak(page, deps, text);
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
      { text: 'Booking is already checked in', key: 'hostBookings.alreadyCheckedIn' },
      { text: 'Only confirmed bookings can be checked in', key: 'hostBookings.bookingHasMovedOn' },
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

    it.each([
      { text: 'Only checked-in bookings can be checked out', key: 'hostBookings.bookingHasMovedOn' },
      { text: 'Disposition is invalid', key: 'hostBookings.moveNotAccepted' },
    ])('lets no server text or API URL reach the screen on "$text"', async ({ text, key }) => {
      const deps = hostPageDeps();
      deps.bookings.checkOut.mockReturnValue(throwError(() => urlRefusal(text)));
      const page = await open({ deps, items: [checkedIn()] });

      await startFromMenu(page, 'Check out');
      await confirmViaButton(page);

      expect(modal(page)).not.toBeNull();
      expect(textOf(modal(page)!.querySelector('[role="alert"]'))).toBe(key);
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
});
