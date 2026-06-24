import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { Card, ErrorState, Skeleton, Tabs } from '@hostelhive/ui';
import { AnalyticsApi, HostPropertyStore } from '@services';
import { AnalyticsData } from '@hostelhive/data-access';
import { occupancyLine } from '@features/host/analytics/charts/chart-helpers';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { DateRange, DateRangePicker } from '@layout/components/date-range-picker/date-range-picker';
import { isNetworkError } from '@util/network-error';

interface ViewState {
  loading: boolean;
  error: boolean;
  networkError: boolean;
  data: AnalyticsData | null;
}

interface OccupancyRow {
  month: string;
  monthLabel: string;
  occupancyPct: number;
  movedIn: number;
  movedOut: number;
  net: number;
}

@Component({
  selector: 'app-occupancy-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DashboardLayout, DateRangePicker, Card, ErrorState, Skeleton, Tabs],
  templateUrl: './occupancy-detail.html',
})
export class OccupancyDetail {
  private readonly api = inject(AnalyticsApi);
  protected readonly propertyStore = inject(HostPropertyStore);

  protected readonly dateRange = signal<DateRange | null>(null);
  protected readonly range = signal('12m');
  protected readonly hoveredIdx = signal(-1);
  protected readonly rangeTabs = [
    { label: '6M', value: '6m' },
    { label: '12M', value: '12m' },
  ];

  private readonly refresh = signal(0);

  private readonly query = computed(() => {
    this.refresh();
    return this.propertyStore.selected();
  });

  protected readonly state = toSignal(
    toObservable(this.query).pipe(
      switchMap((id) =>
        this.api.getAnalytics(id).pipe(
          map((data): ViewState => ({ loading: false, error: false, networkError: false, data })),
          startWith<ViewState>({ loading: true, error: false, networkError: false, data: null }),
          catchError((err) =>
            of<ViewState>({ loading: false, error: true, networkError: isNetworkError(err), data: null }),
          ),
        ),
      ),
    ),
    { initialValue: { loading: true, error: false, networkError: false, data: null } as ViewState },
  );

  protected readonly chartLine = computed(() => {
    const series = this.state().data?.occupancy ?? [];
    const trimmed = this.range() === '6m' ? series.slice(-6) : series;
    return occupancyLine(trimmed, 800, 200, 12);
  });

  private readonly MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  private yearForMonth(abbr: string): number {
    const now = new Date();
    const idx = this.MONTH_NAMES.indexOf(abbr);
    return idx <= now.getMonth() ? now.getFullYear() : now.getFullYear() - 1;
  }

  protected readonly rows = computed((): OccupancyRow[] => {
    const occupancy = this.state().data?.occupancy ?? [];
    const movement = this.state().data?.tenantMovement ?? [];
    const trimmed = this.range() === '6m' ? occupancy.slice(-6) : occupancy;
    const movMap = new Map(movement.map((m) => [m.month, m]));
    return trimmed.map((o) => {
      const mv = movMap.get(o.month);
      return {
        month: o.month,
        monthLabel: `${o.month} ${this.yearForMonth(o.month)}`,
        occupancyPct: o.occupancyPct,
        movedIn: mv?.movedIn ?? 0,
        movedOut: mv?.movedOut ?? 0,
        net: (mv?.movedIn ?? 0) - (mv?.movedOut ?? 0),
      };
    });
  });

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }
}
