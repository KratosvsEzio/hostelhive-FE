import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoService } from '@jsverse/transloco';
import type {
  AdminHostelBilling as AdminHostelBillingData,
  AdminPlan,
  BillingSubscription,
  HostBilling,
  OpenInvoice,
  SubscriptionEvent,
} from '@hostelhive/data-access';
import { Dropdown } from '@hostelhive/ui';
import { API_CONFIG } from '@core/api-config';
import { errorInterceptor } from '@core/interceptors/error-interceptor';
import { API_ERROR_NOTIFIER, SUPPRESS_ERROR_TOAST } from '@core/tokens';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import type { AdminHostelState } from '../shared/admin-billing-labels';
import { AdminHostelBilling } from './admin-hostel-billing';

const BASE = 'https://api.test';
const HOSTEL = 'hOs3';
const OTHER_HOSTEL = 'hOs8';

// Only the keys a test reads carry copy; the rest resolve to their key.
const COPY = {
  adminBilling: {
    common: { cancel: 'Cancel', retry: 'Try again', loadError: 'Load failed' },
    errors: {
      forbidden: 'Only HostelHive admins can see billing.',
      notFound: 'This was changed or removed.',
      generic: 'Something went wrong.',
    },
    hostel: {
      title: '{{hostel}} — billing',
      titleFallback: 'Hostel billing',
      noSubscription: 'This hostel has no plan yet.',
      openInvoice: 'Open invoice {{number}} · {{amount}} · expires {{date}}',
      openInvoiceNoExpiry: 'Open invoice {{number}} · {{amount}}',
      awaitingVerification: 'Transfer awaiting verification',
      notFound: "This hostel doesn't exist or was removed.",
      openQueue: 'Open the verification queue',
    },
    currency: {
      auto: 'Automatic ({{currency}})',
      overridden: 'Set by an admin: {{currency}}',
      optionAuto: 'Automatic (from country)',
      save: 'Save currency',
      nextRenewal: 'Applies from the next renewal.',
      openInvoice: 'Open invoice {{number}} stays in {{currency}}.',
      planNoPrice: '{{plan}} has no {{currency}} price.',
      saved: 'Billing currency saved.',
    },
    grant: {
      open: 'Grant a plan',
      title: 'Grant a plan free of charge',
      confirm: 'Grant plan',
      monthsOption: '{{count}} month(s)',
      startsNow: '{{plan}} starts today for {{months}} month(s).',
      extends: 'Adds {{months}} month(s) of {{plan}} from {{date}}.',
      switchNow: 'Switches from {{current}} to {{plan}} now.',
      voids: 'Unpaid invoice {{number}} will be closed.',
      keepsCancel: 'Still set to end.',
      dropsSwitch: 'The switch to {{plan}} won’t happen.',
      receipt: 'Owner gets a receipt.',
      blockedTransfer: 'Transfer for {{number}} awaits verification.',
      granted: 'Plan granted.',
      planGone: 'That plan is no longer active.',
    },
    events: {
      empty: 'No billing history yet.',
      limit: 'Showing the latest 100 events.',
      invoice: 'Invoice {{number}}',
      granted: '{{plan}} granted by HostelHive',
      renewed: '{{plan}} renewed until {{date}}',
      downgraded: 'Downgraded from {{from}} to {{to}}',
      paymentFailed: 'Payment failed: {{reason}}',
    },
  },
  hostBilling: { endsOn: 'Ends on {{date}}' },
};

const LISTING = { id: 'pLn1', code: 'listing', name: 'Listing' };
const BOOST = { id: 'pBst2', code: 'boost', name: 'Listing + Boost' };
const CRM = { id: 'pCrm3', code: 'crm', name: 'Listing + CRM' };

