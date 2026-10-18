import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import type {
  AdminBillingQuery,
  AdminCurrency,
  BillingInvoicePage,
  BillingInvoiceRow,
  BillingInvoiceStatusOption,
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
} from '@hostelhive/ui';
import { ADMIN_BILLING_PAGE_SIZE, AdminBillingApi } from '@services';
import { adminBillingInvoicesCols } from '@util/table-configs/admin-billing-invoices-cols';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import {
  type AdminBillingError,
  adminBillingError,
} from '../shared/admin-billing-errors';
import { adminInvoiceStatusKey } from '../shared/admin-billing-labels';
import { AdminBillingTabs } from '../shared/admin-billing-tabs';
import { injectAdminBillingCellFormat } from '../shared/admin-billing-cell-format';
import { AdminInvoiceDrawer } from './admin-invoice-drawer';

/** The list's filters and page, exactly as the URL holds them. */
interface InvoiceFilters {
  status: string | null;
  currency: AdminCurrency | null;
  from: string | null;
  to: string | null;
  hostel: string;
  number: string;
  page: number;
}

type ListView =
  | { kind: 'loading' }
  | { kind: 'error'; error: AdminBillingError }
  | { kind: 'ready'; result: BillingInvoicePage };

type QueryPatch = Record<string, string | number | null>;

