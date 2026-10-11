import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, NavigationStart, Router, RouterLink } from '@angular/router';
import { catchError, debounceTime, filter, map, of, startWith, switchMap, take, tap } from 'rxjs';
import {
  Button,
  ConfirmModal,
  ContextMenu,
  ContextMenuDivider,
  DataTable,
  DateRangeValue,
  Divider,
  DropdownOption,
  EmptyState,
  ErrorState,
  FilterOption,
  GlobalFilter,
  FilterValues,
  PaginationConfig,
  Search,
  Skeleton,
} from '@hostelhive/ui';
import { downloadCsv } from '@util/csv';
import { HostOpsApi, HostPropertyStore } from '@services';
import { ApiError, Invoice, InvoiceKind, InvoiceStatus } from '@hostelhive/data-access';
import { API_CONFIG } from '@core/api-config';
import { NotificationService } from '@core/notification.service';
import { RefetchDelay } from '@core/refetch-delay';
import { toToastCopy } from '@core/errors/api-error-message';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { SubscriptionGate } from '@layout/components/subscription-gate/subscription-gate';
import { isSubscriptionError } from '@util/subscription-error';
import { isNetworkError } from '@util/network-error';
import { invoiceFilterGroups } from '@app/util/filter-configs/invoice-filter-groups';
import { invoiceTableCols, buildInvoiceId, formatInvoiceDate } from '@app/util/table-configs/invoice-table-cols';
import { dayRangeStart, dayRangeEnd } from '@util/date-range-filter';
import { InvoiceFormDrawer } from './invoice-form-drawer/invoice-form-drawer';
import { HasPermission } from '@core/auth';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Logo } from '@core/brand/logo';
import { LocaleLink } from '@core/i18n/locale-link';
import { bookingPath } from '@util/host-links';
import { HostBooking, HostBookingsApi } from '../bookings/host-bookings-api';
import { PAYABLE_LANES, laneKeyFor } from '../bookings/booking-month';
import {
  InvoiceAggs,
  InvoiceChange,
  shiftInvoiceCounts,
} from './invoice-overlay';

interface ViewState {
  loading: boolean;
  error: boolean;
  subscriptionError: boolean;
  networkError: boolean;
  data: Invoice[] | null;
  total: number;
  totalPages: number;
  statuses: { name: string; slug: string; count: number }[];
  aggs: InvoiceAggs | null;
}

type Filter = 'all' | InvoiceStatus;

const EMPTY_STATE: ViewState = { loading: false, error: false, subscriptionError: false, networkError: false, data: [], total: 0, totalPages: 1, statuses: [], aggs: null };
const LOADING: ViewState = { loading: true, error: false, subscriptionError: false, networkError: false, data: null, total: 0, totalPages: 1, statuses: [], aggs: null };

/**
 * Pixels rendered per printed millimetre when rasterising the logo for the PDF. 12 px/mm
 * is ~305 dpi, so the mark stays sharp in print rather than showing the soft edges a
 * 1:1 raster would give.
 */
const RASTER_SCALE = 12;

/**
 * Paints an SVG onto a canvas and returns PNG bytes, because jsPDF cannot embed SVG.
 *
 * The width is derived from the asset's own aspect ratio rather than assumed, so swapping
 * in a differently proportioned logo does not stretch it. Same-origin with a base64 image
 * inside, so the canvas is never tainted and `toDataURL` stays allowed.
 */
async function rasterise(
  url: string,
  heightMm: number,
  pxPerMm: number,
): Promise<{ dataUrl: string; widthMm: number }> {
  const img = new Image();
  img.decoding = 'sync';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error(`${url} reported no intrinsic size`);

  const widthMm = (w / h) * heightMm;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(widthMm * pxPerMm));
  canvas.height = Math.max(1, Math.round(heightMm * pxPerMm));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is unavailable.');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL('image/png'), widthMm };
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Makes a value safe to interpolate into the print window's markup.
 *
 * The window is filled with `document.write`, so nothing Angular sanitises reaches it — and
 * a guest's name arrives from a public booking form.
 */
function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** Line-item pill colours per bill kind, for the preview, the print window and the PDF. */
const LINE_TAG: Record<InvoiceKind, { preview: string; print: string; rgbBg: [number, number, number]; rgbFg: [number, number, number] }> = {
  rental: { preview: 'bg-tint-sky text-ink-600', print: 'rent', rgbBg: [232, 244, 253], rgbFg: [55, 65, 81] },
  utility: { preview: 'bg-tint-cream text-brand-500', print: 'utility', rgbBg: [254, 243, 226], rgbFg: [180, 83, 9] },
  booking: { preview: 'bg-tint-purple text-backpacker', print: 'booking', rgbBg: [249, 245, 255], rgbFg: [107, 70, 193] },
};

/** The line under the billed-to name in the PDF and the print window. */
function billedToDetail(inv: Invoice): string {
  return inv.kind === 'booking' && inv.booking?.ref ? `Booking ${inv.booking.ref}` : `Room ${inv.roomNumber}`;
}

/**
 * The booking card's figures, from the per-status totals.
 *
 * The API's rent and utility buckets count only those bill types, so a nightly hostel's money
 * appears nowhere but in `statuses[].totalAmount`. Every bill a nightly hostel raises is a
 * booking bill, which makes those totals the booking figures exactly.
 */
function withBookingTotals(
  aggs: InvoiceAggs,
  statuses: readonly { slug: string; totalAmount: number }[],
): InvoiceAggs {
  const total = statuses.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);
  const paid = Number(statuses.find((s) => s.slug === 'paid')?.totalAmount || 0);
  return { ...aggs, bookingTotal: total, bookingPaid: paid, bookingBalance: total - paid };
}

