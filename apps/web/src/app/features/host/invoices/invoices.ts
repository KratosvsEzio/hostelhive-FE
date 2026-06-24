import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import {
  Button,
  EmptyState,
  ErrorState,
  Skeleton,
  StatusPill,
} from '@hostelhive/ui';
import { downloadCsv } from '@hostelhive/util';
import { HostOpsApi } from '@services';
import { Invoice, InvoiceStatus } from '@hostelhive/data-access';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { SubscriptionGate } from '@layout/components/subscription-gate/subscription-gate';
import { isSubscriptionError } from '@util/subscription-error';
import { isNetworkError } from '@util/network-error';

interface ViewState {
  loading: boolean;
  error: boolean;
  subscriptionError: boolean;
  networkError: boolean;
  data: Invoice[] | null;
}

type Filter = 'all' | InvoiceStatus;

const STATUS_TONE: Record<InvoiceStatus, 'ok' | 'warn' | 'danger'> = {
  paid: 'ok',
  unpaid: 'warn',
  overdue: 'danger',
};
const STATUS_LABEL: Record<InvoiceStatus, string> = {
  paid: 'Paid',
  unpaid: 'Unpaid',
  overdue: 'Overdue',
};

@Component({
  selector: 'hh-invoices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    DashboardLayout,
    SubscriptionGate,
    Button,
    Skeleton,
    StatusPill,
    EmptyState,
    ErrorState,
  ],
  templateUrl: './invoices.html',
})
export class Invoices {
  private readonly api = inject(HostOpsApi);
  private readonly refresh = signal(0);

  protected readonly filter = signal<Filter>('all');
  protected readonly selectedId = signal<string | null>(null);

  protected readonly filters: { label: string; value: Filter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Unpaid', value: 'unpaid' },
    { label: 'Paid', value: 'paid' },
    { label: 'Overdue', value: 'overdue' },
  ];

  protected readonly state = toSignal(
    toObservable(this.refresh).pipe(
      switchMap(() =>
        this.api.invoices().pipe(
          map((data): ViewState => ({ loading: false, error: false, subscriptionError: false, networkError: false, data })),
          startWith<ViewState>({ loading: true, error: false, subscriptionError: false, networkError: false, data: null }),
          catchError((err) => {
            const sub = isSubscriptionError(err);
            const net = isNetworkError(err);
            return of<ViewState>({ loading: false, error: !sub, subscriptionError: sub, networkError: net, data: null });
          }),
        ),
      ),
    ),
    { initialValue: { loading: true, error: false, subscriptionError: false, networkError: false, data: null } as ViewState },
  );

  protected readonly filtered = computed<Invoice[]>(() => {
    const all = this.state().data ?? [];
    const f = this.filter();
    return f === 'all' ? all : all.filter((i) => i.status === f);
  });

  protected readonly selected = computed<Invoice | undefined>(() => {
    const list = this.filtered();
    const id = this.selectedId();
    return list.find((i) => i.id === id);
  });

  protected readonly rentSummary = computed(() => {
    const all = this.state().data ?? [];
    const rent = all.filter((i) => i.kind === 'rent');
    return {
      total: rent.reduce((s, i) => s + i.amount, 0),
      count: rent.length,
      unpaid: rent.filter((i) => i.status !== 'paid').length,
    };
  });

  protected readonly utilitySummary = computed(() => {
    const all = this.state().data ?? [];
    const util = all.filter((i) => i.kind === 'utility');
    return {
      total: util.reduce((s, i) => s + i.amount, 0),
      count: util.length,
      unpaid: util.filter((i) => i.status !== 'paid').length,
    };
  });

  constructor() {
    // Auto-select the first visible invoice (initial load + whenever the filter
    // change leaves the current selection out of view), mirroring the mockup's
    // pre-selected preview.
    effect(() => {
      const list = this.filtered();
      if (list.length === 0) return;
      const id = this.selectedId();
      if (!id || !list.some((i) => i.id === id)) {
        this.selectedId.set(list[0].id);
      }
    });
  }

  protected tone(status: InvoiceStatus) {
    return STATUS_TONE[status];
  }
  protected label(status: InvoiceStatus): string {
    return STATUS_LABEL[status];
  }
  protected filterClass(value: Filter): string {
    const base = 'rounded-full px-3 py-1.5 text-xs font-medium transition';
    return value === this.filter()
      ? `${base} bg-ink-900 text-white`
      : `${base} border border-ink-200 text-ink-600 hover:bg-surface`;
  }

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }

  /** CSV export of the filtered ledger — client-side download via the shared helper. */
  protected exportCsv(): void {
    const rows = this.filtered();
    if (!rows.length) return;
    downloadCsv(
      `hostelhive-invoices-${this.filter()}`,
      [
        'Invoice',
        'Tenant',
        'Room',
        'Floor',
        'Type',
        'Status',
        'Issued',
        'Due',
        'Amount (PKR)',
      ],
      rows.map((inv) => [
        inv.id,
        inv.tenantName,
        inv.roomNumber,
        inv.floor,
        inv.kind,
        inv.status,
        inv.issued,
        inv.due,
        inv.amount,
      ]),
    );
  }
}
