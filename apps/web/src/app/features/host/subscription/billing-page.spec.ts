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
import { BillingApi, HostBillingStore, HostPropertyStore } from '@services';
import { SessionStore } from '@core/auth/session-store';
import { LocaleStore } from '@core/i18n/locale-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { BillingPage } from './billing-page';
import { SafepayCheckout } from './safepay-checkout';

const ALL_PERMISSIONS = [
  'core:Invoice:create',
  'core:Invoice:create_payment',
  'host:Hostel:show',
  'core:Invoice:index',
  'core:Subscription:update',
];

// Only the keys whose parameters a test reads carry copy; the rest resolve to their key.
const COPY = {
  hostBilling: {
    upgradePayNow: 'Upgrade: pay {{amount}} now',
    renewsAtOn: 'Renews at {{price}} on {{date}}',
    payNow: 'Pay {{amount}} now',
    renewsOn: 'Renews on {{date}}',
    endsOn: 'Ends on {{date}}',
    switchesTo: 'Switches to {{plan}} on {{date}}',
    undoSwitchLabel: 'Undo the switch to {{plan}}',
    downgradeTitle: 'Switch to {{plan}} at renewal?',
    downgradeMessage:
      'You keep {{current}} until {{date}}, then switch to {{plan}}.',
    downgradeOpenRenewal:
      'Renewal invoice {{number}} is already out for {{current}}.',
    cancelMessage: 'Your plan stays active until {{date}}.',
    cancelDropsSwitch: 'Your scheduled switch to {{plan}} won’t happen.',
    cancelOpenRenewal: 'Renewal invoice {{number}} stays open.',
    renewsAutomaticallyOn: 'Renews automatically on {{date}}',
    autoChargeNotice: "We'll charge {{card}} on {{date}}. You can also pay now.",
    startTrial: 'Start {{days}}-day free trial',
    freeTrialUntil: 'Free trial until {{date}}',
    subscribeOpenInvoiceMessage:
      'Subscribing to {{plan}} doesn’t cancel unpaid invoice {{number}}.',
    cancelTrialMessage:
      'Your hostel goes offline when the trial ends on {{date}}. Nothing is charged.',
  },
};

const VISA = { label: 'Visa •••• 4242', expires_on: '2028-04-30' };

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
    trial_days: null,
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
    billed_by: 'invoice',
    safepay_status: null,
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
    auto_renew: false,
    saved_card: null,
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

const PREMIUM = {
  id: 'pPremium',
  code: 'premium',
  name: 'Premium',
  features: ['boost', 'crm'],
};

/** Downgrade targets on a Premium subscription, so the current and target plans never share a name. */
const TARGETS = { pBasic: 'Basic', pGrowth: 'Growth' } as const;

/**
 * Billing for an active Premium plan ending 3 Dec 2026, with Basic and Growth one switch away
 * and Max one upgrade away.
 */
function changeable(
  opts: {
    scheduled?: keyof typeof TARGETS | null;
    cancelling?: boolean;
    status?: BillingSubscription['status'];
  } & Partial<HostBilling> = {},
): HostBilling {
  const { scheduled = null, cancelling = false, status, ...over } = opts;
  return billing({
    subscription: subscription({
      plan: PREMIUM,
      current_period_end: '2026-12-03T10:00:00+05:00',
      scheduled_plan: scheduled
        ? { id: scheduled, code: scheduled, name: TARGETS[scheduled] }
        : null,
      cancel_at_period_end: cancelling,
      ...(status ? { status } : {}),
    }),
    features: ['listing', 'boost', 'crm'],
    plans: [
      plan({
        id: 'pBasic',
        name: 'Basic',
        action: 'downgrade',
        scheduled: scheduled === 'pBasic',
        amount_due_now: null,
      }),
      plan({
        id: 'pGrowth',
        name: 'Growth',
        price: '8000.00',
        action: 'downgrade',
        scheduled: scheduled === 'pGrowth',
        amount_due_now: null,
      }),
      plan({
        id: 'pPremium',
        name: 'Premium',
        price: '12000.00',
        action: 'current',
        amount_due_now: null,
      }),
      plan({
        id: 'pMax',
        name: 'Max',
        price: '20000.00',
        action: 'upgrade',
        amount_due_now: '6000.00',
      }),
    ],
    ...over,
  });
}

const PAST_DUE = { id: 3, name: 'Past due', slug: 'past-due', color: null };

/** Drops the Unicode isolates the page wraps amounts in, so assertions read as plain text. */
function plain(text: string | null | undefined): string {
  return (text ?? '').replace(/[⁨⁩]/g, '').replace(/\s+/g, ' ').trim();
}

