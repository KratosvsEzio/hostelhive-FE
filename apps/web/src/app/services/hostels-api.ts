import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  AttachmentLabel,
  Paginated,
  HostelDetail,
  HostelEnumOption,
  HostelFormOptionsResponse,
  HostelInput,
  HostelListResponse,
  HostelResponse,
  HostelRoomTypesResponse,
  HostelSearchQuery,
  HostelSearchResult,
  HostelSubscription,
  HostelSubscriptionResponse,
  HostelWriteRequest,
  RoomType,
} from '@hostelhive/data-access';
import { ApiClient } from '@core/api-resource';
import { ApiPagination, toPageInfo } from '@util/pagination';

export interface WeeklyMenuPayload {
  id?: string;
  day: string;
  breakfast_menu_text: string;
  lunch_menu_text: string;
  dinner_menu_text: string;
}

export interface WeeklyMenuRecord extends WeeklyMenuPayload {
  id: string;
}

export interface MealTypeRecord {
  id: string;
  meal: string;
  /** ISO datetime — only the time component is meaningful; e.g. "2000-01-01T07:30:00.000+05:00". */
  meal_time: string;
  /** Hours before meal time the confirmation window closes. */
  confirmation_before_meal: number;
  /** Hours before meal time the notification fires. */
  notify_before_meal_time: number;
}

export interface MealTypePayload {
  meal: string;
  /** Format: "2000-01-01 HH:MM:00.000000000 PKT +05:00" */
  meal_time: string;
  confirmation_before_meal: number;
  notify_before_meal_time: number;
}

export interface MealInfoRaw {
  meal_type: string;      // 'breakfast' | 'lunch' | 'dinner'
  meal_date: string;      // 'yyyy-MM-dd'
  expired_time: string;   // ISO datetime — confirmation window close
}

export interface MealConfirmationRaw {
  id: string;
  renter_id: string;
  meal_type: string;       // 'breakfast' | 'lunch' | 'dinner'
  meal_date: string;       // 'yyyy-MM-dd'
  is_confirmed: boolean;
  confirmed_at: string | null;
  renter: { id: string; name: string; phone: string; email?: string | null; room_number?: string | null };
}

/**
 * Authenticated hostel management — the `/api/hostels` endpoints
 * (app/controllers/api/hostels_controller.rb). Requires a JWT (attached by
 * `authInterceptor`); `list()` is cancan-scoped server-side to the caller's hostels
 * (admins/moderators see all). Every response is unwrapped from the `{ …, success: true }`
 * envelope into a plain model.
 *
 * Two read shapes, by design: `list()` returns Elasticsearch search results
 * (`HostelSearchResult`), while the single-hostel reads return the richer
 * HostelSerializer shape (`HostelDetail`).
 */
/** Raw `mess_overview_cards` aggregate payload. */
interface MessOverviewResponse {
  aggs?: {
    meal_confirmation_aggs?: {
      total?: number;
      meal_types?: { meal_type: string; confirmed?: number; total?: number }[];
    };
    expense_aggs?: {
      this_month?: { total_amount?: number; entry_count?: number };
      last_month?: { total_amount?: number; entry_count?: number };
    };
    renter_aggs?: {
      /** Sum of mess charges billed to enrolled students (PKR). */
      total_mess_charges?: number;
      /** Students enrolled in at least one meal — the headline "enrolled" count. */
      any_meal?: number;
      breakfast?: number;
      lunch?: number;
      dinner?: number;
    };
    mess_invoice_aggs?: {
      last_month?: { total_paid?: number; mess_charges?: number };
    };
  };
}

/** One day's unique meal-confirmation counts — a point in the 30-day trend chart. */
export interface DailyMealConfirmation {
  date: string; // yyyy-MM-dd
  total: number;
  breakfast: number;
  lunch: number;
  dinner: number;
}

/** Raw `grocery_expense_stats` aggregate payload. */
export interface GroceryExpenseStat {
  date: string;
  total_amount: number;
  expense_types: { expense_type: string; total_amount: number }[];
}

interface GroceryExpenseStatsResponse {
  aggs?: GroceryExpenseStat[];
}

interface DailyMealConfirmationResponse {
  aggs?: {
    date: string;
    total_unique?: number;
    meal_types?: { meal_type: string; unique_count?: number }[];
  }[];
  success?: boolean;
}

