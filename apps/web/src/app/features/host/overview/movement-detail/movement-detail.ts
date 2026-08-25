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
  Skeleton,
} from '@hostelhive/ui';
import { HostPropertyStore, OverviewApi } from '@services';
import { TenantMovement } from '@hostelhive/data-access';
import { tenantMovementBars } from '@features/host/overview/charts/chart-helpers';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { DATE_RANGE_PRESETS, DateRange, DateRangePicker } from '@layout/components/date-range-picker/date-range-picker';
import { isNetworkError } from '@util/network-error';
import { TranslocoPipe } from '@jsverse/transloco';

interface ViewState {
  loading: boolean;
  error: boolean;
  networkError: boolean;
  data: TenantMovement[];
}

const toISO = (d: Date | undefined): string | undefined => {
  if (!d) return undefined;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

@Component({
  selector: 'app-movement-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DashboardLayout, Card, ErrorState, Skeleton, DateRangePicker, TranslocoPipe],
  templateUrl: './movement-detail.html',
})
export class MovementDetail {
  private readonly api = inject(OverviewApi);
  protected readonly propertyStore = inject(HostPropertyStore);

  protected readonly dateRange = signal<DateRange | null>(
    DATE_RANGE_PRESETS.find((p) => p.label === 'Last 12 months')!.fn(),
  );
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
          ? this.api.tenantMovement(slug, toISO(range?.start), toISO(range?.end)).pipe(
              map((data): ViewState => ({ loading: false, error: false, networkError: false, data })),
              startWith<ViewState>({ loading: true, error: false, networkError: false, data: [] }),
              catchError((err) => of<ViewState>({ loading: false, error: true, networkError: isNetworkError(err), data: [] })),
            )
          : of<ViewState>({ loading: false, error: false, networkError: false, data: [] }),
      ),
    ),
    { initialValue: { loading: true, error: false, networkError: false, data: [] } as ViewState },
  );

  protected readonly tenantBars = computed(() => tenantMovementBars(this.state().data));

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }
}
