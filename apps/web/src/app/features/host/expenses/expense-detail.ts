import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { format } from 'date-fns';
import { Button } from '@hostelhive/ui';
import { Breadcrumb, DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import {
  ExpenseDetail,
  ExpenseFormOptions,
  HostelsApi,
  HostPropertyStore,
} from '@services';
import { LocaleLink } from '@core/i18n/locale-link';
import { TranslocoPipe } from '@jsverse/transloco';

interface DetailState {
  loading: boolean;
  error: boolean;
  expense: ExpenseDetail | null;
}

/**
 * Host expense detail — opened from a row on the expenses list. Fetches the full expense
 * (line items + receipt) by the `:expenseId` route param whenever landed on, so the data is
 * always fresh. Read-only; editing isn't wired (the create form is quick-entry only).
 */
@Component({
  selector: 'hh-expense-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RouterLink, LocaleLink, DashboardLayout, Button, TranslocoPipe],
  templateUrl: './expense-detail.html',
})
export class ExpenseDetailPage {
  private readonly hostelsApi = inject(HostelsApi);
  private readonly propertyStore = inject(HostPropertyStore);
  private readonly route = inject(ActivatedRoute);

  private readonly expenseId = this.route.snapshot.paramMap.get('expenseId') ?? '';

  private readonly hostelId = computed(() =>
    this.propertyStore.properties().length > 0 ? this.propertyStore.selected() : '',
  );

  // Expense-type options → slug→name label map (keeps labels identical to the list page).
  private readonly formOptions = toSignal(
    toObservable(this.hostelId).pipe(
      switchMap((id) => {
        const empty: ExpenseFormOptions = { expenseTypes: [], itemUnits: [] };
        return id
          ? this.hostelsApi.expenseFormOptions(id).pipe(catchError(() => of(empty)))
          : of(empty);
      }),
    ),
    { initialValue: { expenseTypes: [], itemUnits: [] } as ExpenseFormOptions },
  );

  private readonly typeLabels = computed(() => {
    const m: Record<string, string> = {};
    for (const t of this.formOptions().expenseTypes) m[t.slug] = t.name;
    return m;
  });

  private readonly state = toSignal(
    toObservable(this.hostelId).pipe(
      switchMap((hostelId) => {
        if (!hostelId || !this.expenseId)
          return of<DetailState>({ loading: true, error: false, expense: null });
        return this.hostelsApi.getExpense(hostelId, this.expenseId).pipe(
          map((expense): DetailState => ({ loading: false, error: false, expense })),
          startWith<DetailState>({ loading: true, error: false, expense: null }),
          catchError(() => of<DetailState>({ loading: false, error: true, expense: null })),
        );
      }),
    ),
    { initialValue: { loading: true, error: false, expense: null } as DetailState },
  );

  protected readonly loading = computed(() => this.state().loading);
  protected readonly error = computed(() => this.state().error);
  protected readonly expense = computed(() => this.state().expense);

  /** Receipt preview URLs that failed to load (S3 is often still un-processed). */
  private readonly brokenReceipts = signal<ReadonlySet<string>>(new Set());

  protected readonly typeLabel = computed(() => {
    const e = this.expense();
    if (!e) return 'Expense';
    return this.typeLabels()[e.expenseType] || titleCase(e.expenseType);
  });

  protected readonly breadcrumbs = computed<Breadcrumb[]>(() => [
    { label: 'Expenses', url: '..' },
    { label: this.typeLabel() },
  ]);

  protected isReceiptBroken(url: string): boolean {
    return this.brokenReceipts().has(url);
  }

  protected onReceiptError(url: string): void {
    this.brokenReceipts.update((s) => new Set(s).add(url));
  }

  protected displayDate(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : format(d, 'd MMM yyyy');
  }
}

/** "staff_salaries" → "Staff salaries" — fallback label when a slug isn't in the options map. */
function titleCase(slug: string): string {
  return slug ? slug.charAt(0).toUpperCase() + slug.slice(1).replace(/_/g, ' ') : '';
}
