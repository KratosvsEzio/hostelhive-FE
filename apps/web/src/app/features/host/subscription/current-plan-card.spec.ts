import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import type { BillingSubscription } from '@hostelhive/data-access';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { CurrentPlanCard, type CurrentPlanAction } from './current-plan-card';

// Only the keys that take a parameter carry copy, so the spec can see what was passed in.
const COPY = {
  hostBilling: {
    renewsOn: 'Renews on {{date}}',
    renewsAutomaticallyOn: 'Renews automatically on {{date}}',
    endsOn: 'Ends on {{date}}',
    endedOn: 'Ended on {{date}}',
    wasDueOn: 'Payment was due on {{date}}',
    graceUntil: 'Pay by {{date}} to keep your listing',
    switchesTo: 'Switches to {{plan}} on {{date}}',
    undoSwitchLabel: 'Undo the switch to {{plan}}',
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
    billed_by: 'invoice',
    safepay_status: null,
    ...over,
  };
}

@Component({
  imports: [CurrentPlanCard],
  template: `
    <hh-current-plan-card
      [subscription]="subscription"
      [features]="features"
      [canChange]="canChange"
      [autoRenew]="autoRenew"
      [busy]="busy"
      [locked]="locked"
      (undo)="emitted.push('undo')"
      (resume)="emitted.push('resume')"
      (cancelPlan)="emitted.push('cancel')"
    >
      <span data-test="projected">actions</span>
    </hh-current-plan-card>
  `,
})
class Host {
  subscription: BillingSubscription | null = null;
  features: readonly string[] = [];
  canChange = false;
  autoRenew = false;
  busy: CurrentPlanAction | null = null;
  locked = false;
  emitted: CurrentPlanAction[] = [];
}

interface Controls {
  canChange?: boolean;
  autoRenew?: boolean;
  busy?: CurrentPlanAction | null;
  locked?: boolean;
}

