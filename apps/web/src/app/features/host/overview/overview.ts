import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, map, of, startWith, switchMap, timer } from 'rxjs';
import {
  Avatar,
  Card,
  CompactNumber,
  DonutChart,
  EmptyState,
  ErrorState,
  Skeleton,
} from '@hostelhive/ui';
import { HostOpsApi, HostPropertyStore, OverviewApi } from '@services';
import { Invoice, Kpi, LedgerRow, OverviewData, RevenuePoint, TenantMovement } from '@hostelhive/data-access';
import {
  AXIS_MAXFILL,
  AxisTick,
  fixedAxis,
  revenueBars,
  tenantMovementBars,
} from '@features/host/overview/charts/chart-helpers';
import {
  StripLevel,
  UpcomingStrip,
  stripRange,
  upcomingStrip,
} from '@features/host/overview/charts/upcoming-strip';
import { CalendarDayCounts, HostBookingsApi } from '@features/host/bookings/host-bookings-api';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { SubscriptionGate } from '@layout/components/subscription-gate/subscription-gate';
import { isSubscriptionError } from '@util/subscription-error';
import { isNetworkError } from '@util/network-error';
import { ApiDate } from '@util/api-date';
import { LocaleLink } from '@core/i18n/locale-link';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Cell tints by volume band.
 *
 * Written out rather than composed, because Tailwind only emits the classes it can find as
 * literal text — a `bg-emerald-${n}00` would compile and then render untinted.
 *
 * Arrivals green, departures rose, matching the legend above the strip. A day with none is
 * flat grey rather than a pale tint, so an empty cell reads as nothing happening rather than
 * as the quietest band.
 */
const IN_TINTS: Record<StripLevel, string> = {
  0: 'bg-ink-50 text-ink-300',
  1: 'bg-emerald-50 text-emerald-700',
  2: 'bg-emerald-100 text-emerald-800',
  3: 'bg-emerald-200 text-emerald-900',
};

const OUT_TINTS: Record<StripLevel, string> = {
  0: 'bg-ink-50 text-ink-300',
  1: 'bg-rose-50 text-rose-700',
  2: 'bg-rose-100 text-rose-800',
  3: 'bg-rose-200 text-rose-900',
};

interface ViewState {
  loading: boolean;
  error: boolean;
  subscriptionError: boolean;
  networkError: boolean;
  data: OverviewData | null;
}

@Component({
  selector: 'app-host-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DashboardLayout,
    RouterLink, LocaleLink,
    SubscriptionGate,
    ApiDate,
    DecimalPipe,
    Avatar,
    Card,
    CompactNumber,
    DonutChart,
    EmptyState,
    ErrorState,
    Skeleton,
    TranslocoPipe,
  ],
  templateUrl: './overview.html',
})
export class HostOverview {
  private readonly api = inject(OverviewApi);
  private readonly opsApi = inject(HostOpsApi);
  private readonly bookingsApi = inject(HostBookingsApi);
  protected readonly propertyStore = inject(HostPropertyStore);

  /**
   * Which pair of cards the bottom row carries.
   *
   * A monthly hostel lets to tenants who run up utility bills and a rent ledger. A nightly
   * one has neither — it has arrivals — so those two cards sat empty on every backpacker
   * dashboard, saying "No pending utility bills" about a thing the hostel does not do. The
   * strip takes their place there.
   */
  protected readonly monthlyBilled = computed(() => this.propertyStore.isMonthlyBilled());

  protected readonly billTab = signal<'due' | 'over-due'>('due');
  protected readonly ledgerTab = signal<'due' | 'over-due'>('due');

  private readonly billTabQuery = computed(() => ({
    hostelId: this.propertyStore.selected(),
    tab: this.billTab(),
  }));

  private readonly ledgerQuery = computed(() => ({
    hostelId: this.propertyStore.selected(),
    tab: this.ledgerTab(),
  }));

  /**
   * The fortnight ahead, for nightly hostels only.
   *
   * Gated on {@link monthlyBilled} in the query rather than at the call site, so a monthly
   * hostel never asks: `booking_calender` is a real request, and the bottom row it would
   * feed is not on screen.
   */
  private readonly upcomingQuery = computed(() => ({
    hostelId: this.monthlyBilled() ? '' : this.propertyStore.selected(),
  }));

  private readonly upcomingResp = toSignal(
    toObservable(this.upcomingQuery).pipe(
      switchMap(({ hostelId }) => {
        if (!hostelId) return of({ loading: false, error: false, days: [] as CalendarDayCounts[] });
        const { from, to } = stripRange(new Date());
        return this.bookingsApi.calendar(hostelId, from, to).pipe(
          map((cal) => ({ loading: false, error: false, days: cal.days })),
          startWith({ loading: true, error: false, days: [] as CalendarDayCounts[] }),
          catchError(() => of({ loading: false, error: true, days: [] as CalendarDayCounts[] })),
        );
      }),
    ),
    { initialValue: { loading: true, error: false, days: [] as CalendarDayCounts[] } },
  );