/** Whether the booking still owes on a stage it can be marked paid from, as the bookings page decides it. */
function bookingStillOwes(b: HostBooking): boolean {
  const lane = laneKeyFor(b.disposition.slug);
  return !!lane && PAYABLE_LANES.includes(lane) && b.paid < b.total;
}

/** A booking bill waiting on the host before it is marked paid. */
interface PayPrompt {
  inv: Invoice;
  /** Still asking the server where the booking stands. */
  checking: boolean;
  /** Whether to offer settling the booking as well. */
  offerBooking: boolean;
}


@Component({
  selector: 'hh-invoices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Logo, 
    HasPermission,
    DecimalPipe,
    DashboardLayout,
    SubscriptionGate,
    Button,
    ConfirmModal,
    DataTable,
    ContextMenu,
    ContextMenuDivider,
    Divider,
    EmptyState,
    ErrorState,
    GlobalFilter,
    Search,
    Skeleton,
    InvoiceFormDrawer,
    TranslocoPipe,
    RouterLink,
    LocaleLink,
  ],
  templateUrl: './invoices.html',
})
export class Invoices {
  private readonly api = inject(HostOpsApi);
  private readonly bookingsApi = inject(HostBookingsApi);
  private readonly apiBaseUrl = inject(API_CONFIG).baseUrl;
  private readonly store = inject(HostPropertyStore);
  private readonly notifications = inject(NotificationService);
  private readonly i18n = inject(TranslocoService);
  private readonly refetchDelay = inject(RefetchDelay);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /**
   * Back to the property's overview.
   *
   * Absolute rather than `..`, because this component answers to four routes — the list,
   * `create`, `edit/:billId` and `view/:billId` — and a relative hop would land somewhere
   * different on each.
   */
  protected readonly backUrl = computed(() => `/host/${this.store.selected()}`);

  /**
   * Whether the hostel bills by the night. Such a hostel raises booking bills only, so the
   * page drops the rent/utility cards, the type filter and the manual "Add invoice".
   *
   * Strictly nightly: an unknown billing cycle keeps the monthly page, which still renders
   * any booking bill correctly.
   */
  protected readonly nightly = computed(() => this.store.isNightlyBilled(this.store.selected() ?? undefined));

  protected readonly invoiceRowId = (row: unknown) => (row as Invoice).id;
  protected readonly menuInv = signal<Invoice | null>(null);
  protected readonly menuPos = signal<{ top: number; right: number } | null>(null);
  protected readonly deletePending = signal<Invoice | null>(null);
  protected readonly deleting = signal(false);
  /** Whether the URL is on `create`. */
  private readonly createRequested = signal(false);
  /** A nightly hostel has no manual bills, so its `create` URL shows the list alone. */
  protected readonly addOpen = computed(() => this.createRequested() && !this.nightly());
  /** Bill id from the `edit/:billId` route segment, or null when not editing. */
  private readonly editingId = signal<string | null>(null);
  /**
   * The invoice the drawer should amend. Resolved from the loaded rows, so it stays
   * null until they arrive — the drawer only opens once there is something to seed it
   * with, rather than flashing an empty form.
   *
   * Never a booking bill: the form always saves the bill as a renter's, so editing one would
   * detach it from its booking.
   */
  protected readonly editingInvoice = computed(() => {
    const id = this.editingId();
    if (!id) return null;
    // Unfiltered: resolving against `filtered()` would make the drawer refuse to open
    // whenever the active status filter happened to hide the row being edited.
    const inv = (this.state().data ?? []).find((i) => i.id === id);
    return inv && inv.kind !== 'booking' ? inv : null;
  });
  /** Bill id from the `view/:billId` route segment, or null when not deep-linked. */
  private readonly viewingId = signal<string | null>(null);
  /** The deep-linked bill, once fetched by id because it was not on the loaded page. */
  private readonly viewed = signal<Invoice | null>(null);

  protected readonly payPrompt = signal<PayPrompt | null>(null);
  protected readonly alsoPayBooking = signal(true);
  /** Held across both requests of a cross-pay, so a second confirm cannot start another. */
  protected readonly paying = signal(false);
  private readonly deletedIds = signal(new Set<string>());

  protected readonly hostelName = computed(() => this.store.activeProperty()?.name ?? '');
  protected readonly hostelAddress = computed(() => {
    const p = this.store.activeProperty();
    if (!p) return '';
    return [p.area, p.city].filter(Boolean).join(', ');
  });
  private readonly refresh = signal(0);
  protected readonly fetching = signal(false);

  protected readonly PAGE_SIZE = 10;
  protected readonly Math = Math;
  protected readonly filter = signal<Filter>(this.initialFilter());
  protected readonly kindFilter = signal<'all' | 'rental' | 'utility'>(this.initialKindFilter());
  protected readonly roomFilter = signal('');
  protected readonly tenantFilter = signal('');
  protected readonly dateFrom = signal('');
  protected readonly dateTo = signal('');
  protected readonly page = signal(1);
  protected readonly selectedId = signal<string | null>(null);
  /** The type filter as it applies: a nightly hostel has no type to filter by. */
  private readonly activeKind = computed(() => (this.nightly() ? 'all' : this.kindFilter()));
  /** `tenant` searches whoever the bill is for: the tenant, or the guest on a nightly hostel. */
  protected readonly searchField = signal<'room' | 'tenant'>('room');
  protected readonly searchTerm = signal('');
  private readonly guestNameLabel = toSignal(
    this.i18n.selectTranslate<string>('hostInvoices.guestName'),
    { initialValue: '' },
  );
  protected readonly searchFieldOptions = computed<DropdownOption[]>(() => [
    { value: 'room', label: 'Room' },
    { value: 'tenant', label: this.nightly() ? this.guestNameLabel() : 'Tenant' },
  ]);
  protected readonly searchPlaceholder = computed(() => {
    if (this.searchField() === 'room') return 'Room number…';
    return this.nightly() ? `${this.guestNameLabel()}…` : 'Tenant name…';
  });
  private readonly debouncedTerm = toSignal(
    toObservable(this.searchTerm).pipe(debounceTime(300)),
    { initialValue: '' },
  );
  protected readonly hasActiveFilters = computed(() =>
    this.activeKind() !== 'all' ||
    this.roomFilter() !== '' ||
    this.tenantFilter() !== '' ||
    this.dateFrom() !== '' ||
    this.dateTo() !== '' ||
    this.searchTerm() !== '',
  );

