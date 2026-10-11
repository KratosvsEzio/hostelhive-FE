import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  catchError,
  combineLatest,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import type {
  ApiError,
  BillingInvoicePage,
  BillingInvoiceStatusOption,
} from '@hostelhive/data-access';
import {
  Button,
  EmptyState,
  ErrorState,
  FilterChips,
  type FilterChipOption,
  Pagination,
  Skeleton,
} from '@hostelhive/ui';
import { BillingApi } from '@services';
import { LocaleLink } from '@core/i18n/locale-link';
import { LocaleStore } from '@core/i18n/locale-store';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { isNetworkError } from '@util/network-error';
import { billingInvoiceStatusKey } from '@app/shared/billing/billing-labels';
import {
  type BillingHistoryQuery,
  BillingInvoiceTable,
} from './billing-invoice-table';

type HistoryView =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'error'; networkError: boolean }
  | { kind: 'ready'; result: BillingInvoicePage };

/** Which message a page without rows shows. */
type EmptyKind = 'empty' | 'noMatch' | 'pastLast';

const ALL = 'all';

const SKELETON_ROWS = [0, 1, 2, 3, 4] as const;

/** `?page=` as a page number; anything that is not a whole number from 1 up reads as page 1. */
function pageFrom(raw: string | null): number {
  const page = Number.parseInt(raw ?? '', 10);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

/**
 * A hostel's HostelHive invoices, newest first, filtered by status and paged by the server.
 *
 * The URL is the only state: `?status=` and `?page=` are read live, so a reload, the browser's
 * back button and a hostel switch (which drops the query) all land on the list they describe.
 */
@Component({
  selector: 'hh-billing-invoices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DashboardLayout,
    BillingInvoiceTable,
    Button,
    EmptyState,
    ErrorState,
    FilterChips,
    Pagination,
    Skeleton,
    RouterLink,
    LocaleLink,
    TranslocoPipe,
  ],
  templateUrl: './billing-invoices.html',
})
export class BillingInvoices {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(BillingApi);
  private readonly i18n = inject(TranslocoService);
  private readonly locale = inject(LocaleStore);

  private readonly listTop = viewChild<ElementRef<HTMLElement>>('listTop');

  protected readonly skeletonRows = SKELETON_ROWS;

  // The hostel id sits on an ancestor route and is not inherited here, so every level is read.
  protected readonly hostelId = toSignal(
    combineLatest(this.route.pathFromRoot.map((r) => r.paramMap)).pipe(
      map(
        (maps) =>
          maps
            .map((m) => m.get('hostelId'))
            .filter((id): id is string => !!id)
            .at(-1) ?? '',
      ),
      distinctUntilChanged(),
    ),
    { initialValue: '' },
  );

  private readonly query = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => ({
        status: params.get('status') || ALL,
        page: pageFrom(params.get('page')),
      })),
    ),
    { initialValue: { status: ALL, page: 1 } },
  );

  protected readonly status = computed(() => this.query().status);
  protected readonly page = computed(() => this.query().page);

  private readonly refresh = signal(0);

  protected readonly view = toSignal(
    toObservable(
      computed(() => ({
        hostelId: this.hostelId(),
        status: this.status(),
        page: this.page(),
        refresh: this.refresh(),
      })),
    ).pipe(
      switchMap(({ hostelId, status, page }) => {
        if (!hostelId) return of<HistoryView>({ kind: 'loading' });
        return this.api.invoices(hostelId, { status, page }).pipe(
          map((result): HistoryView => ({ kind: 'ready', result })),
          startWith<HistoryView>({ kind: 'loading' }),
          catchError((err: ApiError) =>
            of<HistoryView>(
              err?.status === 403
                ? { kind: 'forbidden' }
                : { kind: 'error', networkError: isNetworkError(err) },
            ),
          ),
        );
      }),
    ),
    { initialValue: { kind: 'loading' } as HistoryView },
  );

  protected readonly result = computed(() => {
    const v = this.view();
    return v.kind === 'ready' ? v.result : null;
  });

  protected readonly networkError = computed(() => {
    const v = this.view();
    return v.kind === 'error' && v.networkError;
  });

  // The last statuses the server offered, kept through a reload so the chips stay usable.
  private readonly statuses = linkedSignal<
    { hostelId: string; result: BillingInvoicePage | null },
    readonly BillingInvoiceStatusOption[] | null
  >({
    source: () => ({ hostelId: this.hostelId(), result: this.result() }),
    computation: (source, previous) => {
      if (source.result) return source.result.statuses;
      return previous?.source.hostelId === source.hostelId
        ? previous.value
        : null;
    },
  });

  protected readonly emptyKind = computed<EmptyKind | null>(() => {
    const result = this.result();
    if (!result || result.rows.length > 0) return null;
    if (this.page() > 1) return 'pastLast';
    return this.status() === ALL ? 'empty' : 'noMatch';
  });

  protected readonly showChips = computed(
    () => this.statuses() !== null && this.emptyKind() !== 'empty',
  );

  protected readonly chips = computed<FilterChipOption[]>(() => [
    { value: ALL, label: this.t('hostBillingHistory.filterAll') },
    ...(this.statuses() ?? []).map((s) => {
      const key = billingInvoiceStatusKey(s.slug);
      return { value: s.slug, label: key ? this.t(key) : s.name };
    }),
  ]);

  protected readonly pageInfo = computed(() => {
    const info = this.result()?.page;
    return info && info.totalPages > 1 ? info : null;
  });

  /** The filter and page a detail link hands over, so its back link returns to this list. */
  protected readonly historyQuery = computed<BillingHistoryQuery>(() => {
    const status = this.status();
    const page = this.page();
    return {
      ...(status !== ALL ? { status } : {}),
      ...(page > 1 ? { page } : {}),
    };
  });

  protected readonly billingLink = computed(
    () => `/host/${this.hostelId()}/subscription`,
  );

  protected selectStatus(status: string): void {
    if (status === this.status()) return;
    this.writeQuery({ status: status === ALL ? null : status, page: null });
  }

  protected goToPage(page: number): void {
    if (page === this.page()) return;
    this.writeQuery({ page: page === 1 ? null : page });
    this.listTop()?.nativeElement.scrollIntoView?.({ block: 'start' });
  }

  protected showAll(): void {
    this.selectStatus(ALL);
  }

  protected firstPage(): void {
    this.goToPage(1);
  }

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }

  /** A label for the chips, which are built here and so cannot use the pipe; see `search-filters.ts`. */
  private t(key: string): string {
    return this.locale.ready() ? this.i18n.translate(key) : '';
  }

  private writeQuery(
    queryParams: Record<string, string | number | null>,
  ): void {
    void this.router.navigate([], {
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
