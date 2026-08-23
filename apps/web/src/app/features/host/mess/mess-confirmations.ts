import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { format } from 'date-fns';
import {
  CellDef,
  ColumnDef,
  DataTable,
  DatePicker,
  PaginationConfig,
  TabItem,
  Tabs,
} from '@hostelhive/ui';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { HostelsApi, HostPropertyStore, MealConfirmationRaw } from '@services';
import {
  MEAL_META,
  MEAL_ORDER,
  MealType,
  MessNotificationsService,
} from './mess-notifications.service';
import { TranslocoPipe } from '@jsverse/transloco';

const todayIso = () => format(new Date(), 'yyyy-MM-dd');

const PAGE_SIZE = 25;

const CONFIRMATION_COLS: ColumnDef[] = [
  {
    key: 'tenant',
    label: 'Tenant',
    cell: (r) => {
      const o = r as MealConfirmationRaw;
      return { kind: 'composite', primary: o.renter.name, secondary: o.renter.phone } satisfies CellDef;
    },
  },
  {
    key: 'room',
    label: 'Room',
    cell: (r) => {
      const room = (r as MealConfirmationRaw).renter.room_number;
      return { kind: 'text', value: room ?? '—', class: 'text-ink-500' } satisfies CellDef;
    },
  },
  {
    key: 'confirmed_at',
    label: 'Confirmed at',
    align: 'right',
    cell: (r) => {
      const t = (r as MealConfirmationRaw).confirmed_at;
      return { kind: 'text', value: t ? format(new Date(t), 'h:mm a') : '—', class: 'text-ink-500' } satisfies CellDef;
    },
  },
];

interface LoadState {
  loading: boolean;
  items: MealConfirmationRaw[];
  total: number;
}

const EMPTY: LoadState = { loading: false, items: [], total: 0 };

@Component({
  selector: 'hh-mess-confirmations',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, DatePicker, Tabs, DataTable, DashboardLayout, TranslocoPipe],
  templateUrl: './mess-confirmations.html',
})
export class MessConfirmations {
  private readonly router = inject(Router);
  private readonly queryParams = toSignal(inject(ActivatedRoute).queryParamMap);
  private readonly store = inject(HostPropertyStore);
  private readonly api = inject(HostelsApi);

  protected readonly svc = inject(MessNotificationsService);
  protected readonly mealMeta = MEAL_META;
  protected readonly cols = CONFIRMATION_COLS;
  protected readonly rowId = (r: unknown): string => (r as MealConfirmationRaw).id;

  protected readonly activeMeal = computed<MealType>(() => {
    const meal = this.queryParams()?.get('meal');
    return MEAL_ORDER.includes(meal as MealType) ? (meal as MealType) : 'breakfast';
  });
  protected readonly page = signal(1);
  protected readonly selectedDate = signal<string | null>(todayIso());

  private readonly effectiveDate = computed(() => this.selectedDate() ?? todayIso());

  protected readonly isToday = computed(() => this.effectiveDate() === todayIso());

  protected readonly dateLabel = computed(() =>
    this.isToday()
      ? "Today's confirmations"
      : format(new Date(this.effectiveDate() + 'T00:00:00'), 'd MMM yyyy'),
  );

  private readonly fetchKey = computed(() => {
    const hostelId = this.store.selected();
    const ready = this.store.properties().length > 0;
    return {
      hostelId: ready ? hostelId : '',
      date: this.effectiveDate(),
      meal: this.activeMeal(),
    };
  });

  private readonly loaded = toSignal(
    toObservable(this.fetchKey).pipe(
      switchMap(({ hostelId, date, meal }) => {
        if (!hostelId) return of<LoadState>(EMPTY);
        return this.api.mealConfirmations(hostelId, { date, mealType: meal }).pipe(
          map((r) => ({ loading: false, items: r.items, total: r.total }) satisfies LoadState),
          startWith<LoadState>({ loading: true, items: [], total: 0 }),
          catchError(() => of<LoadState>(EMPTY)),
        );
      }),
    ),
    { initialValue: { loading: true, items: [], total: 0 } as LoadState },
  );

  protected readonly loading = computed(() => this.loaded().loading);
  protected readonly total = computed(() => this.loaded().total);
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  protected readonly tabs = computed<TabItem[]>(() =>
    MEAL_ORDER.map((m) => ({ value: m, label: MEAL_META[m].label })),
  );

  protected readonly activeMenu = computed(() => {
    const dayIndex = (new Date(this.effectiveDate() + 'T00:00:00').getDay() + 6) % 7;
    return this.svc.settings().meals[this.activeMeal()].weeklyMenu[dayIndex] ?? '';
  });

  protected readonly rows = computed(() => {
    const start = (this.page() - 1) * PAGE_SIZE;
    return this.loaded().items.slice(start, start + PAGE_SIZE);
  });

  protected readonly pagination = computed<PaginationConfig>(() => ({
    page: this.page(),
    total: this.total(),
    totalPages: this.totalPages(),
    hasNextPage: this.page() < this.totalPages(),
    itemLabel: 'tenant',
  }));

  protected onMealChange(v: string): void {
    this.page.set(1);
    this.router.navigate([], { queryParams: { meal: v }, queryParamsHandling: 'merge' });
  }

  protected onPage(p: number): void {
    this.page.set(p);
  }
}