  private readonly fetchKey = computed(() => ({
    hostelId: this.store.selected(),
    refresh: this.refresh(),
    page: this.page(),
    status: this.filter(),
    kind: this.activeKind(),
    nightly: this.nightly(),
    room: this.roomFilter(),
    tenant: this.tenantFilter(),
    dateFrom: this.dateFrom(),
    dateTo: this.dateTo(),
    searchTerm: this.debouncedTerm(),
  }));

  private readonly fetched = toSignal(
    toObservable(this.fetchKey).pipe(
      switchMap(({ hostelId, page, status, kind, nightly, room, tenant, dateFrom, dateTo, searchTerm }) => {
        if (!hostelId) { this.fetching.set(false); return of(EMPTY_STATE); }
        this.fetching.set(true);
        // Every query change funnels through here, whichever setter caused it — so this is
        // the one place the overlay can be dropped without a caller being able to forget.
        // Leaving it would let rows patched in for the previous query reappear over the new
        // page the moment `loading` went false again.
        this.local.set(null);
        this.baseline.set(new Map());
        const filters: Record<string, string> = {};
        if (status !== 'all') filters['f[status.slug]'] = status;
        if (kind !== 'all') filters['f[bill_type]'] = kind;
        if (room) filters['f[room.id]'] = room;
        if (tenant) filters['f[renter.id]'] = tenant;
        if (dateFrom) filters['f[issue_date][gte]'] = dayRangeStart(dateFrom);
        if (dateTo) filters['f[issue_date][lte]'] = dayRangeEnd(dateTo);
        if (searchTerm) {
          if (this.searchField() === 'room') filters['s[room.room_number]'] = searchTerm;
          else if (nightly) filters['s[booking.guest_name]'] = searchTerm;
          else filters['s[renter.full_name]'] = searchTerm;
        }
        return this.api.invoices(hostelId, page, this.PAGE_SIZE, filters).pipe(
          tap(() => this.fetching.set(false)),
          map((res): ViewState => ({
            loading: false,
            error: false,
            subscriptionError: false,
            networkError: false,
            data: res.bills,
            total: res.total,
            totalPages: res.totalPages,
            statuses: res.statuses,
            // Seeded into the counts rather than derived in the card, so local edits shift it.
            aggs: nightly ? withBookingTotals(res.aggs, res.statuses) : res.aggs,
          })),
          catchError((err) => {
            this.fetching.set(false);
            const sub = isSubscriptionError(err);
            const net = isNetworkError(err);
            return of<ViewState>({ loading: false, error: !sub, subscriptionError: sub, networkError: net, data: null, total: 0, totalPages: 1, statuses: [], aggs: null });
          }),
        );
      }),
    ),
    { initialValue: LOADING as ViewState },
  );

  /**
   * Bills amended in this session, shown over the fetched page.
   *
   * PUT answers with the saved bill, so an edit already knows the row a reload would go and
   * read. Cleared whenever the query changes, because the incoming page is the server's own
   * answer and supersedes anything patched in here.
   */
  private readonly local = signal<Invoice[] | null>(null);

  /**
   * Every row changed locally, as the last fetch reported it. `null` means it is new.
   *
   * The *previous* state is the part that matters, which is why this holds rows rather than
   * a set of ids. A bill moving from due to paid takes its amount out of the balance as well
   * as adding it to paid, and an edited amount has to be subtracted before the new one is
   * added — neither is answerable from the result alone.
   */
  private readonly baseline = signal<ReadonlyMap<string, Invoice | null>>(new Map());

  protected readonly state = computed<ViewState>(() => {
    const base = this.fetched();
    const overlay = this.local();
    const rows = overlay && !base.loading && !base.error ? overlay : base.data;

    const touched = this.baseline();
    const removed = this.deletedIds();
    if (!touched.size && !removed.size) return overlay && rows ? { ...base, data: rows } : base;

    const changes: InvoiceChange[] = [];
    const seen = new Set<string>();

    for (const [id, before] of touched) {
      seen.add(id);
      // A deleted row is gone whatever else was done to it, so `after` is null even when the
      // overlay still carries the edit that preceded the delete.
      const after = removed.has(id) ? null : (rows?.find((i) => i.id === id) ?? null);
      changes.push({ before, after });
    }

    // Deleted without having been touched first — the common case, since most bills are
    // removed straight from the list. Their previous state is whatever the fetch reported.
    for (const id of removed) {
      if (seen.has(id)) continue;
      const before = base.data?.find((i) => i.id === id);
      if (before) changes.push({ before, after: null });
    }

    const { total, statuses, aggs } = shiftInvoiceCounts(base, changes);
    return { ...base, data: rows, total, statuses, aggs };
  });

  // ── filter panel ───────────────────────────────────────────────────────────

  protected readonly statusOptions = computed<FilterOption[]>(() =>
    this.state().statuses.map((s) => ({ value: s.slug, label: `${s.name} (${s.count})` })),
  );