// Out of position order on purpose, with an inactive plan only history still names.
const ADMIN_PLANS: AdminPlan[] = [
  {
    ...CRM,
    active: true,
    position: 3,
    features: ['crm'],
    prices: { PKR: '9000.00' },
  },
  {
    id: 'pOld9',
    code: 'legacy',
    name: 'Legacy Basic',
    active: false,
    position: 0,
    features: [],
    prices: { PKR: '1500.00', USD: '6.00' },
  },
  {
    ...LISTING,
    active: true,
    position: 1,
    features: [],
    prices: { PKR: '5000.00', USD: '18.00' },
  },
  {
    ...BOOST,
    active: true,
    position: 2,
    features: ['boost'],
    prices: { PKR: '7500.00' },
  },
];

function subscription(
  over: Partial<BillingSubscription> = {},
): BillingSubscription {
  return {
    id: 'sUb5',
    status: { id: 1, name: 'Active', slug: 'active' },
    currency: 'PKR',
    plan: { ...BOOST, features: ['boost'] },
    current_period_start: '2026-10-12T00:00:00Z',
    current_period_end: '2026-11-12T00:00:00Z',
    grace_until: null,
    scheduled_plan: null,
    cancel_at_period_end: false,
    ...over,
  };
}

function openInvoice(over: Partial<OpenInvoice> = {}): OpenInvoice {
  return {
    id: 'iNv7Q',
    number: 'HH-2026-000123',
    kind: 'renewal',
    total: '7500.00',
    currency: 'PKR',
    period_start: '2026-11-12T00:00:00Z',
    period_end: '2026-12-12T00:00:00Z',
    expires_at: '2026-10-14T09:30:00Z',
    awaiting_verification: false,
    ...over,
  };
}

function billing(over: Partial<HostBilling> = {}): HostBilling {
  return {
    currency: 'PKR',
    country_code: 'PK',
    payment_methods: ['safepay'],
    subscription: subscription(),
    features: ['listing', 'boost'],
    open_invoice: null,
    // The host-facing list: active plans, in the server's order.
    plans: [LISTING, BOOST, CRM].map((p) => ({
      ...p,
      features: [],
      interval: 'month',
      currency: 'PKR',
      price: '1.00',
      action: 'renew',
      amount_due_now: '1.00',
    })),
    ...over,
  };
}

function event(
  id: string,
  kind: string,
  data: Record<string, unknown> | null,
  createdAt: string,
  invoiceNumber: string | null = null,
): SubscriptionEvent {
  return {
    id,
    kind,
    data,
    created_at: createdAt,
    invoice_number: invoiceNumber,
  };
}

const EVENTS: SubscriptionEvent[] = [
  event('e1', 'granted', { plan: 'legacy' }, '2026-08-01T08:00:00Z'),
  event(
    'e2',
    'payment_failed',
    { payment_id: 48213, reason: 'Amount does not match' },
    '2026-09-03T10:15:00Z',
  ),
  event(
    'e3',
    'renewed',
    { plan: 'boost', period_end: '2026-11-12T00:00:00Z' },
    '2026-10-12T00:05:00Z',
    'HH-2026-000120',
  ),
];

function envelope(
  over: Partial<AdminHostelBillingData> = {},
): AdminHostelBillingData {
  return {
    billing: billing(),
    billing_currency_override: null,
    events: EVENTS,
    ...over,
  };
}

@Component({ template: '' })
class Blank {}

