import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import type { SubscriptionEvent } from '@hostelhive/data-access';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { AdminBillingEvents } from './billing-events';

const COPY = {
  adminBilling: {
    events: {
      upgraded: 'Upgraded from {{from}} to {{to}}',
      cancelScheduled: 'Plan set to end on {{date}}',
      cancelScheduledPlain: 'Plan set to end',
      currencyChanged: 'Billing currency changed from {{from}} to {{to}}',
      currencyOverrideSet: 'Billing currency set to {{to}} by {{admin}}',
      currencyOverrideChanged:
        'Billing currency changed from {{from}} to {{to}} by {{admin}}',
      currencyOverrideCleared: 'Billing currency set back to Automatic by {{admin}}',
      other: 'Other event ({{kind}})',
      empty: 'No billing history yet.',
    },
  },
};

function event(
  id: string,
  kind: string,
  data: Record<string, unknown> | null,
): SubscriptionEvent {
  return {
    id,
    kind,
    data,
    created_at: '2026-10-11T14:20:00Z',
    invoice_number: null,
  };
}

describe('AdminBillingEvents', () => {
  function render(
    events: readonly SubscriptionEvent[],
    planName?: (code: string) => string,
  ): HTMLElement {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideI18nTesting()],
    });
    TestBed.inject(TranslocoService).setTranslation(COPY, 'en');
    const fixture = TestBed.createComponent(AdminBillingEvents);
    fixture.componentRef.setInput('events', events);
    if (planName) fixture.componentRef.setInput('planName', planName);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const labels = (el: HTMLElement): (string | undefined)[] =>
    Array.from(el.querySelectorAll('[data-field="label"]')).map((n) =>
      n.textContent?.trim(),
    );

  afterEach(() => TestBed.resetTestingModule());

  it('labels each kind, falling back to the plan code and the raw unknown kind', () => {
    const el = render([
      event('a', 'upgraded', { from: 'listing', to: 'enterprise' }),
      event('b', 'cancel_scheduled', { at: '2026-12-01T00:00:00Z' }),
      event('c', 'cancel_scheduled', null),
      event('d', 'currency_changed', { from: 'PKR', to: 'USD' }),
      event('e', 'plan_paused', { anything: 1 }),
    ]);

    expect(labels(el)).toEqual([
      'Other event (plan_paused)',
      'Billing currency changed from PKR to USD',
      'Plan set to end',
      'Plan set to end on 1 Dec 2026',
      // No name lookup was given, so the codes stand.
      'Upgraded from listing to enterprise',
    ]);
    expect(
      el.querySelector('[data-field="created"]')?.getAttribute('datetime'),
    ).toBe('2026-10-11T14:20:00Z');
  });

  it('names the admin who set, changed or cleared the currency override', () => {
    const el = render([
      event('a', 'currency_override_changed', {
        from: null,
        to: 'USD',
        admin_id: 'SwEcOA',
        admin_name: 'Sana Qureshi',
      }),
      event('b', 'currency_override_changed', {
        from: 'USD',
        to: 'PKR',
        admin_id: 'SwEcOA',
        admin_name: 'Omar Farooq',
      }),
      event('c', 'currency_override_changed', {
        from: 'PKR',
        to: null,
        admin_id: 'SwEcOA',
        admin_name: 'Hina Raza',
      }),
    ]);

    expect(labels(el)).toEqual([
      'Billing currency set back to Automatic by Hina Raza',
      'Billing currency changed from USD to PKR by Omar Farooq',
      'Billing currency set to USD by Sana Qureshi',
    ]);
    expect(el.textContent).not.toContain('SwEcOA');
  });

  it('names plans through the lookup it is given', () => {
    const names: Record<string, string> = { listing: 'Listing' };
    const el = render(
      [event('a', 'upgraded', { from: 'listing', to: 'enterprise' })],
      (code) => names[code] ?? code,
    );

    expect(labels(el)).toEqual(['Upgraded from Listing to enterprise']);
  });

  it('shows the empty state and no footnote for no events', () => {
    const el = render([]);

    expect(
      el.querySelector('[data-testid="events-empty"]')?.textContent?.trim(),
    ).toBe('No billing history yet.');
    expect(el.querySelector('[data-testid="events-limit"]')).toBeNull();
  });

  it('adds no footnote below 100 events', () => {
    const el = render(
      Array.from({ length: 99 }, (_, i) => event(`e${i}`, 'expired', {})),
    );

    expect(el.querySelectorAll('[data-testid="billing-event"]').length).toBe(
      99,
    );
    expect(el.querySelector('[data-testid="events-limit"]')).toBeNull();
  });
});
