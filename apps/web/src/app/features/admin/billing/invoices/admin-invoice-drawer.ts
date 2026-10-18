import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import type { BillingInvoice } from '@hostelhive/data-access';
import { Drawer, ErrorState, Skeleton, StatusPill } from '@hostelhive/ui';
import { AdminBillingApi } from '@services';
import { LocaleLink } from '@core/i18n/locale-link';
import { AdminUtcDate } from '../shared/admin-utc-date';
import { invoiceStatusTone } from '@app/shared/billing/billing-labels';
import { InvoiceSummary } from '@features/host/subscription/invoice-summary';
import {
  type AdminBillingError,
  adminBillingError,
} from '../shared/admin-billing-errors';
import {
  type AdminHostelState,
  adminHostelBillingPath,
  adminInvoiceKindKey,
  adminInvoiceStatusKey,
} from '../shared/admin-billing-labels';
import { AdminPaymentAttempts } from '../shared/admin-payment-attempts';
import { ADMIN_BILLING_DATE_TIME } from '../shared/admin-billing-cell-format';

type DrawerView =
  | { kind: 'loading' }
  | { kind: 'error'; error: AdminBillingError }
  | { kind: 'ready'; invoice: BillingInvoice };

/**
 * One invoice as an admin sees it, fetched fresh from `GET /api/admin/invoices/:id`: status,
 * type and dates, the lines and total, the PDF, every payment attempt with its internal
 * detail, and a link to the hostel's billing when the caller knows the hostel.
 *
 * The invoice itself carries no hostel, so a deep link without a list row has no hostel link.
 *
 * `<hh-admin-invoice-drawer [invoiceId]="id" [hostel]="row.hostel" (closed)="close()" (missing)="refetch()" />`
 */
@Component({
  selector: 'hh-admin-invoice-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Drawer,
    ErrorState,
    Skeleton,
    StatusPill,
    RouterLink,
    LocaleLink,
    TranslocoPipe,
    AdminUtcDate,
    InvoiceSummary,
    AdminPaymentAttempts,
  ],
  template: `
    @let v = view();
    <hh-drawer
      [heading]="
        v.kind === 'ready'
          ? ('adminBilling.invoices.title'
            | transloco: { number: v.invoice.number })
          : ('adminBilling.common.viewInvoice' | transloco)
      "
      widthClass="max-w-xl"
      (closed)="closed.emit()"
    >
      @switch (v.kind) {
        @case ('loading') {
          <div
            class="flex flex-col gap-3"
            aria-busy="true"
            data-testid="invoice-loading"
          >
            <hh-skeleton class="h-8 w-40" radius="md" />
            <hh-skeleton class="h-40 w-full" radius="lg" />
            <hh-skeleton class="h-24 w-full" radius="lg" />
          </div>
        }
        @case ('error') {
          @switch (v.error.kind) {
            @case ('forbidden') {
              <hh-error-state
                [message]="v.error.key | transloco"
                [showRetry]="false"
                data-testid="invoice-forbidden"
              />
            }
            @case ('notFound') {
              <hh-error-state
                [message]="v.error.key | transloco"
                [showRetry]="false"
                data-testid="invoice-not-found"
              />
            }
            @default {
              <hh-error-state
                [message]="
                  v.error.message ??
                  ('adminBilling.common.loadError' | transloco)
                "
                [retryLabel]="'adminBilling.common.retry' | transloco"
                [networkError]="v.error.kind === 'network'"
                (retry)="retry()"
                data-testid="invoice-error"
              />
            }
          }
        }
        @case ('ready') {
          @let inv = v.invoice;
          <div class="flex flex-col gap-4" data-testid="invoice-detail">
            <div class="flex flex-wrap items-center gap-2">
              <hh-status-pill [tone]="tone()" data-field="status">{{
                statusKey() ? (statusKey()! | transloco) : inv.status.name
              }}</hh-status-pill>
              <span class="text-sm text-ink-600" data-field="kind">{{
                kindKey() ? (kindKey()! | transloco) : '—'
              }}</span>
            </div>

            <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt class="text-ink-500">
                {{ 'adminBilling.columns.issued' | transloco }}
              </dt>
              <dd class="text-ink-900" data-field="issued">
                {{ inv.created_at | adminUtcDate: dateTime }}
              </dd>
              @switch (inv.status.slug) {
                @case ('open') {
                  @if (inv.expires_at) {
                    <dt class="text-ink-500">
                      {{ 'adminBilling.fields.expires' | transloco }}
                    </dt>
                    <dd class="text-ink-900" data-field="expires">
                      {{ inv.expires_at | adminUtcDate: dateTime }}
                    </dd>
                  }
                }
                @case ('paid') {
                  @if (inv.paid_at) {
                    <dt class="text-ink-500">
                      {{ 'adminBilling.columns.paid' | transloco }}
                    </dt>
                    <dd class="text-ink-900" data-field="paid">
                      {{ inv.paid_at | adminUtcDate: dateTime }}
                    </dd>
                  }
                }
                @case ('void') {
                  @if (inv.voided_at) {
                    <dt class="text-ink-500">
                      {{ 'adminBilling.fields.voided' | transloco }}
                    </dt>
                    <dd class="text-ink-900" data-field="voided">
                      {{ inv.voided_at | adminUtcDate: dateTime }}
                    </dd>
                  }
                }
              }
              <dt class="text-ink-500">
                {{ 'adminBilling.columns.pdf' | transloco }}
              </dt>
              <dd data-field="pdf">
                @if (inv.invoice_pdf_url; as url) {
                  <a
                    class="font-medium text-brand-600 hover:underline"
                    [href]="url"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="pdf-link"
                    >{{ 'adminBilling.columns.pdf' | transloco }}</a
                  >
                } @else if (inv.status.slug === 'paid') {
                  <span class="text-ink-500" data-testid="pdf-preparing">{{
                    'adminBilling.common.preparing' | transloco
                  }}</span>
                } @else {
                  <span class="text-ink-400">—</span>
                }
              </dd>
            </dl>
            <p class="text-xs text-ink-400" data-testid="dates-utc">
              {{ 'adminBilling.common.datesUtc' | transloco }}
            </p>

            <hh-invoice-summary [invoice]="inv" />

            <hh-admin-payment-attempts [payments]="inv.payments" />

            @if (hostel(); as h) {
              <a
                class="inline-flex items-center gap-1.5 self-start text-sm font-medium text-brand-600 hover:underline"
                [routerLink]="hostelLink()"
                [state]="hostelState()"
                data-testid="hostel-link"
                ><i class="ti ti-building" aria-hidden="true"></i
                >{{ 'adminBilling.common.viewHostelBilling' | transloco }} ·
                <bdi>{{ h.name }}</bdi></a
              >
            }
          </div>
        }
      }
    </hh-drawer>
  `,
})
export class AdminInvoiceDrawer {
  private readonly api = inject(AdminBillingApi);

