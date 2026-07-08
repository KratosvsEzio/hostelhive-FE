import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
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
import {
  MEAL_META,
  MEAL_ORDER,
  MealConfirmation,
  MealType,
  MessNotificationsService,
} from './mess-notifications.service';

const todayIso = () => format(new Date(), 'yyyy-MM-dd');

const PAGE_SIZE = 25;

const CONFIRMATION_COLS: ColumnDef[] = [
  {
    key: 'student',
    label: 'Student',
    cell: (r) => {
      const o = r as MealConfirmation;
      return { kind: 'composite', primary: o.studentName, secondary: o.rollNo } satisfies CellDef;
    },
  },
  {
    key: 'room',
    label: 'Room',
    cell: (r) => ({ kind: 'text', value: (r as MealConfirmation).room ?? '—', class: 'text-ink-600' } satisfies CellDef),
  },
  {
    key: 'time',
    label: 'Confirmed at',
    align: 'right',
    cell: (r) => ({ kind: 'text', value: format((r as MealConfirmation).confirmedAt, 'h:mm a'), class: 'text-ink-500' } satisfies CellDef),
  },
];

@Component({
  selector: 'hh-mess-confirmations',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, DatePicker, Tabs, DataTable, DashboardLayout],
  templateUrl: './mess-confirmations.html',
})
export class MessConfirmations {
  private readonly router = inject(Router);
  private readonly queryParams = toSignal(inject(ActivatedRoute).queryParamMap);

  protected readonly svc = inject(MessNotificationsService);
  protected readonly mealMeta = MEAL_META;
  protected readonly cols = CONFIRMATION_COLS;
  protected readonly rowId = (r: unknown): string => (r as MealConfirmation).id;

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

  private readonly confirmationsForDate = computed(() => {
    const d = this.effectiveDate();
    return this.svc.confirmations().filter((o) => o.date === d);
  });

  private readonly countsByMeal = computed<Record<MealType, number>>(() => {
    const counts: Record<MealType, number> = { breakfast: 0, lunch: 0, dinner: 0 };
    for (const o of this.confirmationsForDate()) counts[o.meal]++;
    return counts;
  });

  private readonly confirmationsByMeal = computed<Record<MealType, MealConfirmation[]>>(() => {
    const groups: Record<MealType, MealConfirmation[]> = { breakfast: [], lunch: [], dinner: [] };
    for (const o of this.confirmationsForDate()) groups[o.meal].push(o);
    return groups;
  });

  protected readonly tabs = computed<TabItem[]>(() =>
    MEAL_ORDER.map((m) => ({
      value: m,
      label: `${MEAL_META[m].label} (${this.countsByMeal()[m]})`,
    })),
  );

  protected readonly activeMenu = computed(() => {
    const dayIndex = (new Date(this.effectiveDate() + 'T00:00:00').getDay() + 6) % 7;
    return this.svc.settings().meals[this.activeMeal()].weeklyMenu[dayIndex] ?? '';
  });

  private readonly allForMeal = computed(() => this.confirmationsByMeal()[this.activeMeal()]);
  protected readonly total = computed(() => this.allForMeal().length);
  protected readonly totalConfirmations = computed(() => this.confirmationsForDate().length);
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  protected readonly rows = computed(() => {
    const start = (this.page() - 1) * PAGE_SIZE;
    return this.allForMeal().slice(start, start + PAGE_SIZE);
  });

  protected readonly pagination = computed<PaginationConfig>(() => ({
    page: this.page(),
    total: this.total(),
    totalPages: this.totalPages(),
    hasNextPage: this.page() < this.totalPages(),
    itemLabel: 'student',
  }));

  protected onMealChange(v: string): void {
    this.page.set(1);
    this.router.navigate([], { queryParams: { meal: v }, queryParamsHandling: 'merge' });
  }

  protected onPage(p: number): void {
    this.page.set(p);
  }
}
