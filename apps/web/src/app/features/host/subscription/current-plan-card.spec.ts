import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import type { BillingSubscription } from '@hostelhive/data-access';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { CurrentPlanCard } from './current-plan-card';

// Only the keys that take a parameter carry copy, so the spec can see what was passed in.
const COPY = {
  hostBilling: {
    renewsOn: 'Renews on {{date}}',
    endsOn: 'Ends on {{date}}',
    endedOn: 'Ended on {{date}}',
    wasDueOn: 'Payment was due on {{date}}',
    graceUntil: 'Pay by {{date}} to keep your listing',
    switchesTo: 'Switches to {{plan}} at renewal',
  },
};

function subscription(
  slug: string,
  over: Partial<BillingSubscription> = {},
): BillingSubscription {
  return {
    id: 'sub1',
    status: { id: 1, name: `Status ${slug}`, slug, color: null },
    currency: 'PKR',
    plan: { id: 'plGrow', code: 'growth', name: 'Growth', features: ['boost'] },
    current_period_start: '2026-10-12T00:00:00.000+05:00',
    current_period_end: '2026-11-12T00:00:00.000+05:00',
    grace_until: null,
    scheduled_plan: null,
    cancel_at_period_end: false,
    ...over,
  };
}

@Component({
  imports: [CurrentPlanCard],
  template: `
    <hh-current-plan-card [subscription]="subscription" [features]="features">
      <span data-test="projected">actions</span>
    </hh-current-plan-card>
  `,
})
class Host {
  subscription: BillingSubscription | null = null;
  features: readonly string[] = [];
}

