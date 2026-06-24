import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import {
  Avatar,
  Card,
  CompactNumber,
  EmptyState,
  ErrorState,
  Skeleton,
  StatusPill,
} from '@hostelhive/ui';
import { AnalyticsApi, HostOpsApi, HostPropertyStore } from '@services';
import { AnalyticsData, Invoice, Kpi } from '@hostelhive/data-access';
import { donutDash, revenueBars, tenantMovementBars } from '@features/host/analytics/charts/chart-helpers';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { DateRange, DateRangePicker } from '@layout/components/date-range-picker/date-range-picker';
import { SubscriptionGate } from '@layout/components/subscription-gate/subscription-gate';
import { isSubscriptionError } from '@util/subscription-error';
import { isNetworkError } from '@util/network-error';

interface ViewState {
  loading: boolean;
  error: boolean;
  subscriptionError: boolean;
  networkError: boolean;
  data: AnalyticsData | null;
}

@Component({
  selector: 'app-host-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DashboardLayout,
    RouterLink,
    DateRangePicker,
    SubscriptionGate,
    DatePipe,
    DecimalPipe,
    Avatar,
    Card,
    CompactNumber,
    EmptyState,
    ErrorState,
    Skeleton,
    StatusPill,
  ],
  templateUrl: './overview.html',
})
export class HostOverview {
  private readonly api = inject(AnalyticsApi);
  private readonly opsApi = inject(HostOpsApi);
  protected readonly propertyStore = inject(HostPropertyStore);

  protected readonly pendingUtility = toSignal(
    this.opsApi.invoices().pipe(
      map((invoices) =>
        invoices
          .filter((i) => i.kind === 'utility' && i.status !== 'paid')
          .sort((a, b) => (a.status === 'overdue' ? -1 : 1) - (b.status === 'overdue' ? -1 : 1)),
      ),
      catchError(() => of<Invoice[]>([])),
    ),
    { initialValue: [] as Invoice[] },
  );

  protected readonly pendingUtilityTotal = computed(() =>
    this.pendingUtility().reduce((sum, i) => sum + i.amount, 0),
  );

  private readonly allInvoices = toSignal(
    this.opsApi.invoices().pipe(catchError(() => of<Invoice[]>([]))),
    { initialValue: [] as Invoice[] },
  );

  protected readonly unpaidRentTenants = computed(() =>
    new Set(
      this.allInvoices()
        .filter((i) => i.kind === 'rent' && i.status !== 'paid')
        .map((i) => i.tenantName),
    ).size,
  );

  protected readonly unpaidUtilityTenants = computed(() =>
    new Set(this.pendingUtility().map((i) => i.tenantName)).size,
  );

  protected readonly dateRange = signal<DateRange | null>(null);
  private readonly refresh = signal(0);

  protected readonly kpiSkeletons = [1, 2, 3, 4, 5, 6];

  private readonly query = computed(() => {
    this.refresh();
    return this.propertyStore.selected();
  });

  protected readonly state = toSignal(
    toObservable(this.query).pipe(
      switchMap((id) =>
        this.api.getAnalytics(id).pipe(
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

  protected readonly bars = computed(() =>
    revenueBars(this.state().data?.revenue ?? []),
  );

  protected readonly tenantBars = computed(() =>
    tenantMovementBars(this.state().data?.tenantMovement ?? []),
  );

  protected readonly ledger = computed(() =>
    [...(this.state().data?.ledger ?? [])].sort(
      (a, b) => b.outstanding - a.outstanding,
    ),
  );

  protected initials(name: string): string {
    return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  }

  protected donut(pct: number): string {
    return donutDash(pct);
  }

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }

  protected valueClass(tone: Kpi['tone']): string {
    return {
      brand: 'text-brand-600',
      ok: 'text-ok',
      warn: 'text-warn',
      danger: 'text-danger',
      neutral: 'text-ink-900',
    }[tone];
  }

  protected deltaClass(delta: number): string {
    return delta >= 0 ? 'text-ok' : 'text-danger';
  }

  protected kpiLink(key: string): string | null {
    const pid = this.propertyStore.selected();
    const b = `/host/${pid}`;
    const map: Record<string, string> = {
      occupancy: `${b}/occupancy`,
      vacant: `${b}/listings`,
      collected: `${b}/revenue`,
      'pending-total': `${b}/invoices`,
      'pending-rent': `${b}/invoices`,
      'pending-utility': `${b}/invoices`,
    };
    return map[key] ?? null;
  }

  protected kpiLinkLabel(key: string): string {
    const map: Record<string, string> = {
      occupancy: 'View occupancy trend',
      vacant: 'View listings',
      collected: 'View revenue breakdown',
      'pending-total': 'View all invoices',
      'pending-rent': 'View rent invoices',
      'pending-utility': 'View utility bills',
    };
    return map[key] ?? 'View detail';
  }

  protected kpiFooterClass(tone: Kpi['tone']): string {
    return {
      brand: 'border-brand-100 bg-brand-50/60 text-brand-600 hover:bg-brand-100/60',
      ok: 'border-ok/20 bg-ok/5 text-ok hover:bg-ok/10',
      warn: 'border-warn/20 bg-warn/5 text-warn hover:bg-warn/10',
      danger: 'border-danger/20 bg-danger/5 text-danger hover:bg-danger/10',
      neutral: 'border-ink-100 bg-surface text-ink-500 hover:bg-ink-50',
    }[tone];
  }
}
