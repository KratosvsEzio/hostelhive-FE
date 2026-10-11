import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoService } from '@jsverse/transloco';
import { Subject } from 'rxjs';
import type {
  BillingInvoice,
  BillingPlan,
  BillingSubscription,
  HostBilling,
  OpenInvoice,
} from '@hostelhive/data-access';
import { BillingApi, HostPropertyStore } from '@services';
import { SessionStore } from '@core/auth/session-store';
import { LocaleStore } from '@core/i18n/locale-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { BillingPage } from './billing-page';

const ALL_PERMISSIONS = [
  'core:Invoice:create',
  'core:Invoice:create_payment',
  'host:Hostel:show',
];

// Only the keys whose parameters a test reads carry copy; the rest resolve to their key.
const COPY = {
  hostBilling: {
    upgradePayNow: 'Upgrade: pay {{amount}} now',
    renewsAtOn: 'Renews at {{price}} on {{date}}',
    payNow: 'Pay {{amount}} now',
  },
};

function plan(over: Partial<BillingPlan> = {}): BillingPlan {
  return {
    id: 'pBasic',
    code: 'basic',
    name: 'Basic',
    features: [],
    interval: 'month',
    currency: 'PKR',
    price: '5000.00',
    action: 'buy',
    amount_due_now: '5000.00',
    ...over,
  };
}

function subscription(
  over: Partial<BillingSubscription> = {},
): BillingSubscription {
  return {
    id: 'sub1',
    status: { id: 1, name: 'Active', slug: 'active', color: null },
    currency: 'PKR',
    plan: { id: 'pBasic', code: 'basic', name: 'Basic', features: [] },
    current_period_start: '2026-10-12T10:00:00+05:00',
    current_period_end: '2026-11-12T10:00:00+05:00',
    grace_until: null,
    scheduled_plan: null,
    cancel_at_period_end: false,
    ...over,
  };
}

function openInvoice(over: Partial<OpenInvoice> = {}): OpenInvoice {
  return {
    id: 'inv7',
    number: 'HH-2026-0007',
    kind: 'new',
    total: '5000.00',
    currency: 'PKR',
    period_start: '2026-10-12T00:00:00+05:00',
    period_end: '2026-11-12T00:00:00+05:00',
    expires_at: '2026-10-13T10:00:00+05:00',
    awaiting_verification: false,
    ...over,
  };
}

function billing(over: Partial<HostBilling> = {}): HostBilling {
  return {
    currency: 'PKR',
    country_code: 'PK',
    payment_methods: ['card', 'bank_transfer'],
    subscription: null,
    features: [],
    open_invoice: null,
    plans: [
      plan(),
      plan({
        id: 'pGrowth',
        code: 'growth',
        name: 'Growth',
        features: ['boost'],
      }),
    ],
    ...over,
  };
}

const INVOICE: BillingInvoice = {
  id: 'inv9',
  number: 'HH-2026-0009',
  kind: 'new',
  currency: 'PKR',
  total: '5000.00',
  period_start: null,
  period_end: null,
  expires_at: null,
  paid_at: null,
  voided_at: null,
  created_at: '2026-10-11T09:00:00+05:00',
  invoice_pdf_url: null,
  plan: null,
  lines: [],
  status: { id: 1, name: 'Open', slug: 'open', color: null },
  payments: [],
};

/** Drops the Unicode isolates the page wraps amounts in, so assertions read as plain text. */
function plain(text: string | null | undefined): string {
  return (text ?? '').replace(/[⁨⁩]/g, '').replace(/\s+/g, ' ').trim();
}

