import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { TranslocoService } from '@jsverse/transloco';
import { Injectable } from '@angular/core';
import { FilterGroup } from '@hostelhive/ui';
import { ApiError, Invoice } from '@hostelhive/data-access';
import {
  BillingMode,
  HOSTEL_ID,
  InvoicesReply,
  apiError,
  apiErrorWithCode,
  bookingInvoice,
  hostBooking,
  invoice,
  invoicesReply,
  sessionUser,
} from '@app/testing/host-builders';
import { CANCAN_MESSAGE, RefusalKind, refusalError } from '@app/testing/backend-refusals';
import { HostPage, HostPageDeps, hostPageDeps, openHostPage } from '@app/testing/host-page';
import { LIST_LOAD_REFUSALS, PLAN_REFUSALS, kindsShowing, loadSurface } from '@app/testing/load-refusal-surface';
import { PrintWindowRecord, fakePrintWindow } from '@app/testing/print-window';
import type { Role } from '@core/auth/roles';
import { SessionStore } from '@core/auth/session-store';
import { toToastCopy } from '@core/errors/api-error-message';
import { HostPropertyStore } from '@services/host-property-store';
import { downloadCsv } from '@util/csv';
import { HostBooking } from '../bookings/host-bookings-api';
import { Invoices } from './invoices';

vi.mock('@util/csv', () => ({ downloadCsv: vi.fn() }));

/** The opt-out a page sends on a request whose failure it reports itself. */
const QUIET = { suppressErrorToast: true };

const LIST = `/host/${HOSTEL_ID}/invoices`;
const viewUrl = (billId: string): string => `${LIST}/view/${billId}`;

/** Session that grants every permission, so the row menu offers every action. */
@Injectable()
class PermissiveSession extends SessionStore {
  override hasPermission(): boolean {
    return true;
  }
}

/** The members of the page these specs reach into; protected in the class, so typed here. */
interface Internals {
  filterGroups(): FilterGroup[];
  statusOptions(): { value: string; label: string }[];
  searchFieldOptions(): { value: string; label: string }[];
  onSearchFieldChange(value: string): void;
  payPrompt(): { inv: Invoice; checking: boolean; offerBooking: boolean } | null;
  paying(): boolean;
  confirmPay(): void;
  markPaid(inv: Invoice, event: MouseEvent): void;
  editingInvoice(): Invoice | null;
  selected(): Invoice | undefined;
  onInvoiceUpdated(saved: Invoice | null): void;
  onInvoiceCreated(saved: Invoice | null): void;
}

type Page = HostPage<Invoices>;

const internals = (page: Page): Internals => page.component as unknown as Internals;

const STATUS_NAME = { due: 'Due', paid: 'Paid', 'over-due': 'Overdue' } as const;

function status(slug: keyof typeof STATUS_NAME, count: number, totalAmount: number): InvoicesReply['statuses'][number] {
  return { name: STATUS_NAME[slug], slug, count, totalAmount };
}

const RENT_AGGS = {
  rentTotal: 15000,
  rentPaid: 0,
  rentBalance: 15000,
  utilityTotal: 3600,
  utilityPaid: 0,
  utilityBalance: 3600,
  bookingTotal: 0,
  bookingPaid: 0,
  bookingBalance: 0,
};

/** The aggregates a nightly hostel's reply carries: only the booking bucket has money. */
function bookingAggs(total: number, paid: number) {
  return { ...invoicesReply().aggs, bookingTotal: total, bookingPaid: paid, bookingBalance: total - paid };
}

/** Two unpaid booking bills for two different bookings. */
function dueBookingBills(): Invoice[] {
  return [
    bookingInvoice(),
    bookingInvoice({
      id: 'rb-4',
      tenantName: 'Sara Khan',
      amount: 8000,
      lines: [{ label: 'Room Charges', amount: 8000 }],
      booking: { id: 'bk-2', ref: 'BK-0002', guestName: 'Sara Khan', phone: '923007654321' },
    }),
  ];
}

function depsWith(reply: InvoicesReply): HostPageDeps {
  const deps = hostPageDeps();
  deps.ops.invoices.mockReturnValue(of(reply));
  return deps;
}

/** The add/edit drawer asks for renters, which the shared stub does not carry. */
function withRenters(deps: HostPageDeps): HostPageDeps {
  Object.assign(deps.ops, { renters: vi.fn(() => of({ renters: [], total: 0 })) });
  return deps;
}

/** The permissive session, signed in as `role` from the start when one is given. */
function permissiveSession(role?: Role): PermissiveSession {
  const session = new PermissiveSession();
  if (role) session.setSession(sessionUser(role), 'tok');
  return session;
}

/**
 * Mounts the page. `signedInAs` signs the session in before the host store is seeded, because the
 * store holds its hostel list for one user: signing in after the page opened empties the list.
 */
function open(opts: { url?: string; billing?: BillingMode; deps?: HostPageDeps; signedInAs?: Role } = {}): Promise<Page> {
  return openHostPage(opts.url ?? LIST, Invoices, { invoices: Invoices }, {
    billing: opts.billing ?? 'night',
    deps: opts.deps,
    providers: [{ provide: SessionStore, useFactory: () => permissiveSession(opts.signedInAs) }],
  });
}

async function flush(page: Page): Promise<void> {
  await page.settle();
  await page.settle();
}

const norm = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

const bodyRows = (page: Page): HTMLElement[] => Array.from(page.el.querySelectorAll<HTMLElement>('tbody tr'));

const dialog = (page: Page): HTMLElement | null => page.el.querySelector<HTMLElement>('[role="dialog"]');

const preview = (page: Page): HTMLElement | null => page.el.querySelector<HTMLElement>('.hh-below-header');

const buttonIn = (root: ParentNode | null, text: string): HTMLButtonElement | undefined =>
  Array.from(root?.querySelectorAll<HTMLButtonElement>('button') ?? []).find((b) => norm(b) === text);

/** The three figures of each summary card on the page, as displayed. */
const figures = (page: Page): string[] =>
  Array.from(page.el.querySelectorAll('p.text-lg')).map((p) => norm(p));

async function click(page: Page, el: Element | null | undefined): Promise<void> {
  expect(el, 'element to click').toBeTruthy();
  (el as HTMLElement).click();
  await flush(page);
}

async function openRowMenu(page: Page, index: number): Promise<void> {
  await click(page, bodyRows(page)[index].querySelector('button[aria-label="a11y.rowActions"]'));
}

