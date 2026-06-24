import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import {
  Card,
  ErrorState,
  Search,
  Skeleton,
  Tabs,
} from '@hostelhive/ui';
import { AnalyticsApi, HostPropertyStore } from '@services';
import { AnalyticsData } from '@hostelhive/data-access';
import { tenantMovementBars } from '@features/host/analytics/charts/chart-helpers';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { isNetworkError } from '@util/network-error';

interface ViewState {
  loading: boolean;
  error: boolean;
  networkError: boolean;
  data: AnalyticsData | null;
}

@Component({
  selector: 'app-movement-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DashboardLayout, Card, ErrorState, Search, Skeleton, Tabs],
  templateUrl: './movement-detail.html',
})
export class MovementDetail {
  private readonly api = inject(AnalyticsApi);
  protected readonly propertyStore = inject(HostPropertyStore);

  protected readonly range = signal('12m');
  protected readonly search = signal('');

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
          catchError((err) => of<ViewState>({ loading: false, error: true, networkError: isNetworkError(err), data: null })),
        ),
      ),
    ),
    { initialValue: { loading: true, error: false, networkError: false, data: null } as ViewState },
  );

  protected readonly tenantBars = computed(() => {
    const series = this.state().data?.tenantMovement ?? [];
    const trimmed = this.range() === '6m' ? series.slice(-6) : series;
    return tenantMovementBars(trimmed);
  });

  protected readonly filteredRows = computed(() => {
    const q = this.search().toLowerCase().trim();
    const rows = this.tenantBars();
    return q ? rows.filter((b) => b.month.toLowerCase().includes(q)) : rows;
  });

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }
}
