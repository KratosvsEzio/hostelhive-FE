import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import type { BillingSubscription, HostBilling } from '@hostelhive/data-access';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import type { BannerInput } from '@app/shared/billing/billing-banner';
import { BillingBanner, DISMISSED_KEY } from './billing-banner';

const NOW = Date.parse('2026-10-11T12:00:00Z');
const DAY = 86_400_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function subscription(overrides: Partial<BillingSubscription> = {}): BillingSubscription {
  return {
    id: 'sub1',
    status: { id: 1, name: 'Active', slug: 'active' },
    currency: 'PKR',
    plan: { id: 'qTFruf', code: 'listing_crm', name: 'Listing + CRM', features: ['crm'] },
    current_period_start: iso(NOW - 20 * DAY),
    current_period_end: iso(NOW + 3 * DAY),
    grace_until: null,
    scheduled_plan: null,
    cancel_at_period_end: false,
    billed_by: 'invoice',
    safepay_status: null,
    ...overrides,
  };
}

function withSlug(slug: string, overrides: Partial<BillingSubscription> = {}): BillingSubscription {
  return subscription({ status: { id: 9, name: slug, slug }, ...overrides });
}

function billing(overrides: Partial<HostBilling> = {}): HostBilling {
  return {
    currency: 'PKR',
    country_code: 'PK',
    payment_methods: ['safepay'],
    auto_renew: false,
    saved_card: null,
    subscription: subscription(),
    features: ['listing', 'crm'],
    open_invoice: null,
    plans: [],
    ...overrides,
  };
}

const OPEN_INVOICE: HostBilling['open_invoice'] = {
  id: 'inv1',
  number: 'HH-0001',
  kind: 'new',
  total: '5000.00',
  currency: 'PKR',
  period_start: null,
  period_end: null,
  expires_at: null,
  awaiting_verification: false,
};

function owner(b: HostBilling | null, offlineObserved = false): BannerInput {
  return { billing: b, offlineObserved, canManageBilling: true };
}

function pastDue(graceMs: number): BannerInput {
  return owner(
    billing({
      subscription: withSlug('past-due', {
        current_period_end: iso(NOW - DAY),
        grace_until: iso(NOW + graceMs),
      }),
    }),
  );
}

