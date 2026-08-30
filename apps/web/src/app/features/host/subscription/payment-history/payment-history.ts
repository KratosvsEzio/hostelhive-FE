import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';
import { format, isValid, parse } from 'date-fns';
import {
  CellDef,
  ColumnDef,
  DataTable,
  EmptyState,
  ErrorState,
  ExpandConfig,
  Pagination,
  Skeleton,
} from '@hostelhive/ui';
import type { StatusTone } from '@hostelhive/ui';
import {
  PaymentProduct,
  SubscriptionPayment as Payment,
} from '@hostelhive/data-access';
import { HostPropertyStore, SubscriptionApi } from '@services';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { isNetworkError } from '@util/network-error';
import { PAGE_SIZE } from '@util/pagination';
import { TranslocoPipe } from '@jsverse/transloco';

const PAYMENT_TONE: Record<Payment['status'], StatusTone> = {
  paid: 'ok',
  failed: 'danger',
  refunded: 'neutral',
  pending: 'warn',
};

const PAYMENT_LABEL: Record<Payment['status'], string> = {
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
  pending: 'Pending',
};

/**
 * The API sends `yyyy-MM-dd` on some rows and a full timestamp on others, and `new Date()`
 * only parses the second reliably — hence the explicit fallback rather than one call.
 */
function fmtDate(s: string): string {
  if (!s) return '—';
  let d = new Date(s);
  if (!isValid(d)) d = parse(s, 'yyyy-MM-dd', new Date());
  return isValid(d) ? format(d, 'd MMM y') : '—';
}

interface ViewState {
  loading: boolean;
  error: boolean;
  networkError: boolean;
  payments: Payment[] | null;
}

/**
 * Every charge against this hostel, on its own page.
 *
 * It used to be the middle section of the subscription page, between the current plan and
 * the plans on offer — so a host comparing plans scrolled through their own billing history
 * to get there, and a host looking for a receipt landed on a page mostly about buying
 * something. They answer different questions and now have different URLs.
 *
 * The subscription page still fetches the full history: the listing discount is worked out
 * from how many paid listing purchases a host has made, and that count spans everything.
 * This page fetches it again rather than sharing state, because it has to stand on its own
 * when opened directly.
 */
@Component({
  selector: 'hh-payment-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DashboardLayout,
    DataTable,
    EmptyState,
    ErrorState,
    Pagination,
    Skeleton,
    TranslocoPipe,
  ],
  templateUrl: './payment-history.html',
})
export class PaymentHistory {
  private readonly api = inject(SubscriptionApi);
  protected readonly store = inject(HostPropertyStore);

  private readonly refresh = signal(0);

  protected readonly subscriptionUrl = computed(
    () => `/host/${this.store.selected()}/subscription`,
  );

  protected readonly state = toSignal(
    combineLatest({
      hostelId: toObservable(this.store.selected),
      refresh: toObservable(this.refresh),
    }).pipe(
      switchMap(({ hostelId }) =>
        (hostelId ? this.api.paymentHistory(hostelId) : of<Payment[]>([])).pipe(
          map((payments): ViewState => ({
            loading: false,
            error: false,
            networkError: false,
            payments,
          })),
          startWith<ViewState>({
            loading: true,
            error: false,
            networkError: false,
            payments: null,
          }),
          catchError((err) =>
            of<ViewState>({
              loading: false,
              error: true,
              networkError: isNetworkError(err),
              payments: null,
            }),
          ),
        ),
      ),
    ),
    {
      initialValue: {
        loading: true,
        error: false,
        networkError: false,
        payments: null,
      } as ViewState,
    },
  );

  protected readonly page = signal(1);

  private readonly all = computed(() => this.state().payments ?? []);

  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.all().length / PAGE_SIZE)),
  );

  protected readonly paged = computed(() => {
    // Clamped so switching to a hostel with fewer payments cannot leave the table blank on
    // an out-of-range page.
    const page = Math.min(this.page(), this.pageCount());
    const start = (page - 1) * PAGE_SIZE;
    return this.all().slice(start, start + PAGE_SIZE);
  });

  protected readonly rowId = (r: unknown) => (r as Payment).id;

  protected readonly cols: ColumnDef[] = [
    { key: 'date',        label: 'Date',        cell: (r) => ({ kind: 'text', value: fmtDate((r as Payment).date), class: 'whitespace-nowrap text-ink-600' }) satisfies CellDef },
    { key: 'description', label: 'Description', cell: (r) => ({ kind: 'composite', primary: (r as Payment).description, secondary: (r as Payment).products.length > 1 ? `${(r as Payment).products.length} products` : undefined }) satisfies CellDef },
    { key: 'method',      label: 'Method',      cell: (r) => ({ kind: 'text', value: (r as Payment).method, class: 'text-ink-600' }) satisfies CellDef },
    { key: 'status',      label: 'Status',      cell: (r) => ({ kind: 'pill', text: PAYMENT_LABEL[(r as Payment).status], tone: PAYMENT_TONE[(r as Payment).status] }) satisfies CellDef },
    { key: 'amount', align: 'right', label: 'Amount', cell: (r) => ({ kind: 'currency', amount: (r as Payment).amount, class: 'font-medium text-ink-900' }) satisfies CellDef },
  ];

  /** A charge covering more than one product opens to show what was in it. */
  protected readonly expand: ExpandConfig = {
    childRows: (r) => ((r as Payment).products.length > 1 ? (r as Payment).products : []),
    childId: (s) => (s as PaymentProduct).id,
    childName: (s) => (s as PaymentProduct).name,
    nameLabel: 'Product',
    nameColSpan: 4,
    columns: [
      {
        label: 'Price',
        align: 'right',
        cell: (s) => ({ kind: 'currency', amount: (s as PaymentProduct).price, class: 'font-medium text-ink-900' }) satisfies CellDef,
      },
    ],
  };

  protected reload(): void {
    this.refresh.update((n) => n + 1);
  }
}