/** Mess dashboard KPI figures, flattened for the cards. `byMeal` is keyed by meal type. */
export interface MessOverviewCards {
  /** Today's confirmed meal opt-ins. */
  confirmations: { total: number; byMeal: Record<string, number> };
  /** Grocery spend this month and last, each with its entry count. */
  expense: {
    monthlySpend: number;
    entryCount: number;
    lastMonthSpend: number;
    lastMonthEntryCount: number;
  };
  /** Enrolled students (any meal), their per-meal split, and total charges billed. */
  renters: {
    totalUnique: number;
    totalMessCharges: number;
    byMeal: Record<string, number>;
  };
  /** Last month's mess invoicing — charges levied and amount actually paid. */
  invoice: { lastMonthCharges: number; lastMonthPaid: number };
}

/** An expense category or item unit — both share the `{ id, slug, name }` shape. */
export interface ExpenseOption {
  id: number;
  slug: string;
  name: string;
}

/** Expense-form dropdown options (from `/expenses/new`). */
export interface ExpenseFormOptions {
  expenseTypes: ExpenseOption[];
  itemUnits: ExpenseOption[];
}

interface ExpenseFormOptionsResponse {
  expenses_types?: ExpenseOption[];
  expense_item_units?: ExpenseOption[];
}

/** One line item in a create/update expense payload (Rails nested attributes — carries
 *  `id` when editing an existing item). Amounts are strings, matching the API. */
export interface ExpenseItemInput {
  id?: string;
  name: string;
  unit: string;
  quantity: string;
  unit_price: string;
  total_price: string;
}

/** Create/update payload for a grocery expense (nested under `expense`). */
export interface ExpenseInput {
  expense_type: string;
  amount: string;
  /** Rails timestamp, e.g. "2026-07-30 20:01:59.496 +0500". */
  expense_date: string;
  notes: string;
  /** Attachment ids of the receipts (multiple images supported). */
  receipt_ids?: string[];
  /** Present only in breakdown mode (create). */
  expense_items_attributes?: ExpenseItemInput[];
  /** Echoed back on update to preserve existing line items (PUT uses `expense_items`, not `_attributes`). */
  expense_items?: ExpenseItemInput[];
}

/** One row in the expenses list, flattened for display. */
export interface ExpenseListItem {
  id: string;
  expenseType: string;
  amount: number;
  date: string;
  notes: string;
  receiptUrl: string | null;
  itemCount: number;
  /** ISO datetime the expense record was created (`created_at`). */
  createdAt: string;
}

/** A line item on an expense's detail view. */
export interface ExpenseItemDetail {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

/** One receipt attachment: `id` is echoed back as a `receipt_ids` entry, `url` is for preview. */
export interface ExpenseReceipt {
  id: string;
  url: string;
}

/** Full expense (detail view), flattened. */
export interface ExpenseDetail {
  id: string;
  expenseType: string;
  amount: number;
  date: string;
  notes: string;
  items: ExpenseItemDetail[];
  /** Receipts (multiple supported) — echoed via `receipt_ids` on update to keep them attached. */
  receipts: ExpenseReceipt[];
  createdAt: string;
  updatedAt: string;
}

/** One point in the monthly-expense trend: `month` is 'YYYY-MM', `value` the total spend. */
export interface ExpenseMonthlyPoint {
  month: string;
  value: number;
}

/** Server-side per-type monthly breakdown from `expense_type_monthly_summary`. */
export interface ExpenseTypeMonthlySummary {
  months: string[];
  series: { expenseType: string; data: { month: string; amount: number }[] }[];
}

interface RawExpenseDetail {
  id?: string | number;
  expense_type?: string;
  amount?: string | number;
  expense_date?: string;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  expense_items?: {
    id?: string | number;
    name?: string;
    unit?: string;
    quantity?: string | number;
    unit_price?: string | number;
    total_price?: string | number;
  }[] | null;
  receipt?: { id?: string | number; url?: string; variants?: { document?: string } } | null;
  receipts?: { id?: string | number; url?: string; variants?: { document?: string } }[] | null;
}

/** Raw expense row — field names assumed from the create/update payloads (defensive parse). */
interface RawExpense {
  id: number | string;
  expense_type?: string;
  amount?: number | string;
  expense_date?: string;
  created_at?: string;
  notes?: string | null;
  receipt?: { url?: string } | null;
  receipts?: { url?: string }[] | null;
  receipt_url?: string | null;
  expense_items?: unknown[] | null;
}

interface ExpenseListResponse {
  expenses?: RawExpense[];
  data?: RawExpense[];
  pagination?: ApiPagination;
}

@Injectable({ providedIn: 'root' })
export class HostelsApi {
  private readonly api = inject(ApiClient);

