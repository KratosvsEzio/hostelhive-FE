import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { HostPropertyStore } from '@services';

/**
 * Bottom tab bar for the host console on the mobile app (design boards 42–44):
 * Overview · Rooms · Tenants · Invoices · More. Rendered by HostShell when
 * `MobileApp.isMobile` is true; the remaining sidebar destinations (profile,
 * team, utilities, analytics, subscription, property switcher) live on /more.
 */
@Component({
  selector: 'app-host-tab-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
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
      aria-label="Host console"
    >
      <div class="flex px-1 pt-1.5">
        <a [routerLink]="base() + '/overview'" routerLinkActive="on" class="tab">
          <i class="ti ti-layout-dashboard text-xl" aria-hidden="true"></i>Overview
        </a>
        <a [routerLink]="base() + '/rooms'" routerLinkActive="on" class="tab">
          <i class="ti ti-bed text-xl" aria-hidden="true"></i>Rooms
        </a>
        <a [routerLink]="base() + '/tenants'" routerLinkActive="on" class="tab">
          <i class="ti ti-users text-xl" aria-hidden="true"></i>Tenants
        </a>
        <a [routerLink]="base() + '/invoices'" routerLinkActive="on" class="tab">
          <i class="ti ti-file-invoice text-xl" aria-hidden="true"></i>Invoices
        </a>
        <a [routerLink]="base() + '/more'" routerLinkActive="on" class="tab">
          <i class="ti ti-dots text-xl" aria-hidden="true"></i>More
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
}
