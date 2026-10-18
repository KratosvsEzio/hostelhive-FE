import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import type {
  AdminCurrency,
  AdminPaymentPage,
  AdminPaymentRow,
  AdminSortDir,
  AdminStatusOption,
} from '@hostelhive/data-access';
import {
  Button,
  DataTable,
  type DateRangeValue,
  EmptyState,
  ErrorState,
  type FilterGroup,
  type FilterValues,
  GlobalFilter,
  type PaginationConfig,
  Search,
  Skeleton,
  type SortState,
  Toast,
} from '@hostelhive/ui';
import { ADMIN_BILLING_PAGE_SIZE, AdminBillingApi } from '@services';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import {
  type AdminPaymentSortField,
  adminBillingPaymentsCols,
} from '@util/table-configs/admin-billing-payments-cols';
import { adminBillingError } from '../shared/admin-billing-errors';
import {
  adminPaymentMethodKey,
  adminPaymentStatusKey,
} from '../shared/admin-billing-labels';
import { AdminBillingTabs } from '../shared/admin-billing-tabs';
import { injectAdminBillingCellFormat } from '../shared/admin-billing-cell-format';
import {
  AdminPaymentDrawer,
  type AdminPaymentOutcome,
} from './admin-payment-drawer';

type ListView =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'error'; networkError: boolean }
  | { kind: 'ready'; result: AdminPaymentPage };

/** Everything the list shows, read from and written to the URL. */
interface PaymentsQuery {
  status: string;
  method: string | null;
  currency: AdminCurrency | null;
  from: string | null;
  to: string | null;
  hostel: string;
  sort: AdminPaymentSortField;
  dir: AdminSortDir;
  page: number;
}

interface Notice {
  key: string;
  params: Record<string, string>;
}

/** What an action on a payment changed, laid over its row until the search index catches up. */
type RowPatch = Pick<
  AdminPaymentRow,
  'status' | 'failure_reason' | 'succeeded_at' | 'verified_at'
>;

const AWAITING = 'awaiting-verification';