  /** GET /api/hostels — paginated search over the caller's hostels (Elastic `_source`). */
  list(
    query: HostelSearchQuery = {},
  ): Observable<Paginated<HostelSearchResult>> {
    return this.api
      .get<HostelListResponse>('/api/hostels', toSearchParams(query))
      .pipe(
        map((r) => ({
          items: r.hostels ?? [],
          total: r.pagination?.total_count ?? r.hostels?.length ?? 0,
          page: r.pagination?.current_page ?? query.page ?? 1,
          pageSize: query.limit ?? 30,
          totalPages: r.pagination?.total_pages,
        })),
      );
  }

  /** GET /api/hostels/new — gender, property, billing-frequency & attachment-label options. */
  formOptions(): Observable<{
    genderTypes: HostelEnumOption[];
    propertyTypes: HostelEnumOption[];
    billingFrequencyTypes: HostelEnumOption[];
    attachmentLabels: AttachmentLabel[];
  }> {
    return this.api
      .get<HostelFormOptionsResponse>('/api/hostels/new')
      .pipe(
        map((r) => ({
          genderTypes: r.gender_types ?? [],
          propertyTypes: r.property_types ?? [],
          billingFrequencyTypes: r.billing_frequency_types ?? [],
          attachmentLabels: r.attachment_labels ?? [],
        })),
      );
  }

  /** GET /api/hostels/:id — the full hostel (HostelSerializer). */
  getById(id: number | string): Observable<HostelDetail> {
    return this.api
      .get<HostelResponse>(`/public/hostel_detail/${id}`)
      .pipe(map((r) => requireHostel(r, id)));
  }

  /** GET /api/hostels/:id/edit — same detail shape, for edit forms. */
  getForEdit(id: number | string): Observable<HostelDetail> {
    return this.api
      .get<HostelResponse>(`/api/hostels/${id}/edit`)
      .pipe(map((r) => requireHostel(r, id)));
  }

  /** POST /api/hostels — create. Body is nested under `hostel`. */
  create(input: HostelInput): Observable<HostelDetail> {
    const body: HostelWriteRequest = { hostel: input };
    return this.api
      .post<HostelResponse>('/api/hostels', body)
      .pipe(map((r) => requireHostel(r)));
  }

  /** PUT /api/hostels/:id — update (full replace). Body is nested under `hostel`. */
  update(id: number | string, input: HostelInput): Observable<HostelDetail> {
    const body: HostelWriteRequest = { hostel: input };
    return this.api
      .put<HostelResponse>(`/api/hostels/${id}`, body)
      .pipe(map((r) => requireHostel(r, id)));
  }

  /** GET /api/hostels/:id/show_phone — gated contact reveal. Returns the primary phone number. */
  showPhone(id: number | string): Observable<string> {
    return this.api
      .get<{ phone_detail?: { primary_phone?: string | null } }>(`/api/hostels/${id}/show_phone`)
      .pipe(map((r) => r.phone_detail?.primary_phone ?? ''));
  }

  /** GET /api/hostels/:id/room_types — the hostel's room types. */
  roomTypes(id: number | string): Observable<RoomType[]> {
    return this.api
      .get<HostelRoomTypesResponse>(`/api/hostels/${id}/room_types`)
      .pipe(map((r) => r.room_types ?? []));
  }

  /** GET /api/hostels/:id/current_subscription — the most recent contract, or null. */
  currentSubscription(
    id: number | string,
  ): Observable<HostelSubscription | null> {
    return this.api
      .get<HostelSubscriptionResponse>(
        `/api/hostels/${id}/current_subscription`,
      )
      .pipe(map((r) => normalizeSubscription(r.subscription)));
  }

  /** POST /api/host/hostels/:id/meal_types — bulk upsert notification settings for all meals. */
  saveMealTypes(hostelId: string, payloads: MealTypePayload[]): Observable<MealTypeRecord[]> {
    return this.api
      .post<{ meal_types: MealTypeRecord[] }>(`/api/host/hostels/${hostelId}/meal_types`, { meal_types: payloads })
      .pipe(map((r) => r.meal_types ?? []));
  }

