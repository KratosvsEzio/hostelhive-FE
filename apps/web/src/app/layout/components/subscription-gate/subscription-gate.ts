import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button } from '@hostelhive/ui';
import { HostPropertyStore } from '@services';
import { LocaleLink } from '@core/i18n/locale-link';

const BENEFITS = [
  'Room & occupancy management',
  'Tenant tracking & payment records',
  'Rent and utility invoice generation',
  'Analytics and revenue reports',
];

/**
 * Full-page subscription gate — drop in whenever a feature is paywalled.
 * Resolves the subscription URL via HostPropertyStore so the link is
 * always correct regardless of which page the component is placed on.
 */
@Component({
  selector: 'hh-subscription-gate',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LocaleLink, Button],
  template: `
    <div class="flex flex-col items-center px-6 py-16 text-center">

      <!-- Icon -->
      <div class="mb-6 grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-200">
        <i class="ti ti-crown text-4xl text-white" aria-hidden="true"></i>
      </div>

      <!-- Headline -->
      <h2 class="font-display text-2xl font-bold text-ink-900">
        Unlock {{ feature() }}
      </h2>
      <p class="mx-auto mt-2 max-w-sm text-sm text-ink-500">
        This feature is available on paid plans. Subscribe to get full access
        to your hostel dashboard.
      </p>

      <!-- Benefits -->
      <ul class="mt-7 space-y-2.5 text-start">
        @for (item of benefits; track item) {
          <li class="flex items-center gap-3 text-sm text-ink-700">
            <i class="ti ti-circle-check shrink-0 text-base text-ok" aria-hidden="true"></i>
            {{ item }}
          </li>
        }
      </ul>

      <!-- CTA -->
      <div class="mt-8 flex flex-col items-center gap-3">
        <a hh-button [routerLink]="subscriptionLink()">
          <i class="ti ti-rosette" aria-hidden="true"></i>View plans &amp; subscribe
        </a>
        @if (showProfileLink()) {
          <a hh-button variant="text" size="sm" [routerLink]="profileLink()">
            Complete hostel profile first
          </a>
        }
      </div>

      <p class="mt-6 text-xs text-ink-400">
        Once subscribed, all features unlock automatically.
      </p>
    </div>
  `,
})
export class SubscriptionGate {
  private readonly store = inject(HostPropertyStore);

  readonly feature = input('This feature');
  readonly showProfileLink = input(false);

  protected readonly benefits = BENEFITS;
  protected readonly subscriptionLink = computed(
    () => `/host/${this.store.selected()}/subscription`,
  );
  protected readonly profileLink = computed(
    () => `/host/${this.store.selected()}/profile/${this.store.selected()}`,
  );
}