  protected readonly upcomingLoading = computed(() => this.upcomingResp().loading);
  protected readonly upcomingError = computed(() => this.upcomingResp().error);

  /** Rebuilt from `new Date()` on every read so the strip cannot outlive midnight. */
  protected readonly strip = computed<UpcomingStrip>(() =>
    upcomingStrip(this.upcomingResp().days, new Date()),
  );

  protected inTint(level: StripLevel): string {
    return IN_TINTS[level];
  }

  protected outTint(level: StripLevel): string {
    return OUT_TINTS[level];
  }

  private readonly pendingUtilityResp = toSignal(
    toObservable(this.billTabQuery).pipe(
      switchMap(({ hostelId, tab }) =>
        hostelId
          ? forkJoin([
              this.opsApi.invoices(hostelId, 1, 10, {
                'f[status.slug]': tab,
                'f[bill_type]': 'utility',
                'sort[due_date]': 'desc',
              }).pipe(
                catchError(() => of({ bills: [] as Invoice[], total: 0, totalPages: 0, statuses: [], aggs: { utilityTotal: 0, utilityPaid: 0, utilityBalance: 0, rentTotal: 0, rentPaid: 0, rentBalance: 0 } })),
              ),
              timer(600),
            ]).pipe(
              map(([res]) => ({
                loading: false, bills: res.bills, count: res.total,
                total: res.statuses.find((s) => s.slug === tab)?.totalAmount ?? 0,
                dueCount: res.statuses.find((s) => s.slug === 'due')?.count ?? 0,
                overdueCount: res.statuses.find((s) => s.slug === 'over-due')?.count ?? 0,
              })),
              startWith({ loading: true, bills: [] as Invoice[], count: 0, total: 0, dueCount: 0, overdueCount: 0 }),
            )
          : of({ loading: false, bills: [] as Invoice[], count: 0, total: 0, dueCount: 0, overdueCount: 0 }),
      ),
    ),
    { initialValue: { loading: true, bills: [] as Invoice[], count: 0, total: 0, dueCount: 0, overdueCount: 0 } },
  );

  protected readonly billsLoading = computed(() => this.pendingUtilityResp().loading);
  protected readonly pendingUtilityCount = computed(() => this.pendingUtilityResp().count);
  protected readonly billDueCount = computed(() => this.pendingUtilityResp().dueCount);
  protected readonly billOverdueCount = computed(() => this.pendingUtilityResp().overdueCount);

  private readonly ledgerResp = toSignal(
    toObservable(this.ledgerQuery).pipe(
      switchMap(({ hostelId, tab }) =>
        hostelId
          ? forkJoin([
              this.opsApi.invoices(hostelId, 1, 50, {
                'f[status.slug]': tab,
                'f[bill_type]': 'rental',
                'sort[due_date]': 'desc',
              }).pipe(
                catchError(() => of({ bills: [] as Invoice[], total: 0, totalPages: 0, statuses: [] as { name: string; slug: string; count: number; totalAmount: number }[] })),
              ),
              timer(600),
            ]).pipe(
              map(([res]) => ({
                loading: false, bills: res.bills,
                dueCount: res.statuses.find((s) => s.slug === 'due')?.count ?? 0,
                overdueCount: res.statuses.find((s) => s.slug === 'over-due')?.count ?? 0,
              })),
              startWith({ loading: true, bills: [] as Invoice[], dueCount: 0, overdueCount: 0 }),
            )
          : of({ loading: false, bills: [] as Invoice[], dueCount: 0, overdueCount: 0 }),
      ),
    ),
    { initialValue: { loading: true, bills: [] as Invoice[], dueCount: 0, overdueCount: 0 } },
  );

  protected readonly ledgerLoading = computed(() => this.ledgerResp().loading);
  protected readonly ledgerDueCount = computed(() => this.ledgerResp().dueCount);
  protected readonly ledgerOverdueCount = computed(() => this.ledgerResp().overdueCount);

  protected readonly pendingUtility = computed(() => this.pendingUtilityResp().bills);

  protected readonly pendingUtilityTotal = computed(() => this.pendingUtilityResp().total);

  protected readonly unpaidRentTenants = computed(() => 0);

  protected readonly unpaidUtilityTenants = computed(() =>
    new Set(this.pendingUtility().map((i) => i.tenantName)).size,
  );

  private readonly refresh = signal(0);

  protected readonly kpiSkeletons = [1, 2, 3, 4, 5, 6];

  private readonly query = computed(() => {
    this.refresh();
    return this.propertyStore.selected();
  });