describe('BillingPage', () => {
  let harness: RouterTestingHarness;
  let loads: Subject<HostBilling>[];
  let checkouts: Subject<BillingInvoice>[];
  let api: {
    billing: ReturnType<typeof vi.fn>;
    checkout: ReturnType<typeof vi.fn>;
  };
  let navigate: ReturnType<typeof vi.spyOn>;

  async function open(
    permissions: readonly string[] = ALL_PERMISSIONS,
  ): Promise<HTMLElement> {
    loads = [];
    checkouts = [];
    api = {
      billing: vi.fn(() => {
        const s = new Subject<HostBilling>();
        loads.push(s);
        return s.asObservable();
      }),
      checkout: vi.fn(() => {
        const s = new Subject<BillingInvoice>();
        checkouts.push(s);
        return s.asObservable();
      }),
    };
    const granted = new Set(permissions);
    TestBed.configureTestingModule({
      providers: [
        // The hostel id lives two routes above the page, as in the real tree.
        provideRouter([
          {
            path: 'host/:hostelId',
            children: [
              {
                path: 'subscription',
                children: [
                  { path: '', pathMatch: 'full', component: BillingPage },
                ],
              },
            ],
          },
        ]),
        provideI18nTesting(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: BillingApi, useValue: api },
        {
          provide: SessionStore,
          useValue: { hasPermission: (f: string) => granted.has(f) },
        },
        {
          provide: HostPropertyStore,
          useValue: { selected: signal('nHelLt') },
        },
      ],
    });
    TestBed.inject(TranslocoService).setTranslation(COPY, 'en');
    harness = await RouterTestingHarness.create();
    await TestBed.inject(Router).navigateByUrl('/host/nHelLt/subscription');
    navigate = vi
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockResolvedValue(true);
    harness.detectChanges();
    return harness.routeNativeElement as HTMLElement;
  }

  async function openWith(
    data: HostBilling,
    permissions: readonly string[] = ALL_PERMISSIONS,
  ): Promise<HTMLElement> {
    const el = await open(permissions);
    loads[0].next(data);
    harness.detectChanges();
    return el;
  }

  function planButtonOf(
    el: HTMLElement,
    planId: string,
  ): HTMLButtonElement | null {
    return el.querySelector(`hh-plan-card[data-plan="${planId}"] button`);
  }

  function field(
    el: HTMLElement,
    planId: string,
    name: string,
  ): HTMLElement | null {
    return el.querySelector(
      `hh-plan-card[data-plan="${planId}"] [data-field="${name}"]`,
    );
  }

  function checkoutErrorOf(el: HTMLElement, planId: string): Element | null {
    return el.querySelector(
      `hh-plan-card[data-plan="${planId}"] [data-testid="checkout-error"]`,
    );
  }

  /** The refusal sits in the clicked card and nowhere else on the page. */
  function expectErrorOnlyIn(el: HTMLElement, planId: string): Element {
    const all = el.querySelectorAll('[data-testid="checkout-error"]');
    const inCard = checkoutErrorOf(el, planId);
    expect(all.length).toBe(1);
    expect(inCard).not.toBeNull();
    expect(all[0]).toBe(inCard);
    return inCard as Element;
  }

  function buttonByText(
    root: Element | null,
    text: string,
  ): HTMLButtonElement | undefined {
    return Array.from(root?.querySelectorAll('button') ?? []).find((b) =>
      b.textContent?.includes(text),
    );
  }

  function failCheckout(
    err: { status: number; serverMessages?: string[] },
    index = 0,
  ): void {
    checkouts[index].error({ code: 'unknown_error', message: 'x', ...err });
    harness.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  describe('loading and access', () => {
    it('shows a skeleton until billing arrives, then the screen', async () => {
      const el = await open();

      expect(api.billing).toHaveBeenCalledWith('nHelLt');
      expect(
        el.querySelector('[data-testid="billing-loading"]'),
      ).not.toBeNull();
      expect(
        el.querySelectorAll('[data-testid="billing-loading"] hh-skeleton'),
      ).toHaveLength(5);
      expect(el.querySelector('hh-current-plan-card')).toBeNull();

      loads[0].next(billing());
      harness.detectChanges();

      expect(el.querySelector('[data-testid="billing-loading"]')).toBeNull();
      expect(el.querySelector('hh-current-plan-card')).not.toBeNull();
      expect(el.querySelectorAll('hh-plan-card')).toHaveLength(2);
      expect(el.textContent).toContain('hostBilling.plansTitle');
    });

    it('shows an inline no-access state on 403, with no retry', async () => {
      const el = await open();
      loads[0].error({ status: 403, code: 'unknown_error', message: 'x' });
      harness.detectChanges();

      const state = el.querySelector('[data-testid="billing-forbidden"]');
      expect(state?.textContent).toContain('hostBilling.noAccessTitle');
      expect(state?.textContent).toContain('hostBilling.noAccessMessage');
      expect(state?.querySelector('button')).toBeNull();
      expect(el.querySelector('[data-testid="billing-error"]')).toBeNull();
    });

    it('shows an error with a retry that loads again', async () => {
      const el = await open();
      loads[0].error({ status: 500, code: 'unknown_error', message: 'x' });
      harness.detectChanges();

      const error = el.querySelector('[data-testid="billing-error"]');
      expect(error?.textContent).toContain('hostBilling.loadError');
      buttonByText(error, 'common.tryAgain')?.click();
      harness.detectChanges();

      expect(api.billing).toHaveBeenCalledTimes(2);
      expect(
        el.querySelector('[data-testid="billing-loading"]'),
      ).not.toBeNull();
      loads[1].next(billing());
      harness.detectChanges();
      expect(el.querySelector('hh-current-plan-card')).not.toBeNull();
    });
  });

  describe('current plan and payment due', () => {
    it('shows the no-plan card when there is no subscription, and every plan can be bought', async () => {
      const el = await openWith(billing({ subscription: null }));

      expect(el.querySelector('hh-current-plan-card')?.textContent).toContain(
        'hostBilling.noPlanTitle',
      );
      for (const id of ['pBasic', 'pGrowth']) {
        const button = planButtonOf(el, id);
        expect(button?.textContent).toContain('hostBilling.choosePlan');
        expect(button?.disabled).toBe(false);
      }
    });

    it('renders the payment-due box with a link to the payment step', async () => {
      const el = await openWith(billing({ open_invoice: openInvoice() }));

      const box = el.querySelector('hh-payment-due');
      expect(box).not.toBeNull();
      const pay = Array.from(box?.querySelectorAll('a') ?? []).map((a) =>
        a.getAttribute('href'),
      );
      expect(
        pay.some((h) => h?.endsWith('/host/nHelLt/subscription/pay/inv7')),
      ).toBe(true);
    });

    it('hides Pay for someone who may not pay', async () => {
      const el = await openWith(billing({ open_invoice: openInvoice() }), [
        'core:Invoice:create',
        'host:Hostel:show',
      ]);

      expect(el.querySelector('hh-payment-due a')).toBeNull();
    });

    // The plan includes Boost, but past due switches it off: the card follows billing.features.
    it('lists the features from the billing summary, not the plan’s own', async () => {
      const el = await openWith(
        billing({
          subscription: subscription({
            status: { id: 3, name: 'Past due', slug: 'past-due', color: null },
            plan: {
              id: 'pGrowth',
              code: 'growth',
              name: 'Growth',
              features: ['boost', 'crm'],
            },
          }),
          features: ['listing', 'crm'],
        }),
      );

      const listed = Array.from(
        el.querySelectorAll('hh-current-plan-card li'),
      ).map((li) => li.textContent?.trim());
      expect(listed).toEqual([
        'sharedBilling.featureListing',
        'sharedBilling.featureCrm',
      ]);
    });

    it('has no payment-due box without an open invoice', async () => {
      const el = await openWith(billing());

      expect(el.querySelector('hh-payment-due')).toBeNull();
    });
  });

  describe('plan buttons', () => {
    const plans = [
      plan({ id: 'pBuy', action: 'buy' }),
      plan({ id: 'pCurrent', action: 'current' }),
      plan({ id: 'pRenew', action: 'renew', amount_due_now: '5000.00' }),
      plan({
        id: 'pUp',
        action: 'upgrade',
        price: '8000.00',
        amount_due_now: '3000.00',
      }),
      plan({
        id: 'pDown',
        action: 'downgrade',
        scheduled: false,
        amount_due_now: null,
      }),
      plan({
        id: 'pSched',
        action: 'downgrade',
        scheduled: true,
        amount_due_now: null,
      }),
      plan({
        id: 'pNone',
        action: 'unavailable',
        amount_due_now: null,
        reason: 'This plan is not available in USD',
      }),
      plan({ id: 'pOdd', action: 'teleport' }),
    ];

    it.each([
      ['pBuy', 'hostBilling.choosePlan', false],
      ['pCurrent', 'hostBilling.currentPlanButton', true],
      ['pRenew', 'hostBilling.renew', false],
      ['pUp', 'Upgrade: pay', false],
      ['pDown', 'hostBilling.switchAtRenewal', true],
      ['pSched', 'hostBilling.switchAtRenewal', true],
      ['pNone', 'hostBilling.unavailable', true],
    ])('gives %s the label %s, disabled: %s', async (id, label, disabled) => {
      const el = await openWith(
        billing({ subscription: subscription(), plans }),
      );

      const button = planButtonOf(el, id);
      expect(button?.textContent).toContain(label);
      expect(button?.disabled).toBe(disabled);
    });

    it('shows no button for an action it does not know', async () => {
      const el = await openWith(
        billing({ subscription: subscription(), plans }),
      );

      expect(el.querySelector('hh-plan-card[data-plan="pOdd"]')).not.toBeNull();
      expect(planButtonOf(el, 'pOdd')).toBeNull();
    });

    it('labels an upgrade with the amount due now and the renewal price and date', async () => {
      const el = await openWith(
        billing({ subscription: subscription(), plans }),
      );

      expect(plain(planButtonOf(el, 'pUp')?.textContent)).toBe(
        'Upgrade: pay PKR 3,000 now',
      );
      expect(plain(field(el, 'pUp', 'subline')?.textContent)).toBe(
        'Renews at PKR 8,000 on 12 Nov 2026',
      );
    });

    it('quotes the amount due under Renew', async () => {
      const el = await openWith(
        billing({ subscription: subscription(), plans }),
      );

      expect(plain(field(el, 'pRenew', 'subline')?.textContent)).toBe(
        'Pay PKR 5,000 now',
      );
    });

    it('disables a downgrade with a coming-soon hint and a Contact us link', async () => {
      const el = await openWith(
        billing({ subscription: subscription(), plans }),
      );

      const hint = field(el, 'pDown', 'hint');
      expect(hint?.textContent).toContain('hostBilling.switchComingSoon');
      expect(hint?.querySelector('a')?.getAttribute('href')).toMatch(
        /\/contact$/,
      );
    });

    it('badges a downgrade already scheduled for renewal', async () => {
      const el = await openWith(
        billing({ subscription: subscription(), plans }),
      );

      expect(
        el.querySelector('hh-plan-card[data-plan="pSched"] hh-status-pill')
          ?.textContent,
      ).toContain('hostBilling.scheduledForRenewal');
    });

    it('shows an unavailable plan’s reason exactly as returned', async () => {
      const el = await openWith(
        billing({ subscription: subscription(), plans }),
      );

      expect(field(el, 'pNone', 'reason')?.textContent?.trim()).toBe(
        'This plan is not available in USD',
      );
    });

    it('disables checkout for someone who may not buy, and says only the owner can', async () => {
      const el = await openWith(billing(), [
        'core:Invoice:create_payment',
        'host:Hostel:show',
      ]);

      expect(planButtonOf(el, 'pBasic')?.disabled).toBe(true);
      expect(planButtonOf(el, 'pGrowth')?.disabled).toBe(true);
      expect(
        el.querySelector('[data-testid="owner-only"]')?.textContent,
      ).toContain('hostBilling.ownerOnly');
    });

    it('has no owner-only note for someone who may buy', async () => {
      const el = await openWith(billing());

      expect(el.querySelector('[data-testid="owner-only"]')).toBeNull();
    });
  });

  describe('missing country', () => {
    const countryless = billing({
      country_code: null,
      plans: [
        plan({
          action: 'unavailable',
          amount_due_now: null,
          reason: "Set the hostel's country first",
        }),
        plan({
          id: 'pGrowth',
          action: 'unavailable',
          amount_due_now: null,
          reason: "Set the hostel's country first",
        }),
      ],
    });

    it('says it once above the plans with a link to the profile, not on every card', async () => {
      const el = await openWith(countryless);

      const notice = el.querySelector('[data-testid="country-notice"]');
      expect(notice?.textContent).toContain('hostBilling.setCountryNotice');
      expect(notice?.querySelector('a')?.getAttribute('href')).toMatch(
        /\/host\/nHelLt\/profile$/,
      );
      expect(el.querySelectorAll('[data-field="reason"]')).toHaveLength(0);
      expect(planButtonOf(el, 'pBasic')?.disabled).toBe(true);
    });

    it('asks for the owner instead of linking when the profile is out of reach', async () => {
      const el = await openWith(countryless, [
        'core:Invoice:create',
        'core:Invoice:create_payment',
      ]);

      const notice = el.querySelector('[data-testid="country-notice"]');
      expect(notice?.querySelector('a')).toBeNull();
      expect(notice?.textContent).toContain('hostBilling.askOwnerCountry');
    });

    it('stays away when the hostel has a country', async () => {
      const el = await openWith(
        billing({
          plans: [
            plan({
              action: 'unavailable',
              amount_due_now: null,
              reason: 'Nope',
            }),
          ],
        }),
      );

      expect(el.querySelector('[data-testid="country-notice"]')).toBeNull();
      expect(field(el, 'pBasic', 'reason')?.textContent?.trim()).toBe('Nope');
    });
  });

  describe('checkout', () => {
    it('disables every plan button while one is in flight and spins the clicked one', async () => {
      const el = await openWith(billing());

      planButtonOf(el, 'pGrowth')?.click();
      harness.detectChanges();

      expect(api.checkout).toHaveBeenCalledWith('nHelLt', 'pGrowth');
      expect(planButtonOf(el, 'pBasic')?.disabled).toBe(true);
      expect(planButtonOf(el, 'pGrowth')?.disabled).toBe(true);
      expect(planButtonOf(el, 'pGrowth')?.getAttribute('aria-busy')).toBe(
        'true',
      );
      expect(planButtonOf(el, 'pBasic')?.getAttribute('aria-busy')).toBeNull();

      planButtonOf(el, 'pBasic')?.click();
      expect(api.checkout).toHaveBeenCalledTimes(1);
    });

    it('opens the payment step with the issued invoice on success', async () => {
      const el = await openWith(billing());

      planButtonOf(el, 'pBasic')?.click();
      checkouts[0].next(INVOICE);
      checkouts[0].complete();
      harness.detectChanges();

      expect(navigate).toHaveBeenCalledWith(
        [
          expect.stringMatching(/\/host$/),
          'nHelLt',
          'subscription',
          'pay',
          'inv9',
        ],
        { state: { invoice: INVOICE } },
      );
    });

    it('prefixes the payment step with the active language', async () => {
      const el = await openWith(billing());
      TestBed.inject(LocaleStore).apply('ur');

      try {
        planButtonOf(el, 'pBasic')?.click();
        checkouts[0].next(INVOICE);
        checkouts[0].complete();
        harness.detectChanges();

        expect(navigate).toHaveBeenCalledWith(
          ['/ur/host', 'nHelLt', 'subscription', 'pay', 'inv9'],
          { state: { invoice: INVOICE } },
        );
      } finally {
        TestBed.inject(LocaleStore).apply('en');
      }
    });

    it('replaces the server’s generic 403 text with its own permission message', async () => {
      const el = await openWith(billing());
      TestBed.inject(TranslocoService).setTranslation(
        {
          hostBilling: {
            checkoutForbidden:
              "You don't have permission to buy plans for this hostel.",
          },
        },
        'en',
      );

      planButtonOf(el, 'pBasic')?.click();
      failCheckout({
        status: 403,
        serverMessages: ['You are not authorized to access this page.'],
      });

      const alert = expectErrorOnlyIn(el, 'pBasic');
      expect(alert.textContent?.trim()).toBe(
        "You don't have permission to buy plans for this hostel.",
      );
      expect(alert.textContent).not.toContain('not authorized');
    });

    it('shows a refusal word for word and lets the host try again', async () => {
      const el = await openWith(billing());

      planButtonOf(el, 'pBasic')?.click();
      failCheckout({
        status: 422,
        serverMessages: ['This plan is not available in USD'],
      });

      const alert = expectErrorOnlyIn(el, 'pBasic');
      expect(checkoutErrorOf(el, 'pGrowth')).toBeNull();
      expect(alert.getAttribute('role')).toBe('alert');
      expect(alert.textContent?.trim()).toBe(
        'This plan is not available in USD',
      );
      expect(alert.querySelector('a')).toBeNull();
      expect(planButtonOf(el, 'pBasic')?.disabled).toBe(false);
      expect(planButtonOf(el, 'pGrowth')?.disabled).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
      expect(api.billing).toHaveBeenCalledTimes(1);
    });

    it('adds the profile link to the missing-country refusal', async () => {
      const el = await openWith(billing());

      planButtonOf(el, 'pBasic')?.click();
      failCheckout({
        status: 422,
        serverMessages: ["Set the hostel's country first"],
      });

      const alert = expectErrorOnlyIn(el, 'pBasic');
      expect(checkoutErrorOf(el, 'pGrowth')).toBeNull();
      expect(alert.textContent).toContain("Set the hostel's country first");
      expect(alert.querySelector('a')?.getAttribute('href')).toMatch(
        /\/host\/nHelLt\/profile$/,
      );
    });

    it('asks a non-owner to have the owner add the country, in the clicked card', async () => {
      const el = await openWith(billing(), [
        'core:Invoice:create',
        'core:Invoice:create_payment',
      ]);

      planButtonOf(el, 'pGrowth')?.click();
      failCheckout({
        status: 422,
        serverMessages: ["Set the hostel's country first"],
      });

      const alert = expectErrorOnlyIn(el, 'pGrowth');
      expect(checkoutErrorOf(el, 'pBasic')).toBeNull();
      expect(alert.querySelector('a')).toBeNull();
      expect(
        alert.querySelector('[data-testid="ask-owner-country"]')?.textContent,
      ).toContain('hostBilling.askOwnerCountry');
    });

    it('reloads billing when a bank transfer is already waiting for verification', async () => {
      const el = await openWith(billing());

      planButtonOf(el, 'pBasic')?.click();
      failCheckout({
        status: 422,
        serverMessages: [
          'A bank transfer for invoice HH-2026-0007 is waiting for verification',
        ],
      });

      expect(api.billing).toHaveBeenCalledTimes(2);
      loads[1].next(
        billing({ open_invoice: openInvoice({ awaiting_verification: true }) }),
      );
      harness.detectChanges();
      expect(expectErrorOnlyIn(el, 'pBasic').textContent).toContain(
        'waiting for verification',
      );
      expect(checkoutErrorOf(el, 'pGrowth')).toBeNull();
    });

    it('reloads billing when the plan is gone', async () => {
      const el = await openWith(billing());

      planButtonOf(el, 'pBasic')?.click();
      failCheckout({ status: 404 });

      expect(api.billing).toHaveBeenCalledTimes(2);
    });

    it('falls back to its own copy when the server gives no message', async () => {
      const el = await openWith(billing());

      planButtonOf(el, 'pBasic')?.click();
      failCheckout({ status: 403 });
      expect(expectErrorOnlyIn(el, 'pBasic').textContent).toContain(
        'hostBilling.checkoutForbidden',
      );

      planButtonOf(el, 'pBasic')?.click();
      failCheckout({ status: 500 }, 1);
      expect(expectErrorOnlyIn(el, 'pBasic').textContent).toContain(
        'hostBilling.checkoutFailed',
      );
    });

    it('moves the refusal to whichever card was clicked last', async () => {
      const el = await openWith(billing());

      planButtonOf(el, 'pBasic')?.click();
      failCheckout({ status: 500 });
      expectErrorOnlyIn(el, 'pBasic');

      planButtonOf(el, 'pGrowth')?.click();
      harness.detectChanges();
      expect(el.querySelector('[data-testid="checkout-error"]')).toBeNull();

      failCheckout({ status: 500 }, 1);
      expectErrorOnlyIn(el, 'pGrowth');
      expect(checkoutErrorOf(el, 'pBasic')).toBeNull();
    });
  });

  describe('replacing an unpaid invoice', () => {
    it('asks first when an unpaid invoice exists, and cancel sends nothing', async () => {
      const el = await openWith(billing({ open_invoice: openInvoice() }));

      planButtonOf(el, 'pGrowth')?.click();
      harness.detectChanges();

      const modal = el.querySelector('hh-confirm-modal');
      expect(modal?.textContent).toContain('hostBilling.replaceInvoiceTitle');
      expect(modal?.textContent).toContain('hostBilling.replaceInvoiceMessage');
      expect(api.checkout).not.toHaveBeenCalled();

      buttonByText(modal, 'common.cancel')?.click();
      harness.detectChanges();

      expect(el.querySelector('hh-confirm-modal')).toBeNull();
      expect(api.checkout).not.toHaveBeenCalled();
    });

    it('names the unpaid invoice it would replace', async () => {
      const el = await openWith(billing({ open_invoice: openInvoice() }));
      TestBed.inject(TranslocoService).setTranslation(
        {
          hostBilling: {
            replaceInvoiceMessage: 'This replaces unpaid invoice {{number}}.',
          },
        },
        'en',
      );

      planButtonOf(el, 'pGrowth')?.click();
      harness.detectChanges();

      expect(plain(el.querySelector('hh-confirm-modal')?.textContent)).toContain(
        'This replaces unpaid invoice HH-2026-0007.',
      );
    });

    it('checks out the chosen plan once confirmed', async () => {
      const el = await openWith(billing({ open_invoice: openInvoice() }));

      planButtonOf(el, 'pGrowth')?.click();
      harness.detectChanges();
      buttonByText(
        el.querySelector('hh-confirm-modal'),
        'hostBilling.replaceInvoiceConfirm',
      )?.click();
      harness.detectChanges();

      expect(el.querySelector('hh-confirm-modal')).toBeNull();
      expect(api.checkout).toHaveBeenCalledWith('nHelLt', 'pGrowth');
    });

    it('does not ask while a bank transfer for it is under review', async () => {
      const el = await openWith(
        billing({ open_invoice: openInvoice({ awaiting_verification: true }) }),
      );

      planButtonOf(el, 'pGrowth')?.click();
      harness.detectChanges();

      expect(el.querySelector('hh-confirm-modal')).toBeNull();
      expect(api.checkout).toHaveBeenCalledWith('nHelLt', 'pGrowth');
    });

    it('does not ask without an unpaid invoice', async () => {
      const el = await openWith(billing());

      planButtonOf(el, 'pGrowth')?.click();
      harness.detectChanges();

      expect(el.querySelector('hh-confirm-modal')).toBeNull();
      expect(api.checkout).toHaveBeenCalledTimes(1);
    });
  });

  describe('switching hostel', () => {
    it('loads the new hostel and drops a checkout that answers for the old one', async () => {
      const el = await openWith(billing());

      planButtonOf(el, 'pBasic')?.click();
      harness.detectChanges();
      await TestBed.inject(Router).navigateByUrl('/host/other1/subscription');
      harness.detectChanges();

      expect(api.billing).toHaveBeenLastCalledWith('other1');
      checkouts[0].next(INVOICE);
      harness.detectChanges();
      expect(navigate).not.toHaveBeenCalled();

      loads[1].next(billing());
      harness.detectChanges();
      const now = harness.routeNativeElement as HTMLElement;
      expect(planButtonOf(now, 'pBasic')?.disabled).toBe(false);
      expect(now.querySelector('[data-testid="checkout-error"]')).toBeNull();
    });
  });
});
