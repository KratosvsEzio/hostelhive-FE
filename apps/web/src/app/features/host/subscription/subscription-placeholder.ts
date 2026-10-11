import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, EmptyState } from '@hostelhive/ui';
import { HostPropertyStore } from '@services';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { LocaleLink } from '@core/i18n/locale-link';

/**
 * The hostel's billing page while billing moves to its new system.
 *
 * Deliberately data-free: it cannot know the hostel's plan, so it states only what is true for
 * every host — billing is moving, and support can help in the meantime. The paywall card and
 * the booking drawer's renew notice both link here.
 */
@Component({
  selector: 'hh-subscription-placeholder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DashboardLayout,
    EmptyState,
    Button,
    RouterLink,
    LocaleLink,
    TranslocoPipe,
  ],
  template: `
    <app-dashboard-layout [label]="'common.subscription' | transloco">
      <hh-empty-state
        icon="ti-rosette"
        [title]="'hostBilling.comingSoonTitle' | transloco"
        [message]="'hostBilling.comingSoonMessage' | transloco"
      >
        <div class="flex flex-wrap items-center justify-center gap-2">
          <a hh-button size="sm" routerLink="/contact">{{
            'common.contactUs' | transloco
          }}</a>
          <a hh-button variant="text" size="sm" [routerLink]="overviewLink()">{{
            'hostBilling.backToDashboard' | transloco
          }}</a>
        </div>
      </hh-empty-state>
    </app-dashboard-layout>
  `,
})
export class SubscriptionPlaceholder {
  private readonly store = inject(HostPropertyStore);

  protected readonly overviewLink = computed(
    () => `/host/${this.store.selected()}/overview`,
  );
}