  protected readonly state = toSignal(
    toObservable(this.query).pipe(
      switchMap((id) =>
        this.api.overviewCards(id).pipe(
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

  private readonly monthlyRevenueResp = toSignal(
    toObservable(this.propertyStore.selected).pipe(
      switchMap((slug) =>
        slug
          ? this.api.monthlyRevenue(slug).pipe(
              map((data) => ({ loading: false, error: false, data })),
              startWith({ loading: true, error: false, data: [] as RevenuePoint[] }),
              catchError(() => of({ loading: false, error: true, data: [] as RevenuePoint[] })),
            )
          : of({ loading: false, error: false, data: [] as RevenuePoint[] }),
      ),
    ),
    { initialValue: { loading: true, error: false, data: [] as RevenuePoint[] } },
  );

  protected readonly revenueError = computed(() => this.monthlyRevenueResp().error);

  private readonly tenantMovementResp = toSignal(
    toObservable(this.propertyStore.selected).pipe(
      switchMap((slug) =>
        slug
          ? this.api.tenantMovement(slug).pipe(
              map((data) => ({ loading: false, error: false, data })),
              startWith({ loading: true, error: false, data: [] as TenantMovement[] }),
              catchError(() => of({ loading: false, error: true, data: [] as TenantMovement[] })),
            )
          : of({ loading: false, error: false, data: [] as TenantMovement[] }),
      ),
    ),
    { initialValue: { loading: true, error: false, data: [] as TenantMovement[] } },
  );

  protected readonly movementError = computed(() => this.tenantMovementResp().error);

  protected readonly bars = computed(() =>
    revenueBars(this.monthlyRevenueResp().data),
  );

  protected readonly tenantBars = computed(() =>
    tenantMovementBars(this.tenantMovementResp().data),
  );

  // The axis itself lives in `charts/chart-helpers`, with the rest of the chart geometry —
  // it is arithmetic, and it is where it can be tested. See `axis.spec.ts` for the bug that
  // moved it: an empty revenue chart drew its top gridline through the card's heading.

  private readonly revenueScale = computed(() => {
    const bars = this.bars();
    if (!bars.length) return { ceiling: 1, ticks: [] as AxisTick[] };
    return fixedAxis(Math.max(1, ...bars.map((b) => b.total)), false);
  });
  protected readonly revenueYAxis = computed(() =>
    this.revenueScale().ticks.map((t) => ({ ...t, label: this.fmtY(t.value) })),
  );
  /** Bars rescaled to the shared ceiling so their heights sit against the fixed gridlines. */
  protected readonly revenueBarsScaled = computed(() => {
    const ceiling = this.revenueScale().ceiling;
    return this.bars().map((b) => ({
      ...b,
      rentPct: (b.rent / ceiling) * AXIS_MAXFILL,
      utilityPct: (b.utility / ceiling) * AXIS_MAXFILL,
    }));
  });

  private readonly movementScale = computed(() => {
    const bars = this.tenantBars();
    if (!bars.length) return { ceiling: 1, ticks: [] as AxisTick[] };
    return fixedAxis(Math.max(1, ...bars.flatMap((b) => [b.movedIn, b.movedOut])), true);
  });
  protected readonly movementYAxis = computed(() =>
    this.movementScale().ticks.map((t) => ({ ...t, label: String(t.value) })),
  );
  protected readonly movementBarsScaled = computed(() => {
    const ceiling = this.movementScale().ceiling;
    return this.tenantBars().map((b) => ({
      ...b,
      moveInPct: (b.movedIn / ceiling) * AXIS_MAXFILL,
      moveOutPct: (b.movedOut / ceiling) * AXIS_MAXFILL,
    }));
  });

  private fmtY(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(n % 1_000 ? 1 : 0) + 'k';
    return String(n);
  }

  protected readonly ledger = computed<LedgerRow[]>(() =>
    this.ledgerResp().bills.map((inv) => ({
      id: inv.id,
      tenant: inv.tenantName,
      initials: this.initials(inv.tenantName),
      room: inv.roomNumber,
      lastInvoice: this.fmtDate(inv.due),
      outstanding: inv.amount,
    })),
  );

  private fmtDate(iso: string): string {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${d ?? ''} ${MONTHS[Number(m) - 1] ?? ''} ${y ?? ''}`.trim();
  }

  protected initials(name: string): string {
    return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
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
      occupancy: `${b}/overview/occupancy`,
      vacant: `${b}/rooms`,
      collected: `${b}/overview/revenue`,
      'pending-total': `${b}/invoices`,
      'pending-rent': `${b}/invoices`,
      'pending-utility': `${b}/invoices`,
    };
    return map[key] ?? null;
  }

  protected kpiQueryParams(key: string): Record<string, string> | null {
    if (key === 'vacant') return { status: 'available' };
    if (key === 'pending-rent') return { kind: 'rental', status: 'due' };
    if (key === 'pending-utility') return { kind: 'utility', status: 'due' };
    if (key === 'pending-total') return { status: 'due' };
    return null;
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
