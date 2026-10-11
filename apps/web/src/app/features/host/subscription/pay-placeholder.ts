import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { BillingInvoice } from '@hostelhive/data-access';
import { Button, EmptyState, ErrorState, Skeleton } from '@hostelhive/ui';
import { BillingApi } from '@services';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { LocaleLink } from '@core/i18n/locale-link';
import { BillingMoneyPipe } from '@app/shared/billing/billing-money.pipe';
import { ApiDate } from '@util/api-date';

/**
 * Where an issued invoice lands until online payment exists.
 *
 * It always reads the invoice from the server; an invoice handed over in the router's
 * navigation state only fills the page while that request is in flight. Payment itself is
 * not offered yet, so the page quotes the invoice number and sends the host to support.
 */
@Component({
  selector: 'hh-pay-placeholder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DashboardLayout,
    EmptyState,
    ErrorState,
    Skeleton,
    Button,
    RouterLink,
    LocaleLink,
    TranslocoPipe,
    BillingMoneyPipe,
    ApiDate,
  ],
  template: `
    <app-dashboard-layout [label]="'hostBilling.title' | transloco">
      <div class="mx-auto flex w-full max-w-xl flex-col gap-4">
        @if (invoice(); as inv) {
          <div class="flex flex-col gap-1">
            <p class="text-sm text-ink-500">
              {{
                'hostBilling.invoiceNumber' | transloco: { number: inv.number }
              }}
            </p>
            <p class="text-2xl font-bold text-ink-900">
              <bdi>{{ inv.total | billingMoney: inv.currency }}</bdi>
            </p>
            @if (inv.expires_at) {
              <p class="text-sm font-medium text-ink-700">
                {{
                  'hostBilling.payBy'
                    | transloco
                      : {
                          date:
                            (inv.expires_at | apiDate: 'd MMM yyyy, h:mm a'),
                        }
                }}
              </p>
            }
          </div>

          <hh-empty-state
            icon="ti-credit-card"
            [title]="'hostBilling.payStubTitle' | transloco"
            [message]="
              'hostBilling.payStubMessage' | transloco: { number: inv.number }
            "
          >
            <div class="flex flex-wrap items-center justify-center gap-2">
              <a hh-button size="sm" routerLink="/contact">{{
                'common.contactUs' | transloco
              }}</a>
              <a
                hh-button
                variant="text"
                size="sm"
                [routerLink]="billingLink()"
                >{{ 'hostBilling.backToBilling' | transloco }}</a
              >
            </div>
          </hh-empty-state>
        } @else if (failed()) {
          <hh-error-state
            [message]="'hostBilling.invoiceLoadError' | transloco"
            [retryLabel]="'common.tryAgain' | transloco"
            (retry)="load()"
          />
          <a hh-button variant="text" size="sm" [routerLink]="billingLink()">{{
            'hostBilling.backToBilling' | transloco
          }}</a>
        } @else {
          <div class="flex flex-col gap-3" data-testid="pay-loading">
            <hh-skeleton class="h-4 w-1/3" />
            <hh-skeleton class="h-8 w-1/2" />
            <hh-skeleton class="h-4 w-2/3" />
            <hh-skeleton class="h-40 w-full" radius="lg" />
          </div>
        }
      </div>
    </app-dashboard-layout>
  `,
})
export class PayPlaceholder {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(BillingApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly doc = inject(DOCUMENT);

  private readonly invoiceId =
    this.route.snapshot.paramMap.get('invoiceId') ?? '';

  // The hostel id sits on an ancestor route, so it is found by walking up from here.
  private readonly hostelId = this.route.pathFromRoot
    .map((r) => r.snapshot.paramMap.get('hostelId'))
    .filter((id): id is string => !!id)
    .at(-1);

  protected readonly invoice = signal<BillingInvoice | null>(this.handedOver());
  protected readonly failed = signal(false);

  protected readonly billingLink = computed(
    () => `/host/${this.hostelId ?? ''}/subscription`,
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    this.failed.set(false);
    this.api
      .invoice(this.invoiceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (inv) => this.invoice.set(inv),
        // A handed-over invoice stays on screen; only an empty page shows the failure.
        error: () => this.failed.set(true),
      });
  }

  private handedOver(): BillingInvoice | null {
    const state: unknown = this.doc.defaultView?.history?.state;
    const candidate = (state as { invoice?: BillingInvoice } | null)?.invoice;
    return candidate && candidate.id === this.invoiceId ? candidate : null;
  }
}
