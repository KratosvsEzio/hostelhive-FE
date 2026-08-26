import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { Card, ErrorState, Skeleton } from '@hostelhive/ui';
import { HostPropertyStore, OccupancySummaryPoint, OverviewApi } from '@services';
import { occupancyLine } from '@features/host/overview/charts/chart-helpers';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { DATE_RANGE_PRESETS, DateRange, DateRangePicker } from '@layout/components/date-range-picker/date-range-picker';
import { isNetworkError } from '@util/network-error';
import { localToday } from '@util/api-date';
import { TranslocoPipe } from '@jsverse/transloco';

interface ViewState {
  loading: boolean;
  error: boolean;
  networkError: boolean;
  data: OccupancySummaryPoint[];
}

const toISO = (d: Date | undefined): string | undefined =>
  d ? localToday(d) : undefined;

@Component({
  selector: 'app-occupancy-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DashboardLayout, DateRangePicker, Card, ErrorState, Skeleton, TranslocoPipe],
  templateUrl: './occupancy-detail.html',
})
export class OccupancyDetail {
  private readonly api = inject(OverviewApi);
  protected readonly propertyStore = inject(HostPropertyStore);

  protected readonly dateRange = signal<DateRange | null>(
    DATE_RANGE_PRESETS.find((p) => p.label === 'Last 12 months')!.fn(),
  );
  protected readonly hoveredIdx = signal(-1);

  private readonly refresh = signal(0);

  private readonly query = computed(() => {
    this.refresh();
    const slug = this.propertyStore.selected();
    const range = this.dateRange();
    return { slug, range };
  });

  protected readonly state = toSignal(
    toObservable(this.query).pipe(
      switchMap(({ slug, range }) =>
        slug
          ? this.api.occupancySummaries(slug, toISO(range?.start), toISO(range?.end)).pipe(
              map((data): ViewState => ({ loading: false, error: false, networkError: false, data })),
              startWith<ViewState>({ loading: true, error: false, networkError: false, data: [] }),
              catchError((err) =>
                of<ViewState>({ loading: false, error: true, networkError: isNetworkError(err), data: [] }),
              ),
            )
          : of<ViewState>({ loading: false, error: false, networkError: false, data: [] }),
      ),
    ),
    { initialValue: { loading: true, error: false, networkError: false, data: [] } as ViewState },
  );

  protected readonly chartLine = computed(() =>
    occupancyLine(this.state().data, 800, 200, 12),
  );

  protected readonly rows = computed(() => this.state().data);

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }
}