  /** GET /api/host/hostels/:id/meal_types — fetch saved notification settings per meal. */
  getMealTypes(hostelId: string): Observable<MealTypeRecord[]> {
    return this.api
      .get<{ meal_types: MealTypeRecord[] }>(`/api/host/hostels/${hostelId}/meal_types`)
      .pipe(map((r) => r.meal_types ?? []));
  }

  /** GET /api/host/hostels/:id/weekly_menus — fetch the saved weekly menu. */
  getWeeklyMenus(hostelId: string): Observable<WeeklyMenuRecord[]> {
    return this.api
      .get<{ weekly_menus: WeeklyMenuRecord[] }>(`/api/host/hostels/${hostelId}/weekly_menus`)
      .pipe(map((r) => r.weekly_menus ?? []));
  }

  /** PUT /api/host/hostels/:id/weekly_menus — upsert the full week's menu (id present = update, absent = create). */
  saveWeeklyMenus(hostelId: string, menus: WeeklyMenuPayload[]): Observable<void> {
    return this.api.put<void>(`/api/host/hostels/${hostelId}/weekly_menus`, {
      weekly_menus: menus,
    });
  }

  /** GET /public/meal_confirmations/meal_info/:token — resolve a tenant opt-in token (no auth required). */
  getMealInfo(token: string): Observable<MealInfoRaw> {
    return this.api
      .get<{ meal_info: MealInfoRaw; success: boolean }>(`/public/meal_confirmations/meal_info/${token}`)
      .pipe(map((r) => r.meal_info));
  }

  /** GET /api/host/hostels/:id/meal_confirmations — tenant meal opt-ins, filterable by date and meal type. */
  mealConfirmations(
    hostelId: string,
    filters: { mealType?: string; date?: string } = {},
  ): Observable<{ items: MealConfirmationRaw[]; total: number }> {
    const params: Record<string, string> = { 'f[is_confirmed]': 'true' };
    if (filters.mealType) params['f[meal_type]'] = filters.mealType;
    if (filters.date) params['f[meal_date]'] = filters.date;
    return this.api
      .get<{ meal_confirmations: MealConfirmationRaw[]; pagination?: { total_count: number } }>(
        `/api/host/hostels/${hostelId}/meal_confirmations`,
        params,
      )
      .pipe(
        map((r) => ({
          items: r.meal_confirmations ?? [],
          total: r.pagination?.total_count ?? r.meal_confirmations?.length ?? 0,
        })),
      );
  }

  /** GET /api/host/hostels/:id/mess_overview_cards — KPI aggregates for the mess dashboard. */
  messOverviewCards(hostelId: string): Observable<MessOverviewCards> {
    return this.api
      .get<MessOverviewResponse>(`/api/host/hostels/${hostelId}/mess_overview_cards`)
      .pipe(
        map((r) => {
          const a = r.aggs ?? {};
          const confByMeal: Record<string, number> = {};
          for (const m of a.meal_confirmation_aggs?.meal_types ?? []) {
            confByMeal[m.meal_type] = m.confirmed ?? 0;
          }
          const renters = a.renter_aggs ?? {};
          return {
            confirmations: {
              total: a.meal_confirmation_aggs?.total ?? 0,
              byMeal: confByMeal,
            },
            expense: {
              monthlySpend: a.expense_aggs?.this_month?.total_amount ?? 0,
              entryCount: a.expense_aggs?.this_month?.entry_count ?? 0,
              lastMonthSpend: a.expense_aggs?.last_month?.total_amount ?? 0,
              lastMonthEntryCount: a.expense_aggs?.last_month?.entry_count ?? 0,
            },
            renters: {
              totalUnique: renters.any_meal ?? 0,
              totalMessCharges: renters.total_mess_charges ?? 0,
              byMeal: {
                breakfast: renters.breakfast ?? 0,
                lunch: renters.lunch ?? 0,
                dinner: renters.dinner ?? 0,
              },
            },
            invoice: {
              lastMonthCharges: a.mess_invoice_aggs?.last_month?.mess_charges ?? 0,
              lastMonthPaid: a.mess_invoice_aggs?.last_month?.total_paid ?? 0,
            },
          };
        }),
      );
  }

  /**
   * GET /api/host/hostels/:id/daily_meal_confirmation — the last-30-days daily series of unique
   * confirmations per meal, powering the "Meal confirmations" trend chart. One entry per day.
   */
  /** GET /api/host/hostels/:id/grocery_expense_stats — daily or monthly grocery spend for the chart. */
  groceryExpenseStats(hostelId: string, interval: 'day' | 'month'): Observable<GroceryExpenseStat[]> {
    return this.api
      .get<GroceryExpenseStatsResponse>(`/api/host/hostels/${hostelId}/grocery_expense_stats`, { interval })
      .pipe(map((r) => r.aggs ?? []));
  }