describe('BillingBanner', () => {
  let fixture: ComponentFixture<BillingBanner> | null = null;
  let elapsed = 0;

  function current(): ComponentFixture<BillingBanner> {
    if (!fixture) throw new Error('mount() first');
    return fixture;
  }

  function unmount(): void {
    fixture?.destroy();
    fixture = null;
    TestBed.resetTestingModule();
  }

  function mount(
    state: BannerInput,
    hostelId = 'nHelLt',
    ownerId: string | null = 'uA1',
    translations: Record<string, Record<string, string>> = {},
  ): HTMLElement {
    unmount();
    TestBed.configureTestingModule({
      imports: [BillingBanner],
      providers: [provideRouter([]), provideI18nTesting()],
    });
    TestBed.inject(TranslocoService).setTranslation(translations, 'en', { merge: true });
    const f = TestBed.createComponent(BillingBanner);
    fixture = f;
    f.componentRef.setInput('state', state);
    f.componentRef.setInput('hostelId', hostelId);
    f.componentRef.setInput('owner', ownerId);
    elapsed = 0;
    f.componentInstance.graceElapsed.subscribe(() => elapsed++);
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }

  function setInputs(inputs: { state?: BannerInput; hostelId?: string }): void {
    const f = current();
    if (inputs.hostelId !== undefined) f.componentRef.setInput('hostelId', inputs.hostelId);
    if (inputs.state !== undefined) f.componentRef.setInput('state', inputs.state);
    f.detectChanges();
  }

  function tick(ms: number): void {
    vi.advanceTimersByTime(ms);
    current().detectChanges();
  }

  function section(el: HTMLElement): HTMLElement | null {
    return el.querySelector('[data-testid="billing-banner"]');
  }

  function countdown(el: HTMLElement): string {
    return el.querySelector('[data-testid="billing-banner-countdown"]')?.textContent?.trim() ?? '';
  }

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['setInterval', 'clearInterval', 'Date'] });
    localStorage.clear();
  });

  afterEach(() => {
    unmount();
    vi.useRealTimers();
    localStorage.clear();
  });

  describe('tone and call to action', () => {
    const cases: [string, BannerInput, string, string | null][] = [
      ['expired', owner(billing({ subscription: withSlug('expired') })), 'border-danger/30', 'hostBilling.renew'],
      [
        'canceled',
        owner(billing({ subscription: withSlug('canceled') })),
        'border-danger/30',
        'hostBilling.choosePlan',
      ],
      ['no-plan', owner(billing({ subscription: null })), 'border-danger/30', 'hostBilling.choosePlan'],
      [
        'awaiting-payment',
        owner(billing({ subscription: null, open_invoice: OPEN_INVOICE })),
        'border-danger/30',
        'hostBilling.pay',
      ],
      ['offline', owner(billing(), true), 'border-danger/30', 'hostAccess.goToBilling'],
      ['offline', { billing: null, offlineObserved: true, canManageBilling: false }, 'border-danger/30', null],
      ['past-due', pastDue(3 * DAY), 'border-warn/30', 'hostBilling.renew'],
      ['grace-over', pastDue(-HOUR), 'border-warn/30', 'hostBilling.renew'],
      [
        'cancel-pending',
        owner(billing({ subscription: subscription({ cancel_at_period_end: true }) })),
        'border-tint-sky',
        'hostBilling.resumePlan',
      ],
      ['renewing', owner(billing()), 'border-tint-sky', 'hostBilling.renew'],
      [
        'renew-due',
        owner(billing({ subscription: subscription({ current_period_end: iso(NOW - HOUR) }) })),
        'border-tint-sky',
        'hostBilling.renew',
      ],
    ];

    it.each(cases)('%s gets its tone and action', (kind, state, toneClass, actionKey) => {
      const el = mount(state);
      const banner = section(el);

      expect(banner?.getAttribute('data-kind')).toBe(kind);
      expect(banner?.classList.contains(toneClass)).toBe(true);
      const link = el.querySelector('[data-testid="billing-banner-action"]');
      if (actionKey === null) {
        expect(link).toBeNull();
      } else {
        expect(link?.textContent?.trim()).toBe(actionKey);
        expect(link?.getAttribute('href')).toMatch(/\/host\/nHelLt\/subscription$/);
      }
    });

    it('offers dismissal only on the renewing and plan-ending banners', () => {
      const dismissible = cases
        .filter(([, state]) => mount(state).querySelector('[data-testid="billing-banner-dismiss"]') !== null)
        .map(([kind]) => kind);

      expect(dismissible).toEqual(['cancel-pending', 'renewing']);
    });
  });

  describe('with auto-renew on', () => {
    const secondary = (el: HTMLElement) =>
      el.querySelector('[data-testid="billing-banner-secondary-action"]');
    const primary = (el: HTMLElement) => el.querySelector('[data-testid="billing-banner-action"]');

    function autoPastDue(withInvoice = false): BannerInput {
      return owner(
        billing({
          auto_renew: true,
          open_invoice: withInvoice ? OPEN_INVOICE : null,
          subscription: withSlug('past-due', {
            current_period_end: iso(NOW - DAY),
            grace_until: iso(NOW + 3 * DAY),
          }),
        }),
      );
    }

    it('shows Go to billing instead of Renew on a renewing plan, still dismissible', () => {
      const el = mount(owner(billing({ auto_renew: true })));

      expect(section(el)?.getAttribute('data-kind')).toBe('renewing');
      expect(primary(el)?.textContent?.trim()).toBe('hostAccess.goToBilling');
      expect(primary(el)?.getAttribute('href')).toMatch(/\/host\/nHelLt\/subscription$/);
      expect(secondary(el)).toBeNull();
      expect(el.querySelector('[data-testid="billing-banner-dismiss"]')).not.toBeNull();
    });

    it('shows Go to billing on a renew-due plan', () => {
      const sub = subscription({ current_period_end: iso(NOW - HOUR) });
      const el = mount(owner(billing({ auto_renew: true, subscription: sub })));

      expect(section(el)?.getAttribute('data-kind')).toBe('renew-due');
      expect(primary(el)?.textContent?.trim()).toBe('hostAccess.goToBilling');
    });

    it('renders two actions while past due: update the card, and pay the open invoice', () => {
      const el = mount(autoPastDue(true));

      expect(primary(el)?.textContent?.trim()).toBe('hostAccess.updateCard');
      expect(primary(el)?.getAttribute('href')).toMatch(/\/host\/nHelLt\/subscription#saved-card$/);
      expect(secondary(el)?.textContent?.trim()).toBe('hostBilling.pay');
      expect(secondary(el)?.getAttribute('href')).toMatch(/\/host\/nHelLt\/subscription\/pay\/inv1$/);
      expect(countdown(el)).toBe('hostAccess.timeLeft');
    });

    it('renders only the card action while past due with no open invoice', () => {
      const el = mount(autoPastDue());

      expect(primary(el)?.textContent?.trim()).toBe('hostAccess.updateCard');
      expect(secondary(el)).toBeNull();
    });
  });

  it('renders no secondary action and the usual links when auto-renew is off', () => {
    const el = mount(pastDue(3 * DAY));

    expect(el.querySelector('[data-testid="billing-banner-secondary-action"]')).toBeNull();
    const link = el.querySelector('[data-testid="billing-banner-action"]');
    expect(link?.textContent?.trim()).toBe('hostBilling.renew');
    expect(link?.getAttribute('href')).toMatch(/\/host\/nHelLt\/subscription$/);
  });

  it('renders nothing when no banner applies', () => {
    const el = mount(owner(billing({ subscription: subscription({ current_period_end: iso(NOW + 30 * DAY) }) })));

    expect(section(el)).toBeNull();
  });

  it('renders a canceled plan with no period end', () => {
    const el = mount(owner(billing({ subscription: withSlug('canceled', { current_period_end: null }) })), 'nHelLt', 'uA1', {
      hostAccess: { canceled: 'ended on [{{date}}]' },
    });

    expect(section(el)?.textContent).toContain('ended on []');
  });

  it('renders dates as the calendar day the API sent, and the scheduled plan by name', () => {
    const state = owner(
      billing({
        subscription: subscription({
          current_period_end: '2026-10-14T00:00:00.000+05:00',
          scheduled_plan: { id: 'pL1', code: 'listing', name: 'Listing' },
        }),
      }),
    );
    const el = mount(state, 'nHelLt', 'uA1', { hostAccess: { switchesSoon: 'to {{plan}} on {{date}}' } });

    expect(section(el)?.textContent).toContain('to Listing on 14 Oct 2026');
  });

  it('fills the past-due message with the end and grace calendar days the API sent', () => {
    const state = owner(
      billing({
        subscription: withSlug('past-due', {
          current_period_end: '2026-10-10T00:00:00.000+05:00',
          grace_until: '2026-10-15T00:00:00.000+05:00',
        }),
      }),
    );
    const el = mount(state, 'nHelLt', 'uA1', {
      hostAccess: { pastDue: 'ended [{{endDate}}] grace [{{graceDate}}]' },
    });

    expect(section(el)?.textContent).toContain('ended [10 Oct 2026] grace [15 Oct 2026]');
  });

  describe('countdown', () => {
    it('shows whole days left, in the active language, with the boost note when the plan has boost', () => {
      const state = pastDue(3 * DAY + 5 * HOUR);
      state.billing?.subscription?.plan.features.push('boost');
      const el = mount(state, 'nHelLt', 'uA1', { hostAccess: { timeLeft: '{{time}} left' } });

      expect(countdown(el)).toBe('3 days left');
      expect(section(el)?.textContent).toContain('hostAccess.boostPaused');
    });

    it('leaves out the boost note when the plan has no boost', () => {
      const el = mount(pastDue(3 * DAY));

      expect(section(el)?.textContent).not.toContain('hostAccess.boostPaused');
    });

    it('says less than an hour under an hour', () => {
      const el = mount(pastDue(30 * MINUTE));

      expect(countdown(el)).toBe('hostAccess.lessThanAnHourLeft');
    });

    it('re-evaluates every minute', () => {
      const el = mount(pastDue(HOUR + 30 * MINUTE));

      expect(countdown(el)).toBe('hostAccess.timeLeft');
      tick(30 * MINUTE);
      expect(countdown(el)).toBe('hostAccess.timeLeft');
      tick(MINUTE);
      expect(countdown(el)).toBe('hostAccess.lessThanAnHourLeft');
    });

    it('re-evaluates when the tab becomes visible again', () => {
      const el = mount(pastDue(HOUR + 10 * MINUTE));
      vi.setSystemTime(NOW + 15 * MINUTE);
      document.dispatchEvent(new Event('visibilitychange'));
      current().detectChanges();

      expect(countdown(el)).toBe('hostAccess.lessThanAnHourLeft');
    });
  });

  describe('graceElapsed', () => {
    it('fires once when a shown countdown runs out', () => {
      const el = mount(pastDue(2 * MINUTE + 1));

      tick(MINUTE);
      expect(elapsed).toBe(0);
      tick(2 * MINUTE);
      expect(section(el)?.getAttribute('data-kind')).toBe('grace-over');
      expect(elapsed).toBe(1);
      tick(10 * MINUTE);
      expect(elapsed).toBe(1);
    });

    it('does not fire twice for one hostel', () => {
      mount(pastDue(MINUTE));
      tick(MINUTE);
      expect(elapsed).toBe(1);

      setInputs({ state: pastDue(2 * DAY) });
      setInputs({ state: pastDue(-DAY) });
      expect(elapsed).toBe(1);
    });

    it('does not fire when grace was already over on arrival', () => {
      mount(pastDue(-HOUR));
      tick(MINUTE);

      expect(elapsed).toBe(0);
    });

    it('does not fire when the countdown belonged to another hostel', () => {
      mount(pastDue(DAY), 'hA');
      setInputs({ hostelId: 'hB', state: pastDue(-HOUR) });

      expect(elapsed).toBe(0);
    });
  });

  describe('dismissal', () => {
    const renewing = () => owner(billing());
    const renewingKey = `uA1|nHelLt|renewing|${iso(NOW + 3 * DAY)}`;

    function dismiss(el: HTMLElement): void {
      el.querySelector<HTMLButtonElement>('[data-testid="billing-banner-dismiss"]')?.click();
      current().detectChanges();
    }

    function stored(): string[] {
      return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]') as string[];
    }

    it('hides the banner and remembers it per owner, hostel, kind and period end', () => {
      const el = mount(renewing());
      dismiss(el);

      expect(section(el)).toBeNull();
      expect(stored()).toEqual([renewingKey]);
      expect(section(mount(renewing()))).toBeNull();
    });

    it('shows again for the next period, another hostel or another owner', () => {
      dismiss(mount(renewing()));
      const nextPeriod = owner(billing({ subscription: subscription({ current_period_end: iso(NOW + 4 * DAY) }) }));

      expect(section(mount(nextPeriod))).not.toBeNull();
      expect(section(mount(renewing(), 'otherH'))).not.toBeNull();
      expect(section(mount(renewing(), 'nHelLt', 'uB2'))).not.toBeNull();
    });

    it('keeps only the last 20 dismissals', () => {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from({ length: 20 }, (_, i) => `uA1|h${i}|renewing|x`)));
      dismiss(mount(renewing()));

      expect(stored()).toHaveLength(20);
      expect(stored()[0]).toBe('uA1|h1|renewing|x');
      expect(stored()[19]).toBe(renewingKey);
    });

    it('survives unreadable storage', () => {
      localStorage.setItem(DISMISSED_KEY, '{not json');
      const el = mount(renewing());

      expect(section(el)).not.toBeNull();
      dismiss(el);
      expect(section(el)).toBeNull();
    });

    it('survives storage that refuses writes', () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      const el = mount(renewing());
      dismiss(el);
      setItem.mockRestore();

      expect(section(el)).toBeNull();
    });
  });

  it('is a labelled region with a polite live region, hidden icons and a named dismiss button', () => {
    const el = mount(owner(billing()));
    const banner = section(el);

    expect(banner?.getAttribute('role')).toBe('region');
    expect(banner?.getAttribute('aria-label')).toBe('hostAccess.regionLabel');
    expect(banner?.querySelector('[aria-live="polite"]')).not.toBeNull();
    const icons = Array.from(el.querySelectorAll('i.ti'));
    expect(icons.length).toBeGreaterThan(0);
    expect(icons.every((i) => i.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(el.querySelector('[data-testid="billing-banner-dismiss"]')?.getAttribute('aria-label')).toBe(
      'hostAccess.dismiss',
    );
  });

  it('clears its interval and visibility listener on destroy', () => {
    const removeListener = vi.spyOn(document, 'removeEventListener');
    mount(owner(billing()));
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
    expect(removeListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    removeListener.mockRestore();
  });
});
