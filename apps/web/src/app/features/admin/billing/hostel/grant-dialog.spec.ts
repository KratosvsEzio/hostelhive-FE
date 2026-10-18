import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslocoService } from '@jsverse/transloco';
import type { BillingSubscription, OpenInvoice } from '@hostelhive/data-access';
import { Dropdown } from '@hostelhive/ui';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import {
  AdminGrantDialog,
  GrantError,
  GrantPlan,
  GrantRequest,
} from './grant-dialog';

const COPY = {
  adminBilling: {
    grant: {
      startsNow: '{{plan}} starts today for {{months}} month(s).',
      voids: 'Unpaid invoice {{number}} will be closed.',
      planGone: 'That plan is no longer active.',
    },
  },
};

const STARTER: GrantPlan = { id: 'pSt1', code: 'starter', name: 'Starter' };
const PRO: GrantPlan = { id: 'pPr2', code: 'pro', name: 'Pro' };
const TEAM: GrantPlan = { id: 'pTm3', code: 'team', name: 'Team' };

const OPEN_INVOICE: OpenInvoice = {
  id: 'iNv4',
  number: 'HH-2026-000777',
  kind: 'new',
  total: '5000.00',
  currency: 'PKR',
  period_start: null,
  period_end: null,
  expires_at: null,
  awaiting_verification: false,
};

@Component({
  imports: [AdminGrantDialog],
  template: `
    <hh-admin-grant-dialog
      [subscription]="subscription()"
      [openInvoice]="openInvoice()"
      [plans]="plans()"
      [busy]="busy()"
      [error]="error()"
      (confirmed)="requests.push($event)"
      (cancelled)="cancels = cancels + 1"
    />
  `,
})
class Host {
  readonly subscription = signal<BillingSubscription | null>(null);
  readonly openInvoice = signal<OpenInvoice | null>(null);
  readonly plans = signal<readonly GrantPlan[]>([STARTER, PRO, TEAM]);
  readonly busy = signal(false);
  readonly error = signal<GrantError | null>(null);
  readonly requests: GrantRequest[] = [];
  cancels = 0;
}

describe('AdminGrantDialog', () => {
  function render() {
    TestBed.configureTestingModule({ providers: [provideI18nTesting()] });
    TestBed.inject(TranslocoService).setTranslation(COPY, 'en');
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const actions = (): HTMLButtonElement[] =>
      Array.from(
        el.querySelectorAll<HTMLButtonElement>('div.flex.gap-3 button'),
      );
    const dropdown = (id: string) =>
      fixture.debugElement.query(By.css(`[data-testid="${id}"]`));
    return {
      fixture,
      host: fixture.componentInstance,
      el,
      confirm: () => actions()[actions().length - 1],
      cancel: () => actions()[0],
      planValue: () =>
        (dropdown('grant-plan').componentInstance as Dropdown).value(),
      pick: (id: string, value: string) => {
        dropdown(id).triggerEventHandler('valueChange', value);
        fixture.detectChanges();
      },
      text: (id: string) =>
        el.querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? null,
    };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('starts on the first plan when nothing is live and emits the chosen plan and months', () => {
    const { host, confirm, pick, planValue, text } = render();

    expect(planValue()).toBe('pSt1');
    pick('grant-plan', 'pTm3');
    pick('grant-months', '24');
    expect(text('grant-starts-now')).toBe('Team starts today for 24 month(s).');

    confirm().click();
    expect(host.requests).toEqual([{ planId: 'pTm3', months: 24 }]);
  });

  it('ignores a months value outside 1 to 24', () => {
    const { host, confirm, pick } = render();

    pick('grant-months', '25');
    pick('grant-months', '0');
    confirm().click();

    expect(host.requests).toEqual([{ planId: 'pSt1', months: 1 }]);
  });

  it('warns that an open invoice is closed', () => {
    const { fixture, host, text } = render();
    host.openInvoice.set(OPEN_INVOICE);
    fixture.detectChanges();

    expect(text('grant-voids')).toBe(
      'Unpaid invoice HH-2026-000777 will be closed.',
    );
  });

  it('cannot confirm while busy', () => {
    const { fixture, host, confirm } = render();
    host.busy.set(true);
    fixture.detectChanges();

    expect(confirm().disabled).toBe(true);
    confirm().click();
    expect(host.requests).toEqual([]);
  });

  it('keeps the choice while it stays on offer and moves off a plan that leaves', () => {
    const { fixture, host, pick, planValue } = render();
    pick('grant-plan', 'pPr2');

    host.plans.set([STARTER, PRO]);
    fixture.detectChanges();
    expect(planValue()).toBe('pPr2');

    host.plans.set([STARTER, TEAM]);
    fixture.detectChanges();
    expect(planValue()).toBe('pSt1');
  });

  it('shows the server message verbatim, else our key', () => {
    const { fixture, host, text } = render();
    host.error.set({ message: 'Months must be between 1 and 24', key: 'x' });
    fixture.detectChanges();
    expect(text('grant-error')).toBe('Months must be between 1 and 24');

    host.error.set({ message: null, key: 'adminBilling.grant.planGone' });
    fixture.detectChanges();
    expect(text('grant-error')).toBe('That plan is no longer active.');
  });

  it('reports a cancel', () => {
    const { host, cancel } = render();

    cancel().click();
    expect(host.cancels).toBe(1);
  });
});