  readonly invoiceId = input.required<string>();
  /** The hostel from the list row, when there is one; the invoice payload has none. */
  readonly hostel = input<{ id: string; name: string } | null>(null);
  readonly closed = output<void>();
  /** The invoice is gone (404); the copy shown tells the admin the list behind was refreshed. */
  readonly missing = output<void>();

  protected readonly dateTime = ADMIN_BILLING_DATE_TIME;

  private readonly refresh = signal(0);

  protected readonly view = toSignal(
    toObservable(
      computed(() => ({ id: this.invoiceId(), refresh: this.refresh() })),
    ).pipe(
      switchMap(({ id }) =>
        this.api.invoice(id).pipe(
          map((invoice): DrawerView => ({ kind: 'ready', invoice })),
          startWith<DrawerView>({ kind: 'loading' }),
          catchError((err: unknown) => {
            const error = adminBillingError(err);
            if (error.kind === 'notFound') this.missing.emit();
            return of<DrawerView>({ kind: 'error', error });
          }),
        ),
      ),
    ),
    { initialValue: { kind: 'loading' } as DrawerView },
  );

  private readonly invoice = computed(() => {
    const v = this.view();
    return v.kind === 'ready' ? v.invoice : null;
  });

  protected readonly statusKey = computed(() =>
    adminInvoiceStatusKey(this.invoice()?.status?.slug),
  );
  protected readonly tone = computed(() =>
    invoiceStatusTone(this.invoice()?.status?.slug),
  );
  protected readonly kindKey = computed(() =>
    adminInvoiceKindKey(this.invoice()?.kind),
  );

  protected readonly hostelLink = computed(() => {
    const h = this.hostel();
    return h ? adminHostelBillingPath(h.id) : null;
  });
  protected readonly hostelState = computed(() => {
    const h = this.hostel();
    return h
      ? ({ hostel: { id: h.id, name: h.name } } satisfies AdminHostelState)
      : undefined;
  });

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }
}
