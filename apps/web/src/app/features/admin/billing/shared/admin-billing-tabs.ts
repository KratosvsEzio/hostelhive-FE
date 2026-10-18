import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocaleLink } from '@core/i18n/locale-link';
import { ADMIN_BILLING_PATHS } from './admin-billing-labels';

interface BillingTab {
  link: string;
  labelKey: string;
  testId: string;
}

// The verification tab's label depends on the count, so it is written in the template.
const OTHER_TABS: readonly BillingTab[] = [
  {
    link: ADMIN_BILLING_PATHS.payments,
    labelKey: 'adminBilling.tabs.payments',
    testId: 'tab-payments',
  },
  {
    link: ADMIN_BILLING_PATHS.invoices,
    labelKey: 'adminBilling.tabs.invoices',
    testId: 'tab-invoices',
  },
  {
    link: ADMIN_BILLING_PATHS.plans,
    labelKey: 'adminBilling.tabs.plans',
    testId: 'tab-plans',
  },
];

const TAB_BASE = 'shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 transition';
const TAB_ON = `${TAB_BASE} bg-white text-ink-900 shadow-card`;
const TAB_OFF = `${TAB_BASE} bg-ink-100 text-ink-500 hover:bg-ink-200 hover:text-ink-800`;

/**
 * The admin billing sections as links, styled like `hh-tabs`, with the current one raised.
 *
 * `<hh-admin-billing-tabs [verifyCount]="total()" />` — only the verification queue passes
 * a count, so every other page shows the plain "To verify".
 */
@Component({
  selector: 'hh-admin-billing-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, LocaleLink, TranslocoPipe],
  host: { class: 'block' },
  template: `
    <nav
      class="flex gap-1 overflow-x-auto rounded-xl bg-surface p-1 text-sm font-medium"
      [attr.aria-label]="'adminBilling.tabs.label' | transloco"
    >
      <a
        #verify="routerLinkActive"
        [routerLink]="paths.verification"
        routerLinkActive
        ariaCurrentWhenActive="page"
        [class]="verify.isActive ? tabOn : tabOff"
        data-testid="tab-verification"
      >
        @if (verifyCount() !== null) {
          {{
            'adminBilling.tabs.verifyCount'
              | transloco: { count: verifyCount() }
          }}
        } @else {
          {{ 'adminBilling.tabs.verify' | transloco }}
        }
      </a>
      @for (tab of tabs; track tab.link) {
        <a
          #active="routerLinkActive"
          [routerLink]="tab.link"
          routerLinkActive
          ariaCurrentWhenActive="page"
          [class]="active.isActive ? tabOn : tabOff"
          [attr.data-testid]="tab.testId"
        >
          {{ tab.labelKey | transloco }}
        </a>
      }
    </nav>
  `,
})
export class AdminBillingTabs {
  /** The queue's total, shown in its tab; null shows the plain label. */
  readonly verifyCount = input<number | null>(null);

  protected readonly paths = ADMIN_BILLING_PATHS;
  protected readonly tabs = OTHER_TABS;
  protected readonly tabOn = TAB_ON;
  protected readonly tabOff = TAB_OFF;
}