  protected readonly filterGroups = computed(() =>
    invoiceFilterGroups(this.store.selected() ?? '', this.statusOptions(), this.apiBaseUrl, !this.nightly()),
  );

  /** Maps current signal state → FilterValues so the panel shows current selections on open. */
  protected readonly currentFilterValues = computed<FilterValues>(() => {
    const v: FilterValues = {};
    v['status'] = this.filter();
    v['kind'] = this.kindFilter();
    const room = this.roomFilter();
    if (room) v['room'] = room;
    const tenant = this.tenantFilter();
    if (tenant) v['tenant'] = tenant;
    const from = this.dateFrom();
    const to = this.dateTo();
    if (from || to) v['date'] = { from: from || undefined, to: to || undefined };
    return v;
  });

  // ── derived ────────────────────────────────────────────────────────────────

  protected readonly filtered = computed<Invoice[]>(() => {
    const all = this.state().data ?? [];
    const deleted = this.deletedIds();
    const visible = deleted.size ? all.filter((i) => !deleted.has(i.id)) : all;
    const f = this.filter();
    return f === 'all' ? visible : visible.filter((i) => i.status === f);
  });

  /**
   * The bill in the preview drawer.
   *
   * A deep-linked bill opens even when the status filter hides it or it is on another page:
   * the link names one bill, whatever the list around it is showing.
   */
  protected readonly selected = computed<Invoice | undefined>(() => {
    const id = this.selectedId();
    if (!id) return undefined;
    const hit = this.filtered().find((i) => i.id === id);
    if (hit || id !== this.viewingId() || this.deletedIds().has(id)) return hit;
    const viewed = this.viewed();
    return (this.state().data ?? []).find((i) => i.id === id) ?? (viewed?.id === id ? viewed : undefined);
  });

  protected readonly rentSummary = computed(() => {
    const s = this.state();
    const all = s.data ?? [];
    const rent = all.filter((i) => i.kind === 'rental');
    return {
      total: s.aggs?.rentTotal ?? rent.reduce((sum, i) => sum + i.amount, 0),
      paid: s.aggs?.rentPaid ?? 0,
      balance: s.aggs?.rentBalance ?? 0,
    };
  });

  protected readonly utilitySummary = computed(() => {
    const s = this.state();
    const all = s.data ?? [];
    const util = all.filter((i) => i.kind === 'utility');
    return {
      total: s.aggs?.utilityTotal ?? util.reduce((sum, i) => sum + i.amount, 0),
      paid: s.aggs?.utilityPaid ?? 0,
      balance: s.aggs?.utilityBalance ?? 0,
    };
  });

  /** Read only on a nightly hostel, whose fetch always seeds these (see `withBookingTotals`). */
  protected readonly bookingSummary = computed(() => {
    const aggs = this.state().aggs;
    return {
      total: aggs?.bookingTotal ?? 0,
      paid: aggs?.bookingPaid ?? 0,
      balance: aggs?.bookingBalance ?? 0,
    };
  });

  protected readonly lineTagClass = (kind: InvoiceKind): string => LINE_TAG[kind].preview;

  protected readonly bookingLink = (inv: Invoice): string | null => {
    const hostelId = this.store.selected();
    return hostelId && inv.booking?.id ? bookingPath(hostelId, inv.booking.id) : null;
  };

  protected readonly tableCols = computed(() => invoiceTableCols(this.store.selected() ?? ''));

  protected readonly paginationConf = computed<PaginationConfig | null>(() => {
    const s = this.state();
    if (s.totalPages <= 1) return null;
    return {
      page: this.page(),
      total: s.total,
      totalPages: s.totalPages,
      hasNextPage: this.page() < s.totalPages,
      itemLabel: 'invoice',
    };
  });

  protected readonly menuActionActive = (row: unknown): boolean =>
    this.menuInv()?.id === (row as Invoice).id;