  /** GET /api/host/hostels/:id/expenses/new — expense-type + item-unit options for the grocery form. */
  expenseFormOptions(hostelId: string): Observable<ExpenseFormOptions> {
    return this.api
      .get<ExpenseFormOptionsResponse>(`/api/host/hostels/${hostelId}/expenses/new`)
      .pipe(
        map((r) => ({
          expenseTypes: r.expenses_types ?? [],
          itemUnits: r.expense_item_units ?? [],
        })),
      );
  }

  /** POST /api/host/hostels/:id/expenses — create a grocery expense (quick or breakdown). */
  createExpense(hostelId: string, expense: ExpenseInput): Observable<unknown> {
    return this.api.post<unknown>(`/api/host/hostels/${hostelId}/expenses`, { expense });
  }

  /** PUT /api/host/hostels/:id/expenses/:expenseId — update a grocery expense. */
  updateExpense(hostelId: string, expenseId: string, expense: ExpenseInput): Observable<unknown> {
    return this.api.put<unknown>(`/api/host/hostels/${hostelId}/expenses/${expenseId}`, { expense });
  }

  /** DELETE /api/host/hostels/:id/expenses/:expenseId — permanently remove an expense. */
  deleteExpense(hostelId: string, expenseId: string): Observable<unknown> {
    return this.api.delete<unknown>(`/api/host/hostels/${hostelId}/expenses/${expenseId}`);
  }

  /**
   * GET /api/host/hostels/:id/expenses/expense_monthly_summary — total spend per month for the
   * trailing ~12 months. Verified shape: `{ aggs: [{ month: 'YYYY-MM', amount }], success }`.
   */
  expenseMonthlySummary(hostelId: string): Observable<ExpenseMonthlyPoint[]> {
    return this.api
      .get<{ aggs?: { month?: string; amount?: number | string }[] }>(
        `/api/host/hostels/${hostelId}/expenses/expense_monthly_summary`,
      )
      .pipe(
        map((r) =>
          (r.aggs ?? []).map((a) => ({ month: a.month ?? '', value: Number(a.amount) || 0 })),
        ),
      );
  }

  /**
   * GET /api/host/hostels/:id/expenses/expense_type_monthly_summary — per-type monthly breakdown
   * for the trailing ~13 months. Shape: `{ aggs: { months, series: [{ expense_type, data }] } }`.
   */
  expenseTypeMonthlySummary(hostelId: string): Observable<ExpenseTypeMonthlySummary> {
    return this.api
      .get<{
        aggs?: {
          months?: string[];
          series?: { expense_type?: string; data?: { month?: string; amount?: number | string }[] }[];
        };
      }>(`/api/host/hostels/${hostelId}/expenses/expense_type_monthly_summary`)
      .pipe(
        map((r) => ({
          months: r.aggs?.months ?? [],
          series: (r.aggs?.series ?? []).map((s) => ({
            expenseType: s.expense_type ?? '',
            data: (s.data ?? []).map((d) => ({ month: d.month ?? '', amount: Number(d.amount) || 0 })),
          })),
        })),
      );
  }

  /**
   * GET /api/host/hostels/:id/expenses — all of the hostel's expenses. Verified shape:
   * `{ expenses: [{ id, expense_type, amount, expense_date, … }], pagination }`.
   * Type + date-range filtering is applied client-side — the endpoint's `f[...]` params
   * don't cover these fields (they return no rows), so we pull a large single page (`limit`) and
   * filter in the component.
   */
  listExpenses(
    hostelId: string,
    params?: Record<string, string>,
  ): Observable<{ items: ExpenseListItem[]; total: number; totalPages: number }> {
    return this.api
      .get<ExpenseListResponse>(`/api/host/hostels/${hostelId}/expenses`, { limit: '200', ...params })
      .pipe(
        map((r) => {
          const rows = r.expenses ?? r.data ?? [];
          return {
            items: rows.map((e) => ({
              id: String(e.id),
              expenseType: e.expense_type ?? '',
              amount: Number(e.amount ?? 0),
              date: e.expense_date ?? '',
              notes: e.notes ?? '',
              receiptUrl: e.receipt?.url ?? e.receipts?.[0]?.url ?? e.receipt_url ?? null,
              itemCount: (e.expense_items ?? []).length,
              createdAt: e.created_at ?? '',
            })),
            total: r.pagination?.total_count ?? rows.length,
            // Callers that page (the mess grocery table) need the page count. Derived from
            // the requested limit when the API omits it, so a missing field degrades to a
            // single page rather than to zero.
            totalPages: r.pagination?.total_pages ?? 1,
          };
        }),
      );
  }