describe('CurrentPlanCard', () => {
  let fixture: ComponentFixture<Host>;

  function render(
    sub: BillingSubscription | null,
    features: readonly string[] = [],
  ): HTMLElement {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideI18nTesting()],
    });
    TestBed.inject(TranslocoService).setTranslation(COPY, 'en');
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.subscription = sub;
    fixture.componentInstance.features = features;
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const pill = (el: HTMLElement) => el.querySelector('hh-status-pill');
  const lines = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('[data-line]')).map((p) =>
      p.textContent?.trim(),
    );
  const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ') ?? '';

  afterEach(() => TestBed.resetTestingModule());

  describe('without a subscription', () => {
    it('says there is no plan yet, with no badge and no date', () => {
      const el = render(null);

      expect(text(el)).toContain('hostBilling.noPlanTitle');
      expect(text(el)).toContain('hostBilling.noPlanMessage');
      expect(pill(el)).toBeNull();
      expect(lines(el)).toEqual([]);
    });

    it('renders no button of its own', () => {
      const el = render(null);

      expect(
        el.querySelector('hh-current-plan-card button, hh-current-plan-card a'),
      ).toBeNull();
    });
  });

  it('names the plan and labels the badge with the status name as returned', () => {
    const el = render(subscription('active'));

    expect(el.querySelector('h2')?.textContent?.trim()).toBe('Growth');
    expect(pill(el)?.textContent?.trim()).toBe('Status active');
    expect(text(el)).not.toContain('hostBilling.noPlanTitle');
  });

  describe('status badge tone and date line', () => {
    it('active: ok, renews on the period end', () => {
      const el = render(subscription('active'));

      expect(pill(el)?.className).toContain('text-ok');
      expect(lines(el)).toEqual(['Renews on 12 Nov 2026']);
    });

    it('active and cancelling at period end: ends on, never renews', () => {
      const el = render(subscription('active', { cancel_at_period_end: true }));

      expect(pill(el)?.className).toContain('text-ok');
      expect(lines(el)).toEqual(['Ends on 12 Nov 2026']);
      expect(text(el)).not.toContain('Renews');
    });

    it('past due: warn, was due on the period end', () => {
      const el = render(subscription('past-due'));

      expect(pill(el)?.className).toContain('text-warn');
      expect(lines(el)).toEqual(['Payment was due on 12 Nov 2026']);
    });

    it('past due with a grace period: adds the date to pay by', () => {
      const el = render(
        subscription('past-due', {
          grace_until: '2026-11-19T00:00:00.000+05:00',
        }),
      );

      expect(lines(el)).toEqual([
        'Payment was due on 12 Nov 2026',
        'Pay by 19 Nov 2026 to keep your listing',
      ]);
    });

    it('incomplete: neutral, waiting for the first payment', () => {
      const el = render(subscription('incomplete'));

      expect(pill(el)?.className).toContain('text-ink-600');
      expect(lines(el)).toEqual(['hostBilling.awaitingFirstPayment']);
    });

    it('expired: danger, ended on the period end', () => {
      const el = render(subscription('expired'));

      expect(pill(el)?.className).toContain('text-danger');
      expect(lines(el)).toEqual(['Ended on 12 Nov 2026']);
    });

    it('canceled: neutral, ended on the period end', () => {
      const el = render(subscription('canceled'));

      expect(pill(el)?.className).toContain('text-ink-600');
      expect(lines(el)).toEqual(['Ended on 12 Nov 2026']);
    });

    it('an unknown slug: neutral, with no date line', () => {
      const el = render(subscription('paused'));

      expect(pill(el)?.className).toContain('text-ink-600');
      expect(pill(el)?.textContent?.trim()).toBe('Status paused');
      expect(lines(el)).toEqual([]);
    });

    it('drops a dated line whose date the API left null', () => {
      const el = render(subscription('active', { current_period_end: null }));

      expect(lines(el)).toEqual([]);
    });

    // The API sends the hostel's offset; the date must not slip a day for a viewer elsewhere.
    it('renders the date in the offset the API sent', () => {
      const el = render(
        subscription('active', {
          current_period_end: '2026-11-12T00:30:00.000+05:00',
        }),
      );

      expect(lines(el)).toEqual(['Renews on 12 Nov 2026']);
    });
  });

  describe('scheduled plan', () => {
    it('adds the switch at renewal, naming the scheduled plan', () => {
      const el = render(
        subscription('active', {
          scheduled_plan: { id: 'plStart', code: 'starter', name: 'Starter' },
        }),
      );

      expect(lines(el)).toEqual([
        'Renews on 12 Nov 2026',
        'Switches to Starter at renewal',
      ]);
    });

    it('has no switch line when nothing is scheduled', () => {
      const el = render(subscription('active'));

      expect(text(el)).not.toContain('Switches to');
    });
  });

  describe('active features', () => {
    const features = (el: HTMLElement) =>
      Array.from(el.querySelectorAll('li')).map((li) => li.textContent?.trim());

    it('lists what is on now, in a fixed order, from the features input', () => {
      const el = render(subscription('active'), ['crm', 'listing', 'boost']);

      expect(text(el)).toContain('hostBilling.activeFeatures');
      expect(features(el)).toEqual([
        'sharedBilling.featureListing',
        'sharedBilling.featureBoost',
        'sharedBilling.featureCrm',
      ]);
    });

    // The plan includes Boost, but past due switches it off: the list follows the input.
    it('follows the features input, not the plan', () => {
      const el = render(subscription('past-due'), ['listing', 'crm']);

      expect(features(el)).toEqual([
        'sharedBilling.featureListing',
        'sharedBilling.featureCrm',
      ]);
    });

    it('skips a feature it has no label for', () => {
      const el = render(subscription('active'), ['listing', 'insights']);

      expect(features(el)).toEqual(['sharedBilling.featureListing']);
    });

    it('shows no section when nothing is on', () => {
      const el = render(subscription('expired'), []);

      expect(text(el)).not.toContain('hostBilling.activeFeatures');
      expect(features(el)).toEqual([]);
    });
  });

  it('projects the caller’s actions into the card', () => {
    const el = render(subscription('active'));

    expect(el.querySelector('hh-card [data-test="projected"]')).not.toBeNull();
  });
});