describe('CurrentPlanCard', () => {
  let fixture: ComponentFixture<Host>;

  function render(
    sub: BillingSubscription | null,
    features: readonly string[] = [],
    controls: Controls = {},
  ): HTMLElement {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideI18nTesting()],
    });
    TestBed.inject(TranslocoService).setTranslation(COPY, 'en');
    fixture = TestBed.createComponent(Host);
    Object.assign(fixture.componentInstance, {
      subscription: sub,
      features,
      ...controls,
    });
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

  describe('automatic renewal', () => {
    it('renews automatically on the period end when the saved card renews the plan', () => {
      const el = render(subscription('active'), [], { autoRenew: true });

      expect(lines(el)).toEqual(['Renews automatically on 12 Nov 2026']);
      expect(text(el)).not.toContain('Renews on');
    });

    it('keeps the plain renewal line without automatic renewal', () => {
      const el = render(subscription('active'), [], { autoRenew: false });

      expect(lines(el)).toEqual(['Renews on 12 Nov 2026']);
    });

    it('ends on the period end while cancelling, whatever the flag says', () => {
      const el = render(
        subscription('active', { cancel_at_period_end: true }),
        [],
        { autoRenew: true },
      );

      expect(lines(el)).toEqual(['Ends on 12 Nov 2026']);
    });

    it('never says so on a plan Safepay bills', () => {
      const el = render(
        subscription('active', { billed_by: 'safepay_subscription' }),
        [],
        { autoRenew: true },
      );

      expect(lines(el)).toEqual(['Renews on 12 Nov 2026']);
    });

    it('leaves a past-due plan’s lines alone', () => {
      const el = render(subscription('past-due'), [], { autoRenew: true });

      expect(lines(el)).toEqual(['Payment was due on 12 Nov 2026']);
    });

    it('drops the line when the API left the period end null', () => {
      const el = render(
        subscription('active', { current_period_end: null }),
        [],
        { autoRenew: true },
      );

      expect(lines(el)).toEqual([]);
    });
  });

  describe('scheduled plan', () => {
    const starter = { id: 'plStart', code: 'starter', name: 'Starter' };

    it('adds the switch on the period end, naming the scheduled plan', () => {
      const el = render(subscription('active', { scheduled_plan: starter }));

      expect(lines(el)).toEqual([
        'Renews on 12 Nov 2026',
        'Switches to Starter on 12 Nov 2026',
      ]);
    });

    it('has no switch line when nothing is scheduled', () => {
      const el = render(subscription('active'));

      expect(text(el)).not.toContain('Switches to');
    });

    // Cancel wins at period end, so the switch will not happen.
    it('has no switch line while cancelling', () => {
      const el = render(
        subscription('active', {
          scheduled_plan: starter,
          cancel_at_period_end: true,
        }),
      );

      expect(lines(el)).toEqual(['Ends on 12 Nov 2026']);
    });

    it.each(['past-due', 'incomplete', 'expired', 'canceled'])(
      'has no switch line on %s',
      (slug) => {
        const el = render(subscription(slug, { scheduled_plan: starter }));

        expect(text(el)).not.toContain('Switches to');
      },
    );

    it('has no switch line without a period end to name', () => {
      const el = render(
        subscription('active', {
          scheduled_plan: starter,
          current_period_end: null,
        }),
      );

      expect(text(el)).not.toContain('Switches to');
    });
  });

  describe('plan-change controls', () => {
    const starter = { id: 'plStart', code: 'starter', name: 'Starter' };
    const undo = (el: HTMLElement) =>
      el.querySelector<HTMLButtonElement>('[data-testid="card-undo"]');
    const resume = (el: HTMLElement) =>
      el.querySelector<HTMLButtonElement>('[data-testid="card-resume"]');
    const cancel = (el: HTMLElement) =>
      el.querySelector<HTMLButtonElement>('[data-testid="card-cancel"]');
    const shown = (el: HTMLElement) => ({
      undo: !!undo(el),
      resume: !!resume(el),
      cancel: !!cancel(el),
    });
    const none = { undo: false, resume: false, cancel: false };

    describe('with permission to change the plan', () => {
      const can = { canChange: true };

      it('active: offers Cancel plan only', () => {
        const el = render(subscription('active'), [], can);

        expect(shown(el)).toEqual({ undo: false, resume: false, cancel: true });
        expect(cancel(el)?.textContent?.trim()).toBe('hostBilling.cancelPlan');
      });

      it('active with a switch: offers Undo and Cancel plan', () => {
        const el = render(
          subscription('active', { scheduled_plan: starter }),
          [],
          can,
        );

        expect(shown(el)).toEqual({ undo: true, resume: false, cancel: true });
        expect(undo(el)?.textContent?.trim()).toBe('hostBilling.undo');
      });

      it('active and cancelling: offers Resume plan only', () => {
        const el = render(
          subscription('active', { cancel_at_period_end: true }),
          [],
          can,
        );

        expect(shown(el)).toEqual({ undo: false, resume: true, cancel: false });
        expect(resume(el)?.textContent?.trim()).toBe('hostBilling.resumePlan');
      });

      it('active, cancelling and with a switch: Resume plan only, no Undo', () => {
        const el = render(
          subscription('active', {
            scheduled_plan: starter,
            cancel_at_period_end: true,
          }),
          [],
          can,
        );

        expect(shown(el)).toEqual({ undo: false, resume: true, cancel: false });
      });

      it('places Resume plan on the Ends on line', () => {
        const el = render(
          subscription('active', { cancel_at_period_end: true }),
          [],
          can,
        );

        expect(
          resume(el)?.parentElement?.querySelector(
            '[data-line="hostBilling.endsOn"]',
          ),
        ).not.toBeNull();
      });

      it('still offers Resume plan when the API left the end date null', () => {
        const el = render(
          subscription('active', {
            cancel_at_period_end: true,
            current_period_end: null,
          }),
          [],
          can,
        );

        expect(shown(el)).toEqual({ undo: false, resume: true, cancel: false });
      });

      it('places Undo on the Switches to line', () => {
        const el = render(
          subscription('active', { scheduled_plan: starter }),
          [],
          can,
        );

        expect(
          undo(el)?.parentElement?.querySelector(
            '[data-line="hostBilling.switchesTo"]',
          ),
        ).not.toBeNull();
      });

      it('places Cancel plan after the features and before the projected content', () => {
        const el = render(subscription('active'), ['listing'], can);
        const card = el.querySelector('hh-card') as HTMLElement;
        const order = Array.from(
          card.querySelectorAll(
            'li, [data-testid="card-cancel"], [data-test="projected"]',
          ),
        ).map((n) => n.tagName.toLowerCase());

        expect(order).toEqual(['li', 'button', 'span']);
      });

      it.each(['past-due', 'incomplete', 'expired', 'canceled', 'paused'])(
        '%s: offers nothing, even with a switch or a cancel set',
        (slug) => {
          const el = render(
            subscription(slug, {
              scheduled_plan: starter,
              cancel_at_period_end: true,
            }),
            [],
            can,
          );
          const el2 = render(subscription(slug), [], can);

          expect(shown(el)).toEqual(none);
          expect(shown(el2)).toEqual(none);
        },
      );

      it('without a subscription: offers nothing', () => {
        const el = render(null, [], can);

        expect(shown(el)).toEqual(none);
      });
    });

    describe('without permission to change the plan', () => {
      it.each([
        ['active', {}],
        ['active with a switch', { scheduled_plan: starter }],
        ['active and cancelling', { cancel_at_period_end: true }],
      ] as const)('%s: offers nothing', (_, over) => {
        const el = render(subscription('active', over), [], {
          canChange: false,
        });

        expect(shown(el)).toEqual(none);
      });

      it('is the default, so the switch line still shows without Undo', () => {
        const el = render(subscription('active', { scheduled_plan: starter }));

        expect(lines(el)).toContain('Switches to Starter on 12 Nov 2026');
        expect(shown(el)).toEqual(none);
      });
    });

    it('names the plan in Undo’s accessible label', () => {
      const el = render(
        subscription('active', { scheduled_plan: starter }),
        [],
        { canChange: true },
      );

      expect(undo(el)?.getAttribute('aria-label')).toBe(
        'Undo the switch to Starter',
      );
    });

    it('keeps the status lines in a polite live region', () => {
      const el = render(
        subscription('active', { scheduled_plan: starter }),
        [],
        { canChange: true },
      );
      const region = el.querySelector('[data-testid="plan-status"]');

      expect(region?.getAttribute('aria-live')).toBe('polite');
      expect(
        Array.from(region?.querySelectorAll('[data-line]') ?? []).map((p) =>
          p.getAttribute('data-line'),
        ),
      ).toEqual(['hostBilling.renewsOn', 'hostBilling.switchesTo']);
    });

    it('has no live region without a subscription', () => {
      const el = render(null);

      expect(el.querySelector('[data-testid="plan-status"]')).toBeNull();
    });

    describe('locked and busy', () => {
      const withSwitch = subscription('active', { scheduled_plan: starter });
      const cancelling = subscription('active', { cancel_at_period_end: true });

      it('enables every control by default', () => {
        const a = render(withSwitch, [], { canChange: true });
        const b = render(cancelling, [], { canChange: true });

        expect(undo(a)?.disabled).toBe(false);
        expect(cancel(a)?.disabled).toBe(false);
        expect(resume(b)?.disabled).toBe(false);
      });

      it('locked disables all three', () => {
        const a = render(withSwitch, [], { canChange: true, locked: true });
        const b = render(cancelling, [], { canChange: true, locked: true });

        expect(undo(a)?.disabled).toBe(true);
        expect(cancel(a)?.disabled).toBe(true);
        expect(resume(b)?.disabled).toBe(true);
      });

      it.each([
        ['undo', 'card-undo', withSwitch],
        ['cancel', 'card-cancel', withSwitch],
        ['resume', 'card-resume', cancelling],
      ] as const)(
        'busy %s puts the spinner on that control only',
        (action, testId, sub) => {
          const el = render(sub, [], { canChange: true, busy: action });
          const spinning = Array.from(
            el.querySelectorAll('[data-testid^="card-"]'),
          ).filter((b) => b.getAttribute('aria-busy') === 'true');

          expect(spinning.map((b) => b.getAttribute('data-testid'))).toEqual([
            testId,
          ]);
          expect(
            el.querySelector(`[data-testid="${testId}"] .ti-loader-2`),
          ).not.toBeNull();
        },
      );
    });

    describe('outputs', () => {
      it.each([
        ['undo', 'card-undo', { scheduled_plan: starter }],
        ['cancel', 'card-cancel', {}],
        ['resume', 'card-resume', { cancel_at_period_end: true }],
      ] as const)('%s emits on click', (action, testId, over) => {
        const el = render(subscription('active', over), [], {
          canChange: true,
        });

        el.querySelector<HTMLButtonElement>(
          `[data-testid="${testId}"]`,
        )?.click();

        expect(fixture.componentInstance.emitted).toEqual([action]);
      });

      it('emits nothing from a locked control', () => {
        const el = render(subscription('active'), [], {
          canChange: true,
          locked: true,
        });

        cancel(el)?.click();

        expect(fixture.componentInstance.emitted).toEqual([]);
      });
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