  /**
   * GET /api/host/hostels/:id/expenses/:expenseId — full detail for one expense.
   * Verified shape: `{ expense: { id, expense_type, amount (string), expense_date, notes,
   * expense_items: [{ id, name, unit, quantity, unit_price, total_price }],
   * receipt: { url, variants: { document } } }, success }`. Parsing is defensive.
   */
  getExpense(hostelId: string, expenseId: string): Observable<ExpenseDetail> {
    return this.api
      .get<{ expense?: RawExpenseDetail }>(`/api/host/hostels/${hostelId}/expenses/${expenseId}`)
      .pipe(
        map((r) => {
          const e = r.expense ?? {};
          return {
            id: String(e.id ?? ''),
            expenseType: e.expense_type ?? '',
            amount: Number(e.amount ?? 0),
            date: e.expense_date ?? '',
            notes: e.notes ?? '',
            items: (e.expense_items ?? []).map((it) => ({
              id: String(it.id ?? ''),
              name: it.name ?? '',
              unit: it.unit ?? '',
              quantity: Number(it.quantity ?? 0),
              unitPrice: Number(it.unit_price ?? 0),
              totalPrice: Number(it.total_price ?? 0),
            })),
            receipts: (e.receipts ?? (e.receipt ? [e.receipt] : []))
              .map((r) => ({
                id: r?.id != null ? String(r.id) : '',
                url: r?.url ?? r?.variants?.document ?? '',
              }))
              .filter((r) => r.id || r.url),
            createdAt: e.created_at ?? '',
            updatedAt: e.updated_at ?? '',
          } satisfies ExpenseDetail;
        }),
      );
  }

  dailyMealConfirmation(hostelId: string): Observable<DailyMealConfirmation[]> {
    return this.api
      .get<DailyMealConfirmationResponse>(`/api/host/hostels/${hostelId}/daily_meal_confirmation`)
      .pipe(
        map((r) =>
          (r.aggs ?? []).map((d) => {
            const count = (meal: string): number =>
              d.meal_types?.find((m) => m.meal_type === meal)?.unique_count ?? 0;
            return {
              date: d.date,
              total: d.total_unique ?? 0,
              breakfast: count('breakfast'),
              lunch: count('lunch'),
              dinner: count('dinner'),
            };
          }),
        ),
      );
  }
}

/**
 * HostelSerializer omits `:id`, so guarantee it from the requested id when available.
 * (`create()` has no prior id — if the backend doesn't echo one, add `:id` to
 * HostelSerializer server-side; until then `id` may be absent on the create result.)
 */
function requireHostel(r: HostelResponse, id?: number | string): HostelDetail {
  const h = r.hostel;
  if (!h) throw new Error('Hostel response did not include a hostel.');
  return id != null && h.id == null ? { ...h, id: Number(id) } : h;
}

/** `current_subscription` returns `{}` (no id) when a hostel has no contract — normalize to null. */
function normalizeSubscription(
  s: HostelSubscription | null | undefined,
): HostelSubscription | null {
  return s && s.id != null ? s : null;
}

/** Map the typed query to the Rails search params (`f[...]`, `sort[...]`, `page`, `limit`). */
function toSearchParams(
  q: HostelSearchQuery,
): Record<string, string | number | boolean> {
  const p: Record<string, string | number | boolean> = {};
  if (q.page != null) p['page'] = q.page;
  if (q.limit != null) p['limit'] = q.limit;
  if (q.city) p['f[city]'] = q.city;
  if (q.gender_type != null) p['f[gender_type]'] = q.gender_type;
  if (q.property_type != null) p['f[property_type]'] = q.property_type;
  if (q.bounds) {
    p['f[bounding][north]'] = q.bounds.north;
    p['f[bounding][south]'] = q.bounds.south;
    p['f[bounding][east]'] = q.bounds.east;
    p['f[bounding][west]'] = q.bounds.west;
  }
  if (q.sort) {
    for (const [field, order] of Object.entries(q.sort))
      p[`sort[${field}]`] = order;
  }
  return p;
}
