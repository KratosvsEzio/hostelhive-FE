import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { HhLink } from '@hostelhive/ui';
import type { SubscriptionEvent } from '@hostelhive/data-access';
import { LocaleLink } from '@core/i18n/locale-link';
import { AdminUtcDate } from '../shared/admin-utc-date';
import { ADMIN_BILLING_DATE_TIME } from '../shared/admin-billing-cell-format';
import {
  ADMIN_BILLING_PATHS,
  AdminEventView,
  adminEventsNewestFirst,
} from '../shared/admin-billing-labels';

/** The backend sends at most this many events, the latest ones. */
const EVENTS_LIMIT = 100;

/**
 * A hostel's subscription history, newest first, each event in admin wording.
 *
 * `planName` turns a plan code from the event data into its name; it returns the code when
 * the plan is unknown. The source list is never reordered in place.
 *
 * `<hh-admin-billing-events [events]="data.events" [planName]="planName()" />`
 */
@Component({
  selector: 'hh-admin-billing-events',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LocaleLink, HhLink, TranslocoPipe, AdminUtcDate],
  host: { class: 'block' },
  template: `
    <section
      class="rounded-xl border border-ink-200 bg-white px-5 py-4"
      aria-labelledby="hostel-billing-events-title"
      data-testid="billing-events"
    >
      <div
        class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
      >
        <h2
          id="hostel-billing-events-title"
          class="font-display text-base font-bold text-ink-900"
        >
          {{ 'adminBilling.events.title' | transloco }}
        </h2>
        <p class="text-xs text-ink-500">
          {{ 'adminBilling.common.datesUtc' | transloco }}
        </p>
      </div>
      @if (views().length) {
        <ol class="mt-3 divide-y divide-ink-100">
          @for (view of views(); track view.id) {
            <li
              class="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
              data-testid="billing-event"
              [attr.data-kind]="view.kind"
            >
              <div class="flex min-w-0 flex-col gap-0.5">
                <p class="text-sm font-medium text-ink-800" data-field="label">
                  {{
                    view.key
                      | transloco
                        : {
                            plan: view.params['plan'],
                            from: view.params['from'],
                            to: view.params['to'],
                            reason: view.params['reason'],
                            kind: view.params['kind'],
                            admin: view.params['admin'],
                            date: (view.date | adminUtcDate: 'd MMM yyyy'),
                          }
                  }}
                </p>
                @if (view.invoiceNumber; as number) {
                  <a
                    hhLink
                    class="text-xs"
                    [routerLink]="invoicesPath"
                    [queryParams]="{ number }"
                    data-field="invoice"
                    >{{
                      'adminBilling.events.invoice' | transloco: { number }
                    }}</a
                  >
                }
              </div>
              <time
                class="shrink-0 text-xs text-ink-500"
                [attr.datetime]="view.createdAt"
                data-field="created"
                >{{ view.createdAt | adminUtcDate: dateTime }}</time
              >
            </li>
          }
        </ol>
        @if (atLimit()) {
          <p class="mt-2 text-xs text-ink-500" data-testid="events-limit">
            {{ 'adminBilling.events.limit' | transloco }}
          </p>
        }
      } @else {
        <p class="mt-3 text-sm text-ink-600" data-testid="events-empty">
          {{ 'adminBilling.events.empty' | transloco }}
        </p>
      }
    </section>
  `,
})
export class AdminBillingEvents {
  /** Oldest to newest, as the API sends them. */
  readonly events = input.required<readonly SubscriptionEvent[]>();
  readonly planName = input<(code: string) => string>((code) => code);

  protected readonly invoicesPath = ADMIN_BILLING_PATHS.invoices;
  protected readonly dateTime = ADMIN_BILLING_DATE_TIME;

  protected readonly views = computed<readonly AdminEventView[]>(() =>
    adminEventsNewestFirst(this.events(), this.planName()),
  );

  protected readonly atLimit = computed(
    () => this.events().length === EVENTS_LIMIT,
  );
}
