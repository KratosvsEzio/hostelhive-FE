import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import {
  Avatar,
  Button,
  Card,
  CompactNumber,
  EmptyState,
  ErrorState,
  Skeleton,
  StatusPill,
  Tabs,
} from '@hostelhive/ui';
import { downloadCsv } from '@util/csv';
import { AnalyticsApi, HostPropertyStore } from '@services';
import { AnalyticsData, Kpi } from '@hostelhive/data-access';
import { donutDash, occupancyLine, revenueBars, tenantMovementBars } from '@features/host/analytics/charts/chart-helpers';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
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

/**
 * Host analytics dashboard (design-mockups/16-analytics.html). KPI cards with an
 * SVG occupancy donut, a stacked SVG revenue chart, an SVG occupancy timeline,
 * and the tenant ledger — all scoped by a property selector that re-queries the
 * (stubbed) `AnalyticsApi`. Charts are inline SVG/CSS computed by chart-helpers;
 * no chart library is used.
 */
@Component({
  selector: 'hh-analytics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DashboardLayout,
    SubscriptionGate,
    DecimalPipe,
    Avatar,
    Button,
    Card,
    CompactNumber,
    EmptyState,
    ErrorState,
    Skeleton,
    StatusPill,
    Tabs,
  ],
  templateUrl: './analytics.html',
})
export class Analytics {
  private readonly api = inject(AnalyticsApi);
  protected readonly propertyStore = inject(HostPropertyStore);

  protected readonly range = signal('12m');
  private readonly refresh = signal(0);

  protected readonly kpiSkeletons = [1, 2, 3, 4, 5, 6];
  protected readonly rangeTabs = [
    { label: '6M', value: '6m' },
    { label: '12M', value: '12m' },
  ];

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

  /** Revenue bars, recomputed when the loaded dataset changes. */
  protected readonly bars = computed(() =>
    revenueBars(this.state().data?.revenue ?? []),
  );

  protected readonly tenantBars = computed(() =>
    tenantMovementBars(this.state().data?.tenantMovement ?? []),
  );

  /** Occupancy line; the 6M tab trims to the last 6 points. */
  protected readonly occupancy = computed(() => {
    const series = this.state().data?.occupancy ?? [];
    const trimmed = this.range() === '6m' ? series.slice(-6) : series;
    return occupancyLine(trimmed);
  });

  /** Ledger rows sorted by outstanding, descending. */
  protected readonly ledger = computed(() =>
    [...(this.state().data?.ledger ?? [])].sort(
      (a, b) => b.outstanding - a.outstanding,
    ),
  );

  protected donut(pct: number): string {
    return donutDash(pct);
  }

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }

  /** CSV export of the monthly revenue + occupancy series behind the charts. */
  protected exportCsv(): void {
    const data = this.state().data;
    if (!data?.revenue.length) return;
    const occByMonth = new Map(
      data.occupancy.map((o) => [o.month, o.occupancyPct]),
    );
    downloadCsv(
      `hostelhive-analytics-${this.propertyStore.selected()}`,
      [
        'Month',
        'Rent (PKR)',
        'Utility (PKR)',
        'Total Revenue (PKR)',
        'Occupancy %',
      ],
      data.revenue.map((r) => [
        r.month,
        r.rent,
        r.utility,
        r.rent + r.utility,
        occByMonth.get(r.month) ?? '',
      ]),
    );
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
}
