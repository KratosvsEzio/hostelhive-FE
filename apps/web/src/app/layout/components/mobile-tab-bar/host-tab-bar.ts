import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { HostPropertyStore } from '@services';
import { LocaleLink } from '@core/i18n/locale-link';
import { hostTabBar } from '@layout/host-shell/host-nav';

/**
 * Bottom tab bar for the host console on the mobile app (design boards 42–44):
 * Overview · Rooms · Tenants-or-Bookings · Invoices · More. Rendered by HostShell when
 * `MobileApp.isMobile` is true — which is any viewport under 768px, not only the
 * packaged app, and at that width HostShell renders no sidebar at all.
 *
 * These five plus /more are therefore the *whole* of host navigation on a phone, so a
 * sidebar destination missing from both is unreachable except by typing its URL. That is
 * what happened to Bookings, which sat in neither list until it was added to /more. When
 * adding a destination to the sidebar, give it a home here or there in the same change.
 *
 * The destinations come from `hostTabBar`, which `/more` also reads to know what to leave
 * out — so the two cannot drift into hiding a page between them. They were separate lists
 * until the third slot started moving with the billing cycle.
 */
@Component({
  selector: 'app-host-tab-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LocaleLink, RouterLinkActive, TranslocoPipe],
  styles: `
    :host { display: block; }
    .tab {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 4px 0 6px;
      font-size: 10px;
      font-weight: 500;
      color: #a3a3a3;
      text-decoration: none;
    }
    .tab.on { color: #f36e21; }
  `,
  template: `
    <nav
      class="safe-pb fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-white"
      [attr.aria-label]="'a11y.hostConsole' | transloco"
    >
      <div class="flex px-1 pt-1.5">
        @for (t of tabs(); track t.suffix) {
          <a [routerLink]="base() + t.suffix" routerLinkActive="on" class="tab">
            <i class="ti text-xl" [class]="t.icon" aria-hidden="true"></i>{{ t.label | transloco }}
          </a>
        }
        <a [routerLink]="base() + '/more'" routerLinkActive="on" class="tab">
          <i class="ti ti-dots text-xl" aria-hidden="true"></i>{{ 'common.more' | transloco }}
        </a>
      </div>
    </nav>
  `,
})
export class HostTabBar {
  private readonly propertyStore = inject(HostPropertyStore);
  protected readonly base = computed(
    () => `/host/${this.propertyStore.selected()}`,
  );

  protected readonly tabs = computed(() =>
    hostTabBar({ monthlyBilled: this.propertyStore.isMonthlyBilled() }),
  );
}
