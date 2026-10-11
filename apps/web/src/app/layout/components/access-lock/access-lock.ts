import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from '@hostelhive/ui';
import { LocaleLink } from '@core/i18n/locale-link';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';

export type AccessLockVariant = 'offline' | 'crm';

/**
 * Full-page lock for a host section the hostel's plan state shuts: the hostel is offline, or
 * the plan has no CRM. Owners get a link to billing; staff are told to ask the owner.
 */
@Component({
  selector: 'hh-access-lock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DashboardLayout, RouterLink, LocaleLink, Button, TranslocoPipe],
  template: `
    <app-dashboard-layout [label]="sectionLabel() | transloco">
      <div class="flex flex-col items-center px-6 py-16 text-center" data-testid="access-lock">
        <div class="mb-6 grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-500 shadow-lg shadow-brand-200">
          <i class="ti ti-lock text-4xl text-white" aria-hidden="true"></i>
        </div>

        @if (canManageBilling()) {
          <h2 class="font-display text-2xl font-bold text-ink-900">{{ titleKey() | transloco }}</h2>
          <p class="mx-auto mt-2 max-w-sm text-sm text-ink-500">{{ bodyKey() | transloco }}</p>
          @if (variant() === 'crm') {
            <p class="mx-auto mt-2 max-w-sm text-sm text-ink-500">{{ 'hostAccess.crmKept' | transloco }}</p>
          }
          <div class="mt-8">
            <a hh-button [routerLink]="billingLink()" data-testid="access-lock-link">
              <i class="ti ti-rosette" aria-hidden="true"></i>{{ actionKey() | transloco }}
            </a>
          </div>
        } @else {
          <p class="mx-auto max-w-sm text-sm text-ink-500">{{ staffKey() | transloco }}</p>
        }
      </div>
    </app-dashboard-layout>
  `,
})
export class AccessLock {
  readonly variant = input.required<AccessLockVariant>();
  readonly sectionLabel = input.required<string>();
  readonly hostelId = input.required<string>();
  readonly canManageBilling = input.required<boolean>();

  protected readonly billingLink = computed(() => `/host/${this.hostelId()}/subscription`);
  protected readonly titleKey = computed(() =>
    this.variant() === 'crm' ? 'hostAccess.crmTitle' : 'hostAccess.offlineTitle',
  );
  protected readonly bodyKey = computed(() =>
    this.variant() === 'crm' ? 'hostAccess.crmBody' : 'hostAccess.offlineBody',
  );
  protected readonly actionKey = computed(() =>
    this.variant() === 'crm' ? 'hostAccess.upgrade' : 'hostAccess.goToBilling',
  );
  protected readonly staffKey = computed(() =>
    this.variant() === 'crm' ? 'hostAccess.crmStaff' : 'hostAccess.offlineBodyStaff',
  );
}