describe('BillingPage', () => {
  let harness: RouterTestingHarness;
  let loads: Subject<HostBilling>[];
  let checkouts: Subject<BillingInvoice>[];
  let schedules: Subject<HostBilling>[];
  let unschedules: Subject<HostBilling>[];
  let cancels: Subject<HostBilling>[];
  let resumes: Subject<HostBilling>[];
  let cardRemovals: Subject<HostBilling>[];
  let autoRenews: Subject<HostBilling>[];
  let cardSaves: Subject<void>[];
  let subscribes: Subject<void>[];
  let api: {
    billing: ReturnType<typeof vi.fn>;
    checkout: ReturnType<typeof vi.fn>;
    scheduleDowngrade: ReturnType<typeof vi.fn>;
    unscheduleDowngrade: ReturnType<typeof vi.fn>;
    cancelSubscription: ReturnType<typeof vi.fn>;
    resumeSubscription: ReturnType<typeof vi.fn>;
    removeCard: ReturnType<typeof vi.fn>;
    setAutoRenew: ReturnType<typeof vi.fn>;
  };
  let safepay: {
    startCardSave: ReturnType<typeof vi.fn>;
    startSubscribe: ReturnType<typeof vi.fn>;
    restored$: Subject<void>;
  };
  let store: { accept: ReturnType<typeof vi.fn> };

  /** A mock call that answers only when the test pushes into the Subject it records. */
  function pending<T>(into: Subject<T>[]): ReturnType<typeof vi.fn> {
    return vi.fn(() => {
      const s = new Subject<T>();
      into.push(s);
      return s.asObservable();
    });
  }
  let navigate: ReturnType<typeof vi.spyOn>;

  async function open(
    permissions: readonly string[] = ALL_PERMISSIONS,
  ): Promise<HTMLElement> {
    loads = [];
    checkouts = [];
    schedules = [];
    unschedules = [];
    cancels = [];
    resumes = [];
    cardRemovals = [];
    autoRenews = [];
    cardSaves = [];
    subscribes = [];
    api = {
      billing: pending(loads),
      checkout: pending(checkouts),
      scheduleDowngrade: pending(schedules),
      unscheduleDowngrade: pending(unschedules),
      cancelSubscription: pending(cancels),
      resumeSubscription: pending(resumes),
      removeCard: pending(cardRemovals),
      setAutoRenew: pending(autoRenews),
    };
    safepay = {
      startCardSave: pending(cardSaves),
      startSubscribe: pending(subscribes),
      restored$: new Subject<void>(),
    };
    store = { accept: vi.fn() };
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
        { provide: SafepayCheckout, useValue: safepay },
        { provide: HostBillingStore, useValue: store },
        {
          provide: SessionStore,
          // Like the real store, no flags at all means nothing is withheld.
          useValue: {
            hasPermission: (f: string) => granted.size === 0 || granted.has(f),
          },
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

  function byTestId(root: ParentNode, id: string): HTMLElement | null {
    return root.querySelector(`[data-testid="${id}"]`);
  }

  function click(target: Element | null | undefined): void {
    (target as HTMLElement | null)?.click();
    harness.detectChanges();
  }

  function modal(el: HTMLElement): HTMLElement | null {
    return el.querySelector('hh-confirm-modal');
  }

  function modalTitle(el: HTMLElement): string {
    return plain(modal(el)?.querySelector('h2')?.textContent);
  }

  function statusText(el: HTMLElement): string {
    return plain(byTestId(el, 'plan-status')?.textContent);
  }

  function planChangeErrorOf(el: HTMLElement, planId: string): Element | null {
    return el.querySelector(
      `hh-plan-card[data-plan="${planId}"] [data-testid="plan-change-error"]`,
    );
  }

  function answer(subject: Subject<HostBilling>, data: HostBilling): void {
    subject.next(data);
    subject.complete();
    harness.detectChanges();
  }

  function refuse(
    subject: Subject<HostBilling>,
    err: { status: number; serverMessages?: string[] },
  ): void {
    subject.error({ code: 'unknown_error', message: 'x', ...err });
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

  describe('billing history link', () => {
    function historyOf(el: HTMLElement): HTMLElement | null {
      return el.querySelector('[data-testid="billing-history"]');
    }

    it('links to the history after the payment-due box and before the plans', async () => {
      const el = await openWith(billing({ open_invoice: openInvoice() }));

      const row = historyOf(el);
      expect(row?.textContent).toContain('hostBillingHistory.title');
      expect(row?.textContent).toContain('hostBillingHistory.linkHint');
      const link = row?.querySelector('a');
      expect(link?.textContent).toContain('hostBillingHistory.viewHistory');
      expect(link?.getAttribute('href')).toMatch(
        /\/host\/nHelLt\/subscription\/invoices$/,
      );
      const due = el.querySelector('hh-payment-due') as Element;
      const plans = el.querySelector('#billing-plans-title') as Element;
      const after = Node.DOCUMENT_POSITION_FOLLOWING;
      expect(due.compareDocumentPosition(row as Node) & after).toBeTruthy();
      expect((row as Node).compareDocumentPosition(plans) & after).toBeTruthy();
    });

    it('follows the current plan when no invoice is due', async () => {
      const el = await openWith(billing());

      const plan = el.querySelector('hh-current-plan-card') as Element;
      expect(
        plan.compareDocumentPosition(historyOf(el) as Node) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('is hidden for someone without invoice access', async () => {
      const el = await openWith(billing(), [
        'core:Invoice:create',
        'host:Hostel:show',
      ]);

      expect(historyOf(el)).toBeNull();
    });

    it('is shown when the session carries no permission flags', async () => {
      const el = await openWith(billing(), []);

      expect(historyOf(el)).not.toBeNull();
    });

    it('is not shown while loading', async () => {
      const el = await open();

      expect(historyOf(el)).toBeNull();
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
      ['pDown', 'hostBilling.switchAtRenewal', false],
      ['pSched', 'hostBilling.scheduled', true],
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

    it('offers a downgrade with no hint, and no Contact link anywhere', async () => {
      const el = await openWith(
        billing({ subscription: subscription(), plans }),
      );

      expect(field(el, 'pDown', 'hint')).toBeNull();
      expect(el.querySelector('a[href$="/contact"]')).toBeNull();
    });

    it('explains a downgrade held back by a cancellation in plain text, with no link', async () => {
      const el = await openWith(
        billing({
          subscription: subscription({ cancel_at_period_end: true }),
          plans,
        }),
      );

      const hint = field(el, 'pDown', 'hint');
      expect(hint?.textContent?.trim()).toBe('hostBilling.resumeToSwitch');
      expect(hint?.querySelector('a')).toBeNull();
      expect(planButtonOf(el, 'pDown')?.disabled).toBe(true);
    });

    it('shows a scheduled downgrade as a disabled Scheduled button with Undo under it, and no badge', async () => {
      const el = await openWith(
        billing({ subscription: subscription(), plans }),
      );

      const card = el.querySelector('hh-plan-card[data-plan="pSched"]');
      expect(card?.querySelector('hh-status-pill')).toBeNull();
      const buttons = Array.from(card?.querySelectorAll('button') ?? []);
      expect(buttons).toHaveLength(2);
      expect(buttons[0].textContent).toContain('hostBilling.scheduled');
      expect(buttons[0].disabled).toBe(true);
      expect(buttons[1]).toBe(byTestId(card as Element, 'plan-undo'));
      expect(buttons[1].textContent?.trim()).toBe('hostBilling.undo');
      expect(buttons[1].disabled).toBe(false);
      expect(el.querySelectorAll('[data-testid="plan-undo"]')).toHaveLength(1);
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

      expect(
        plain(el.querySelector('hh-confirm-modal')?.textContent),
      ).toContain('This replaces unpaid invoice HH-2026-0007.');
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

  describe('scheduling a downgrade', () => {
    it('asks first, naming both plans and the period end, and dismissing sends nothing', async () => {
      const el = await openWith(changeable());

      click(planButtonOf(el, 'pGrowth'));

      expect(el.querySelectorAll('hh-confirm-modal')).toHaveLength(1);
      expect(modalTitle(el)).toBe('Switch to Growth at renewal?');
      expect(plain(byTestId(el, 'downgrade-message')?.textContent)).toBe(
        'You keep Premium until 3 Dec 2026, then switch to Growth.',
      );
      expect(byTestId(el, 'downgrade-open-renewal')).toBeNull();
      expect(
        buttonByText(modal(el), 'hostBilling.downgradeConfirm'),
      ).toBeDefined();

      click(buttonByText(modal(el), 'common.cancel'));
      expect(modal(el)).toBeNull();

      click(planButtonOf(el, 'pBasic'));
      expect(modalTitle(el)).toBe('Switch to Basic at renewal?');
      click(modal(el)?.querySelector('button[aria-label="a11y.close"]'));
      expect(modal(el)).toBeNull();

      expect(api.scheduleDowngrade).not.toHaveBeenCalled();
      expect(planButtonOf(el, 'pGrowth')?.disabled).toBe(false);
    });

    it('never asks about the unpaid invoice, which a switch leaves alone', async () => {
      const el = await openWith(changeable({ open_invoice: openInvoice() }));

      click(planButtonOf(el, 'pGrowth'));

      expect(el.querySelectorAll('hh-confirm-modal')).toHaveLength(1);
      expect(modalTitle(el)).toBe('Switch to Growth at renewal?');
      expect(byTestId(el, 'downgrade-open-renewal')).toBeNull();
    });

    it('warns that an open renewal invoice still bills the current plan', async () => {
      const el = await openWith(
        changeable({
          open_invoice: openInvoice({
            kind: 'renewal',
            number: 'HH-2026-0042',
          }),
        }),
      );

      click(planButtonOf(el, 'pGrowth'));

      expect(plain(byTestId(el, 'downgrade-open-renewal')?.textContent)).toBe(
        'Renewal invoice HH-2026-0042 is already out for Premium.',
      );
    });

    it('schedules the plan as returned once confirmed, spinning its button and locking the rest', async () => {
      const el = await openWith(changeable());

      click(planButtonOf(el, 'pGrowth'));
      click(buttonByText(modal(el), 'hostBilling.downgradeConfirm'));

      expect(modal(el)).toBeNull();
      expect(api.scheduleDowngrade).toHaveBeenCalledTimes(1);
      expect(api.scheduleDowngrade).toHaveBeenCalledWith('nHelLt', 'pGrowth');
      expect(planButtonOf(el, 'pGrowth')?.getAttribute('aria-busy')).toBe(
        'true',
      );
      expect(planButtonOf(el, 'pBasic')?.getAttribute('aria-busy')).toBeNull();
      for (const id of ['pBasic', 'pGrowth', 'pMax']) {
        expect(planButtonOf(el, id)?.disabled).toBe(true);
      }
      expect((byTestId(el, 'card-cancel') as HTMLButtonElement).disabled).toBe(
        true,
      );
    });

    it('renders the scheduled switch from the answer alone, with no second load', async () => {
      const el = await openWith(changeable());

      click(planButtonOf(el, 'pGrowth'));
      click(buttonByText(modal(el), 'hostBilling.downgradeConfirm'));
      answer(
        schedules[0],
        changeable({ scheduled: 'pGrowth', features: ['listing'] }),
      );

      expect(api.billing).toHaveBeenCalledTimes(1);
      expect(statusText(el)).toContain('Switches to Growth on 3 Dec 2026');
      expect(byTestId(el, 'card-undo')?.getAttribute('aria-label')).toBe(
        'Undo the switch to Growth',
      );
      const growth = planButtonOf(el, 'pGrowth');
      expect(growth?.textContent).toContain('hostBilling.scheduled');
      expect(growth?.disabled).toBe(true);
      expect(growth?.getAttribute('aria-busy')).toBeNull();
      expect(
        el
          .querySelector(
            'hh-plan-card[data-plan="pGrowth"] [data-testid="plan-undo"]',
          )
          ?.getAttribute('aria-label'),
      ).toBe('Undo the switch to Growth');
      expect(planButtonOf(el, 'pBasic')?.textContent).toContain(
        'hostBilling.switchAtRenewal',
      );
      expect(planButtonOf(el, 'pBasic')?.disabled).toBe(false);
      expect(planButtonOf(el, 'pMax')?.disabled).toBe(false);
      // The whole summary is replaced, so the features come from the answer too.
      const listed = Array.from(
        el.querySelectorAll('hh-current-plan-card li'),
      ).map((li) => li.textContent?.trim());
      expect(listed).toEqual(['sharedBilling.featureListing']);
    });
  });

  describe('undoing a switch', () => {
    it.each([
      ['the current plan card', 'card'],
      ['the scheduled plan card', 'plan'],
    ] as const)(
      'undoes from %s without asking, and renders the answer',
      async (_, origin) => {
        const el = await openWith(changeable({ scheduled: 'pGrowth' }));
        const onCard = byTestId(el, 'card-undo') as HTMLButtonElement;
        const onPlan = byTestId(el, 'plan-undo') as HTMLButtonElement;
        const [clicked, other] =
          origin === 'card' ? [onCard, onPlan] : [onPlan, onCard];

        click(clicked);

        expect(modal(el)).toBeNull();
        expect(api.unscheduleDowngrade).toHaveBeenCalledTimes(1);
        expect(api.unscheduleDowngrade).toHaveBeenCalledWith('nHelLt');
        expect(clicked.getAttribute('aria-busy')).toBe('true');
        expect(other.getAttribute('aria-busy')).toBeNull();
        expect(other.disabled).toBe(true);

        answer(unschedules[0], changeable());

        expect(api.billing).toHaveBeenCalledTimes(1);
        expect(statusText(el)).toBe('Renews on 3 Dec 2026');
        expect(byTestId(el, 'card-undo')).toBeNull();
        expect(byTestId(el, 'plan-undo')).toBeNull();
        expect(planButtonOf(el, 'pGrowth')?.textContent).toContain(
          'hostBilling.switchAtRenewal',
        );
        expect(planButtonOf(el, 'pGrowth')?.disabled).toBe(false);
      },
    );
  });

  describe('cancelling and resuming', () => {
    it('asks first with Keep my plan as the way out, and keeping it sends nothing', async () => {
      const el = await openWith(changeable());

      click(byTestId(el, 'card-cancel'));

      expect(modalTitle(el)).toBe('hostBilling.cancelTitle');
      expect(plain(byTestId(el, 'cancel-message')?.textContent)).toBe(
        'Your plan stays active until 3 Dec 2026.',
      );
      expect(byTestId(el, 'cancel-drops-switch')).toBeNull();
      expect(byTestId(el, 'cancel-open-renewal')).toBeNull();
      const labels = Array.from(modal(el)?.querySelectorAll('button') ?? [])
        .map((b) => b.textContent?.trim())
        .filter(Boolean);
      expect(labels).toEqual([
        'hostBilling.keepPlan',
        'hostBilling.cancelPlan',
      ]);
      expect(
        buttonByText(modal(el), 'hostBilling.cancelPlan')?.className,
      ).toContain('bg-danger');
      expect(modal(el)?.querySelector('.ti-alert-triangle')).not.toBeNull();

      click(buttonByText(modal(el), 'hostBilling.keepPlan'));

      expect(modal(el)).toBeNull();
      expect(api.cancelSubscription).not.toHaveBeenCalled();
      expect(byTestId(el, 'card-cancel')).not.toBeNull();
    });

    it('says a scheduled switch will not happen and an open renewal stays open', async () => {
      const el = await openWith(
        changeable({
          scheduled: 'pBasic',
          open_invoice: openInvoice({
            kind: 'renewal',
            number: 'HH-2026-0042',
          }),
        }),
      );

      click(byTestId(el, 'card-cancel'));

      expect(plain(byTestId(el, 'cancel-drops-switch')?.textContent)).toBe(
        'Your scheduled switch to Basic won’t happen.',
      );
      expect(plain(byTestId(el, 'cancel-open-renewal')?.textContent)).toBe(
        'Renewal invoice HH-2026-0042 stays open.',
      );
    });

    it('cancels once confirmed and renders Ends on with Resume plan from the answer', async () => {
      const el = await openWith(changeable({ scheduled: 'pGrowth' }));
      expect(field(el, 'pMax', 'subline')).not.toBeNull();

      click(byTestId(el, 'card-cancel'));
      click(buttonByText(modal(el), 'hostBilling.cancelPlan'));

      expect(modal(el)).toBeNull();
      expect(api.cancelSubscription).toHaveBeenCalledTimes(1);
      expect(api.cancelSubscription).toHaveBeenCalledWith('nHelLt');
      expect(byTestId(el, 'card-cancel')?.getAttribute('aria-busy')).toBe(
        'true',
      );

      answer(
        cancels[0],
        changeable({ scheduled: 'pGrowth', cancelling: true }),
      );

      expect(api.billing).toHaveBeenCalledTimes(1);
      expect(statusText(el)).toBe('Ends on 3 Dec 2026 hostBilling.resumePlan');
      expect(byTestId(el, 'card-cancel')).toBeNull();
      expect(byTestId(el, 'card-undo')).toBeNull();
      expect(byTestId(el, 'plan-undo')).toBeNull();
      for (const id of ['pBasic', 'pGrowth']) {
        expect(planButtonOf(el, id)?.textContent).toContain(
          'hostBilling.switchAtRenewal',
        );
        expect(planButtonOf(el, id)?.disabled).toBe(true);
        expect(field(el, id, 'hint')?.textContent?.trim()).toBe(
          'hostBilling.resumeToSwitch',
        );
      }
      expect(field(el, 'pMax', 'subline')).toBeNull();
    });

    it('resumes without asking and renders Renews on again', async () => {
      const el = await openWith(changeable({ cancelling: true }));

      click(byTestId(el, 'card-resume'));

      expect(modal(el)).toBeNull();
      expect(api.resumeSubscription).toHaveBeenCalledTimes(1);
      expect(api.resumeSubscription).toHaveBeenCalledWith('nHelLt');
      expect(byTestId(el, 'card-resume')?.getAttribute('aria-busy')).toBe(
        'true',
      );

      answer(resumes[0], changeable());

      expect(api.billing).toHaveBeenCalledTimes(1);
      expect(statusText(el)).toBe('Renews on 3 Dec 2026');
      expect(byTestId(el, 'card-resume')).toBeNull();
      expect(byTestId(el, 'card-cancel')).not.toBeNull();
      expect(planButtonOf(el, 'pGrowth')?.disabled).toBe(false);
    });

    it('shows the open invoice from the answer in the payment-due box', async () => {
      const el = await openWith(
        changeable({
          open_invoice: openInvoice({
            id: 'invOld',
            kind: 'renewal',
            total: '12000.00',
          }),
        }),
      );
      const hrefs = (): (string | null)[] =>
        Array.from(el.querySelectorAll('hh-payment-due a')).map((a) =>
          a.getAttribute('href'),
        );
      expect(plain(el.querySelector('hh-payment-due')?.textContent)).toContain(
        'PKR 12,000',
      );
      expect(hrefs().some((h) => h?.endsWith('/pay/invOld'))).toBe(true);

      click(byTestId(el, 'card-cancel'));
      click(buttonByText(modal(el), 'hostBilling.cancelPlan'));
      answer(
        cancels[0],
        changeable({
          cancelling: true,
          open_invoice: openInvoice({
            id: 'invNew',
            kind: 'renewal',
            total: '7500.00',
          }),
        }),
      );

      expect(api.billing).toHaveBeenCalledTimes(1);
      const due = plain(el.querySelector('hh-payment-due')?.textContent);
      expect(due).toContain('PKR 7,500');
      expect(due).not.toContain('PKR 12,000');
      expect(hrefs().some((h) => h?.endsWith('/pay/invNew'))).toBe(true);
      expect(hrefs().some((h) => h?.endsWith('/pay/invOld'))).toBe(false);
    });
  });

  describe('plan change errors', () => {
    function scheduleGrowth(el: HTMLElement): void {
      click(planButtonOf(el, 'pGrowth'));
      click(buttonByText(modal(el), 'hostBilling.downgradeConfirm'));
    }

    function cancelPlan(el: HTMLElement): void {
      click(byTestId(el, 'card-cancel'));
      click(buttonByText(modal(el), 'hostBilling.cancelPlan'));
    }

    it('shows a refused switch word for word under that plan, refreshes, and keeps it after the refresh', async () => {
      const el = await openWith(changeable());

      scheduleGrowth(el);
      refuse(schedules[0], {
        status: 422,
        serverMessages: [
          'Only a cheaper plan can be scheduled; upgrade through checkout',
        ],
      });

      expect(modal(el)).toBeNull();
      expect(api.billing).toHaveBeenCalledTimes(2);
      loads[1].next(changeable({ features: ['listing'] }));
      harness.detectChanges();

      expect(el.querySelectorAll('hh-current-plan-card li')).toHaveLength(1);
      const alerts = el.querySelectorAll('[role="alert"]');
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toBe(planChangeErrorOf(el, 'pGrowth'));
      expect(alerts[0].textContent?.trim()).toBe(
        'Only a cheaper plan can be scheduled; upgrade through checkout',
      );
      expect(planButtonOf(el, 'pGrowth')?.disabled).toBe(false);
    });

    it('refreshes after a 404 from the card and keeps the message once the plan is no longer active', async () => {
      const el = await openWith(changeable({ scheduled: 'pGrowth' }));

      click(byTestId(el, 'card-undo'));
      refuse(unschedules[0], {
        status: 404,
        serverMessages: ['Requested resource not found.'],
      });

      expect(api.billing).toHaveBeenCalledTimes(2);
      loads[1].next(changeable({ scheduled: 'pGrowth', status: PAST_DUE }));
      harness.detectChanges();

      expect(byTestId(el, 'card-undo')).toBeNull();
      const alert = byTestId(el, 'card-change-error');
      expect(alert?.closest('hh-current-plan-card')).not.toBeNull();
      expect(alert?.getAttribute('role')).toBe('alert');
      expect(alert?.textContent?.trim()).toBe('Requested resource not found.');
      expect(el.querySelector('[data-testid="plan-change-error"]')).toBeNull();
    });

    it.each([422, 404])(
      'falls back to its own words and still refreshes on a %i with no message',
      async (status) => {
        const el = await openWith(changeable());

        cancelPlan(el);
        refuse(cancels[0], { status });

        expect(api.billing).toHaveBeenCalledTimes(2);
        loads[1].next(changeable({ cancelling: true }));
        harness.detectChanges();

        const alerts = el.querySelectorAll('[role="alert"]');
        expect(alerts).toHaveLength(1);
        expect(alerts[0]).toBe(byTestId(el, 'card-change-error'));
        expect(alerts[0].textContent?.trim()).toBe('hostBilling.cancelFailed');
        expect(statusText(el)).toContain('Ends on 3 Dec 2026');
      },
    );

    it('shows a cancel refused for having no active subscription word for word, refreshes, and keeps it after the refresh', async () => {
      const el = await openWith(changeable());

      cancelPlan(el);
      refuse(cancels[0], {
        status: 422,
        serverMessages: ['There is no active subscription'],
      });

      expect(api.billing).toHaveBeenCalledTimes(2);
      loads[1].next(changeable({ status: PAST_DUE }));
      harness.detectChanges();

      const alert = byTestId(el, 'card-change-error');
      expect(alert?.closest('hh-current-plan-card')).not.toBeNull();
      expect(alert?.getAttribute('role')).toBe('alert');
      expect(alert?.textContent?.trim()).toBe(
        'There is no active subscription',
      );
      expect(byTestId(el, 'card-cancel')).toBeNull();
    });

    it('shows its own words for a 403, never the server’s, and does not refresh', async () => {
      const el = await openWith(changeable());

      cancelPlan(el);
      refuse(cancels[0], {
        status: 403,
        serverMessages: ['You are not authorized to access this page.'],
      });

      expect(byTestId(el, 'card-change-error')?.textContent?.trim()).toBe(
        'hostBilling.planChangeForbidden',
      );
      expect(api.billing).toHaveBeenCalledTimes(1);
      const cancel = byTestId(el, 'card-cancel') as HTMLButtonElement;
      expect(cancel.getAttribute('aria-busy')).toBeNull();
      expect(cancel.disabled).toBe(false);
    });

    it.each([
      [
        'a switch',
        () => changeable(),
        scheduleGrowth,
        (i: number) => schedules[i],
        'hostBilling.scheduleFailed',
        'pGrowth',
      ],
      [
        'an Undo on the plan',
        () => changeable({ scheduled: 'pGrowth' }),
        (el: HTMLElement) => click(byTestId(el, 'plan-undo')),
        (i: number) => unschedules[i],
        'hostBilling.undoFailed',
        'pGrowth',
      ],
      [
        'an Undo on the current plan',
        () => changeable({ scheduled: 'pGrowth' }),
        (el: HTMLElement) => click(byTestId(el, 'card-undo')),
        (i: number) => unschedules[i],
        'hostBilling.undoFailed',
        null,
      ],
      [
        'a cancellation',
        () => changeable(),
        cancelPlan,
        (i: number) => cancels[i],
        'hostBilling.cancelFailed',
        null,
      ],
      [
        'a resume',
        () => changeable({ cancelling: true }),
        (el: HTMLElement) => click(byTestId(el, 'card-resume')),
        (i: number) => resumes[i],
        'hostBilling.resumeFailed',
        null,
      ],
    ] as const)(
      'falls back to its own words when %s fails with no usable message',
      async (_, data, start, call, key, planId) => {
        const el = await openWith(data());
        const failures = [
          { status: 0 },
          { status: 500, serverMessages: ['Internal server error'] },
        ];

        for (const [i, err] of failures.entries()) {
          start(el);
          refuse(call(i), err);

          const alerts = el.querySelectorAll('[role="alert"]');
          expect(alerts).toHaveLength(1);
          expect(alerts[0]).toBe(
            planId
              ? planChangeErrorOf(el, planId)
              : byTestId(el, 'card-change-error'),
          );
          expect(alerts[0].textContent?.trim()).toBe(key);
        }
        expect(api.billing).toHaveBeenCalledTimes(1);
      },
    );

    it('clears a plan-change refusal when the next action starts', async () => {
      const el = await openWith(changeable());

      scheduleGrowth(el);
      refuse(schedules[0], { status: 500 });
      expect(planChangeErrorOf(el, 'pGrowth')).not.toBeNull();

      cancelPlan(el);
      expect(el.querySelector('[role="alert"]')).toBeNull();
    });

    it('clears a checkout refusal on a plan change, and a plan-change refusal on a checkout', async () => {
      const el = await openWith(changeable());

      click(planButtonOf(el, 'pMax'));
      failCheckout({ status: 500 });
      expect(checkoutErrorOf(el, 'pMax')).not.toBeNull();

      scheduleGrowth(el);
      expect(checkoutErrorOf(el, 'pMax')).toBeNull();
      refuse(schedules[0], { status: 500 });
      expect(planChangeErrorOf(el, 'pGrowth')).not.toBeNull();

      click(planButtonOf(el, 'pMax'));
      expect(planChangeErrorOf(el, 'pGrowth')).toBeNull();
      expect(api.checkout).toHaveBeenCalledTimes(2);
    });
  });

  describe('one billing action at a time', () => {
    function disabled(el: HTMLElement, testId: string): boolean | undefined {
      return (byTestId(el, testId) as HTMLButtonElement | null)?.disabled;
    }

    it('locks every checkout and plan change while a plan change is in flight', async () => {
      const el = await openWith(changeable({ scheduled: 'pBasic' }));

      click(byTestId(el, 'card-cancel'));
      click(buttonByText(modal(el), 'hostBilling.cancelPlan'));

      expect(planButtonOf(el, 'pGrowth')?.disabled).toBe(true);
      expect(planButtonOf(el, 'pMax')?.disabled).toBe(true);
      for (const id of ['card-undo', 'plan-undo', 'card-cancel']) {
        expect(disabled(el, id)).toBe(true);
      }

      answer(cancels[0], changeable({ scheduled: 'pBasic' }));

      expect(planButtonOf(el, 'pGrowth')?.disabled).toBe(false);
      expect(planButtonOf(el, 'pMax')?.disabled).toBe(false);
      for (const id of ['card-undo', 'plan-undo', 'card-cancel']) {
        expect(disabled(el, id)).toBe(false);
      }
    });

    it('locks every plan change while a checkout is in flight', async () => {
      const el = await openWith(changeable({ scheduled: 'pBasic' }));

      click(planButtonOf(el, 'pMax'));

      expect(api.checkout).toHaveBeenCalledWith('nHelLt', 'pMax');
      expect(planButtonOf(el, 'pGrowth')?.disabled).toBe(true);
      for (const id of ['card-undo', 'plan-undo', 'card-cancel']) {
        expect(disabled(el, id)).toBe(true);
      }
      click(planButtonOf(el, 'pGrowth'));
      click(byTestId(el, 'card-cancel'));
      expect(modal(el)).toBeNull();
      expect(api.scheduleDowngrade).not.toHaveBeenCalled();
      expect(api.unscheduleDowngrade).not.toHaveBeenCalled();
      expect(api.cancelSubscription).not.toHaveBeenCalled();
    });

    it('does not send a replacing checkout confirmed after a plan change started', async () => {
      const el = await openWith(
        changeable({ scheduled: 'pGrowth', open_invoice: openInvoice() }),
      );

      click(planButtonOf(el, 'pMax'));
      expect(modalTitle(el)).toBe('hostBilling.replaceInvoiceTitle');
      // The Undo behind the open dialog, reached without the dialog closing first.
      byTestId(el, 'card-undo')?.click();
      click(buttonByText(modal(el), 'hostBilling.replaceInvoiceConfirm'));

      expect(api.unscheduleDowngrade).toHaveBeenCalledTimes(1);
      expect(api.checkout).not.toHaveBeenCalled();
      expect(modal(el)).toBeNull();
    });

    it('sends one request for a double click before the page re-renders', async () => {
      const el = await openWith(changeable({ scheduled: 'pGrowth' }));

      // No change detection between the clicks, so only the page's own guard stops the second.
      const undo = byTestId(el, 'card-undo');
      undo?.click();
      undo?.click();
      expect(api.unscheduleDowngrade).toHaveBeenCalledTimes(1);
      answer(unschedules[0], changeable());

      click(planButtonOf(el, 'pGrowth'));
      const confirm = buttonByText(modal(el), 'hostBilling.downgradeConfirm');
      confirm?.click();
      confirm?.click();
      harness.detectChanges();
      expect(api.scheduleDowngrade).toHaveBeenCalledTimes(1);
    });
  });

  describe('plan change permission', () => {
    const WITHOUT_UPDATE = ALL_PERMISSIONS.filter(
      (p) => p !== 'core:Subscription:update',
    );

    it('hides Undo and Cancel plan, disables switching and says only the owner can', async () => {
      const el = await openWith(
        changeable({ scheduled: 'pGrowth' }),
        WITHOUT_UPDATE,
      );

      expect(byTestId(el, 'card-undo')).toBeNull();
      expect(byTestId(el, 'plan-undo')).toBeNull();
      expect(byTestId(el, 'card-cancel')).toBeNull();
      expect(statusText(el)).toBe(
        'Renews on 3 Dec 2026 Switches to Growth on 3 Dec 2026',
      );
      expect(planButtonOf(el, 'pGrowth')?.textContent).toContain(
        'hostBilling.scheduled',
      );
      expect(planButtonOf(el, 'pBasic')?.disabled).toBe(true);
      expect(planButtonOf(el, 'pMax')?.disabled).toBe(false);
      expect(byTestId(el, 'owner-only')?.textContent).toContain(
        'hostBilling.ownerOnly',
      );
    });

    it('hides Resume plan', async () => {
      const el = await openWith(
        changeable({ cancelling: true }),
        WITHOUT_UPDATE,
      );

      expect(statusText(el)).toBe('Ends on 3 Dec 2026');
      expect(byTestId(el, 'card-resume')).toBeNull();
    });

    it('offers every control when the session carries no flags, and a 403 then gets its own words', async () => {
      const el = await openWith(changeable({ scheduled: 'pGrowth' }), []);

      expect(byTestId(el, 'card-undo')).not.toBeNull();
      expect(byTestId(el, 'card-cancel')).not.toBeNull();
      expect(byTestId(el, 'owner-only')).toBeNull();

      click(byTestId(el, 'plan-undo'));
      refuse(unschedules[0], {
        status: 403,
        serverMessages: ['You are not authorized to access this page.'],
      });

      expect(planChangeErrorOf(el, 'pGrowth')?.textContent?.trim()).toBe(
        'hostBilling.planChangeForbidden',
      );
    });
  });

  describe('saved card', () => {
    /** An active Premium plan ending 3 Dec 2026, renewing on a saved Visa. */
    function withCard(
      opts: Parameters<typeof changeable>[0] = {},
    ): HostBilling {
      return changeable({ saved_card: VISA, auto_renew: true, ...opts });
    }

    const block = (el: HTMLElement) => el.querySelector('hh-saved-card');
    const switchOf = (el: HTMLElement) =>
      el.querySelector<HTMLButtonElement>(
        'hh-saved-card button[role="switch"]',
      );
    const disabled = (el: HTMLElement, testId: string) =>
      (byTestId(el, testId) as HTMLButtonElement | null)?.disabled;
    const cardError = (el: HTMLElement) =>
      byTestId(el, 'saved-card-error')?.textContent?.trim();

    describe('where it shows', () => {
      it('is not shown without a subscription', async () => {
        const el = await openWith(billing());

        expect(block(el)).toBeNull();
      });

      it('is shown for an invoice-billed plan, with the id the banners link to', async () => {
        const el = await openWith(withCard());

        expect(block(el)?.id).toBe('saved-card');
        expect(
          block(el)?.querySelector('[data-field="label"]')?.textContent?.trim(),
        ).toBe('Visa •••• 4242');
      });

      describe('a link to #saved-card', () => {
        let scrolled: HTMLElement[];

        beforeEach(() => {
          scrolled = [];
          // jsdom has no scrollIntoView; record which element was asked to scroll.
          HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
            scrolled.push(this);
          };
        });

        afterEach(() => {
          delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
        });

        it('scrolls the block into view once it renders', async () => {
          const el = await openWith(withCard());
          expect(scrolled).toEqual([]);

          await TestBed.inject(Router).navigateByUrl(
            '/host/nHelLt/subscription#saved-card',
          );
          harness.detectChanges();

          expect(scrolled).toEqual([block(el)]);
        });

        it('does not scroll again when a reload renders the block anew', async () => {
          const el = await openWith(withCard({ auto_renew: false }));
          await TestBed.inject(Router).navigateByUrl(
            '/host/nHelLt/subscription#saved-card',
          );
          harness.detectChanges();
          const first = block(el);

          // A refused change reloads billing, which renders a new block.
          click(switchOf(el));
          refuse(autoRenews[0], {
            status: 422,
            serverMessages: ['Save a card first to turn on automatic renewal'],
          });
          loads[1].next(withCard({ auto_renew: false }));
          harness.detectChanges();

          expect(block(el)).not.toBe(first);
          expect(scrolled).toEqual([first]);
        });
      });

      it('is not shown for a live plan Safepay bills', async () => {
        const el = await openWith(
          billing({
            subscription: subscription({ billed_by: 'safepay_subscription' }),
          }),
        );

        expect(block(el)).toBeNull();
      });

      it('is shown once a Safepay-billed plan is no longer live', async () => {
        const el = await openWith(
          billing({
            subscription: subscription({
              billed_by: 'safepay_subscription',
              status: { id: 5, name: 'Expired', slug: 'expired', color: null },
            }),
          }),
        );

        expect(block(el)).not.toBeNull();
        expect(switchOf(el)).toBeNull();
      });

      it('offers Save a card on a plan that is not live, without the switch', async () => {
        const el = await openWith(
          billing({
            subscription: subscription({
              status: {
                id: 2,
                name: 'Incomplete',
                slug: 'incomplete',
                color: null,
              },
            }),
          }),
        );

        expect(byTestId(el, 'card-save')?.textContent?.trim()).toBe(
          'hostBilling.saveCard',
        );
        expect(switchOf(el)).toBeNull();
      });

      it('offers the switch on a past-due plan', async () => {
        const el = await openWith(withCard({ status: PAST_DUE }));

        expect(switchOf(el)).not.toBeNull();
      });
    });

    describe('current-plan renewal line', () => {
      it('says the plan renews automatically when the server has auto-renew on', async () => {
        const el = await openWith(withCard({ auto_renew: true }));

        expect(statusText(el)).toBe('Renews automatically on 3 Dec 2026');
      });

      it('keeps the plain renewal line when auto-renew is off, even with a card saved', async () => {
        const el = await openWith(withCard({ auto_renew: false }));

        expect(statusText(el)).toBe('Renews on 3 Dec 2026');
      });
    });

    describe('auto-renew switch', () => {
      it('shows the server’s value, never one inferred from the card', async () => {
        const el = await openWith(withCard({ auto_renew: false }));

        expect(switchOf(el)?.getAttribute('aria-checked')).toBe('false');
      });

      it('sends the change, locks every other action, and applies the answer', async () => {
        const el = await openWith(withCard({ auto_renew: false }));

        click(switchOf(el));

        expect(api.setAutoRenew).toHaveBeenCalledTimes(1);
        expect(api.setAutoRenew).toHaveBeenCalledWith('nHelLt', true);
        expect(
          byTestId(el, 'auto-renew')?.getAttribute('aria-busy'),
        ).toBe('true');
        expect(switchOf(el)?.disabled).toBe(true);
        expect(disabled(el, 'card-cancel')).toBe(true);
        expect(disabled(el, 'card-save')).toBe(true);
        expect(disabled(el, 'card-remove')).toBe(true);
        expect(planButtonOf(el, 'pMax')?.disabled).toBe(true);

        const answered = withCard({ auto_renew: true });
        answer(autoRenews[0], answered);

        expect(api.billing).toHaveBeenCalledTimes(1);
        expect(switchOf(el)?.getAttribute('aria-checked')).toBe('true');
        expect(switchOf(el)?.disabled).toBe(false);
        expect(statusText(el)).toBe('Renews automatically on 3 Dec 2026');
        expect(store.accept).toHaveBeenLastCalledWith('nHelLt', answered);
      });

      it('turns renewal off', async () => {
        const el = await openWith(withCard());
        expect(statusText(el)).toBe('Renews automatically on 3 Dec 2026');

        click(switchOf(el));
        expect(api.setAutoRenew).toHaveBeenCalledWith('nHelLt', false);
        answer(autoRenews[0], withCard({ auto_renew: false }));

        expect(switchOf(el)?.getAttribute('aria-checked')).toBe('false');
        expect(statusText(el)).toBe('Renews on 3 Dec 2026');
      });

      it('shows what the server decided, even when it differs from the click', async () => {
        const el = await openWith(withCard({ auto_renew: false }));

        click(switchOf(el));
        answer(autoRenews[0], withCard({ auto_renew: false }));

        expect(switchOf(el)?.getAttribute('aria-checked')).toBe('false');
      });

      it('puts the switch back and says so in the block when the change fails', async () => {
        const el = await openWith(withCard({ auto_renew: false }));

        click(switchOf(el));
        expect(switchOf(el)?.getAttribute('aria-checked')).toBe('true');
        refuse(autoRenews[0], { status: 500 });

        expect(switchOf(el)?.getAttribute('aria-checked')).toBe('false');
        expect(switchOf(el)?.disabled).toBe(false);
        expect(cardError(el)).toBe('hostBilling.autoRenewFailed');
        expect(byTestId(el, 'card-change-error')).toBeNull();
        expect(api.billing).toHaveBeenCalledTimes(1);
      });

      it('shows a 422 word for word, reloads, and keeps the switch at the reloaded value', async () => {
        const el = await openWith(withCard({ auto_renew: false }));

        click(switchOf(el));
        refuse(autoRenews[0], {
          status: 422,
          serverMessages: ['Save a card first to turn on automatic renewal'],
        });

        expect(api.billing).toHaveBeenCalledTimes(2);
        loads[1].next(withCard({ auto_renew: false }));
        harness.detectChanges();

        expect(cardError(el)).toBe(
          'Save a card first to turn on automatic renewal',
        );
        expect(switchOf(el)?.getAttribute('aria-checked')).toBe('false');
      });

      it('shows its own words for a 403, never the server’s', async () => {
        const el = await openWith(withCard({ auto_renew: false }));

        click(switchOf(el));
        refuse(autoRenews[0], {
          status: 403,
          serverMessages: ['You are not authorized to access this page.'],
        });

        expect(cardError(el)).toBe('hostBilling.planChangeForbidden');
        expect(switchOf(el)?.getAttribute('aria-checked')).toBe('false');
      });

      it('is off and disabled while the plan is cancelling, with the hint to resume', async () => {
        const el = await openWith(
          withCard({ cancelling: true, auto_renew: false }),
        );

        expect(switchOf(el)?.getAttribute('aria-checked')).toBe('false');
        expect(switchOf(el)?.disabled).toBe(true);
        expect(
          el
            .querySelector('hh-saved-card [data-field="auto-renew-hint"]')
            ?.textContent?.trim(),
        ).toBe('hostBilling.autoRenewResumeHint');

        click(switchOf(el));
        expect(api.setAutoRenew).not.toHaveBeenCalled();
      });

      it('is not sent while a plan change is in flight', async () => {
        const el = await openWith(withCard());

        click(byTestId(el, 'card-cancel'));
        click(buttonByText(modal(el), 'hostBilling.cancelPlan'));

        expect(switchOf(el)?.disabled).toBe(true);
        click(switchOf(el));
        expect(api.setAutoRenew).not.toHaveBeenCalled();
      });
    });

    describe('removing the card', () => {
      it('asks first, and keeping the card sends nothing', async () => {
        const el = await openWith(withCard());

        click(byTestId(el, 'card-remove'));

        expect(modalTitle(el)).toBe('hostBilling.removeCardTitle');
        expect(byTestId(el, 'remove-card-message')?.textContent?.trim()).toBe(
          'hostBilling.removeCardMessage',
        );
        expect(
          buttonByText(modal(el), 'hostBilling.removeCard')?.className,
        ).toContain('bg-danger');

        click(buttonByText(modal(el), 'hostBilling.keepCard'));

        expect(modal(el)).toBeNull();
        expect(api.removeCard).not.toHaveBeenCalled();
      });

      it('removes it once confirmed and renders the answer with no second load', async () => {
        const el = await openWith(withCard());

        click(byTestId(el, 'card-remove'));
        click(buttonByText(modal(el), 'hostBilling.removeCard'));

        expect(modal(el)).toBeNull();
        expect(api.removeCard).toHaveBeenCalledTimes(1);
        expect(api.removeCard).toHaveBeenCalledWith('nHelLt');
        expect(byTestId(el, 'card-remove')?.getAttribute('aria-busy')).toBe(
          'true',
        );
        expect(disabled(el, 'card-cancel')).toBe(true);
        expect(switchOf(el)?.disabled).toBe(true);

        const answered = withCard({ saved_card: null, auto_renew: false });
        answer(cardRemovals[0], answered);

        expect(api.billing).toHaveBeenCalledTimes(1);
        expect(
          block(el)?.querySelector('[data-field="no-card"]')?.textContent?.trim(),
        ).toBe('hostBilling.noCardSaved');
        expect(byTestId(el, 'card-remove')).toBeNull();
        expect(switchOf(el)).toBeNull();
        expect(statusText(el)).toBe('Renews on 3 Dec 2026');
        expect(store.accept).toHaveBeenLastCalledWith('nHelLt', answered);
      });

      it('shows a 422 word for word in the block and reloads', async () => {
        const el = await openWith(withCard());

        click(byTestId(el, 'card-remove'));
        click(buttonByText(modal(el), 'hostBilling.removeCard'));
        refuse(cardRemovals[0], {
          status: 422,
          serverMessages: ['Choose a plan first'],
        });

        expect(api.billing).toHaveBeenCalledTimes(2);
        loads[1].next(withCard());
        harness.detectChanges();
        expect(cardError(el)).toBe('Choose a plan first');
      });

      it('falls back to its own copy for any other failure, and unlocks', async () => {
        const el = await openWith(withCard());

        click(byTestId(el, 'card-remove'));
        click(buttonByText(modal(el), 'hostBilling.removeCard'));
        refuse(cardRemovals[0], { status: 500 });

        expect(cardError(el)).toBe('hostBilling.removeCardFailed');
        expect(disabled(el, 'card-remove')).toBe(false);
        expect(disabled(el, 'card-cancel')).toBe(false);
        expect(api.billing).toHaveBeenCalledTimes(1);
      });

      it('does not open while another action is in flight', async () => {
        const el = await openWith(withCard());

        click(planButtonOf(el, 'pMax'));
        byTestId(el, 'card-remove')?.click();
        harness.detectChanges();

        expect(modal(el)).toBeNull();
      });
    });

    describe('saving a card', () => {
      it('leaves for Safepay with no card on file, keeping its spinner and the lock', async () => {
        const el = await openWith(changeable());

        click(byTestId(el, 'card-save'));

        expect(safepay.startCardSave).toHaveBeenCalledTimes(1);
        expect(safepay.startCardSave).toHaveBeenCalledWith('nHelLt', null);
        cardSaves[0].next();
        cardSaves[0].complete();
        harness.detectChanges();

        expect(byTestId(el, 'card-save')?.getAttribute('aria-busy')).toBe(
          'true',
        );
        expect(disabled(el, 'card-cancel')).toBe(true);
        expect(planButtonOf(el, 'pMax')?.disabled).toBe(true);
      });

      it('hands over the card on file when replacing it', async () => {
        const el = await openWith(withCard());

        expect(byTestId(el, 'card-save')?.textContent?.trim()).toBe(
          'hostBilling.replaceCard',
        );
        click(byTestId(el, 'card-save'));

        expect(safepay.startCardSave).toHaveBeenCalledWith('nHelLt', VISA);
      });

      it('shows a refusal word for word and reloads', async () => {
        const el = await openWith(changeable());

        click(byTestId(el, 'card-save'));
        cardSaves[0].error({
          status: 422,
          code: 'unknown_error',
          message: 'x',
          serverMessages: [
            'Online payment is unavailable right now, please try again (timeout)',
          ],
        });
        harness.detectChanges();

        expect(api.billing).toHaveBeenCalledTimes(2);
        loads[1].next(changeable());
        harness.detectChanges();
        expect(cardError(el)).toBe(
          'Online payment is unavailable right now, please try again (timeout)',
        );
        expect(disabled(el, 'card-save')).toBe(false);
      });

      it('falls back to its own copy when there is no Safepay page to go to', async () => {
        const el = await openWith(changeable());

        click(byTestId(el, 'card-save'));
        cardSaves[0].error({
          status: -1,
          code: 'bad_checkout_url',
          message: '',
        });
        harness.detectChanges();

        expect(cardError(el)).toBe('hostBilling.saveCardFailed');
        expect(disabled(el, 'card-save')).toBe(false);
        expect(api.billing).toHaveBeenCalledTimes(1);
      });

      it('shows its own words for a 403', async () => {
        const el = await openWith(changeable());

        click(byTestId(el, 'card-save'));
        cardSaves[0].error({
          status: 403,
          code: 'unknown_error',
          message: 'x',
          serverMessages: ['You are not authorized to access this page.'],
        });
        harness.detectChanges();

        expect(cardError(el)).toBe('hostBilling.planChangeForbidden');
      });

      it('drops its spinner when the browser restores the page from its cache', async () => {
        const el = await openWith(changeable());

        click(byTestId(el, 'card-save'));
        safepay.restored$.next();
        harness.detectChanges();

        expect(byTestId(el, 'card-save')?.getAttribute('aria-busy')).toBeNull();
        expect(disabled(el, 'card-save')).toBe(false);
        expect(disabled(el, 'card-cancel')).toBe(false);
      });

      it('is not sent while a checkout is in flight', async () => {
        const el = await openWith(changeable());

        click(planButtonOf(el, 'pMax'));
        byTestId(el, 'card-save')?.click();
        harness.detectChanges();

        expect(safepay.startCardSave).not.toHaveBeenCalled();
      });

      it('clears a card refusal when the next action starts', async () => {
        const el = await openWith(changeable());
        click(byTestId(el, 'card-save'));
        cardSaves[0].error({ status: 500, code: 'unknown_error', message: 'x' });
        harness.detectChanges();
        expect(cardError(el)).toBe('hostBilling.saveCardFailed');

        click(byTestId(el, 'card-cancel'));
        click(buttonByText(modal(el), 'hostBilling.cancelPlan'));

        expect(byTestId(el, 'saved-card-error')).toBeNull();
      });
    });

    describe('without permission to change the plan', () => {
      const WITHOUT_UPDATE = ALL_PERMISSIONS.filter(
        (p) => p !== 'core:Subscription:update',
      );

      it('shows the card read-only with the owner-only line', async () => {
        const el = await openWith(withCard(), WITHOUT_UPDATE);

        expect(byTestId(el, 'card-save')).toBeNull();
        expect(byTestId(el, 'card-remove')).toBeNull();
        expect(switchOf(el)?.getAttribute('aria-checked')).toBe('true');
        expect(switchOf(el)?.disabled).toBe(true);
        expect(byTestId(el, 'card-owner-only')?.textContent).toContain(
          'hostBilling.ownerOnly',
        );
      });
    });

    describe('payment due', () => {
      it('says the open renewal will be charged to the card on the period end, with Pay kept', async () => {
        const el = await openWith(
          withCard({ open_invoice: openInvoice({ kind: 'renewal' }) }),
        );
        const due = el.querySelector('hh-payment-due');

        expect(
          plain(due?.querySelector('[data-field="auto-charge"]')?.textContent),
        ).toBe(
          "We'll charge Visa •••• 4242 on 3 Dec 2026. You can also pay now.",
        );
        expect(
          Array.from(due?.querySelectorAll('a') ?? []).some((a) =>
            a.getAttribute('href')?.endsWith('/pay/inv7'),
          ),
        ).toBe(true);
      });

      it('says nothing about a charge without automatic renewal', async () => {
        const el = await openWith(
          withCard({
            auto_renew: false,
            open_invoice: openInvoice({ kind: 'renewal' }),
          }),
        );

        expect(
          el.querySelector('hh-payment-due [data-field="auto-charge"]'),
        ).toBeNull();
      });

      it('says nothing about a charge on a past-due plan', async () => {
        const el = await openWith(
          withCard({
            status: PAST_DUE,
            open_invoice: openInvoice({ kind: 'renewal' }),
          }),
        );

        expect(
          el.querySelector('hh-payment-due [data-field="auto-charge"]'),
        ).toBeNull();
      });
    });
  });

  describe('subscribing through Safepay', () => {
    const subscribeOf = (el: HTMLElement, planId: string) =>
      el.querySelector<HTMLButtonElement>(
        `hh-plan-card[data-plan="${planId}"] [data-testid="plan-subscribe"]`,
      );

    function failSubscribe(
      err: { status: number; code?: string; serverMessages?: string[] },
      index = 0,
    ): void {
      subscribes[index].error({ code: 'unknown_error', message: 'x', ...err });
      harness.detectChanges();
    }

    it('offers Subscribe through Safepay under Choose plan, which stays primary, and says Safepay asks for an account', async () => {
      const el = await openWith(billing());

      const buttons = Array.from(
        el.querySelectorAll('hh-plan-card[data-plan="pBasic"] button'),
      ).map((b) => b.textContent?.trim());
      expect(buttons).toEqual([
        'hostBilling.choosePlan',
        'hostBilling.subscribeWithSafepay',
      ]);
      expect(planButtonOf(el, 'pBasic')?.className).toContain('bg-brand-500');
      expect(subscribeOf(el, 'pBasic')?.className).not.toContain(
        'bg-brand-500',
      );
      expect(
        subscribeOf(el, 'pBasic')?.querySelector('.ti-credit-card'),
      ).not.toBeNull();
      expect(field(el, 'pBasic', 'safepay-account')?.textContent?.trim()).toBe(
        'hostBilling.safepayAccountHint',
      );
      expect(subscribeOf(el, 'pGrowth')).not.toBeNull();
    });

    it('offers the free trial, with its days, when the plan has one', async () => {
      const el = await openWith(
        billing({
          plans: [
            plan({ trial_days: 14 }),
            plan({ id: 'pGrowth', trial_days: null }),
          ],
        }),
      );

      expect(subscribeOf(el, 'pBasic')?.textContent?.trim()).toBe(
        'Start 14-day free trial',
      );
      expect(
        subscribeOf(el, 'pBasic')?.querySelector('.ti-gift'),
      ).not.toBeNull();
      expect(subscribeOf(el, 'pGrowth')?.textContent?.trim()).toBe(
        'hostBilling.subscribeWithSafepay',
      );
    });

    it('is offered only on plans the hostel can buy', async () => {
      const el = await openWith(
        changeable({
          plans: [
            plan({ id: 'pBasic', action: 'downgrade', trial_days: 14 }),
            plan({ id: 'pPremium', action: 'current', trial_days: 14 }),
            plan({ id: 'pMax', action: 'upgrade', trial_days: 14 }),
            plan({
              id: 'pOld',
              action: 'unavailable',
              reason: 'Gone',
              trial_days: 14,
            }),
          ],
        }),
      );

      expect(el.querySelector('[data-testid="plan-subscribe"]')).toBeNull();
      expect(el.querySelector('[data-field="safepay-account"]')).toBeNull();
    });

    it('leaves for Safepay with the plan id, keeping its spinner and locking every other action', async () => {
      const el = await openWith(billing());

      click(subscribeOf(el, 'pGrowth'));

      expect(safepay.startSubscribe).toHaveBeenCalledTimes(1);
      expect(safepay.startSubscribe).toHaveBeenCalledWith('nHelLt', 'pGrowth');
      subscribes[0].next();
      subscribes[0].complete();
      harness.detectChanges();

      expect(subscribeOf(el, 'pGrowth')?.getAttribute('aria-busy')).toBe(
        'true',
      );
      expect(subscribeOf(el, 'pBasic')?.disabled).toBe(true);
      expect(planButtonOf(el, 'pBasic')?.disabled).toBe(true);
      expect(api.checkout).not.toHaveBeenCalled();

      click(subscribeOf(el, 'pBasic'));
      expect(safepay.startSubscribe).toHaveBeenCalledTimes(1);
    });

    it('shows a refusal word for word in the clicked card and lets the host try again', async () => {
      const el = await openWith(billing());

      click(subscribeOf(el, 'pBasic'));
      failSubscribe({
        status: 422,
        serverMessages: [
          "Basic can't be subscribed to through Safepay in PKR yet",
        ],
      });

      const alert = expectErrorOnlyIn(el, 'pBasic');
      expect(alert.textContent?.trim()).toBe(
        "Basic can't be subscribed to through Safepay in PKR yet",
      );
      expect(subscribeOf(el, 'pBasic')?.disabled).toBe(false);
      expect(subscribeOf(el, 'pBasic')?.getAttribute('aria-busy')).toBeNull();
      expect(planButtonOf(el, 'pGrowth')?.disabled).toBe(false);
    });

    it('shows its own words for a 403, never the server’s', async () => {
      const el = await openWith(billing());

      click(subscribeOf(el, 'pBasic'));
      failSubscribe({
        status: 403,
        serverMessages: ['You are not authorized to access this page.'],
      });

      const alert = expectErrorOnlyIn(el, 'pBasic');
      expect(alert.textContent?.trim()).toBe('hostBilling.checkoutForbidden');
    });

    it('falls back to its own copy when there is no Safepay page to go to', async () => {
      const el = await openWith(billing());

      click(subscribeOf(el, 'pBasic'));
      failSubscribe({ status: -1, code: 'bad_checkout_url' });

      expect(expectErrorOnlyIn(el, 'pBasic').textContent?.trim()).toBe(
        'hostBilling.checkoutFailed',
      );
    });

    it('is disabled for someone who may not buy', async () => {
      const el = await openWith(billing(), ['core:Invoice:index']);

      expect(subscribeOf(el, 'pBasic')?.disabled).toBe(true);
      click(subscribeOf(el, 'pBasic'));
      expect(safepay.startSubscribe).not.toHaveBeenCalled();
    });

    it('is disabled while a checkout is in flight', async () => {
      const el = await openWith(billing());

      click(planButtonOf(el, 'pBasic'));

      expect(subscribeOf(el, 'pBasic')?.disabled).toBe(true);
      expect(subscribeOf(el, 'pGrowth')?.disabled).toBe(true);
      click(subscribeOf(el, 'pGrowth'));
      expect(safepay.startSubscribe).not.toHaveBeenCalled();
    });

    it('is disabled while a plan change is in flight', async () => {
      const el = await openWith(
        billing({
          subscription: subscription({ plan: PREMIUM }),
          plans: [plan({ id: 'pGrowth', name: 'Growth' })],
        }),
      );

      click(byTestId(el, 'card-cancel'));
      click(buttonByText(modal(el), 'hostBilling.cancelPlan'));
      expect(api.cancelSubscription).toHaveBeenCalledTimes(1);

      expect(subscribeOf(el, 'pGrowth')?.disabled).toBe(true);
      click(subscribeOf(el, 'pGrowth'));
      expect(safepay.startSubscribe).not.toHaveBeenCalled();

      answer(cancels[0], billing({ plans: [plan({ id: 'pGrowth' })] }));
      expect(subscribeOf(el, 'pGrowth')?.disabled).toBe(false);
    });

    it('drops its spinner when the browser restores the page from its cache', async () => {
      const el = await openWith(billing());

      click(subscribeOf(el, 'pBasic'));
      subscribes[0].next();
      subscribes[0].complete();
      safepay.restored$.next();
      harness.detectChanges();

      expect(subscribeOf(el, 'pBasic')?.getAttribute('aria-busy')).toBeNull();
      expect(subscribeOf(el, 'pBasic')?.disabled).toBe(false);
    });

    describe('with an unpaid invoice', () => {
      it('says first that the invoice stays open, and cancel sends nothing', async () => {
        const el = await openWith(billing({ open_invoice: openInvoice() }));

        click(subscribeOf(el, 'pGrowth'));

        expect(modalTitle(el)).toBe('hostBilling.subscribeOpenInvoiceTitle');
        expect(plain(byTestId(el, 'subscribe-open-invoice')?.textContent)).toBe(
          'Subscribing to Growth doesn’t cancel unpaid invoice HH-2026-0007.',
        );
        expect(safepay.startSubscribe).not.toHaveBeenCalled();

        click(buttonByText(modal(el), 'common.cancel'));

        expect(modal(el)).toBeNull();
        expect(safepay.startSubscribe).not.toHaveBeenCalled();
      });

      it('leaves for Safepay once confirmed', async () => {
        const el = await openWith(billing({ open_invoice: openInvoice() }));

        click(subscribeOf(el, 'pGrowth'));
        click(
          buttonByText(modal(el), 'hostBilling.subscribeOpenInvoiceConfirm'),
        );

        expect(modal(el)).toBeNull();
        expect(safepay.startSubscribe).toHaveBeenCalledWith(
          'nHelLt',
          'pGrowth',
        );
        expect(api.checkout).not.toHaveBeenCalled();
      });

      it('is disabled while a bank transfer for it is under review, and asks nothing', async () => {
        const el = await openWith(
          billing({
            open_invoice: openInvoice({ awaiting_verification: true }),
          }),
        );

        expect(subscribeOf(el, 'pGrowth')?.disabled).toBe(true);
        expect(planButtonOf(el, 'pGrowth')?.disabled).toBe(false);
        click(subscribeOf(el, 'pGrowth'));

        expect(modal(el)).toBeNull();
        expect(safepay.startSubscribe).not.toHaveBeenCalled();
      });
    });
  });

  describe('a plan Safepay bills', () => {
    const REASON =
      'This plan is billed by Safepay: cancel it, then subscribe to the new plan';

    function safepayBilled(
      over: Partial<BillingSubscription> = {},
      billingOver: Partial<HostBilling> = {},
    ): HostBilling {
      const base = changeable();
      return {
        ...base,
        subscription: {
          ...(base.subscription as BillingSubscription),
          billed_by: 'safepay_subscription',
          safepay_status: 'ACTIVE',
          ...over,
        },
        saved_card: VISA,
        plans: base.plans.map((p) => ({
          ...p,
          action: 'unavailable',
          reason: REASON,
          amount_due_now: null,
          trial_days: null,
        })),
        ...billingOver,
      };
    }

    it('reads Current plan on its own card and Unavailable on the rest, all disabled', async () => {
      const el = await openWith(safepayBilled());

      expect(planButtonOf(el, 'pPremium')?.textContent?.trim()).toBe(
        'hostBilling.currentPlanButton',
      );
      for (const id of ['pBasic', 'pGrowth', 'pMax']) {
        expect(planButtonOf(el, id)?.textContent?.trim()).toBe(
          'hostBilling.unavailable',
        );
      }
      for (const id of ['pBasic', 'pGrowth', 'pPremium', 'pMax']) {
        expect(planButtonOf(el, id)?.disabled).toBe(true);
      }
      expect(el.querySelector('[data-testid="plan-subscribe"]')).toBeNull();
      expect(el.querySelector('[data-testid="plan-undo"]')).toBeNull();
    });

    it('offers no Renew on any card while past due, though the server sends one', async () => {
      const base = safepayBilled({ status: PAST_DUE });
      const el = await openWith({
        ...base,
        plans: base.plans.map((p) =>
          p.id === 'pPremium'
            ? { ...p, action: 'renew', reason: undefined, amount_due_now: '12000.00' }
            : p.id === 'pMax'
              ? { ...p, action: 'upgrade', reason: undefined, amount_due_now: '6000.00' }
              : p,
        ),
      });

      expect(planButtonOf(el, 'pPremium')?.textContent?.trim()).toBe(
        'hostBilling.currentPlanButton',
      );
      for (const id of ['pBasic', 'pGrowth', 'pMax']) {
        expect(planButtonOf(el, id)?.textContent?.trim()).toBe(
          'hostBilling.unavailable',
        );
      }
      for (const id of ['pBasic', 'pGrowth', 'pPremium', 'pMax']) {
        expect(planButtonOf(el, id)?.disabled).toBe(true);
      }
      expect(el.textContent).not.toContain('hostBilling.renew');
      expect(el.querySelectorAll('[data-testid="safepay-notice"]').length).toBe(1);
      expect(byTestId(el, 'safepay-notice')?.textContent?.trim()).toBe(REASON);
    });

    it('says the server’s reason once above the plans, not on every card', async () => {
      const el = await openWith(safepayBilled());

      expect(byTestId(el, 'safepay-notice')?.textContent?.trim()).toBe(REASON);
      expect(el.querySelectorAll('[data-field="reason"]').length).toBe(0);
    });

    it('hides the saved card and its auto-renew switch', async () => {
      const el = await openWith(safepayBilled());

      expect(el.querySelector('hh-saved-card')).toBeNull();
      expect(el.querySelector('button[role="switch"]')).toBeNull();
    });

    it('never says the saved card will be charged for an open invoice', async () => {
      const el = await openWith(
        safepayBilled(
          {},
          { auto_renew: true, open_invoice: openInvoice({ kind: 'renewal' }) },
        ),
      );

      expect(el.querySelector('hh-payment-due')).not.toBeNull();
      expect(
        el.querySelector('hh-payment-due [data-field="auto-charge"]'),
      ).toBeNull();
    });

    it('keeps Cancel plan with the ordinary copy outside a trial', async () => {
      const el = await openWith(safepayBilled());

      click(byTestId(el, 'card-cancel'));

      expect(modalTitle(el)).toBe('hostBilling.cancelTitle');
      expect(plain(byTestId(el, 'cancel-message')?.textContent)).toBe(
        'Your plan stays active until 3 Dec 2026.',
      );
    });

    describe('in its free trial', () => {
      const trial = () => safepayBilled({ safepay_status: 'TRAILING' });

      it('says when the trial ends instead of a renewal', async () => {
        const el = await openWith(trial());

        expect(statusText(el)).toBe(
          'hostBilling.billedBySafepay Free trial until 3 Dec 2026',
        );
      });

      it('asks to cancel the trial in its own words, and keeping it sends nothing', async () => {
        const el = await openWith(trial());

        click(byTestId(el, 'card-cancel'));

        expect(modalTitle(el)).toBe('hostBilling.cancelTrialTitle');
        expect(plain(byTestId(el, 'cancel-message')?.textContent)).toBe(
          'Your hostel goes offline when the trial ends on 3 Dec 2026. Nothing is charged.',
        );
        const labels = Array.from(modal(el)?.querySelectorAll('button') ?? [])
          .map((b) => b.textContent?.trim())
          .filter(Boolean);
        expect(labels).toEqual([
          'hostBilling.keepTrial',
          'hostBilling.cancelTrial',
        ]);

        click(buttonByText(modal(el), 'hostBilling.keepTrial'));
        expect(modal(el)).toBeNull();
        expect(api.cancelSubscription).not.toHaveBeenCalled();
      });

      it('cancels once confirmed', async () => {
        const el = await openWith(trial());

        click(byTestId(el, 'card-cancel'));
        click(buttonByText(modal(el), 'hostBilling.cancelTrial'));

        expect(api.cancelSubscription).toHaveBeenCalledWith('nHelLt');
      });
    });

    it('follows the server again once the plan is no longer live', async () => {
      const el = await openWith(
        safepayBilled(
          {
            status: { id: 5, name: 'Expired', slug: 'expired', color: null },
          },
          {
            plans: [
              plan({
                id: 'pPremium',
                action: 'renew',
                amount_due_now: '12000.00',
              }),
            ],
          },
        ),
      );

      expect(byTestId(el, 'safepay-notice')).toBeNull();
      expect(planButtonOf(el, 'pPremium')?.textContent?.trim()).toBe(
        'hostBilling.renew',
      );
      expect(el.querySelector('hh-saved-card')).not.toBeNull();
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

    async function go(hostelId: string): Promise<HTMLElement> {
      await TestBed.inject(Router).navigateByUrl(
        `/host/${hostelId}/subscription`,
      );
      harness.detectChanges();
      return harness.routeNativeElement as HTMLElement;
    }

    it('drops a Safepay subscribe refusal that answers for the old hostel and unlocks the new one', async () => {
      const el = await openWith(billing());

      click(
        el.querySelector(
          'hh-plan-card[data-plan="pBasic"] [data-testid="plan-subscribe"]',
        ),
      );
      expect(safepay.startSubscribe).toHaveBeenCalledWith('nHelLt', 'pBasic');
      const now = await go('other1');
      loads[1].next(billing());
      harness.detectChanges();

      subscribes[0].error({
        code: 'unknown_error',
        message: 'x',
        status: 422,
        serverMessages: ['Refused for the old hostel'],
      });
      harness.detectChanges();

      expect(now.querySelector('[data-testid="checkout-error"]')).toBeNull();
      expect(now.textContent).not.toContain('Refused for the old hostel');
      for (const id of ['pBasic', 'pGrowth']) {
        expect(planButtonOf(now, id)?.disabled).toBe(false);
        expect(
          now.querySelector<HTMLButtonElement>(
            `hh-plan-card[data-plan="${id}"] [data-testid="plan-subscribe"]`,
          )?.disabled,
        ).toBe(false);
      }
    });

    it('drops a plan change that answers for the old hostel and unlocks the new one', async () => {
      const el = await openWith(changeable());

      click(byTestId(el, 'card-cancel'));
      click(buttonByText(modal(el), 'hostBilling.cancelPlan'));
      const now = await go('other1');

      expect(api.billing).toHaveBeenLastCalledWith('other1');
      loads[1].next(changeable());
      harness.detectChanges();
      answer(cancels[0], changeable({ cancelling: true }));

      expect(statusText(now)).toBe('Renews on 3 Dec 2026');
      const cancel = byTestId(now, 'card-cancel') as HTMLButtonElement;
      expect(cancel.disabled).toBe(false);
      expect(cancel.getAttribute('aria-busy')).toBeNull();
      expect(now.querySelector('[role="alert"]')).toBeNull();
    });

    it('closes an open confirm and sends nothing', async () => {
      const el = await openWith(changeable());

      click(planButtonOf(el, 'pGrowth'));
      expect(modal(el)).not.toBeNull();
      let now = await go('other1');
      expect(modal(now)).toBeNull();

      loads[1].next(changeable());
      harness.detectChanges();
      click(byTestId(now, 'card-cancel'));
      expect(modal(now)).not.toBeNull();
      now = await go('nHelLt');
      expect(modal(now)).toBeNull();

      expect(api.scheduleDowngrade).not.toHaveBeenCalled();
      expect(api.cancelSubscription).not.toHaveBeenCalled();
    });

    it('drops an answer from an earlier visit to the same hostel, without unlocking a newer change', async () => {
      const el = await openWith(changeable());

      click(byTestId(el, 'card-cancel'));
      click(buttonByText(modal(el), 'hostBilling.cancelPlan'));
      await go('other1');
      const now = await go('nHelLt');

      expect(api.billing).toHaveBeenCalledTimes(3);
      expect(api.billing).toHaveBeenLastCalledWith('nHelLt');
      loads[2].next(changeable({ scheduled: 'pGrowth' }));
      harness.detectChanges();
      click(byTestId(now, 'card-undo'));
      expect(api.unscheduleDowngrade).toHaveBeenCalledTimes(1);

      answer(cancels[0], changeable({ cancelling: true }));

      expect(statusText(now)).not.toContain('Ends on');
      expect(statusText(now)).toContain('Switches to Growth on 3 Dec 2026');
      expect(byTestId(now, 'card-undo')?.getAttribute('aria-busy')).toBe(
        'true',
      );

      answer(unschedules[0], changeable());
      expect(statusText(now)).toBe('Renews on 3 Dec 2026');
    });

    it('clears a plan-change refusal shown for the old hostel, and leaves the new one usable', async () => {
      const el = await openWith(changeable());

      click(planButtonOf(el, 'pGrowth'));
      click(buttonByText(modal(el), 'hostBilling.downgradeConfirm'));
      refuse(schedules[0], { status: 500 });
      expect(planChangeErrorOf(el, 'pGrowth')?.textContent?.trim()).toBe(
        'hostBilling.scheduleFailed',
      );

      const now = await go('other1');
      loads[1].next(changeable());
      harness.detectChanges();

      expect(now.querySelector('[role="alert"]')).toBeNull();
      expect(planChangeErrorOf(now, 'pGrowth')).toBeNull();
      expect(planButtonOf(now, 'pGrowth')?.disabled).toBe(false);
      expect((byTestId(now, 'card-cancel') as HTMLButtonElement).disabled).toBe(
        false,
      );
      click(planButtonOf(now, 'pGrowth'));
      expect(modalTitle(now)).toBe('Switch to Growth at renewal?');
    });

    it('drops a refusal from an earlier visit to the same hostel', async () => {
      const el = await openWith(changeable());

      click(byTestId(el, 'card-cancel'));
      click(buttonByText(modal(el), 'hostBilling.cancelPlan'));
      await go('other1');
      const now = await go('nHelLt');
      loads[2].next(changeable());
      harness.detectChanges();

      refuse(cancels[0], {
        status: 422,
        serverMessages: ['There is no active subscription'],
      });

      expect(now.querySelector('[role="alert"]')).toBeNull();
      expect(api.billing).toHaveBeenCalledTimes(3);
      expect(statusText(now)).toBe('Renews on 3 Dec 2026');
    });
  });

  describe('sharing billing with the console', () => {
    async function go(hostelId: string): Promise<HTMLElement> {
      await TestBed.inject(Router).navigateByUrl(
        `/host/${hostelId}/subscription`,
      );
      harness.detectChanges();
      return harness.routeNativeElement as HTMLElement;
    }

    function cancelPlan(el: HTMLElement): void {
      click(byTestId(el, 'card-cancel'));
      click(buttonByText(modal(el), 'hostBilling.cancelPlan'));
    }

    it('hands over each summary it loads, for the hostel it was loaded for', async () => {
      await open();
      expect(store.accept).not.toHaveBeenCalled();

      const loaded = billing();
      loads[0].next(loaded);
      harness.detectChanges();

      expect(store.accept).toHaveBeenCalledTimes(1);
      expect(store.accept).toHaveBeenCalledWith('nHelLt', loaded);
    });

    it('hands over nothing when the load fails', async () => {
      await open();
      loads[0].error({ status: 403, code: 'unknown_error', message: 'x' });
      harness.detectChanges();

      expect(store.accept).not.toHaveBeenCalled();
    });

    it('hands over nothing from a load the hostel switch abandoned', async () => {
      await open();
      await go('other1');

      loads[0].next(billing());
      harness.detectChanges();
      expect(store.accept).not.toHaveBeenCalled();

      const other = billing({ country_code: null });
      loads[1].next(other);
      harness.detectChanges();
      expect(store.accept).toHaveBeenCalledTimes(1);
      expect(store.accept).toHaveBeenCalledWith('other1', other);
    });

    it('hands over the summary a plan change answers with', async () => {
      const el = await openWith(changeable());
      cancelPlan(el);

      const answered = changeable({ cancelling: true });
      answer(cancels[0], answered);

      expect(store.accept).toHaveBeenCalledTimes(2);
      expect(store.accept).toHaveBeenLastCalledWith('nHelLt', answered);
    });

    it('hands over nothing when a plan change is refused', async () => {
      const el = await openWith(changeable());
      cancelPlan(el);

      refuse(cancels[0], { status: 500 });

      expect(store.accept).toHaveBeenCalledTimes(1);
    });

    it('hands over nothing from a plan change answered after a hostel switch', async () => {
      const el = await openWith(changeable());
      cancelPlan(el);
      await go('other1');
      const other = changeable();
      loads[1].next(other);
      harness.detectChanges();

      const stale = changeable({ cancelling: true });
      answer(cancels[0], stale);

      expect(store.accept).toHaveBeenCalledTimes(2);
      expect(store.accept).toHaveBeenLastCalledWith('other1', other);
      expect(store.accept).not.toHaveBeenCalledWith('nHelLt', stale);
    });

    it('hands over nothing from a plan change asked on an earlier visit to the same hostel', async () => {
      const el = await openWith(changeable());
      cancelPlan(el);
      await go('other1');
      await go('nHelLt');
      const reloaded = changeable({ scheduled: 'pGrowth' });
      loads[2].next(reloaded);
      harness.detectChanges();

      const stale = changeable({ cancelling: true });
      answer(cancels[0], stale);

      expect(store.accept).toHaveBeenCalledTimes(2);
      expect(store.accept).toHaveBeenLastCalledWith('nHelLt', reloaded);
      expect(store.accept).not.toHaveBeenCalledWith('nHelLt', stale);
    });
  });
});
