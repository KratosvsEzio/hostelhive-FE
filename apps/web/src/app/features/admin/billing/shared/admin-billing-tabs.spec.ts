import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { AdminBillingTabs } from './admin-billing-tabs';

const COPY = {
  adminBilling: {
    tabs: {
      label: 'Billing sections',
      verify: 'To verify',
      verifyCount: 'To verify ({{count}})',
      payments: 'Payments',
      invoices: 'Invoices',
      plans: 'Plans & prices',
    },
  },
};

@Component({ template: '' })
class Blank {}

describe('AdminBillingTabs', () => {
  async function render(url: string, verifyCount: number | null = null) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', component: Blank }]),
        provideI18nTesting(),
      ],
    });
    TestBed.inject(TranslocoService).setTranslation(COPY, 'en');
    await TestBed.inject(Router).navigateByUrl(url);
    const fixture = TestBed.createComponent(AdminBillingTabs);
    fixture.componentRef.setInput('verifyCount', verifyCount);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const tab = (el: HTMLElement, id: string) =>
    el.querySelector<HTMLAnchorElement>(`[data-testid="tab-${id}"]`);

  afterEach(() => TestBed.resetTestingModule());

  it('links every section and names the nav', async () => {
    const el = await render('/en/admin/billing/payments');

    expect(el.querySelector('nav')?.getAttribute('aria-label')).toBe(
      'Billing sections',
    );
    expect(
      ['verification', 'payments', 'invoices', 'plans'].map((id) => [
        tab(el, id)?.getAttribute('href'),
        tab(el, id)?.textContent?.trim(),
      ]),
    ).toEqual([
      ['/en/admin/billing/verification', 'To verify'],
      ['/en/admin/billing/payments', 'Payments'],
      ['/en/admin/billing/invoices', 'Invoices'],
      ['/en/admin/billing/plans', 'Plans & prices'],
    ]);
  });

  it('marks the current section', async () => {
    const el = await render('/en/admin/billing/invoices');

    expect(tab(el, 'invoices')?.getAttribute('aria-current')).toBe('page');
    expect(tab(el, 'payments')?.hasAttribute('aria-current')).toBe(false);
    expect(tab(el, 'invoices')?.className).toContain('bg-white');
  });

  it('shows the queue count only when given one', async () => {
    const el = await render('/en/admin/billing/verification', 3);

    expect(tab(el, 'verification')?.textContent?.trim()).toBe('To verify (3)');
    expect(tab(el, 'verification')?.getAttribute('aria-current')).toBe('page');
  });
});