  constructor() {
    effect(() => {
      const list = this.filtered();
      const id = this.selectedId();
      // The deep-linked bill is exempt: it may be off-page by design, see `selected`.
      if (id && id !== this.viewingId() && !list.some((i) => i.id === id)) {
        this.selectedId.set(null);
      }
    });

    // `view/:billId`: once the list has settled, a bill it does not hold is fetched by id.
    const state$ = toObservable(this.state);
    toObservable(this.viewingId).pipe(
      switchMap((id) => {
        this.viewed.set(null);
        const hostelId = this.store.selected();
        if (!id || !hostelId) return of(null);
        return state$.pipe(
          filter((s) => !s.loading),
          take(1),
          switchMap((s) => {
            if (s.data?.some((i) => i.id === id)) return of(null);
            // Every outcome is reported below, so the interceptor's toast would be a second one.
            return this.api.invoice(hostelId, id, { suppressErrorToast: true }).pipe(
              map((inv): Invoice | 'missing' => (inv.id ? inv : 'missing')),
              catchError((err: ApiError) => of(err.status === 404 ? ('missing' as const) : { failed: err })),
            );
          }),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((found) => {
      if (!found) return;
      if (found === 'missing') {
        this.notifications.show({ kind: 'error', title: this.i18n.translate<string>('hostInvoices.invoiceNotFound') });
        this.closePreview();
        return;
      }
      if ('failed' in found) {
        const { title, message } = toToastCopy(found.failed);
        this.notifications.show({ kind: 'error', title, message });
        this.closePreview();
        return;
      }
      this.viewed.set(found);
    });

    this.router.events.pipe(
      filter(e => e instanceof NavigationStart),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => this.selectedId.set(null));

    // Drive the add-invoice drawer from the URL so the hardware/browser back button
    // closes it and lands back on the list.
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      startWith(null),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => {
      const segments = this.route.snapshot.url;
      this.createRequested.set(segments[0]?.path === 'create');
      // 'view/:billId' opens that bill's preview; the NavigationStart above has just cleared it.
      const viewing = segments[0]?.path === 'view' ? (segments[1]?.path ?? null) : null;
      this.viewingId.set(viewing);
      if (viewing) this.selectedId.set(viewing);
      // 'edit/:billId' — the id is resolved against the loaded list rather than
      // refetched, so a deep link that arrives before the list does simply shows
      // nothing until the rows land, at which point the drawer opens.
      this.editingId.set(
        segments[0]?.path === 'edit' ? (segments[1]?.path ?? null) : null,
      );
    });
  }

  // ── scope search ───────────────────────────────────────────────────────────

  protected onSearchFieldChange(v: string | null): void {
    if (v === 'room' || v === 'tenant') {
      this.searchField.set(v);
      this.page.set(1);
    }
  }

  protected onSearchTerm(term: string): void {
    this.searchTerm.set(term);
    this.page.set(1);
  }

  // ── filter actions ─────────────────────────────────────────────────────────

  private initialFilter(): Filter {
    const raw = this.route.snapshot.queryParamMap.get('status');
    const valid: Filter[] = ['all', 'paid', 'due', 'over-due'];
    return valid.includes(raw as Filter) ? (raw as Filter) : 'all';
  }

  private initialKindFilter(): 'all' | 'rental' | 'utility' {
    const raw = this.route.snapshot.queryParamMap.get('kind');
    return raw === 'rental' || raw === 'utility' ? raw : 'all';
  }

  protected setFilter(value: Filter): void {
    this.filter.set(value);
    this.page.set(1);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { status: value === 'all' ? null : value },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected onFiltersApply(values: FilterValues): void {
    const status = ((values['status'] as string) || 'all') as Filter;
    const kind = ((values['kind'] as string) || 'all') as 'all' | 'rental' | 'utility';
    const room = (values['room'] as string) || '';
    const tenant = (values['tenant'] as string) || '';
    const date = values['date'] as DateRangeValue | undefined;

    this.filter.set(status);
    this.kindFilter.set(kind);
    this.roomFilter.set(room);
    this.tenantFilter.set(tenant);
    this.dateFrom.set(date?.from ?? '');
    this.dateTo.set(date?.to ?? '');
    this.page.set(1);

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { status: status === 'all' ? null : status },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  // ── display helpers (aliases for template access) ──────────────────────────

  protected readonly formatDate = formatInvoiceDate;
  protected readonly invoiceId  = buildInvoiceId;

  protected printInvoice(inv: Invoice): void {
    this.openInvoicePrintWindow(inv, false);
  }

  protected downloadInvoice(inv: Invoice): void {
    void this.generatePdf(inv);
  }

  private async generatePdf(inv: Invoice): Promise<void> {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });

    const ml = 22;          // margin left
    const mr = 22;          // margin right
    const pw = 210;         // page width (A4)
    const cw = pw - ml - mr; // content width
    let y = 28;

    const right = (text: string, yPos: number, size = 10): void => {
      doc.setFontSize(size);
      doc.text(text, pw - mr, yPos, { align: 'right' });
    };

    // ── header ────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(17, 17, 17);
    doc.text(this.hostelName(), ml, y);

    if (this.hostelAddress()) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(136, 136, 136);
      doc.text(this.hostelAddress(), ml, y + 5);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(136, 136, 136);
    right('INVOICE', y - 2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(17, 17, 17);
    right(buildInvoiceId(inv), y + 4);

    y += 16;

    // ── divider ───────────────────────────────────────────────────────
    doc.setDrawColor(232, 232, 232);
    doc.setLineWidth(0.3);
    doc.line(ml, y, pw - mr, y);
    y += 10;

    // ── billing + dates ───────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(136, 136, 136);
    doc.text('BILLED TO', ml, y);
    right('ISSUED', y);
    y += 5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(17, 17, 17);
    doc.text(inv.tenantName, ml, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    right(formatInvoiceDate(inv.issued), y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(102, 102, 102);
    doc.text(billedToDetail(inv), ml, y);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(136, 136, 136);
    right('DUE', y);
    y += 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(17, 17, 17);
    right(formatInvoiceDate(inv.due), y);
    y += 10;

    // ── divider ───────────────────────────────────────────────────────
    doc.setDrawColor(232, 232, 232);
    doc.line(ml, y, pw - mr, y);
    y += 8;

    // ── table header ──────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(136, 136, 136);
    doc.text('DESCRIPTION', ml, y);
    right('AMOUNT', y);
    y += 4;

    doc.setDrawColor(232, 232, 232);
    doc.line(ml, y, pw - mr, y);
    y += 7;

    // ── line items ────────────────────────────────────────────────────
    const { rgbBg: tagBg, rgbFg: tagFg } = LINE_TAG[inv.kind];

    for (const line of inv.lines) {
      // pill background
      const textW = (doc.getStringUnitWidth(line.label) * 9) / doc.internal.scaleFactor + 6;
      doc.setFillColor(tagBg[0], tagBg[1], tagBg[2]);
      doc.roundedRect(ml, y - 4, textW, 6, 2, 2, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(tagFg[0], tagFg[1], tagFg[2]);
      doc.text(line.label, ml + 3, y);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(17, 17, 17);
      right(`Rs ${line.amount.toLocaleString()}`, y);

      y += 3;
      doc.setDrawColor(240, 240, 240);
      doc.line(ml, y, pw - mr, y);
      y += 7;
    }

    // ── total row ─────────────────────────────────────────────────────
    y += 2;
    doc.setFillColor(254, 249, 240);
    doc.roundedRect(ml, y - 5, cw, 12, 3, 3, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(55, 65, 81);
    doc.text('Total due', ml + 5, y + 2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(194, 73, 10);
    right(`Rs ${inv.amount.toLocaleString()}`, y + 2, 14);
    y += 18;

    // ── pay note ──────────────────────────────────────────────────────
    if (inv.payNote) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(136, 136, 136);
      doc.text(inv.payNote, ml, y);
      y += 10;
    }

    // ── footer ────────────────────────────────────────────────────────
    const footerY = 277;
    doc.setDrawColor(232, 232, 232);
    doc.line(ml, footerY - 4, pw - mr, footerY - 4);

    try {
      // jsPDF has no SVG support — addImage only takes raster formats — so the brand SVG
      // is painted onto a canvas and handed over as PNG bytes. Nothing else in the app
      // references a .png logo; this is a PDF-format constraint, not a second asset.
      const logoH = 5;
      const logo = await rasterise('/hostelhive-logo.svg', logoH, RASTER_SCALE);
      doc.addImage(logo.dataUrl, 'PNG', ml, footerY - 2, logo.widthMm, logoH);
    } catch {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(17, 17, 17);
      doc.text('HostelHive', ml, footerY + 2);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(136, 136, 136);
    right('support@hostelhive.com', footerY + 2);

    doc.save(`${buildInvoiceId(inv)}.pdf`);
  }

  private openInvoicePrintWindow(inv: Invoice, autoClose: boolean): void {
    // Every value below is escaped once here and only the escaped copies are interpolated.
    const rawId  = buildInvoiceId(inv);
    const id     = escapeHtml(rawId);
    const name   = escapeHtml(this.hostelName());
    const addr   = escapeHtml(this.hostelAddress());
    const origin = escapeHtml(window.location.origin);
    const billedTo = escapeHtml(inv.tenantName);
    const detail   = escapeHtml(billedToDetail(inv));
    const issued   = escapeHtml(formatInvoiceDate(inv.issued));
    const due      = escapeHtml(formatInvoiceDate(inv.due));
    const amount   = escapeHtml(inv.amount.toLocaleString());
    const payNote  = inv.payNote ? escapeHtml(inv.payNote) : '';
    const tag      = LINE_TAG[inv.kind].print;

    const rows = inv.lines.map((l) => `
      <tr>
        <td class="desc">
          <span class="tag ${tag}">${escapeHtml(l.label)}</span>
        </td>
        <td class="amt">Rs ${escapeHtml(l.amount.toLocaleString())}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${id}.pdf</title>
  <style>
    @page { size: A4; margin: 28mm 22mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #111; background: #fff; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
    .hostel-name { font-size: 18px; font-weight: 700; }
    .hostel-addr { font-size: 11px; color: #888; margin-top: 2px; }
    .inv-label { font-size: 10px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: #888; text-align: right; }
    .inv-id { font-size: 13px; font-weight: 600; text-align: right; margin-top: 2px; }
    hr { border: none; border-top: 1px solid #e8e8e8; margin: 20px 0; }
    .meta { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 20px; }
    .meta-key { font-size: 10px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: #888; margin-bottom: 4px; }
    .meta-val { font-weight: 600; color: #111; }
    .meta-sub { font-size: 11px; color: #666; margin-top: 2px; }
    .meta-right { text-align: right; }
    .meta-right .meta-key:not(:first-child) { margin-top: 10px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    thead th { font-size: 10px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: #888; padding-bottom: 8px; border-bottom: 1px solid #e8e8e8; }
    th.desc { text-align: left; }
    th.amt { text-align: right; }
    td.desc { padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
    td.amt { text-align: right; padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-weight: 500; }
    .tag { display: inline-block; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 500; }
    .tag.utility { background: #fef3e2; color: #b45309; }
    .tag.rent    { background: #e8f4fd; color: #374151; }
    .tag.booking { background: #f9f5ff; color: #6b46c1; }
    .total-row { display: flex; justify-content: space-between; align-items: center; background: #fef9f0; border-radius: 10px; padding: 14px 18px; margin-top: 12px; }
    .total-label { font-weight: 600; font-size: 13px; color: #374151; }
    .total-amt { font-size: 20px; font-weight: 700; color: #c2490a; }
    .pay-note { font-size: 11px; color: #888; margin-top: 14px; }
    .footer { display: flex; justify-content: space-between; align-items: center; margin-top: 28px; padding-top: 16px; border-top: 1px solid #e8e8e8; }
    .footer img { height: 14px; width: auto; }
    .footer a { font-size: 11px; color: #888; text-decoration: none; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="hostel-name">${name}</div>
      ${addr ? `<div class="hostel-addr">${addr}</div>` : ''}
    </div>
    <div>
      <div class="inv-label">Invoice</div>
      <div class="inv-id">${id}</div>
    </div>
  </div>
  <hr />
  <div class="meta">
    <div>
      <div class="meta-key">Billed to</div>
      <div class="meta-val">${billedTo}</div>
      <div class="meta-sub">${detail}</div>
    </div>
    <div class="meta-right">
      <div class="meta-key">Issued</div>
      <div class="meta-sub">${issued}</div>
      <div class="meta-key">Due</div>
      <div class="meta-sub">${due}</div>
    </div>
  </div>
  <hr />
  <table>
    <thead>
      <tr><th class="desc">Description</th><th class="amt">Amount</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="total-row">
    <span class="total-label">Total due</span>
    <span class="total-amt">Rs ${amount}</span>
  </div>
  ${payNote ? `<p class="pay-note">${payNote}</p>` : ''}
  <div class="footer">
    <img src="${origin}/hostelhive-logo.svg" alt="HostelHive" />
    <a href="mailto:support@hostelhive.com">support@hostelhive.com</a>
  </div>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=700,height=900');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.document.title = `${rawId}.pdf`;
    w.onload = () => {
      w.focus();
      w.print();
      if (autoClose) w.onafterprint = () => w.close();
    };
  }

  protected openMenu(inv: Invoice, event: MouseEvent): void {
    event.stopPropagation();
    if (this.menuInv()?.id === inv.id) { this.menuInv.set(null); return; }
    const btn = event.currentTarget as HTMLElement;
    const r = btn.getBoundingClientRect();
    this.menuPos.set({ top: r.bottom + 4, right: window.innerWidth - r.right });
    this.menuInv.set(inv);
  }

  protected closeMenu(): void { this.menuInv.set(null); }

  protected deleteInvoice(inv: Invoice, event: MouseEvent): void {
    event.stopPropagation();
    this.closeMenu();
    this.deletePending.set(inv);
  }

  protected confirmDelete(): void {
    const inv = this.deletePending();
    const hostelId = this.store.selected();
    if (!inv || !hostelId) return;

    this.deletedIds.update((s) => { const n = new Set(s); n.add(inv.id); return n; });
    this.deletePending.set(null);

    this.deleting.set(true);
    this.api.deleteInvoice(hostelId, inv.id).subscribe({
      next: () => { this.deleting.set(false); },
      error: (err: ApiError) => {
        this.deletedIds.update((s) => { const n = new Set(s); n.delete(inv.id); return n; });
        this.deleting.set(false);
        const { title, message } = toToastCopy(err);
        this.notifications.show({ kind: 'error', title, message }, 0);
      },
    });
  }

  protected cancelDelete(): void {
    this.deletePending.set(null);
  }

  protected editInvoice(inv: Invoice, event: MouseEvent): void {
    event.stopPropagation();
    this.closeMenu();
    const base = this.invoicesBase();
    if (!base) return;
    void this.router.navigate([...base, 'edit', inv.id], {
      queryParamsHandling: 'preserve',
    });
  }

  /** Shared by save and cancel — both return to the list, closing the drawer. */
  protected closeEdit(): void {
    const base = this.invoicesBase();
    if (!base) return;
    void this.router.navigate(base, { queryParamsHandling: 'preserve' });
  }

  /**
   * The drawer hands back the amended bill, so the row updates without re-reading the page.
   *
   * An edit changes one row in place: the bill stays on the same page, in the same position,
   * and the totals along the top move only if the amount or the status did — which
   * {@link applyEdited} carries over from the response. So the reload had nothing left to
   * tell us, and cost a spinner and the host's place in a list they were reading.
   *
   * `null` is the safety net — if PUT ever stops answering with the bill, this falls back to
   * the old behaviour instead of silently dropping the edit.
   */
  protected onInvoiceUpdated(saved: Invoice | null): void {
    this.closeEdit();
    if (!saved) {
      this.refetchDelay.track('/renter_bills');
      this.refresh.update((n) => n + 1);
      return;
    }
    this.applyEdited(saved);
  }

  /**
   * Replaces one bill on the page in place.
   *
   * Replace only — never append. This is the edit path, so the row is on the page by
   * definition; a bill arriving here with an unknown id would mean the response described
   * something other than what was edited, and adding it would be inventing a row.
   */
  private applyEdited(saved: Invoice): void {
    const current = this.state().data ?? [];
    const before = current.find((i) => i.id === saved.id);
    if (!before) return;
    this.local.set(current.map((i) => (i.id === saved.id ? saved : i)));
    this.remember(saved.id, before);
  }

  /**
   * Records what a row was, the first time it is touched.
   *
   * Only the first: two edits in a row must still measure against what the server last sent,
   * not against the intermediate state this page invented. Overwriting would make the second
   * edit subtract a figure the server never reported, and the summary would drift a little
   * further with each save.
   *
   * `before` is null for a create, which is how {@link shiftInvoiceCounts} knows to add to
   * the total rather than move a row between buckets.
   */
  private remember(id: string, before: Invoice | null): void {
    this.baseline.update((map) => {
      if (map.has(id)) return map;
      const next = new Map(map);
      next.set(id, before);
      return next;
    });
  }

  /**
   * Rental and utility bills settle in one click. A booking bill asks first, because the
   * booking keeps its own payment state and the host is offered to settle it too.
   */
  protected markPaid(inv: Invoice, event: MouseEvent): void {
    event.stopPropagation();
    this.closeMenu();
    const hostelId = this.store.selected();
    if (!inv || !hostelId || inv.status === 'paid') return;
    if (inv.kind === 'booking') {
      this.promptBookingPay(hostelId, inv);
      return;
    }

    this.api.markInvoicePaid(hostelId, inv.id).subscribe({
      next: (settled) => {
        this.notifications.success('Invoice marked paid', `${buildInvoiceId(inv)} is now settled.`);
        this.applySettled(settled);
      },
      error: (err: ApiError) => {
        const { title, message } = toToastCopy(err);
        this.notifications.show({ kind: 'error', title, message }, 0);
      },
    });
  }

  /**
   * Opens the confirm at once and asks where the booking stands meanwhile.
   *
   * The checkbox is offered while the booking still owes on a payable stage — and also when
   * that cannot be found out, since a booking already paid answers with a harmless 422.
   */
  private promptBookingPay(hostelId: string, inv: Invoice): void {
    if (this.paying()) return;
    const bookingId = inv.booking?.id;
    this.alsoPayBooking.set(true);
    this.payPrompt.set({ inv, checking: !!bookingId, offerBooking: false });
    if (!bookingId) return;

    const settle = (offerBooking: boolean): void =>
      this.payPrompt.update((p) => (p?.inv.id === inv.id ? { ...p, checking: false, offerBooking } : p));
    // A failed read is absorbed by the dialog (it offers the box anyway), so it gets no toast.
    this.bookingsApi.get(hostelId, bookingId, { suppressErrorToast: true }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (booking) => settle(bookingStillOwes(booking)),
      error: () => settle(true),
    });
  }

  /** Invoice first, then — when ticked — the booking; each outcome reported on its own. */
  protected confirmPay(): void {
    const prompt = this.payPrompt();
    const hostelId = this.store.selected();
    if (!prompt || prompt.checking || !hostelId || this.paying()) return;
    const { inv } = prompt;
    const bookingId = prompt.offerBooking && this.alsoPayBooking() ? inv.booking?.id : undefined;

    this.paying.set(true);
    this.api.markInvoicePaid(hostelId, inv.id).subscribe({
      next: (settled) => {
        this.applySettled(settled);
        if (!bookingId) {
          this.finishPay();
          this.notifications.success('Invoice marked paid', `${buildInvoiceId(inv)} is now settled.`);
          return;
        }
        this.bookingsApi.markPaid(hostelId, bookingId, { suppressErrorToast: true }).subscribe({
          next: () => {
            this.finishPay();
            this.notifications.success(this.i18n.translate<string>('hostInvoices.invoiceAndBookingPaid'));
          },
          error: (err: ApiError) => {
            this.finishPay();
            const message = err.serverMessages?.join(' ') || toToastCopy(err).message;
            this.notifications.show(
              { kind: 'error', title: this.i18n.translate<string>('hostInvoices.bookingNotPaid', { message }) },
              0,
            );
          },
        });
      },
      error: (err: ApiError) => {
        this.finishPay();
        const { title, message } = toToastCopy(err);
        this.notifications.show({ kind: 'error', title, message }, 0);
      },
    });
  }

  protected cancelPay(): void {
    if (!this.paying()) this.payPrompt.set(null);
  }

  private finishPay(): void {
    this.paying.set(false);
    this.payPrompt.set(null);
  }

  /**
   * The endpoint echoes the settled bill, so the row moves to paid in place. `applyEdited`
   * records what the bill was as well as what it is, which is what lets the summary take its
   * amount out of the balance and put it into paid.
   */
  private applySettled(settled: Invoice): void {
    this.applyEdited(settled);
    if (this.viewed()?.id === settled.id) this.viewed.set(settled);
  }

  /** Closes the preview; one opened by a `view/:billId` link returns to the list's URL. */
  protected closePreview(): void {
    const base = this.invoicesBase();
    if (this.viewingId() && base) {
      void this.router.navigate(base, { queryParamsHandling: 'preserve' });
      return;
    }
    this.selectedId.set(null);
  }

  protected retry(): void { this.refresh.update((n) => n + 1); }

  // ── Add invoice ─────────────────────────────────────────────────────────────

  private invoicesBase(): unknown[] | null {
    const hostelId = this.store.selected();
    return hostelId ? ['/host', hostelId, 'invoices'] : null;
  }

  protected openAdd(): void {
    const base = this.invoicesBase();
    if (!base) return;
    void this.router.navigate([...base, 'create'], { queryParamsHandling: 'preserve' });
  }

  protected closeAdd(): void {
    const base = this.invoicesBase();
    if (!base) return;
    void this.router.navigate(base, { queryParamsHandling: 'preserve' });
  }

  /**
   * The drawer hands back the new bill, so it joins the list without a reload.
   *
   * A create moves more than the rows: the pagination total, the per-status counts behind
   * the filter labels, and the rent/utility summary cards — which prefer the server's `aggs`
   * over summing the page, so appending a row alone would leave the cards describing the
   * list as it was a moment ago. {@link baseline} is what lets all three follow.
   *
   * Null falls back to reloading, which is what happens if a response ever arrives without
   * a record. A row is worth more caution than an edit: getting it wrong invents an invoice
   * rather than mis-stating one.
   */
  protected onInvoiceCreated(saved: Invoice | null): void {
    this.closeAdd();
    if (!saved) {
      this.refetchDelay.track('/renter_bills');
      this.refresh.update((n) => n + 1);
      return;
    }
    const current = this.state().data ?? [];
    // Guard against a create that answers with an id already on the page — correct the row
    // rather than show the same bill twice.
    if (current.some((i) => i.id === saved.id)) {
      this.applyEdited(saved);
      return;
    }
    this.local.set([...current, saved]);
    this.remember(saved.id, null);
  }

  protected exportCsv(): void {
    const rows = this.filtered();
    if (!rows.length) return;
    if (this.nightly()) {
      downloadCsv(
        `hostelhive-invoices-${this.filter()}`,
        ['ID', 'Billed to', 'Booking', 'Room', 'Floor', 'Type', 'Status', 'Issued', 'Due', 'Amount (PKR)'],
        rows.map((inv) => [inv.id, inv.tenantName, inv.booking?.ref ?? '', inv.roomNumber, inv.floor, inv.kind, inv.status, inv.issued, inv.due, inv.amount]),
      );
      return;
    }
    downloadCsv(
      `hostelhive-invoices-${this.filter()}`,
      ['ID', 'Tenant', 'Room', 'Floor', 'Type', 'Status', 'Issued', 'Due', 'Amount (PKR)'],
      rows.map((inv) => [inv.id, inv.tenantName, inv.roomNumber, inv.floor, inv.kind, inv.status, inv.issued, inv.due, inv.amount]),
    );
  }
}
