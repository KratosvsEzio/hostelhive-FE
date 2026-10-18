import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import type {
  AdminPaymentPage,
  AdminPaymentRow,
} from '@hostelhive/data-access';
import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  type PaginationConfig,
  Skeleton,
  Toast,
} from '@hostelhive/ui';
import { ADMIN_BILLING_PAGE_SIZE, AdminBillingApi } from '@services';
import { LocaleLink } from '@core/i18n/locale-link';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { adminBillingVerificationCols } from '@util/table-configs/admin-billing-verification-cols';
import { adminBillingError } from '../shared/admin-billing-errors';
import { ADMIN_BILLING_PATHS } from '../shared/admin-billing-labels';
import { AdminBillingTabs } from '../shared/admin-billing-tabs';
import { injectAdminBillingCellFormat } from '../shared/admin-billing-cell-format';
import {
  AdminPaymentDrawer,
  type AdminPaymentOutcome,
} from '../payments/admin-payment-drawer';

type QueueView =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'error'; networkError: boolean }
  | { kind: 'ready'; result: AdminPaymentPage };

interface Notice {
  key: string;
  params: Record<string, string>;
}

/** `?page=` as a page number; anything that is not a whole number from 1 up reads as page 1. */
function pageFrom(raw: string | null): number {
  const page = Number.parseInt(raw ?? '', 10);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

/**
 * Bank transfers waiting for an admin to confirm the money arrived, oldest first so the longest
 * wait is on top. Each row opens the payment drawer, where it is verified or rejected.
 *
 * A handled payment leaves the queue at once and stays gone: the search index the list reads
 * catches up about a second after the write, so a refetch straight after can still return it.
 */
@Component({
  selector: 'hh-admin-verification',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DashboardLayout,
    AdminBillingTabs,
    AdminPaymentDrawer,
    Button,
    DataTable,
    EmptyState,
    ErrorState,
    Skeleton,
    Toast,
    RouterLink,
    LocaleLink,
    TranslocoPipe,
  ],
  templateUrl: './admin-verification.html',
})
export class AdminVerification {
  private readonly api = inject(AdminBillingApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly format = injectAdminBillingCellFormat();

  protected readonly paths = ADMIN_BILLING_PATHS;

  protected readonly page = toSignal(
    this.route.queryParamMap.pipe(map((params) => pageFrom(params.get('page')))),
    { initialValue: 1 },
  );

  private readonly refresh = signal(0);
  /** Payments verified or rejected here, hidden whatever the next fetch says. */
  private readonly handled = signal<ReadonlySet<string>>(new Set());

  protected readonly selected = signal<AdminPaymentRow | null>(null);
  protected readonly notice = signal<Notice | null>(null);

  protected readonly view = toSignal(
    toObservable(
      computed(() => ({ page: this.page(), refresh: this.refresh() })),
    ).pipe(
      switchMap(({ page }) =>
        this.api
          .payments({
            status: 'awaiting-verification',
            sort: { field: 'created_at', dir: 'asc' },
            page,
            limit: ADMIN_BILLING_PAGE_SIZE,
          })
          .pipe(
            map((result): QueueView => ({ kind: 'ready', result })),
            startWith<QueueView>({ kind: 'loading' }),
            catchError((err: unknown) => {
              const error = adminBillingError(err);
              return of<QueueView>(
                error.kind === 'forbidden'
                  ? { kind: 'forbidden' }
                  : { kind: 'error', networkError: error.kind === 'network' },
              );
            }),
          ),
      ),
    ),
    { initialValue: { kind: 'loading' } as QueueView },
  );

  private readonly result = computed(() => {
    const v = this.view();
    return v.kind === 'ready' ? v.result : null;
  });

  protected readonly rows = computed(() => {
    const handled = this.handled();
    return (this.result()?.rows ?? []).filter((r) => !handled.has(r.id));
  });

  // The last page loaded, held through a refetch so the tab count does not blink.
  private readonly lastResult = linkedSignal<
    QueueView,
    AdminPaymentPage | null
  >({
    source: () => this.view(),
    computation: (view, previous) => {
      if (view.kind === 'ready') return view.result;
      return view.kind === 'loading' ? (previous?.value ?? null) : null;
    },
  });

  /** The server's count, less the handled payments it still listed. */
  protected readonly count = computed<number | null>(() => {
    const result = this.lastResult();
    if (!result) return null;
    const handled = this.handled();
    const stillListed = result.rows.filter((r) => handled.has(r.id)).length;
    return Math.max(0, result.page.total - stillListed);
  });

  protected readonly networkError = computed(() => {
    const v = this.view();
    return v.kind === 'error' && v.networkError;
  });

  protected readonly columns = computed(() =>
    adminBillingVerificationCols(this.format()),
  );
  protected readonly rowId = (row: unknown) => (row as AdminPaymentRow).id;

  protected readonly pagination = computed<PaginationConfig | null>(() => {
    const info = this.result()?.page;
    if (!info || info.totalPages <= 1) return null;
    return {
      page: info.page,
      total: this.count() ?? info.total,
      totalPages: info.totalPages,
      hasNextPage: info.hasNextPage,
      itemLabel: 'payment',
    };
  });

  protected open(row: unknown): void {
    this.notice.set(null);
    this.selected.set(row as AdminPaymentRow);
  }

  protected close(): void {
    this.selected.set(null);
  }

  protected dismissNotice(): void {
    this.notice.set(null);
  }

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }

  protected goToPage(page: number): void {
    if (page === this.page()) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: page === 1 ? null : page },
      queryParamsHandling: 'merge',
    });
  }

  protected onHandled(outcome: AdminPaymentOutcome): void {
    const number =
      outcome.detail?.invoice.number ?? this.selected()?.invoice?.number ?? '';
    switch (outcome.result) {
      case 'verified':
        this.hide(outcome.paymentId);
        this.selected.set(null);
        this.notice.set({
          key: 'adminBilling.verification.verifiedNotice',
          params: { number },
        });
        break;
      case 'rejected':
        this.hide(outcome.paymentId);
        this.selected.set(null);
        this.notice.set({
          key: 'adminBilling.verification.rejectedNotice',
          params: {},
        });
        break;
      case 'not-applied':
        // The drawer stays open on its alert; the payment is failed, so it is no longer queued.
        this.hide(outcome.paymentId);
        break;
      case 'stale':
        break;
    }
    this.afterChange();
  }

  private hide(id: string): void {
    this.handled.update((ids) => new Set(ids).add(id));
  }

  /** Refetches, or steps back a page when the last row on this one was just handled. */
  private afterChange(): void {
    if (this.result() && this.rows().length === 0 && this.page() > 1) {
      this.goToPage(this.page() - 1);
      return;
    }
    this.refresh.update((n) => n + 1);
  }
}