async function pickMenuItem(page: Page, text: string): Promise<void> {
  const item = Array.from(page.el.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((i) => norm(i) === text);
  await click(page, item);
}

const menuItems = (page: Page): string[] =>
  Array.from(page.el.querySelectorAll('[role="menuitem"]')).map((i) => norm(i));

/** Opens the row's menu and chooses Mark as paid. */
async function startPay(page: Page, rowIndex = 0): Promise<void> {
  await openRowMenu(page, rowIndex);
  await pickMenuItem(page, 'hostInvoices.markAsPaid');
}

const confirmButton = (page: Page): HTMLButtonElement | undefined =>
  Array.from(dialog(page)?.querySelectorAll<HTMLButtonElement>('button') ?? []).at(-1);

const alsoPayBox = (page: Page): HTMLInputElement | null =>
  dialog(page)?.querySelector<HTMLInputElement>('input[type="checkbox"]') ?? null;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Types into the search box and waits out both debounces for real (the box's 600ms, then the page's 300ms). */
async function typeSearch(page: Page, term: string): Promise<void> {
  const input = page.el.querySelector<HTMLInputElement>('hh-search input');
  expect(input, 'search input').toBeTruthy();
  input!.value = term;
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(700);
  await page.settle();
  await wait(400);
  await page.settle();
}

const lastFilters = (deps: HostPageDeps): Record<string, string> =>
  deps.ops.invoices.mock.calls.at(-1)?.[3] ?? {};

describe('Invoices page', () => {
  let printWindow: PrintWindowRecord | undefined;

  beforeEach(() => {
    vi.mocked(downloadCsv).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    printWindow?.restore();
    printWindow = undefined;
  });

  describe('billing modes', () => {
    it('shows only the booking invoices card on a nightly hostel', async () => {
      const page = await open({ deps: depsWith(invoicesReply([bookingInvoice()], { statuses: [status('due', 1, 24000)] })) });

      const text = norm(page.el);
      expect(text).toContain('hostInvoices.bookingInvoices');
      expect(text).not.toContain('hostInvoices.renterBills');
      expect(text).not.toContain('hostInvoices.utilityBills');
      expect(figures(page)).toHaveLength(3);
    });

    it('offers no manual Add invoice on a nightly hostel', async () => {
      const page = await open({ deps: depsWith(invoicesReply([bookingInvoice()])) });

      expect(page.el.querySelector('button[aria-label="a11y.addInvoice"]')).toBeNull();
    });

    it('drops the type and tenant filter groups on a nightly hostel', async () => {
      const page = await open({ deps: depsWith(invoicesReply([bookingInvoice()])) });

      expect(internals(page).filterGroups().map((g) => g.key)).toEqual(['status', 'room', 'date']);
    });

    it('explains that invoices come from bookings when a nightly hostel has none', async () => {
      const page = await open();

      const text = norm(page.el);
      expect(text).toContain('hostInvoices.noInvoicesYet');
      expect(text).toContain('hostInvoices.invoicesAppearHereNightly');
      expect(text).not.toContain('hostInvoices.invoicesAppearHereOnceYou');
    });

    it('keeps the rent and utility cards, Add, and the type and tenant filters on a monthly hostel', async () => {
      const bills = [invoice(), invoice({ id: 'rb-3', kind: 'utility', amount: 3600, lines: [{ label: 'Electricity', amount: 3600 }] })];
      const page = await open({ billing: 'month', deps: depsWith(invoicesReply(bills, { aggs: RENT_AGGS })) });

      const text = norm(page.el);
      expect(text).toContain('hostInvoices.renterBills');
      expect(text).toContain('hostInvoices.utilityBills');
      expect(text).not.toContain('hostInvoices.bookingInvoices');
      expect(page.el.querySelector('button[aria-label="a11y.addInvoice"]')).not.toBeNull();

      const groups = internals(page).filterGroups();
      expect(groups.map((g) => g.key)).toEqual(['status', 'kind', 'room', 'tenant', 'date']);
      const kindOptions = groups.find((g) => g.key === 'kind')!.fields![0].options!.map((o) => o.value);
      expect(kindOptions).toEqual(['all', 'rental', 'utility']);
    });

    it('keeps the original empty copy on a monthly hostel', async () => {
      const page = await open({ billing: 'month' });

      const text = norm(page.el);
      expect(text).toContain('hostInvoices.invoicesAppearHereOnceYou');
      expect(text).not.toContain('hostInvoices.invoicesAppearHereNightly');
    });

    it('shows the monthly view when the billing cycle is unknown', async () => {
      const page = await open({ billing: '', deps: depsWith(invoicesReply([invoice()], { aggs: RENT_AGGS })) });

      const text = norm(page.el);
      expect(text).toContain('hostInvoices.renterBills');
      expect(text).not.toContain('hostInvoices.bookingInvoices');
      expect(page.el.querySelector('button[aria-label="a11y.addInvoice"]')).not.toBeNull();
      expect(internals(page).filterGroups().map((g) => g.key)).toContain('kind');
    });
  });

  describe('booking invoices card', () => {
    it("shows the API's booking bucket: total, paid and balance", async () => {
      const page = await open({ deps: depsWith(invoicesReply([bookingInvoice()], { aggs: bookingAggs(12000, 5000) })) });

      expect(figures(page)).toEqual(['Rs 12,000', 'Rs 5,000', 'Rs 7,000']);
    });

    it('reads the booking bucket, not the per-status totals, which also count stray non-booking bills', async () => {
      const statuses = [status('due', 2, 9000), status('paid', 1, 5000)];
      const page = await open({
        deps: depsWith(invoicesReply([bookingInvoice()], { statuses, aggs: bookingAggs(4000, 0) })),
      });

      expect(figures(page)).toEqual(['Rs 4,000', 'Rs 0', 'Rs 4,000']);
    });

    it('shows zeros when the booking bucket is empty', async () => {
      const page = await open({ deps: depsWith(invoicesReply([bookingInvoice()])) });

      expect(figures(page)).toEqual(['Rs 0', 'Rs 0', 'Rs 0']);
    });

    it('moves money from balance to paid after a local mark-paid, without refetching', async () => {
      const deps = depsWith(invoicesReply(dueBookingBills(), { aggs: bookingAggs(32000, 0) }));
      deps.bookings.get.mockReturnValue(of(hostBooking('checked-in')));
      deps.bookings.markPaid.mockReturnValue(of(hostBooking('checked-in', { paid: 24000, balanceDue: 0 })));
      deps.ops.markInvoicePaid.mockReturnValue(of(bookingInvoice({ status: 'paid' })));
      const page = await open({ deps });
      expect(figures(page)).toEqual(['Rs 32,000', 'Rs 0', 'Rs 32,000']);

      await startPay(page, 0);
      await click(page, confirmButton(page));

      expect(figures(page)).toEqual(['Rs 32,000', 'Rs 24,000', 'Rs 8,000']);
      expect(deps.ops.invoices).toHaveBeenCalledTimes(1);
    });
  });

  describe('nightly query', () => {
    it('ignores a stale type filter in the URL', async () => {
      const deps = depsWith(invoicesReply([bookingInvoice()]));
      await open({ url: `${LIST}?kind=utility`, deps });

      expect(lastFilters(deps)).not.toHaveProperty('f[bill_type]');
    });

    it('still applies the type filter from the URL on a monthly hostel', async () => {
      const deps = depsWith(invoicesReply([invoice()], { aggs: RENT_AGGS }));
      await open({ url: `${LIST}?kind=utility`, billing: 'month', deps });

      expect(lastFilters(deps)['f[bill_type]']).toBe('utility');
    });

    it('opens no add drawer on the create URL', async () => {
      const page = await open({ url: `${LIST}/create`, deps: depsWith(invoicesReply([bookingInvoice()])) });

      expect(page.el.querySelector('hh-invoice-form-drawer')).toBeNull();
    });

    it('opens the add drawer on the create URL of a monthly hostel', async () => {
      const page = await open({
        url: `${LIST}/create`,
        billing: 'month',
        deps: withRenters(depsWith(invoicesReply([invoice()], { aggs: RENT_AGGS }))),
      });

      expect(page.el.querySelector('hh-invoice-form-drawer')).not.toBeNull();
    });
  });

  describe('search', () => {
    it('searches the guest name on a nightly hostel', async () => {
      const deps = depsWith(invoicesReply([bookingInvoice()]));
      const page = await open({ deps });

      internals(page).onSearchFieldChange('tenant');
      page.harness.detectChanges();
      await typeSearch(page, 'ali');

      const filters = lastFilters(deps);
      expect(filters['s[booking.guest_name]']).toBe('ali');
      expect(filters).not.toHaveProperty('s[renter.full_name]');
      expect(filters).not.toHaveProperty('s[room.room_number]');
    });

    it('searches the tenant name on a monthly hostel', async () => {
      const deps = depsWith(invoicesReply([invoice()], { aggs: RENT_AGGS }));
      const page = await open({ billing: 'month', deps });

      internals(page).onSearchFieldChange('tenant');
      page.harness.detectChanges();
      await typeSearch(page, 'saad');

      const filters = lastFilters(deps);
      expect(filters['s[renter.full_name]']).toBe('saad');
      expect(filters).not.toHaveProperty('s[booking.guest_name]');
    });

    it('searches the room number when the room scope is chosen', async () => {
      const deps = depsWith(invoicesReply([bookingInvoice()]));
      const page = await open({ deps });

      await typeSearch(page, '101');

      const filters = lastFilters(deps);
      expect(filters['s[room.room_number]']).toBe('101');
      expect(filters).not.toHaveProperty('s[booking.guest_name]');
    });

    it('holds the fetch back for the page debounce once the box commits the term', async () => {
      const deps = depsWith(invoicesReply([bookingInvoice()]));
      const page = await open({ deps });
      const before = deps.ops.invoices.mock.calls.length;
      const withTerm = (): number =>
        deps.ops.invoices.mock.calls.filter((c) => c[3]?.['s[room.room_number]'] === '1').length;

      const input = page.el.querySelector<HTMLInputElement>('hh-search input')!;
      input.value = '1';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      // Enter commits the term at once, skipping the box's own 600ms wait, so only the page debounce is left.
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await wait(100);
      await page.settle();

      expect(deps.ops.invoices.mock.calls.length).toBe(before);

      await wait(400);
      await page.settle();

      expect(withTerm()).toBe(1);
      expect(deps.ops.invoices.mock.calls.length).toBe(before + 1);
    });

    it('labels the second search scope Guest name on a nightly hostel', async () => {
      const page = await open({ deps: depsWith(invoicesReply([bookingInvoice()])) });
      await flush(page);

      expect(internals(page).searchFieldOptions().map((o) => o.label)).toEqual(['Room', 'hostInvoices.guestName']);
    });

    it('labels the second search scope Tenant on a monthly hostel', async () => {
      const page = await open({ billing: 'month', deps: depsWith(invoicesReply([invoice()], { aggs: RENT_AGGS })) });

      expect(internals(page).searchFieldOptions().map((o) => o.label)).toEqual(['Room', 'Tenant']);
    });

    it('shows the guest name label in the placeholder once that scope is chosen', async () => {
      const page = await open({ deps: depsWith(invoicesReply([bookingInvoice()])) });

      internals(page).onSearchFieldChange('tenant');
      await flush(page);

      const placeholder = page.el.querySelector<HTMLInputElement>('hh-search input')!.placeholder;
      expect(placeholder).toContain('hostInvoices.guestName');
    });
  });

  describe('editing', () => {
    it('offers no Edit on a booking bill, only Mark as paid and Delete', async () => {
      const page = await open({ deps: depsWith(invoicesReply([bookingInvoice()])) });

      await openRowMenu(page, 0);

      const items = menuItems(page);
      expect(items).not.toContain('common.edit');
      expect(items).toContain('hostInvoices.markAsPaid');
      expect(items).toContain('common.delete');
    });

    it('still offers Edit on a rent bill', async () => {
      const page = await open({ billing: 'month', deps: depsWith(invoicesReply([invoice()], { aggs: RENT_AGGS })) });

      await openRowMenu(page, 0);

      expect(menuItems(page)).toContain('common.edit');
    });

    it('opens no edit form for a booking bill on the edit URL', async () => {
      const page = await open({ url: `${LIST}/edit/rb-1`, deps: depsWith(invoicesReply([bookingInvoice()])) });

      expect(internals(page).editingInvoice()).toBeNull();
      expect(page.el.querySelector('hh-invoice-form-drawer')).toBeNull();
    });

    it('opens the edit form for a rent bill on the edit URL of a monthly hostel', async () => {
      const page = await open({
        url: `${LIST}/edit/rb-2`,
        billing: 'month',
        deps: withRenters(depsWith(invoicesReply([invoice()], { aggs: RENT_AGGS }))),
      });

      expect(internals(page).editingInvoice()?.id).toBe('rb-2');
      expect(page.el.querySelector('hh-invoice-form-drawer')).not.toBeNull();
    });
  });

  // The renter-bills index refreshes before the backend answers a write (BE #65), so a
  // fallback re-read gets the saved bill on the very next request, with no delay.
  describe('saving without the bill in the reply', () => {
    it('re-reads the list straight away after an edit', async () => {
      const deps = depsWith(invoicesReply([invoice()], { aggs: RENT_AGGS }));
      const page = await open({ billing: 'month', deps });
      expect(deps.ops.invoices).toHaveBeenCalledTimes(1);

      internals(page).onInvoiceUpdated(null);
      await flush(page);

      expect(deps.ops.invoices).toHaveBeenCalledTimes(2);
    });

    it('re-reads the list straight away after a create', async () => {
      const deps = depsWith(invoicesReply([invoice()], { aggs: RENT_AGGS }));
      const page = await open({ billing: 'month', deps });

      internals(page).onInvoiceCreated(null);
      await flush(page);

      expect(deps.ops.invoices).toHaveBeenCalledTimes(2);
    });
  });

  describe('marking a rent or utility bill paid', () => {
    it('settles in one click, with no prompt, and updates the row and the counts', async () => {
      const bills = [invoice(), invoice({ id: 'rb-3', kind: 'utility', amount: 3600, lines: [{ label: 'Electricity', amount: 3600 }] })];
      const deps = depsWith(invoicesReply(bills, { aggs: RENT_AGGS, statuses: [status('due', 2, 18600), status('paid', 0, 0)] }));
      deps.ops.markInvoicePaid.mockReturnValue(of(invoice({ status: 'paid' })));
      const page = await open({ billing: 'month', deps });

      await startPay(page, 0);

      expect(dialog(page)).toBeNull();
      expect(deps.ops.markInvoicePaid).toHaveBeenCalledWith(HOSTEL_ID, 'rb-2', QUIET);
      expect(deps.bookings.get).not.toHaveBeenCalled();
      expect(norm(bodyRows(page)[0])).toContain('Paid');
      expect(figures(page)).toEqual(['Rs 15,000', 'Rs 15,000', 'Rs 0', 'Rs 3,600', 'Rs 0', 'Rs 3,600']);
      expect(internals(page).statusOptions().map((o) => o.label)).toEqual(['Due (1)', 'Paid (1)']);
      expect(deps.notifications.raised).toEqual([expect.objectContaining({ kind: 'success', title: 'Invoice marked paid' })]);
    });
  });

  describe('marking a booking bill paid', () => {
    it('opens a confirm and keeps Confirm disabled while the booking is looked up', async () => {
      const lookup = new Subject<HostBooking>();
      const deps = depsWith(invoicesReply([bookingInvoice()]));
      deps.bookings.get.mockReturnValue(lookup);
      const page = await open({ deps });

      await startPay(page);

      expect(dialog(page)).not.toBeNull();
      expect(deps.bookings.get).toHaveBeenCalledWith(HOSTEL_ID, 'bk-1', { suppressErrorToast: true });
      expect(deps.ops.markInvoicePaid).not.toHaveBeenCalled();
      expect(confirmButton(page)!.disabled).toBe(true);

      lookup.next(hostBooking('checked-in'));
      await flush(page);

      expect(confirmButton(page)!.disabled).toBe(false);
    });

    it.each(['confirmed', 'checked-in', 'checked-out'])(
      'offers the booking checkbox for a %s booking that still owes',
      async (slug) => {
        const deps = depsWith(invoicesReply([bookingInvoice()]));
        deps.bookings.get.mockReturnValue(of(hostBooking(slug)));
        const page = await open({ deps });

        await startPay(page);

        expect(alsoPayBox(page)).not.toBeNull();
        expect(alsoPayBox(page)!.checked).toBe(true);
      },
    );

    it.each(['no-show', 'cancelled'])('hides the booking checkbox for a %s booking', async (slug) => {
      const deps = depsWith(invoicesReply([bookingInvoice()]));
      deps.bookings.get.mockReturnValue(of(hostBooking(slug)));
      const page = await open({ deps });

      await startPay(page);

      expect(dialog(page)).not.toBeNull();
      expect(alsoPayBox(page)).toBeNull();
    });

    it('hides the booking checkbox when the booking is already paid', async () => {
      const deps = depsWith(invoicesReply([bookingInvoice()]));
      deps.bookings.get.mockReturnValue(of(hostBooking('checked-in', { paid: 24000, balanceDue: 0 })));
      const page = await open({ deps });

      await startPay(page);

      expect(alsoPayBox(page)).toBeNull();
    });

    it('still offers the booking checkbox when the booking lookup fails', async () => {
      const deps = depsWith(invoicesReply([bookingInvoice()]));
      deps.bookings.get.mockReturnValue(throwError(() => apiError(500, [], 'GET')));
      const page = await open({ deps });

      await startPay(page);

      expect(alsoPayBox(page)).not.toBeNull();
      expect(confirmButton(page)!.disabled).toBe(false);
      expect(deps.notifications.raised).toEqual([]);
    });

    it('looks nothing up and offers no checkbox for a bill with no booking id, leaving Confirm enabled', async () => {
      const deps = depsWith(invoicesReply([bookingInvoice({ booking: undefined })]));
      const page = await open({ deps });

      await startPay(page);

      expect(deps.bookings.get).not.toHaveBeenCalled();
      expect(dialog(page)).not.toBeNull();
      expect(alsoPayBox(page)).toBeNull();
      expect(confirmButton(page)!.disabled).toBe(false);
    });

    it('marks the invoice first and the booking only after it, then reports both paid', async () => {
      const invoiceReply = new Subject<Invoice>();
      const deps = depsWith(invoicesReply(dueBookingBills()));
      deps.bookings.get.mockReturnValue(of(hostBooking('checked-in')));
      deps.ops.markInvoicePaid.mockReturnValue(invoiceReply);
      deps.bookings.markPaid.mockReturnValue(of(hostBooking('checked-in', { paid: 24000, balanceDue: 0 })));
      const page = await open({ deps });
      await startPay(page);

      await click(page, confirmButton(page));

      expect(deps.ops.markInvoicePaid).toHaveBeenCalledWith(HOSTEL_ID, 'rb-1', QUIET);
      expect(deps.bookings.markPaid).not.toHaveBeenCalled();

      invoiceReply.next(bookingInvoice({ status: 'paid' }));
      await flush(page);

      expect(deps.bookings.markPaid).toHaveBeenCalledWith(HOSTEL_ID, 'bk-1', { suppressErrorToast: true });
      expect(deps.notifications.raised).toEqual([expect.objectContaining({ kind: 'success', title: 'hostInvoices.invoiceAndBookingPaid' })]);
      expect(dialog(page)).toBeNull();
      expect(norm(bodyRows(page)[0])).toContain('Paid');
    });

    it('marks only the invoice when the booking checkbox is unticked', async () => {
      const deps = depsWith(invoicesReply(dueBookingBills()));
      deps.bookings.get.mockReturnValue(of(hostBooking('checked-in')));
      deps.ops.markInvoicePaid.mockReturnValue(of(bookingInvoice({ status: 'paid' })));
      const page = await open({ deps });
      await startPay(page);

      await click(page, alsoPayBox(page));
      await click(page, confirmButton(page));

      expect(deps.ops.markInvoicePaid).toHaveBeenCalledTimes(1);
      expect(deps.bookings.markPaid).not.toHaveBeenCalled();
      expect(deps.notifications.raised).toEqual([expect.objectContaining({ kind: 'success', title: 'Invoice marked paid' })]);
      expect(dialog(page)).toBeNull();
    });

    it('keeps the invoice paid and shows a sticky error with a translated reason when only the booking fails', async () => {
      const deps = depsWith(invoicesReply(dueBookingBills()));
      deps.bookings.get.mockReturnValue(of(hostBooking('checked-in')));
      deps.ops.markInvoicePaid.mockReturnValue(of(bookingInvoice({ status: 'paid' })));
      deps.bookings.markPaid.mockReturnValue(throwError(() => apiError(422, ['This booking is already paid'])));
      const page = await open({ deps });
      const translate = vi.spyOn(TestBed.inject(TranslocoService), 'translate');
      await startPay(page);

      await click(page, confirmButton(page));

      expect(norm(bodyRows(page)[0])).toContain('Paid');
      expect(deps.notifications.raised).toEqual([
        { kind: 'error', title: 'hostInvoices.bookingNotPaid', message: undefined, ttlMs: 0 },
      ]);
      // The known refusal is classified and translated (keys resolve to themselves here), not quoted.
      expect(translate).toHaveBeenCalledWith('hostInvoices.bookingNotPaid', { reason: 'hostBookings.bookingAlreadyPaid' });
      expect(dialog(page)).toBeNull();
      expect(internals(page).paying()).toBe(false);
    });

    it('falls back to a generic translated reason when the booking failure is not recognised', async () => {
      const failure = apiError(500);
      const deps = depsWith(invoicesReply(dueBookingBills()));
      deps.bookings.get.mockReturnValue(of(hostBooking('checked-in')));
      deps.ops.markInvoicePaid.mockReturnValue(of(bookingInvoice({ status: 'paid' })));
      deps.bookings.markPaid.mockReturnValue(throwError(() => failure));
      const page = await open({ deps });
      const translate = vi.spyOn(TestBed.inject(TranslocoService), 'translate');
      await startPay(page);

      await click(page, confirmButton(page));

      expect(translate).toHaveBeenCalledWith('hostInvoices.bookingNotPaid', { reason: 'hostBookings.moveNotAccepted' });
    });

    describe('when the booking is refused for lack of permission', () => {
      const CANCAN = 'You are not authorized to access this page.';
      const CRM = 'Your plan does not include CRM';
      const WITH_URL = `Http failure response for http://localhost/api/host/hostels/${HOSTEL_ID}/bookings/bk-1/mark_as_paid: 403 Forbidden`;
      const cancan = (): ApiError => ({ ...apiError(403, [CANCAN], 'PUT'), message: WITH_URL });
      const noCrm = (): ApiError => ({ ...apiErrorWithCode(403, 'crm_required', [CRM]), message: WITH_URL });

      // A signed-in host persists its hostel choice; the session persists itself. Neither may reach the next test.
      afterEach(() => {
        TestBed.inject(HostPropertyStore).clear();
        TestBed.inject(SessionStore).clear();
      });

      /** Signs in as `role` and pays a booking bill: the invoice settles, then the server refuses the booking with `failure`. */
      async function payRefusedBooking(role: Role, failure: ApiError) {
        const deps = depsWith(invoicesReply(dueBookingBills()));
        deps.bookings.get.mockReturnValue(of(hostBooking('checked-in')));
        deps.ops.markInvoicePaid.mockReturnValue(of(bookingInvoice({ status: 'paid' })));
        deps.bookings.markPaid.mockReturnValue(throwError(() => failure));
        const page = await open({ deps, signedInAs: role });
        const translate = vi.spyOn(TestBed.inject(TranslocoService), 'translate');
        await startPay(page);

        await click(page, confirmButton(page));
        return { page, deps, translate };
      }

      /** The invoice stays paid and the host gets one sticky error whose reason is `reason`, with nothing of the server's on screen. */
      function expectPaidWithOneStickyError(done: Awaited<ReturnType<typeof payRefusedBooking>>, reason: string, serverText: string): void {
        const { page, deps, translate } = done;
        expect(norm(bodyRows(page)[0])).toContain('Paid');
        expect(deps.notifications.raised).toEqual([
          { kind: 'error', title: 'hostInvoices.bookingNotPaid', message: undefined, ttlMs: 0 },
        ]);
        expect(translate.mock.calls.filter((c) => c[0] === 'hostInvoices.bookingNotPaid').map((c) => c[1])).toEqual([{ reason }]);
        expect(dialog(page)).toBeNull();
        expect(internals(page).paying()).toBe(false);
        const toasts = deps.notifications.raised.map((t) => `${t.title} ${t.message ?? ''}`);
        const shown = [page.el.textContent ?? '', ...toasts, JSON.stringify(translate.mock.calls)].join(' ');
        expect(shown).not.toContain(serverText);
        expect(shown).not.toContain('Http failure');
        expect(shown).not.toContain('http://');
      }

      it('keeps the invoice paid and tells staff they lack permission to mark the booking paid', async () => {
        const done = await payRefusedBooking('manager', cancan());

        expect(done.deps.bookings.markPaid).toHaveBeenCalledTimes(1);
        expectPaidWithOneStickyError(done, 'hostBookings.notAllowed', CANCAN);
      });

      it('tells the owner their account lacks permission and to contact support', async () => {
        const done = await payRefusedBooking('host', cancan());

        expectPaidWithOneStickyError(done, 'hostBookings.notAllowedOwner', CANCAN);
      });

      it.each<Role>(['manager', 'host'])('says the plan has no CRM, whoever is signed in as %s', async (role) => {
        const done = await payRefusedBooking(role, noCrm());

        expectPaidWithOneStickyError(done, 'hostBookings.planHasNoCrm', CRM);
      });
    });

    it.each([
      { text: 'Booking is closed.', reason: 'hostBookings.moveNotAccepted' },
      {
        text: 'Only confirmed, checked-in, checked-out or no-show bookings can be marked paid',
        reason: 'hostBookings.bookingHasMovedOn',
      },
    ])('lets no booking server text or API URL reach the screen or the toast on "$text"', async ({ text, reason }) => {
      const failure = {
        ...apiError(422, [text]),
        message: `Http failure response for http://localhost/api/host/hostels/${HOSTEL_ID}/bookings/bk-1/mark_as_paid: 422 Unprocessable Entity`,
      };
      const deps = depsWith(invoicesReply(dueBookingBills()));
      deps.bookings.get.mockReturnValue(of(hostBooking('checked-in')));
      deps.ops.markInvoicePaid.mockReturnValue(of(bookingInvoice({ status: 'paid' })));
      deps.bookings.markPaid.mockReturnValue(throwError(() => failure));
      const page = await open({ deps });
      const translate = vi.spyOn(TestBed.inject(TranslocoService), 'translate');
      await startPay(page);

      await click(page, confirmButton(page));

      expect(translate).toHaveBeenCalledWith('hostInvoices.bookingNotPaid', { reason });
      const toasts = deps.notifications.raised.map((t) => `${t.title} ${t.message ?? ''}`);
      const shown = [page.el.textContent ?? '', ...toasts, JSON.stringify(translate.mock.calls)].join(' ');
      expect(shown).not.toContain(text);
      expect(shown).not.toContain('Http failure');
      expect(shown).not.toContain('http://');
    });

    it('sends no booking request, reports the failure once and closes the prompt when the invoice fails', async () => {
      const failure = apiError(422, ['Already settled.']);
      const deps = depsWith(invoicesReply(dueBookingBills()));
      deps.bookings.get.mockReturnValue(of(hostBooking('checked-in')));
      deps.ops.markInvoicePaid.mockReturnValue(throwError(() => failure));
      const page = await open({ deps });
      await startPay(page);

      await click(page, confirmButton(page));

      expect(deps.bookings.markPaid).not.toHaveBeenCalled();
      // The request is quiet, so the app-wide notifier is handed the one failure and the page raises nothing itself.
      expect(deps.notifications.apiErrors).toEqual([failure]);
      expect(deps.notifications.raised).toEqual([]);
      expect(dialog(page)).toBeNull();
      expect(norm(bodyRows(page)[0])).not.toContain('Paid');
    });

    it('ignores a second confirm, a cancel and a new prompt while the first is paying', async () => {
      const deps = depsWith(invoicesReply(dueBookingBills()));
      deps.bookings.get.mockReturnValue(of(hostBooking('checked-in')));
      deps.ops.markInvoicePaid.mockReturnValue(new Subject<Invoice>());
      const page = await open({ deps });
      await startPay(page, 0);
      await click(page, confirmButton(page));
      expect(internals(page).paying()).toBe(true);

      await click(page, confirmButton(page));
      internals(page).confirmPay();
      expect(deps.ops.markInvoicePaid).toHaveBeenCalledTimes(1);

      await click(page, buttonIn(dialog(page), 'common.cancel'));
      expect(dialog(page)).not.toBeNull();
      expect(internals(page).payPrompt()?.inv.id).toBe('rb-1');

      await startPay(page, 1);
      expect(deps.bookings.get).toHaveBeenCalledTimes(1);
      expect(internals(page).payPrompt()?.inv.id).toBe('rb-1');
    });

    it('lets a late booking answer for an earlier prompt leave a newer prompt untouched', async () => {
      const earlier = new Subject<HostBooking>();
      const later = new Subject<HostBooking>();
      const deps = depsWith(invoicesReply(dueBookingBills()));
      deps.bookings.get.mockReturnValueOnce(earlier).mockReturnValueOnce(later);
      const page = await open({ deps });
      await startPay(page, 0);
      await click(page, buttonIn(dialog(page), 'common.cancel'));
      await startPay(page, 1);

      earlier.next(hostBooking('checked-in'));
      await flush(page);

      expect(internals(page).payPrompt()).toMatchObject({ checking: true, offerBooking: false });
      expect(confirmButton(page)!.disabled).toBe(true);
      expect(alsoPayBox(page)).toBeNull();

      later.next(hostBooking('checked-in', { id: 'bk-2' }));
      await flush(page);

      expect(internals(page).payPrompt()).toMatchObject({ checking: false, offerBooking: true });
      expect(alsoPayBox(page)).not.toBeNull();
    });
  });

  describe('invoice deep link', () => {
    it('opens the preview of a bill already on the page without fetching it', async () => {
      const deps = depsWith(invoicesReply(dueBookingBills()));
      const page = await open({ url: viewUrl('rb-1'), deps });

      expect(norm(preview(page))).toContain('Invo-1026-rb-1.pdf');
      expect(deps.ops.invoice).not.toHaveBeenCalled();
    });

    it('fetches an off-page bill by id once the list has settled, and keeps its preview open', async () => {
      const list = new Subject<InvoicesReply>();
      const deps = hostPageDeps();
      deps.ops.invoices.mockReturnValue(list);
      deps.ops.invoice.mockReturnValue(of(bookingInvoice({ id: 'rb-9', tenantName: 'Zed Off' })));
      const page = await open({ url: viewUrl('rb-9'), deps });
      expect(deps.ops.invoice).not.toHaveBeenCalled();

      list.next(invoicesReply([bookingInvoice()]));
      await flush(page);

      expect(deps.ops.invoice).toHaveBeenCalledWith(HOSTEL_ID, 'rb-9', { suppressErrorToast: true });
      expect(norm(preview(page))).toContain('Invo-1026-rb-9.pdf');
      expect(norm(preview(page))).toContain('Zed Off');
    });

    it('opens the preview even when the status filter hides the bill', async () => {
      const deps = depsWith(invoicesReply([bookingInvoice()], { statuses: [status('due', 1, 24000), status('paid', 0, 0)] }));
      const page = await open({ url: `${viewUrl('rb-1')}?status=paid`, deps });

      expect(bodyRows(page).some((r) => norm(r).includes('Ali Raza'))).toBe(false);
      expect(norm(preview(page))).toContain('Invo-1026-rb-1.pdf');
      expect(deps.ops.invoice).not.toHaveBeenCalled();
    });

    it('reports a 404 as not found and returns to the list with the query kept', async () => {
      const deps = depsWith(invoicesReply([bookingInvoice()]));
      deps.ops.invoice.mockReturnValue(throwError(() => apiError(404, [], 'GET')));
      const page = await open({ url: `${viewUrl('rb-9')}?status=due`, deps });
      await flush(page);

      expect(deps.notifications.raised).toEqual([{ kind: 'error', title: 'hostInvoices.invoiceNotFound', message: undefined, ttlMs: undefined }]);
      expect(page.url()).toBe(`${LIST}?status=due`);
      expect(preview(page)).toBeNull();
    });

    it('reports a reply with no bill as not found and returns to the list', async () => {
      const deps = depsWith(invoicesReply([bookingInvoice()]));
      deps.ops.invoice.mockReturnValue(of(invoice({ id: '' })));
      const page = await open({ url: `${viewUrl('rb-9')}?status=due`, deps });
      await flush(page);

      expect(deps.notifications.raised).toEqual([expect.objectContaining({ kind: 'error', title: 'hostInvoices.invoiceNotFound' })]);
      expect(page.url()).toBe(`${LIST}?status=due`);
    });

    it('shows one error toast for any other failure and returns to the list', async () => {
      const failure = apiError(500, [], 'GET');
      const deps = depsWith(invoicesReply([bookingInvoice()]));
      deps.ops.invoice.mockReturnValue(throwError(() => failure));
      const page = await open({ url: viewUrl('rb-9'), deps });
      await flush(page);

      const copy = toToastCopy(failure);
      expect(deps.notifications.raised).toHaveLength(1);
      expect(deps.notifications.raised[0]).toMatchObject({ kind: 'error', title: copy.title, message: copy.message });
      expect(page.url()).toBe(LIST);
    });

    it('navigates back to the list when a deep-linked preview is closed', async () => {
      const page = await open({ url: viewUrl('rb-1'), deps: depsWith(invoicesReply(dueBookingBills())) });

      await click(page, preview(page)!.querySelector('button[aria-label="a11y.close"]'));
      await flush(page);

      expect(page.url()).toBe(LIST);
      expect(preview(page)).toBeNull();
    });

    it('only clears the selection when a preview opened from a row is closed', async () => {
      const page = await open({ deps: depsWith(invoicesReply(dueBookingBills())) });
      const navigate = vi.spyOn(page.router, 'navigate');

      await click(page, bodyRows(page)[0]);
      expect(norm(preview(page))).toContain('Invo-1026-rb-1.pdf');

      await click(page, preview(page)!.querySelector('button[aria-label="a11y.close"]'));

      expect(preview(page)).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
      expect(page.url()).toBe(LIST);
    });

    it('marks a deep-linked bill paid from its row and keeps its preview open on that bill', async () => {
      const deps = depsWith(invoicesReply([invoice()], { aggs: RENT_AGGS }));
      deps.ops.markInvoicePaid.mockReturnValue(of(invoice({ status: 'paid' })));
      const page = await open({ url: viewUrl('rb-2'), billing: 'month', deps });
      expect(internals(page).selected()).toMatchObject({ id: 'rb-2', status: 'due' });
      expect(norm(bodyRows(page)[0])).not.toContain('Paid');

      await startPay(page, 0);

      expect(deps.ops.markInvoicePaid).toHaveBeenCalledWith(HOSTEL_ID, 'rb-2', QUIET);
      expect(norm(bodyRows(page)[0])).toContain('Paid');
      expect(internals(page).selected()).toMatchObject({ id: 'rb-2', status: 'paid' });
      expect(preview(page)).not.toBeNull();
      expect(norm(preview(page))).toContain('Invo-1026-rb-2.pdf');
      expect(page.url()).toBe(viewUrl('rb-2'));
    });

    it('closes the preview when the deep-linked bill is deleted', async () => {
      const deps = depsWith(invoicesReply(dueBookingBills()));
      const page = await open({ url: viewUrl('rb-1'), deps });
      expect(norm(preview(page))).toContain('Invo-1026-rb-1.pdf');

      await openRowMenu(page, 0);
      await pickMenuItem(page, 'common.delete');
      await click(page, buttonIn(dialog(page), 'Delete'));

      expect(deps.ops.deleteInvoice).toHaveBeenCalledWith(HOSTEL_ID, 'rb-1', QUIET);
      expect(preview(page)).toBeNull();
    });
  });

  describe('booking bill preview', () => {
    it('passes the booking reference to the reference label', async () => {
      const page = await open({ deps: depsWith(invoicesReply([bookingInvoice()])) });
      const translate = vi.spyOn(TestBed.inject(TranslocoService), 'translate');

      await click(page, bodyRows(page)[0]);

      const refs = translate.mock.calls.filter((c) => c[0] === 'hostInvoices.bookingRef').map((c) => c[1]);
      expect(refs.length).toBeGreaterThan(0);
      expect(refs).toContainEqual({ ref: 'BK-0001' });
    });

    it('links the booking reference to the booking page', async () => {
      const page = await open({ url: viewUrl('rb-1'), deps: depsWith(invoicesReply([bookingInvoice()])) });

      const link = preview(page)!.querySelector<HTMLAnchorElement>('a[title="hostInvoices.viewBooking"]');
      expect(link).not.toBeNull();
      expect(norm(link)).toBe('hostInvoices.bookingRef');
      expect(link!.getAttribute('href')).toMatch(/\/host\/h1\/bookings\/bk-1$/);
    });

    it('shows the reference as plain text when the booking has no id to link to', async () => {
      const bill = bookingInvoice({ booking: { id: '', ref: 'BK-0009', guestName: 'Ali Raza', phone: '' } });
      const page = await open({ url: viewUrl('rb-1'), deps: depsWith(invoicesReply([bill])) });

      expect(norm(preview(page))).toContain('hostInvoices.bookingRef');
      expect(preview(page)!.querySelector('a[title="hostInvoices.viewBooking"]')).toBeNull();
    });

    it('shows the room line when the bill names no booking reference', async () => {
      const bill = bookingInvoice({ booking: undefined, roomNumber: '12' });
      const page = await open({ url: viewUrl('rb-1'), deps: depsWith(invoicesReply([bill])) });

      expect(norm(preview(page))).toContain('common.roomNumber');
      expect(norm(preview(page))).not.toContain('hostInvoices.bookingRef');
      expect(preview(page)!.querySelector('a[title="hostInvoices.viewBooking"]')).toBeNull();
    });

    it('tags the line items purple', async () => {
      const page = await open({ url: viewUrl('rb-1'), deps: depsWith(invoicesReply([bookingInvoice()])) });

      const tag = Array.from(preview(page)!.querySelectorAll<HTMLElement>('tbody span')).find((s) => norm(s) === 'Room Charges');
      expect(tag).toBeDefined();
      expect(tag!.className).toContain('bg-tint-purple');
    });
  });

  describe('print window', () => {
    const HOSTILE = '<script>alert("x")</script> \'y\' & z';
    const ESCAPED = '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &#39;y&#39; &amp; z';

    async function openHostile(): Promise<Page> {
      const bill = bookingInvoice({
        tenantName: HOSTILE,
        payNote: HOSTILE,
        lines: [{ label: HOSTILE, amount: 24000 }],
        booking: { id: 'bk-1', ref: 'BK<9>', guestName: HOSTILE, phone: '' },
      });
      const page = await open({ url: viewUrl('rb-1'), deps: depsWith(invoicesReply([bill])) });
      const store = TestBed.inject(HostPropertyStore);
      const hostile = store.hostels().map((h) => ({ ...h, name: HOSTILE, area: 'Gulberg & <Co>' }));
      vi.spyOn(page.deps.shell, 'listings').mockReturnValue(of({ listings: hostile, draft: null, stats: {} as never }));
      store.load();
      await flush(page);
      return page;
    }

    const printButton = (page: Page): Element | null => preview(page)!.querySelector('button[aria-label="a11y.print"]');

    it('writes the guest, note, line label and hostel name escaped', async () => {
      printWindow = fakePrintWindow();
      const page = await openHostile();

      await click(page, printButton(page));

      const html = printWindow.html();
      expect(html).not.toMatch(/<script/i);
      expect(html).toContain(`<div class="hostel-name">${ESCAPED}</div>`);
      expect(html).toContain(`<div class="hostel-addr">Gulberg &amp; &lt;Co&gt;, Lahore</div>`);
      expect(html).toContain(`<div class="meta-val">${ESCAPED}</div>`);
      expect(html).toContain(`<span class="tag booking">${ESCAPED}</span>`);
      expect(html).toContain(`<p class="pay-note">${ESCAPED}</p>`);
    });

    it('reads Booking and the escaped reference under the guest, with the booking tag', async () => {
      printWindow = fakePrintWindow();
      const page = await openHostile();

      await click(page, printButton(page));

      expect(printWindow.html()).toContain('<div class="meta-sub">Booking BK&lt;9&gt;</div>');
    });

    it('titles the window with the invoice number and prints when it loads', async () => {
      printWindow = fakePrintWindow();
      const page = await open({ url: viewUrl('rb-1'), deps: depsWith(invoicesReply([bookingInvoice()])) });

      await click(page, printButton(page));
      printWindow.load();

      expect(printWindow.title()).toBe('Invo-1026-rb-1.pdf');
      expect(printWindow.html()).toContain('<div class="meta-sub">Booking BK-0001</div>');
      expect(printWindow.print).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the popup is blocked', async () => {
      printWindow = fakePrintWindow({ blocked: true });
      const page = await open({ url: viewUrl('rb-1'), deps: depsWith(invoicesReply([bookingInvoice()])) });

      await click(page, printButton(page));

      expect(printWindow.open).toHaveBeenCalledTimes(1);
      expect(printWindow.html()).toBe('');
    });
  });

  describe('CSV export', () => {
    const exportButton = (page: Page): Element | null => page.el.querySelector('button[aria-label="a11y.exportCsv"]');

    it('exports the nightly columns, including the booking reference', async () => {
      const bills = [bookingInvoice(), bookingInvoice({ id: 'rb-5', tenantName: 'No Ref', booking: undefined })];
      const page = await open({ deps: depsWith(invoicesReply(bills)) });

      await click(page, exportButton(page));

      expect(downloadCsv).toHaveBeenCalledWith(
        'hostelhive-invoices-all',
        ['ID', 'Billed to', 'Booking', 'Room', 'Floor', 'Type', 'Status', 'Issued', 'Due', 'Amount (PKR)'],
        [
          ['rb-1', 'Ali Raza', 'BK-0001', '—', '—', 'booking', 'due', '2026-10-10', '2026-10-13', 24000],
          ['rb-5', 'No Ref', '', '—', '—', 'booking', 'due', '2026-10-10', '2026-10-13', 24000],
        ],
      );
    });

    it('exports the original monthly columns and rows unchanged', async () => {
      const page = await open({ billing: 'month', deps: depsWith(invoicesReply([invoice()], { aggs: RENT_AGGS })) });

      await click(page, exportButton(page));

      expect(downloadCsv).toHaveBeenCalledWith(
        'hostelhive-invoices-all',
        ['ID', 'Tenant', 'Room', 'Floor', 'Type', 'Status', 'Issued', 'Due', 'Amount (PKR)'],
        [['rb-2', 'Saad Ali', '101', 'Ground', 'rental', 'due', '2026-10-01', '2026-10-10', 15000]],
      );
    });
  });

  describe('when the list load is refused', () => {
    const INVOICES_URL = `https://api.test/api/host/hostels/${HOSTEL_ID}/renter_bills`;
    const ROLE_SENTENCES = [
      { role: 'host', sentence: 'hostAccess.pageNotAllowedOwner' },
      { role: 'manager', sentence: 'hostAccess.pageNotAllowed' },
    ] as const satisfies readonly { role: Role; sentence: string }[];

    // A signed-in host persists its hostel choice; the session persists itself. Neither may reach the next test.
    afterEach(() => {
      TestBed.inject(HostPropertyStore).clear();
      TestBed.inject(SessionStore).clear();
    });

    /** Opens the page signed in as `role`, its list read refused the way the backend refuses `kind`. */
    async function openRefused(kind: RefusalKind, role: Role = 'host', billing?: BillingMode) {
      const deps = hostPageDeps();
      deps.ops.invoices.mockReturnValue(throwError(() => refusalError(kind, { url: INVOICES_URL })));
      const page = await open({ deps, signedInAs: role, billing });
      return { page, shown: loadSurface(page.el) };
    }

    const addInvoiceButton = (page: Page): HTMLButtonElement | null =>
      page.el.querySelector<HTMLButtonElement>('button[aria-label="a11y.addInvoice"]');

    describe('for a permission the role lacks', () => {
      const cases = kindsShowing('permission').flatMap((kind) => ROLE_SENTENCES.map((r) => ({ kind, ...r })));

      it.each(cases)('says a $role account may not see this, and offers no retry, after a $kind refusal', async ({ kind, role, sentence }) => {
        const { page, shown } = await openRefused(kind, role);

        expect(shown.surfaces).toEqual([LIST_LOAD_REFUSALS[kind]]);
        expect(shown.heading).toBe('coreForbidden.accessBlocked');
        expect(shown.body).toBe(sentence);
        expect(shown.retry).toBe(false);
        expect(shown.text).not.toContain('common.retry');
        expect(shown.text).not.toContain(CANCAN_MESSAGE);
        expect(shown.text).not.toContain('hostInvoices.noInvoicesYet');
        expect(figures(page)).toEqual([]);
        expect(bodyRows(page)).toEqual([]);
      });

      it.each(kindsShowing('permission').flatMap((kind) => ROLE_SENTENCES.map(({ role }) => ({ kind, role }))))(
        'leaves Add invoice enabled on a monthly hostel for a $role after a $kind refusal',
        async ({ kind, role }) => {
          const { page } = await openRefused(kind, role, 'month');

          expect(addInvoiceButton(page)?.disabled).toBe(false);
        },
      );

      it('stays on the page, still reading as failed rather than loaded', async () => {
        const { page } = await openRefused('permissionCanCan', 'manager');

        expect(page.url()).toBe(LIST);
        expect((page.component as unknown as { state(): { error: boolean } }).state().error).toBe(true);
      });
    });

    describe('for a hostel with no live plan', () => {
      it('leaves Add invoice enabled on a monthly hostel: the console lock answers the refusal, not the page', async () => {
        const { page } = await openRefused('inactive', 'host', 'month');

        expect(addInvoiceButton(page)?.disabled).toBe(false);
      });
    });

    describe('for a plan refusal, which the console lock owns', () => {
      it.each(PLAN_REFUSALS)('shows the generic error with Retry, not the panel, after a %s refusal', async (kind) => {
        const { shown } = await openRefused(kind);

        expect(shown.surfaces).toEqual([LIST_LOAD_REFUSALS[kind]]);
        expect(shown.heading).toBe('states.somethingWentWrong');
        expect(shown.retry).toBe(true);
        expect(shown.text).not.toContain('hostAccess.pageNotAllowed');
      });
    });

    describe('for a failure that is not a permission or plan refusal', () => {
      it.each<RefusalKind>(['rateLimited', 'notFound', 'unprocessable', 'serverError'])(
        'shows the generic error with Retry after a %s refusal',
        async (kind) => {
          const { shown } = await openRefused(kind);

          expect(shown.surfaces).toEqual([LIST_LOAD_REFUSALS[kind]]);
          expect(shown.heading).toBe('states.somethingWentWrong');
          expect(shown.retry).toBe(true);
          expect(shown.text).not.toContain('hostAccess.pageNotAllowed');
        },
      );
    });

    describe('when the server never answers', () => {
      it.each(kindsShowing('network'))('shows the connection error with Retry after a %s failure', async (kind) => {
        const { shown } = await openRefused(kind);

        expect(shown.surfaces).toEqual([LIST_LOAD_REFUSALS[kind]]);
        expect(shown.heading).toBe('states.cantConnect');
        expect(shown.retry).toBe(true);
        expect(shown.text).not.toContain('hostAccess.pageNotAllowed');
      });
    });
  });

  describe('when a bill action is refused', () => {
    const DELETE_URL = `https://api.test/api/host/hostels/${HOSTEL_ID}/renter_bills/rb-2`;
    const PAY_URL = `${DELETE_URL}/mark_as_paid`;
    const BILLS_URL = `https://api.test/api/host/hostels/${HOSTEL_ID}/renter_bills`;
    const STAFF_AND_OWNER = [
      { role: 'manager', key: 'hostBookings.notAllowed' },
      { role: 'host', key: 'hostBookings.notAllowedOwner' },
    ] as const satisfies readonly { role: Role; key: string }[];
    const PAGE_SENTENCES = [
      { role: 'manager', key: 'hostAccess.pageNotAllowed' },
      { role: 'host', key: 'hostAccess.pageNotAllowedOwner' },
    ] as const satisfies readonly { role: Role; key: string }[];
    const PERMISSION_KINDS = ['permissionCanCan', 'permissionRender403'] as const;
    const actionCases = STAFF_AND_OWNER.flatMap((c) => PERMISSION_KINDS.map((kind) => ({ ...c, kind })));

    // A signed-in host persists its hostel choice; the session persists itself. Neither may reach the next test.
    afterEach(() => {
      TestBed.inject(HostPropertyStore).clear();
      TestBed.inject(SessionStore).clear();
    });

    const pinned = (title: string) => ({ kind: 'error', title, message: undefined, ttlMs: 0 });

    /** A monthly page with one due rent bill whose "Mark as paid" the server answers with `failure`. */
    async function payRentBill(failure: ApiError, role?: Role) {
      const deps = depsWith(invoicesReply([invoice()], { aggs: RENT_AGGS }));
      deps.ops.markInvoicePaid.mockReturnValue(throwError(() => failure));
      const page = await open({ billing: 'month', deps, signedInAs: role });
      await startPay(page, 0);
      return { page, deps };
    }

    /** A monthly page with one rent bill whose delete the server answers with `failure`, deleted through the confirm. */
    async function deleteRentBill(failure: ApiError, role?: Role) {
      const deps = depsWith(invoicesReply([invoice()], { aggs: RENT_AGGS }));
      deps.ops.deleteInvoice.mockReturnValue(throwError(() => failure));
      const page = await open({ billing: 'month', deps, signedInAs: role });
      await openRowMenu(page, 0);
      await pickMenuItem(page, 'common.delete');
      await click(page, buttonIn(dialog(page), 'Delete'));
      return { page, deps };
    }

    describe('on Mark paid for a rent or utility bill', () => {
      it.each(actionCases)('tells a $role account once that it lacks permission, after a $kind refusal, and leaves the bill unpaid', async ({ role, key, kind }) => {
        const { page, deps } = await payRentBill(refusalError(kind, { method: 'PUT', url: PAY_URL }), role);

        expect(deps.notifications.raised).toEqual([pinned(key)]);
        expect(deps.notifications.apiErrors).toEqual([]);
        expect(norm(bodyRows(page)[0])).not.toContain('Paid');
        expect(deps.ops.markInvoicePaid).toHaveBeenCalledWith(HOSTEL_ID, 'rb-2', QUIET);
      });

      it.each<RefusalKind>(['crmRequired', 'crmMessageOnly'])('says the plan has no CRM after a %s refusal', async (kind) => {
        const { page, deps } = await payRentBill(refusalError(kind, { method: 'PUT', url: PAY_URL }));

        expect(deps.notifications.raised).toEqual([pinned('hostBookings.planHasNoCrm')]);
        expect(deps.notifications.apiErrors).toEqual([]);
        expect(norm(bodyRows(page)[0])).not.toContain('Paid');
      });

      it('hands any other failure to the app-wide notifier once and raises no toast of its own', async () => {
        const failure = refusalError('unprocessable', { method: 'PUT', url: PAY_URL });
        const { deps } = await payRentBill(failure);

        expect(deps.notifications.apiErrors).toEqual([failure]);
        expect(deps.notifications.raised).toEqual([]);
      });
    });

    describe('on the pay prompt of a booking bill', () => {
      it.each(actionCases)('shows one toast to a $role account, closes the prompt and sends no booking request, after the invoice step gets a $kind refusal', async ({ role, key, kind }) => {
        const deps = depsWith(invoicesReply(dueBookingBills()));
        deps.bookings.get.mockReturnValue(of(hostBooking('checked-in')));
        deps.ops.markInvoicePaid.mockReturnValue(throwError(() => refusalError(kind, { method: 'PUT', url: PAY_URL })));
        const page = await open({ deps, signedInAs: role });
        await startPay(page);

        await click(page, confirmButton(page));

        expect(deps.notifications.raised).toEqual([pinned(key)]);
        expect(deps.notifications.apiErrors).toEqual([]);
        expect(deps.bookings.markPaid).not.toHaveBeenCalled();
        expect(dialog(page)).toBeNull();
        expect(internals(page).paying()).toBe(false);
        expect(norm(bodyRows(page)[0])).not.toContain('Paid');
      });

      it.each([
        { role: 'manager', reason: 'hostAccess.offlineStaff' },
        { role: 'host', reason: 'hostAccess.offline' },
      ] as const satisfies readonly { role: Role; reason: string }[])(
        'gives a $role account the reason $reason when the booking step finds the hostel with no live plan',
        async ({ role, reason }) => {
          const deps = depsWith(invoicesReply(dueBookingBills()));
          deps.bookings.get.mockReturnValue(of(hostBooking('checked-in')));
          deps.ops.markInvoicePaid.mockReturnValue(of(bookingInvoice({ status: 'paid' })));
          deps.bookings.markPaid.mockReturnValue(throwError(() => refusalError('inactive', { method: 'PUT' })));
          const page = await open({ deps, signedInAs: role });
          const translate = vi.spyOn(TestBed.inject(TranslocoService), 'translate');
          await startPay(page);

          await click(page, confirmButton(page));

          expect(deps.notifications.raised).toEqual([pinned('hostInvoices.bookingNotPaid')]);
          expect(translate.mock.calls.filter((c) => c[0] === 'hostInvoices.bookingNotPaid').map((c) => c[1])).toEqual([{ reason }]);
          expect(norm(bodyRows(page)[0])).toContain('Paid');
        },
      );
    });

    describe('on delete', () => {
      it.each(actionCases)('tells a $role account once that it lacks permission, after a $kind refusal, and puts the row back', async ({ role, key, kind }) => {
        const { page, deps } = await deleteRentBill(refusalError(kind, { method: 'DELETE', url: DELETE_URL }), role);

        expect(deps.notifications.raised).toEqual([pinned(key)]);
        expect(deps.notifications.apiErrors).toEqual([]);
        expect(deps.ops.deleteInvoice).toHaveBeenCalledWith(HOSTEL_ID, 'rb-2', QUIET);
        expect(bodyRows(page)).toHaveLength(1);
        expect(norm(bodyRows(page)[0])).toContain('Due');
      });

      it('says the plan has no CRM', async () => {
        const { deps } = await deleteRentBill(refusalError('crmRequired', { method: 'DELETE', url: DELETE_URL }));

        expect(deps.notifications.raised).toEqual([pinned('hostBookings.planHasNoCrm')]);
        expect(deps.notifications.apiErrors).toEqual([]);
      });

      it('hands a server error to the app-wide notifier once, raises no toast of its own and puts the row back', async () => {
        const failure = refusalError('serverError', { method: 'DELETE', url: DELETE_URL });
        const { page, deps } = await deleteRentBill(failure);

        expect(deps.notifications.apiErrors).toEqual([failure]);
        expect(deps.notifications.raised).toEqual([]);
        expect(bodyRows(page)).toHaveLength(1);
      });
    });

    describe('on opening a bill by its link', () => {
      it.each(PAGE_SENTENCES.flatMap((c) => PERMISSION_KINDS.map((kind) => ({ ...c, kind }))))(
        'tells a $role account once that it may not see this, with no server text, after a $kind refusal',
        async ({ role, key, kind }) => {
          const deps = depsWith(invoicesReply([bookingInvoice()]));
          deps.ops.invoice.mockReturnValue(throwError(() => refusalError(kind, { url: `${BILLS_URL}/rb-9` })));
          const page = await open({ url: viewUrl('rb-9'), deps, signedInAs: role });
          await flush(page);

          expect(deps.notifications.raised).toHaveLength(1);
          expect(deps.notifications.raised[0]).toMatchObject({ kind: 'error', title: key, message: undefined });
          expect(deps.notifications.raised[0].title).not.toContain(CANCAN_MESSAGE);
          expect(page.url()).toBe(LIST);
          expect(preview(page)).toBeNull();
        },
      );

      it('says the plan has no CRM', async () => {
        const deps = depsWith(invoicesReply([bookingInvoice()]));
        deps.ops.invoice.mockReturnValue(throwError(() => refusalError('crmRequired', { url: `${BILLS_URL}/rb-9` })));
        const page = await open({ url: viewUrl('rb-9'), deps });
        await flush(page);

        expect(deps.notifications.raised).toHaveLength(1);
        expect(deps.notifications.raised[0]).toMatchObject({ kind: 'error', title: 'hostBookings.planHasNoCrm', message: undefined });
        expect(page.url()).toBe(LIST);
      });
    });

    describe('on the list read', () => {
      it('is sent without the interceptor toast, since the page draws its own error state', async () => {
        const deps = depsWith(invoicesReply());
        await open({ deps });

        expect(deps.ops.invoices).toHaveBeenCalled();
        expect(deps.ops.invoices.mock.calls.every((c) => c[4]?.suppressErrorToast === true)).toBe(true);
      });
    });
  });
});
