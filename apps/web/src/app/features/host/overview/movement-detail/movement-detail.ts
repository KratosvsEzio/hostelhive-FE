import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import {
  Card,
  ErrorState,
  Skeleton,
} from '@hostelhive/ui';
import { HostPropertyStore, OverviewApi, selectedHostelToday, selectedHostelZone } from '@services';
import { TenantMovement } from '@hostelhive/data-access';
import { tenantMovementBars } from '@features/host/overview/charts/chart-helpers';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { DateRange, DateRangePicker, presetRange } from '@layout/components/date-range-picker/date-range-picker';
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

  private readonly zone = selectedHostelZone();
  /** The hostel's date, which the default range and the picker's presets count from. */
  protected readonly today = selectedHostelToday(new Date(), this.zone);

  protected readonly dateRange = linkedSignal<DateRange | null>(() =>
    presetRange('Last 12 months', this.today()),
  );
  private readonly refresh = signal(0);

  private readonly query = computed(() => {
    this.refresh();
    const slug = this.propertyStore.selected();
    const range = this.dateRange();
    // Held until the zone is known, so the default range isn't fetched twice.
    return { slug, range, pending: this.zone() === undefined };
  });

  protected readonly state = toSignal(
    toObservable(this.query).pipe(
      switchMap(({ slug, range, pending }) =>
        pending
          ? of<ViewState>({ loading: true, error: false, networkError: false, data: [] })
          : slug
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