const ALL = 'all';
const CURRENCIES: readonly AdminCurrency[] = ['PKR', 'USD'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SKELETON_ROWS = [0, 1, 2, 3, 4] as const;

// Every filter change goes back to the first page.
const FILTER_RESET: QueryPatch = { page: null };

function pageFrom(raw: string | null): number {
  const page = Number.parseInt(raw ?? '', 10);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

function currencyFrom(raw: string | null): AdminCurrency | null {
  return CURRENCIES.find((c) => c === raw) ?? null;
}

function dayFrom(raw: string | null): string | null {
  return raw && DAY.test(raw) ? raw : null;
}

function sameFilters(a: InvoiceFilters, b: InvoiceFilters): boolean {
  return (
    a.status === b.status &&
    a.currency === b.currency &&
    a.from === b.from &&
    a.to === b.to &&
    a.hostel === b.hostel &&
    a.number === b.number &&
    a.page === b.page
  );
}

/**
 * Every HostelHive invoice across hostels, newest first, filtered by status, currency, created
 * day, hostel name and invoice number, with the count but never a total: amounts are in
 * different currencies and each shows in its own.
 *
 * The URL is the only state. `?invoice=<id>` opens that invoice in the drawer and `?number=`
 * fills the number filter, so other admin screens can link straight here.
 */
@Component({
  selector: 'hh-admin-billing-invoices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DashboardLayout,
    AdminBillingTabs,
    AdminInvoiceDrawer,
    Button,
    DataTable,
    EmptyState,
    ErrorState,
    GlobalFilter,
    Search,
    Skeleton,
    TranslocoPipe,
  ],
  templateUrl: './admin-billing-invoices.html',
})
export class AdminBillingInvoices {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(AdminBillingApi);
  private readonly format = injectAdminBillingCellFormat();

  protected readonly skeletonRows = SKELETON_ROWS;

  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  // Compared by value, so opening or closing the drawer does not refetch the list.
  protected readonly filters = computed<InvoiceFilters>(
    () => {
      const p = this.params();
      const status = p.get('status');
      return {
        status: status && status !== ALL ? status : null,
        currency: currencyFrom(p.get('currency')),
        from: dayFrom(p.get('from')),
        to: dayFrom(p.get('to')),
        hostel: p.get('hostel')?.trim() ?? '',
        number: p.get('number')?.trim() ?? '',
        page: pageFrom(p.get('page')),
      };
    },
    { equal: sameFilters },
  );

  protected readonly openInvoiceId = computed(
    () => this.params().get('invoice') || null,
  );

  private readonly refresh = signal(0);

  private readonly query = computed<AdminBillingQuery>(() => {
    const f = this.filters();
    return {
      page: f.page,
      limit: ADMIN_BILLING_PAGE_SIZE,
      status: f.status,
      currency: f.currency,
      from: f.from,
      to: f.to,
      hostelName: f.hostel || null,
      invoiceNumber: f.number || null,
      sort: { field: 'created_at', dir: 'desc' },
    };
  });

  protected readonly view = toSignal(
    toObservable(
      computed(() => ({ query: this.query(), refresh: this.refresh() })),
    ).pipe(
      switchMap(({ query }) =>
        this.api.invoices(query).pipe(
          map((result): ListView => ({ kind: 'ready', result })),
          startWith<ListView>({ kind: 'loading' }),
          catchError((err: unknown) =>
            of<ListView>({ kind: 'error', error: adminBillingError(err) }),
          ),
        ),
      ),
    ),
    { initialValue: { kind: 'loading' } as ListView },
  );

  protected readonly result = computed(() => {
    const v = this.view();
    return v.kind === 'ready' ? v.result : null;
  });

  protected readonly error = computed(() => {
    const v = this.view();
    return v.kind === 'error' ? v.error : null;
  });

  // The last statuses the server offered, kept through a reload so the filter stays usable.
  private readonly statuses = linkedSignal<
    BillingInvoicePage | null,
    readonly BillingInvoiceStatusOption[]
  >({
    source: () => this.result(),
    computation: (result, previous) =>
      result?.statuses ?? previous?.value ?? [],
  });

  protected readonly hasFilters = computed(() => {
    const f = this.filters();
    return !!(f.status || f.currency || f.from || f.to || f.hostel || f.number);
  });

  protected readonly emptyKind = computed<'empty' | 'noMatch' | null>(() => {
    const result = this.result();
    if (!result || result.rows.length > 0) return null;
    return this.hasFilters() || this.filters().page > 1 ? 'noMatch' : 'empty';
  });

  protected readonly total = computed(() => this.result()?.page.total ?? 0);

  protected readonly columns = computed(() =>
    adminBillingInvoicesCols(this.format()),
  );

  protected readonly filterGroups = computed<FilterGroup[]>(() => {
    const t = this.format().label;
    const all = t('adminBilling.common.filterAll');
    return [
      {
        key: 'status',
        label: t('adminBilling.common.filterStatus'),
        icon: 'ti-tag',
        fields: [
          {
            key: 'status',
            type: 'radio',
            options: [
              { value: ALL, label: all },
              ...this.statuses().map((s) => {
                const key = adminInvoiceStatusKey(s.slug);
                return { value: s.slug, label: key ? t(key) : s.name };
              }),
            ],
            allValue: ALL,
          },
        ],
      },
      {
        key: 'currency',
        label: t('adminBilling.common.filterCurrency'),
        icon: 'ti-currency-dollar',
        fields: [
          {
            key: 'currency',
            type: 'radio',
            options: [
              { value: ALL, label: all },
              ...CURRENCIES.map((c) => ({ value: c, label: c })),
            ],
            allValue: ALL,
          },
        ],
      },
      {
        key: 'created',
        label: t('adminBilling.common.filterCreated'),
        icon: 'ti-calendar',
        fields: [
          {
            key: 'created',
            type: 'date-range',
            label: t('adminBilling.common.filterCreated'),
          },
        ],
      },
    ];
  });

  protected readonly filterValues = computed<FilterValues>(() => {
    const f = this.filters();
    const created: DateRangeValue = {
      ...(f.from ? { from: f.from } : {}),
      ...(f.to ? { to: f.to } : {}),
    };
    return {
      status: f.status ?? ALL,
      currency: f.currency ?? ALL,
      ...(f.from || f.to ? { created } : {}),
    };
  });

  protected readonly pagination = computed<PaginationConfig | null>(() => {
    const info = this.result()?.page;
    if (!info || info.totalPages <= 1) return null;
    return {
      page: info.page,
      total: info.total,
      totalPages: info.totalPages,
      hasNextPage: info.hasNextPage,
      itemLabel: 'invoice',
    };
  });

  // Remembers the hostel of the row that was clicked, since the invoice payload has none.
  private readonly picked = signal<BillingInvoiceRow | null>(null);

  protected readonly drawerHostel = computed(() => {
    const id = this.openInvoiceId();
    if (!id) return null;
    const picked = this.picked();
    const row =
      picked?.id === id ? picked : this.result()?.rows.find((r) => r.id === id);
    return row?.hostel ? { id: row.hostel.id, name: row.hostel.name } : null;
  });

  protected readonly rowId = (row: unknown): string =>
    (row as BillingInvoiceRow).id;

  protected setHostel(term: string): void {
    if (term.trim() === this.filters().hostel) return;
    this.writeQuery({ ...FILTER_RESET, hostel: term.trim() || null });
  }

  protected setNumber(term: string): void {
    if (term.trim() === this.filters().number) return;
    this.writeQuery({ ...FILTER_RESET, number: term.trim() || null });
  }

  protected applyFilters(values: FilterValues): void {
    const status = values['status'];
    const currency = values['currency'];
    const created = values['created'] as DateRangeValue | undefined;
    this.writeQuery({
      ...FILTER_RESET,
      status: typeof status === 'string' && status !== ALL ? status : null,
      currency: currencyFrom(typeof currency === 'string' ? currency : null),
      from: dayFrom(created?.from ?? null),
      to: dayFrom(created?.to ?? null),
    });
  }

  protected clearFilters(): void {
    this.writeQuery({
      ...FILTER_RESET,
      status: null,
      currency: null,
      from: null,
      to: null,
      hostel: null,
      number: null,
    });
  }

  protected goToPage(page: number): void {
    if (page === this.filters().page) return;
    this.writeQuery({ page: page === 1 ? null : page });
  }

  protected openRow(row: unknown): void {
    const invoice = row as BillingInvoiceRow;
    this.picked.set(invoice);
    this.writeQuery({ invoice: invoice.id });
  }

  protected closeDrawer(): void {
    this.picked.set(null);
    this.writeQuery({ invoice: null });
  }

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }

  private writeQuery(queryParams: QueryPatch): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