const ALL = 'all';
const DEFAULT_SORT: AdminPaymentSortField = 'created_at';
const DEFAULT_DIR: AdminSortDir = 'desc';
const METHODS = ['safepay', 'bank_transfer', 'cash', 'admin_grant'] as const;
const CURRENCIES: readonly AdminCurrency[] = ['PKR', 'USD'];
const SORT_FIELDS: readonly AdminPaymentSortField[] = [
  'created_at',
  'succeeded_at',
  'amount_minor',
];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function pageFrom(raw: string | null): number {
  const page = Number.parseInt(raw ?? '', 10);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

function oneOf<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T | null {
  return allowed.find((a) => a === value) ?? null;
}

/** The URL as a query. Unknown values read as unset, and an amount sort without a currency as the default. */
function readQuery(params: ParamMap): PaymentsQuery {
  const currency = oneOf(params.get('currency'), CURRENCIES);
  let sort = oneOf(params.get('sort'), SORT_FIELDS) ?? DEFAULT_SORT;
  let dir = oneOf<AdminSortDir>(params.get('dir'), ['asc', 'desc']) ?? DEFAULT_DIR;
  if (sort === 'amount_minor' && !currency) {
    sort = DEFAULT_SORT;
    dir = DEFAULT_DIR;
  }
  const from = params.get('from');
  const to = params.get('to');
  return {
    status: params.get('status') || ALL,
    method: oneOf(params.get('method'), METHODS),
    currency,
    from: from && DAY.test(from) ? from : null,
    to: to && DAY.test(to) ? to : null,
    hostel: params.get('hostel')?.trim() ?? '',
    sort,
    dir,
    page: pageFrom(params.get('page')),
  };
}

/**
 * Every HostelHive payment across hostels, newest first, filtered and sorted by the server.
 *
 * The URL is the state: a reload or a shared link lands on the same filters, sort and page.
 * There are no totals: amounts come in more than one currency and are never added up, so the
 * header shows how many payments match and each row shows its own amount.
 */
@Component({
  selector: 'hh-admin-billing-payments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DashboardLayout,
    AdminBillingTabs,
    AdminPaymentDrawer,
    Button,
    DataTable,
    EmptyState,
    ErrorState,
    GlobalFilter,
    Search,
    Skeleton,
    Toast,
    TranslocoPipe,
  ],
  templateUrl: './admin-billing-payments.html',
})
export class AdminBillingPayments {
  private readonly api = inject(AdminBillingApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly format = injectAdminBillingCellFormat();

  protected readonly query = toSignal(
    this.route.queryParamMap.pipe(map(readQuery)),
    { initialValue: readQuery(this.route.snapshot.queryParamMap) },
  );

  private readonly refresh = signal(0);

  protected readonly selected = signal<AdminPaymentRow | null>(null);
  protected readonly notice = signal<Notice | null>(null);

  protected readonly view = toSignal(
    toObservable(
      computed(() => ({ query: this.query(), refresh: this.refresh() })),
    ).pipe(
      switchMap(({ query: q }) =>
        this.api
          .payments({
            status: q.status,
            method: q.method,
            currency: q.currency,
            from: q.from,
            to: q.to,
            hostelName: q.hostel || null,
            sort: { field: q.sort, dir: q.dir },
            page: q.page,
            limit: ADMIN_BILLING_PAGE_SIZE,
          })
          .pipe(
            map((result): ListView => ({ kind: 'ready', result })),
            startWith<ListView>({ kind: 'loading' }),
            catchError((err: unknown) => {
              const error = adminBillingError(err);
              return of<ListView>(
                error.kind === 'forbidden'
                  ? { kind: 'forbidden' }
                  : { kind: 'error', networkError: error.kind === 'network' },
              );
            }),
          ),
      ),
    ),
    { initialValue: { kind: 'loading' } as ListView },
  );

  protected readonly result = computed(() => {
    const v = this.view();
    return v.kind === 'ready' ? v.result : null;
  });

  // The list reads a search index that lags a write by about a second, so a refetch straight
  // after an action can still return the payment as awaiting. Each patch lasts until a page
  // shows that row settled, or the query changes.
  private readonly patches = linkedSignal<
    { query: PaymentsQuery; result: AdminPaymentPage | null },
    ReadonlyMap<string, RowPatch>
  >({
    source: () => ({ query: this.query(), result: this.result() }),
    computation: ({ query, result }, previous) => {
      if (!previous || previous.source.query !== query) return new Map();
      const kept = new Map(previous.value);
      for (const r of result?.rows ?? []) {
        if (r.status?.slug !== AWAITING) kept.delete(r.id);
      }
      return kept;
    },
  });

  protected readonly rows = computed(() => {
    const rows = this.result()?.rows ?? [];
    const patches = this.patches();
    if (!patches.size) return rows;
    return rows.map((r) => {
      const patch = patches.get(r.id);
      return patch ? { ...r, ...patch } : r;
    });
  });

  // The last statuses the server offered, kept through a reload so the filter stays usable.
  private readonly statuses = linkedSignal<
    AdminPaymentPage | null,
    readonly AdminStatusOption[]
  >({
    source: () => this.result(),
    computation: (result, previous) =>
      result?.statuses ?? previous?.value ?? [],
  });

  protected readonly networkError = computed(() => {
    const v = this.view();
    return v.kind === 'error' && v.networkError;
  });

  protected readonly filtered = computed(() => {
    const q = this.query();
    return (
      q.status !== ALL ||
      !!q.method ||
      !!q.currency ||
      !!q.from ||
      !!q.to ||
      !!q.hostel
    );
  });

  /** Which message a page without rows shows. */
  protected readonly emptyKind = computed<'empty' | 'noMatch' | null>(() => {
    const result = this.result();
    if (!result || result.rows.length > 0) return null;
    return this.filtered() || this.query().page > 1 ? 'noMatch' : 'empty';
  });

  protected readonly amountSortable = computed(() => !!this.query().currency);

  protected readonly columns = computed(() =>
    adminBillingPaymentsCols(this.format(), {
      amountSortable: this.amountSortable(),
    }),
  );
  protected readonly rowId = (row: unknown) => (row as AdminPaymentRow).id;

  protected readonly tableSort = computed<SortState>(() => ({
    key: this.query().sort,
    dir: this.query().dir,
  }));

  protected readonly filterGroups = computed<FilterGroup[]>(() => {
    const { label } = this.format();
    const all = { value: ALL, label: label('adminBilling.common.filterAll') };
    return [
      {
        key: 'status',
        label: label('adminBilling.common.filterStatus'),
        icon: 'ti-tag',
        fields: [
          {
            key: 'status',
            type: 'radio',
            allValue: ALL,
            options: [
              all,
              ...this.statuses().map((s) => {
                const key = adminPaymentStatusKey(s.slug);
                return { value: s.slug, label: key ? label(key) : s.name };
              }),
            ],
          },
        ],
      },
      {
        key: 'method',
        label: label('adminBilling.common.filterMethod'),
        icon: 'ti-credit-card',
        fields: [
          {
            key: 'method',
            type: 'radio',
            allValue: ALL,
            options: [
              all,
              ...METHODS.map((m) => ({
                value: m,
                label: label(adminPaymentMethodKey(m)),
              })),
            ],
          },
        ],
      },
      {
        key: 'currency',
        label: label('adminBilling.common.filterCurrency'),
        icon: 'ti-currency-dollar',
        fields: [
          {
            key: 'currency',
            type: 'radio',
            allValue: ALL,
            options: [all, ...CURRENCIES.map((c) => ({ value: c, label: c }))],
          },
        ],
      },
      {
        key: 'created',
        label: label('adminBilling.common.filterCreated'),
        icon: 'ti-calendar',
        fields: [{ key: 'created', type: 'date-range' }],
      },
    ];
  });

  protected readonly filterValues = computed<FilterValues>(() => {
    const q = this.query();
    const values: FilterValues = {
      status: q.status,
      method: q.method ?? ALL,
      currency: q.currency ?? ALL,
    };
    if (q.from || q.to) {
      values['created'] = {
        ...(q.from ? { from: q.from } : {}),
        ...(q.to ? { to: q.to } : {}),
      };
    }
    return values;
  });

  protected readonly pagination = computed<PaginationConfig | null>(() => {
    const info = this.result()?.page;
    if (!info || info.totalPages <= 1) return null;
    return {
      page: info.page,
      total: info.total,
      totalPages: info.totalPages,
      hasNextPage: info.hasNextPage,
      itemLabel: 'payment',
    };
  });

  protected applyFilters(values: FilterValues): void {
    const pick = (key: string): string | null => {
      const value = values[key];
      return typeof value === 'string' && value !== ALL ? value : null;
    };
    const range = values['created'] as DateRangeValue | undefined;
    const currency = pick('currency');
    const q = this.query();
    const dropAmountSort = !currency && q.sort === 'amount_minor';
    this.writeQuery({
      status: pick('status'),
      method: pick('method'),
      currency,
      from: range?.from || null,
      to: range?.to || null,
      page: null,
      ...(dropAmountSort ? { sort: null, dir: null } : {}),
    });
  }

  protected onSearch(term: string): void {
    const hostel = term.trim();
    if (hostel === this.query().hostel) return;
    this.writeQuery({ hostel: hostel || null, page: null });
  }

  protected onSort(sort: SortState | null): void {
    const field = sort ? oneOf(sort.key, SORT_FIELDS) : null;
    const isDefault =
      !field || (field === DEFAULT_SORT && sort?.dir === DEFAULT_DIR);
    this.writeQuery({
      sort: isDefault ? null : field,
      dir: isDefault ? null : (sort?.dir ?? null),
      page: null,
    });
  }

  protected clearFilters(): void {
    this.writeQuery({
      status: null,
      method: null,
      currency: null,
      from: null,
      to: null,
      hostel: null,
      sort: null,
      dir: null,
      page: null,
    });
  }

  protected goToPage(page: number): void {
    if (page === this.query().page) return;
    this.writeQuery({ page: page === 1 ? null : page });
  }

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

  protected onHandled(outcome: AdminPaymentOutcome): void {
    this.patchRow(outcome);
    if (outcome.result === 'verified') {
      this.selected.set(null);
      this.notice.set({
        key: 'adminBilling.verification.verifiedNotice',
        params: { number: outcome.detail?.invoice.number ?? '' },
      });
    } else if (outcome.result === 'rejected') {
      this.selected.set(null);
      this.notice.set({
        key: 'adminBilling.verification.rejectedNotice',
        params: {},
      });
    }
    this.refresh.update((n) => n + 1);
  }

  private patchRow({ paymentId, detail }: AdminPaymentOutcome): void {
    const payment = detail?.payment;
    if (!payment || payment.status?.slug === AWAITING) return;
    const patch: RowPatch = {
      status: payment.status,
      failure_reason: payment.failure_reason,
      succeeded_at: payment.succeeded_at,
      verified_at: payment.verified_at,
    };
    this.patches.update((current) => new Map(current).set(paymentId, patch));
  }

  private writeQuery(
    queryParams: Record<string, string | number | null>,
  ): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