describe('AdminHostelBilling', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'en/admin/billing/hostels/:hostelId',
            component: AdminHostelBilling,
          },
          { path: '**', component: Blank },
        ]),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
        { provide: API_ERROR_NOTIFIER, useValue: vi.fn() },
        provideI18nTesting(),
      ],
    });
    TestBed.inject(TranslocoService).setTranslation(COPY, 'en');
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  const el = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const root = (): HTMLElement => harness.fixture.nativeElement as HTMLElement;
  const q = (id: string): HTMLElement | null =>
    root().querySelector(`[data-testid="${id}"]`);
  const text = (id: string): string =>
    (q(id)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function settle(): Promise<void> {
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
  }

  const billingReq = (id = HOSTEL): TestRequest =>
    http.expectOne(`${BASE}/api/admin/hostels/${id}/billing`);
  const plansReq = (): TestRequest => http.expectOne(`${BASE}/api/admin/plans`);
  const listingsReq = (): TestRequest =>
    http.expectOne((r) => r.url === `${BASE}/api/admin/hostels`);

  /** Opens the page with the clicked row's hostel name in router state, as the lists do. */
  async function open(
    data: AdminHostelBillingData = envelope(),
    id = HOSTEL,
    name = 'Green Hostel',
  ): Promise<void> {
    const state: AdminHostelState = { hostel: { id, name } };
    await TestBed.inject(Router).navigateByUrl(
      `/en/admin/billing/hostels/${id}`,
      { state },
    );
    await settle();
    billingReq(id).flush({ success: true, ...data });
    plansReq().flush({ success: true, plans: ADMIN_PLANS });
    await settle();
  }

  function dropdown(id: string): Dropdown {
    return harness.fixture.debugElement.query(By.css(`[data-testid="${id}"]`))
      .componentInstance as Dropdown;
  }

  async function pick(id: string, value: string): Promise<void> {
    harness.fixture.debugElement
      .query(By.css(`[data-testid="${id}"]`))
      .triggerEventHandler('valueChange', value);
    await settle();
  }

  /** The confirm button of the open dialog: the last action in its button row. */
  function confirmButton(host: string): HTMLButtonElement {
    const buttons = root().querySelectorAll<HTMLButtonElement>(
      `${host} div.flex.gap-3 button`,
    );
    return buttons[buttons.length - 1];
  }

  describe('summary', () => {
    it('loads the routed hostel and shows its plan read-only, named from router state', async () => {
      await open(
        envelope({
          billing: billing({
            open_invoice: openInvoice(),
            subscription: subscription({ cancel_at_period_end: false }),
          }),
        }),
      );

      expect(root().querySelector('h1')?.textContent?.trim()).toBe(
        'Green Hostel — billing',
      );
      const card = root().querySelector('hh-current-plan-card');
      expect(card?.querySelector('h2')?.textContent?.trim()).toBe(
        'Listing + Boost',
      );
      // Read-only: an active plan offers no Cancel, Undo or Resume to an admin.
      expect(card?.querySelectorAll('button').length).toBe(0);
      expect(text('open-invoice')).toBe(
        'Open invoice HH-2026-000123 · ⁨PKR 7,500⁩ · expires 14 Oct 2026, 09:30',
      );
      expect(q('awaiting-verification')).toBeNull();
      expect(text('currency-state')).toBe('Automatic (PKR)');
    });

    it('leaves the expiry out of the open invoice line when it has none', async () => {
      await open(
        envelope({ billing: billing({ open_invoice: openInvoice({ expires_at: null }) }) }),
      );

      expect(text('open-invoice')).toBe('Open invoice HH-2026-000123 · ⁨PKR 7,500⁩');
    });

    it('says the hostel has no plan instead of the host card', async () => {
      await open(envelope({ billing: billing({ subscription: null }) }));

      expect(root().querySelector('hh-current-plan-card')).toBeNull();
      expect(text('no-subscription')).toBe('This hostel has no plan yet.');
    });

    it('shows an admin override as set by an admin', async () => {
      await open(envelope({ billing_currency_override: 'USD' }));

      expect(text('currency-state')).toBe('Set by an admin: USD');
    });

    it('flags a transfer under review, links the queue and blocks the grant', async () => {
      await open(
        envelope({
          billing: billing({
            open_invoice: openInvoice({ awaiting_verification: true }),
          }),
        }),
      );

      expect(text('awaiting-verification')).toBe(
        'Transfer awaiting verification',
      );
      expect(q('open-invoice-queue')?.getAttribute('href')).toBe(
        '/en/admin/billing/verification',
      );
      expect((q('grant-open') as HTMLButtonElement).disabled).toBe(true);
      expect(text('grant-blocked')).toBe(
        'Transfer for HH-2026-000123 awaits verification. Open the verification queue',
      );
      expect(q('grant-queue')?.getAttribute('href')).toBe(
        '/en/admin/billing/verification',
      );

      (q('grant-open') as HTMLButtonElement).click();
      await settle();
      expect(root().querySelector('hh-admin-grant-dialog')).toBeNull();
    });
  });

  describe('hostel name', () => {
    it('looks the hostel up by id when no row handed its name over', async () => {
      await TestBed.inject(Router).navigateByUrl(
        `/en/admin/billing/hostels/${HOSTEL}`,
      );
      await settle();
      billingReq().flush({ success: true, ...envelope() });
      plansReq().flush({ success: true, plans: ADMIN_PLANS });
      const lookup = listingsReq();
      expect(lookup.request.params.get('f[id]')).toBe(HOSTEL);
      expect(lookup.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
      await settle();
      expect(root().querySelector('h1')?.textContent?.trim()).toBe(
        'Hostel billing',
      );

      lookup.flush({ hostels: [{ id: HOSTEL, name: 'Blue Lodge' }] });
      await settle();

      expect(root().querySelector('h1')?.textContent?.trim()).toBe(
        'Blue Lodge — billing',
      );
    });

    it('ignores a name handed over for another hostel and keeps the fallback when the lookup fails', async () => {
      await TestBed.inject(Router).navigateByUrl(
        `/en/admin/billing/hostels/${HOSTEL}`,
        { state: { hostel: { id: OTHER_HOSTEL, name: 'Wrong Hostel' } } },
      );
      await settle();
      billingReq().flush({ success: true, ...envelope() });
      plansReq().flush({ success: true, plans: ADMIN_PLANS });
      listingsReq().flush(null, { status: 500, statusText: 'Server Error' });
      await settle();

      expect(root().querySelector('h1')?.textContent?.trim()).toBe(
        'Hostel billing',
      );
    });
  });

  describe('history', () => {
    it('lists events newest first with plan names from the admin plan list', async () => {
      const source = [...EVENTS];
      await open(envelope({ events: source }));

      const items = Array.from(
        root().querySelectorAll<HTMLElement>('[data-testid="billing-event"]'),
      );
      expect(
        items.map((li) =>
          li.querySelector('[data-field="label"]')?.textContent?.trim(),
        ),
      ).toEqual([
        'Listing + Boost renewed until 12 Nov 2026',
        'Payment failed: Amount does not match',
        // Inactive, so only the admin plan list knows its name.
        'Legacy Basic granted by HostelHive',
      ]);
      expect(source.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
      expect(
        items[0].querySelector('[data-field="created"]')?.textContent?.trim(),
      ).toBe('12 Oct 2026, 00:05');
      const invoice = items[0].querySelector<HTMLAnchorElement>(
        '[data-field="invoice"]',
      );
      expect(invoice?.textContent?.trim()).toBe('Invoice HH-2026-000120');
      expect(invoice?.getAttribute('href')).toBe(
        '/en/admin/billing/invoices?number=HH-2026-000120',
      );
      expect(items[1].querySelector('[data-field="invoice"]')).toBeNull();
      expect(el().textContent).not.toContain('48213');
      expect(q('events-limit')).toBeNull();
    });

    it('says when only the latest 100 events are shown', async () => {
      const many = Array.from({ length: 100 }, (_, i) =>
        event(`e${i}`, 'expired', {}, '2026-10-01T00:00:00Z'),
      );
      await open(envelope({ events: many }));

      expect(
        root().querySelectorAll('[data-testid="billing-event"]').length,
      ).toBe(100);
      expect(text('events-limit')).toBe('Showing the latest 100 events.');
    });

    it('says when there is no history', async () => {
      await open(envelope({ events: [] }));

      expect(text('events-empty')).toBe('No billing history yet.');
    });
  });

  describe('grant', () => {
    it('offers active plans in position order and grants from the dialog, re-rendering from the response', async () => {
      await open(
        envelope({
          billing: billing({
            open_invoice: openInvoice(),
            subscription: subscription({
              cancel_at_period_end: true,
              scheduled_plan: LISTING,
            }),
          }),
        }),
      );

      (q('grant-open') as HTMLButtonElement).click();
      await settle();

      expect(
        dropdown('grant-plan')
          .options()
          .map((o) => [o.value, o.label]),
      ).toEqual([
        ['pLn1', 'Listing'],
        ['pBst2', 'Listing + Boost'],
        ['pCrm3', 'Listing + CRM'],
      ]);
      // The current plan is the starting choice.
      expect(dropdown('grant-plan').value()).toBe('pBst2');
      expect(dropdown('grant-months').options().length).toBe(24);
      expect(dropdown('grant-months').options()[2].label).toBe('3 month(s)');

      await pick('grant-plan', 'pCrm3');
      await pick('grant-months', '3');

      expect(text('grant-extends')).toBe(
        'Adds 3 month(s) of Listing + CRM from 12 Nov 2026.',
      );
      expect(text('grant-switch-now')).toBe(
        'Switches from Listing + Boost to Listing + CRM now.',
      );
      expect(text('grant-voids')).toBe(
        'Unpaid invoice HH-2026-000123 will be closed.',
      );
      expect(text('grant-keeps-cancel')).toBe('Still set to end.');
      expect(text('grant-drops-switch')).toBe(
        'The switch to Listing won’t happen.',
      );
      expect(text('grant-receipt')).toBe('Owner gets a receipt.');
      expect(q('grant-starts-now')).toBeNull();

      confirmButton('hh-admin-grant-dialog').click();
      await settle();

      const req = http.expectOne(`${BASE}/api/admin/hostels/${HOSTEL}/grant`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ plan_id: 'pCrm3', months: 3 });
      expect(confirmButton('hh-admin-grant-dialog').disabled).toBe(true);
      expect((q('currency-save') as HTMLButtonElement).disabled).toBe(true);

      const renewed = event(
        'e4',
        'renewed',
        { plan: 'crm', period_end: '2027-02-12T00:00:00Z' },
        '2026-10-11T12:00:00Z',
        'HH-2026-000124',
      );
      // As the server answers a grant: the new events, but the subscription from before it.
      req.flush({
        success: true,
        ...envelope({
          billing: billing({
            subscription: subscription({
              plan: { ...CRM, features: ['crm'] },
              current_period_end: '2026-11-12T00:00:00Z',
              cancel_at_period_end: true,
            }),
          }),
          events: [...EVENTS, renewed],
        }),
      });
      await settle();

      expect(root().querySelector('hh-admin-grant-dialog')).toBeNull();
      expect(text('hostel-billing-notice')).toBe('Plan granted.');
      expect(
        root().querySelector('hh-current-plan-card h2')?.textContent?.trim(),
      ).toBe('Listing + CRM');
      expect(q('open-invoice')).toBeNull();
      expect(
        root()
          .querySelector('[data-testid="billing-event"] [data-field="label"]')
          ?.textContent?.trim(),
      ).toBe('Listing + CRM renewed until 12 Feb 2027');
      expect(text('plan-status')).toBe('Ends on 12 Nov 2026');

      // The billing is read again in place, and the plan card takes the new period end from it.
      http
        .expectOne(`${BASE}/api/admin/hostels/${HOSTEL}/billing`)
        .flush({
          success: true,
          ...envelope({
            billing: billing({
              subscription: subscription({
                plan: { ...CRM, features: ['crm'] },
                current_period_end: '2027-02-12T00:00:00Z',
                cancel_at_period_end: true,
              }),
            }),
            events: [...EVENTS, renewed],
          }),
        });
      await settle();

      expect(text('plan-status')).toBe('Ends on 12 Feb 2027');
      expect(text('hostel-billing-notice')).toBe('Plan granted.');
    });

    it('keeps the grant answer on screen when the read after it fails', async () => {
      await open();
      (q('grant-open') as HTMLButtonElement).click();
      await settle();
      confirmButton('hh-admin-grant-dialog').click();
      await settle();

      http
        .expectOne(`${BASE}/api/admin/hostels/${HOSTEL}/grant`)
        .flush({
          success: true,
          ...envelope({
            billing: billing({
              subscription: subscription({ cancel_at_period_end: true }),
            }),
          }),
        });
      await settle();
      http
        .expectOne(`${BASE}/api/admin/hostels/${HOSTEL}/billing`)
        .flush(
          { success: false, errors: ['down'] },
          { status: 500, statusText: 'Server Error' },
        );
      await settle();

      expect(text('plan-status')).toBe('Ends on 12 Nov 2026');
      expect(text('hostel-billing-notice')).toBe('Plan granted.');
      expect(q('hostel-billing-error')).toBeNull();
    });

    it('drops the read after a grant when a currency save finished while it was in flight', async () => {
      await open();
      (q('grant-open') as HTMLButtonElement).click();
      await settle();
      confirmButton('hh-admin-grant-dialog').click();
      await settle();
      http
        .expectOne(`${BASE}/api/admin/hostels/${HOSTEL}/grant`)
        .flush({ success: true, ...envelope() });
      await settle();
      const reread = billingReq();

      await pick('currency-select', 'USD');
      (q('currency-save') as HTMLButtonElement).click();
      await settle();
      confirmButton('hh-confirm-modal').click();
      http
        .expectOne(`${BASE}/api/admin/hostels/${HOSTEL}/billing_currency`)
        .flush({
          success: true,
          ...envelope({ billing_currency_override: 'USD' }),
        });
      await settle();
      expect(text('currency-state')).toBe('Set by an admin: USD');

      // Read before the save, so it still carries no override.
      reread.flush({ success: true, ...envelope() });
      await settle();

      expect(text('currency-state')).toBe('Set by an admin: USD');
      expect(dropdown('currency-select').value()).toBe('USD');
    });

    it('starts the plan today when nothing is live, with no live-only warnings', async () => {
      await open(
        envelope({
          billing: billing({
            subscription: subscription({
              status: { id: 4, name: 'Expired', slug: 'expired' },
              cancel_at_period_end: true,
              scheduled_plan: LISTING,
            }),
          }),
        }),
      );

      (q('grant-open') as HTMLButtonElement).click();
      await settle();
      await pick('grant-plan', 'pLn1');

      expect(text('grant-starts-now')).toBe(
        'Listing starts today for 1 month(s).',
      );
      for (const id of [
        'grant-extends',
        'grant-switch-now',
        'grant-voids',
        'grant-keeps-cancel',
        'grant-drops-switch',
      ]) {
        expect(q(id)).toBeNull();
      }

      confirmButton('hh-admin-grant-dialog').click();
      http
        .expectOne(`${BASE}/api/admin/hostels/${HOSTEL}/grant`)
        .flush({ success: true, ...envelope() });
      await settle();
      billingReq().flush({ success: true, ...envelope() });
      await settle();
    });

    it('extends a past-due plan from its old period end', async () => {
      await open(
        envelope({
          billing: billing({
            subscription: subscription({
              status: { id: 2, name: 'Past due', slug: 'past-due' },
              current_period_end: '2026-10-01T00:00:00Z',
            }),
          }),
        }),
      );

      (q('grant-open') as HTMLButtonElement).click();
      await settle();

      expect(text('grant-extends')).toBe(
        'Adds 1 month(s) of Listing + Boost from 1 Oct 2026.',
      );
      expect(q('grant-switch-now')).toBeNull();
    });

    it('shows a 422 exactly as sent and keeps the dialog open', async () => {
      await open();
      (q('grant-open') as HTMLButtonElement).click();
      await settle();
      confirmButton('hh-admin-grant-dialog').click();

      http.expectOne(`${BASE}/api/admin/hostels/${HOSTEL}/grant`).flush(
        {
          errors: [
            'Invoice HH-2026-000123 has a bank transfer waiting for verification',
          ],
        },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
      await settle();

      expect(root().querySelector('hh-admin-grant-dialog')).not.toBeNull();
      expect(text('grant-error')).toBe(
        'Invoice HH-2026-000123 has a bank transfer waiting for verification',
      );
      expect(q('hostel-billing-notice')).toBeNull();
    });

    it('says the plan is gone on a 404 and reloads the plan list', async () => {
      await open();
      (q('grant-open') as HTMLButtonElement).click();
      await settle();
      await pick('grant-plan', 'pCrm3');
      confirmButton('hh-admin-grant-dialog').click();

      http
        .expectOne(`${BASE}/api/admin/hostels/${HOSTEL}/grant`)
        .flush(null, { status: 404, statusText: 'Not Found' });
      await settle();

      expect(text('grant-error')).toBe('That plan is no longer active.');
      plansReq().flush({
        success: true,
        plans: ADMIN_PLANS.map((p) =>
          p.code === 'crm' ? { ...p, active: false } : p,
        ),
      });
      await settle();

      expect(
        dropdown('grant-plan')
          .options()
          .map((o) => o.value),
      ).toEqual(['pLn1', 'pBst2']);
    });

    it('drops the answer to a grant asked on another hostel', async () => {
      await open();
      (q('grant-open') as HTMLButtonElement).click();
      await settle();
      confirmButton('hh-admin-grant-dialog').click();
      const stale = http.expectOne(`${BASE}/api/admin/hostels/${HOSTEL}/grant`);

      await TestBed.inject(Router).navigateByUrl(
        `/en/admin/billing/hostels/${OTHER_HOSTEL}`,
        { state: { hostel: { id: OTHER_HOSTEL, name: 'Blue Lodge' } } },
      );
      await settle();
      billingReq(OTHER_HOSTEL).flush({
        success: true,
        ...envelope({ billing: billing({ subscription: null }), events: [] }),
      });
      await settle();

      stale.flush({ success: true, ...envelope() });
      await settle();

      expect(root().querySelector('h1')?.textContent?.trim()).toBe(
        'Blue Lodge — billing',
      );
      expect(text('no-subscription')).toBe('This hostel has no plan yet.');
      expect(q('hostel-billing-notice')).toBeNull();
      expect(root().querySelector('hh-admin-grant-dialog')).toBeNull();
      expect((q('grant-open') as HTMLButtonElement).disabled).toBe(false);
    });
  });

  describe('billing currency', () => {
    it('saves only a change, after a confirm that names every consequence', async () => {
      await open(
        envelope({ billing: billing({ open_invoice: openInvoice() }) }),
      );

      const save = q('currency-save') as HTMLButtonElement;
      expect(dropdown('currency-select').value()).toBe('auto');
      expect(
        dropdown('currency-select')
          .options()
          .map((o) => o.label),
      ).toEqual(['Automatic (from country)', 'PKR', 'USD']);
      expect(save.disabled).toBe(true);

      await pick('currency-select', 'USD');
      expect(save.disabled).toBe(false);
      save.click();
      await settle();

      expect(text('currency-next-renewal')).toBe(
        'Applies from the next renewal.',
      );
      expect(text('currency-open-invoice')).toBe(
        'Open invoice HH-2026-000123 stays in PKR.',
      );
      // Boost has no USD price in the admin list.
      expect(text('currency-plan-no-price')).toBe(
        'Listing + Boost has no USD price.',
      );

      confirmButton('hh-confirm-modal').click();
      await settle();

      const req = http.expectOne(
        `${BASE}/api/admin/hostels/${HOSTEL}/billing_currency`,
      );
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ currency: 'USD' });
      req.flush({
        success: true,
        ...envelope({ billing_currency_override: 'USD' }),
      });
      await settle();

      expect(text('currency-state')).toBe('Set by an admin: USD');
      expect(text('hostel-billing-notice')).toBe('Billing currency saved.');
      expect(dropdown('currency-select').value()).toBe('USD');
      expect((q('currency-save') as HTMLButtonElement).disabled).toBe(true);
    });

    it('clears an override with an empty currency and warns about no missing price it cannot know', async () => {
      await open(envelope({ billing_currency_override: 'USD' }));

      await pick('currency-select', 'auto');
      (q('currency-save') as HTMLButtonElement).click();
      await settle();
      expect(q('currency-plan-no-price')).toBeNull();
      expect(q('currency-open-invoice')).toBeNull();
      confirmButton('hh-confirm-modal').click();

      const req = http.expectOne(
        `${BASE}/api/admin/hostels/${HOSTEL}/billing_currency`,
      );
      expect(req.request.body).toEqual({ currency: '' });
      req.flush({ success: true, ...envelope() });
      await settle();

      expect(text('currency-state')).toBe('Automatic (PKR)');
    });

    it('shows our own copy for a refused write', async () => {
      await open();
      await pick('currency-select', 'PKR');
      (q('currency-save') as HTMLButtonElement).click();
      await settle();
      confirmButton('hh-confirm-modal').click();

      http
        .expectOne(`${BASE}/api/admin/hostels/${HOSTEL}/billing_currency`)
        .flush(
          { errors: ['You are not authorized'] },
          { status: 403, statusText: 'Forbidden' },
        );
      await settle();

      expect(text('currency-error')).toBe(
        'Only HostelHive admins can see billing.',
      );
      expect(text('currency-state')).toBe('Automatic (PKR)');
    });
  });

  describe('load failures', () => {
    it('shows our forbidden copy with no retry on a 403', async () => {
      await TestBed.inject(Router).navigateByUrl(
        `/en/admin/billing/hostels/${HOSTEL}`,
        { state: { hostel: { id: HOSTEL, name: 'Green Hostel' } } },
      );
      await settle();
      billingReq().flush(
        { errors: ['Not an admin'] },
        { status: 403, statusText: 'Forbidden' },
      );
      plansReq().flush(null, { status: 403, statusText: 'Forbidden' });
      await settle();

      expect(text('hostel-billing-forbidden')).toContain(
        'Only HostelHive admins can see billing.',
      );
      expect(el().textContent).not.toContain('Not an admin');
      expect(q('hostel-billing-forbidden')?.querySelector('button')).toBeNull();
    });

    it('says the hostel is gone with no retry on a 404', async () => {
      await TestBed.inject(Router).navigateByUrl(
        `/en/admin/billing/hostels/${HOSTEL}`,
        { state: { hostel: { id: HOSTEL, name: 'Green Hostel' } } },
      );
      await settle();
      billingReq().flush(
        { errors: ['Not found'] },
        { status: 404, statusText: 'Not Found' },
      );
      plansReq().flush({ success: true, plans: ADMIN_PLANS });
      await settle();

      expect(text('hostel-billing-not-found')).toContain(
        "This hostel doesn't exist or was removed.",
      );
      expect(q('hostel-billing-error')).toBeNull();
      expect(q('hostel-billing-not-found')?.querySelector('button')).toBeNull();
    });

    it('offers a retry on any other failure, which loads again', async () => {
      await TestBed.inject(Router).navigateByUrl(
        `/en/admin/billing/hostels/${HOSTEL}`,
        { state: { hostel: { id: HOSTEL, name: 'Green Hostel' } } },
      );
      await settle();
      billingReq().flush(null, { status: 500, statusText: 'Server Error' });
      plansReq().flush({ success: true, plans: ADMIN_PLANS });
      await settle();

      expect(text('hostel-billing-error')).toContain('Load failed');
      q('hostel-billing-error')?.querySelector('button')?.click();
      await settle();

      billingReq().flush({ success: true, ...envelope() });
      await settle();
      expect(q('hostel-billing-error')).toBeNull();
      expect(root().querySelector('hh-current-plan-card')).not.toBeNull();
    });
  });
});
