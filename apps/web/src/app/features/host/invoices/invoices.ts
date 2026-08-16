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
import { ActivatedRoute, NavigationEnd, NavigationStart, Router } from '@angular/router';
import { catchError, debounceTime, filter, map, of, startWith, switchMap, tap } from 'rxjs';
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
import { ApiError, Invoice, InvoiceStatus } from '@hostelhive/data-access';
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

interface InvoiceAggs {
  utilityTotal: number;
  utilityPaid: number;
  utilityBalance: number;
  rentTotal: number;
  rentPaid: number;
  rentBalance: number;
}

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


@Component({
  selector: 'hh-invoices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
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
  ],
  templateUrl: './invoices.html',
})
export class Invoices {
  private readonly api = inject(HostOpsApi);
  private readonly apiBaseUrl = inject(API_CONFIG).baseUrl;
  private readonly store = inject(HostPropertyStore);
  private readonly notifications = inject(NotificationService);
  private readonly refetchDelay = inject(RefetchDelay);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly invoiceRowId = (row: unknown) => (row as Invoice).id;
  protected readonly menuInv = signal<Invoice | null>(null);
  protected readonly menuPos = signal<{ top: number; right: number } | null>(null);
  protected readonly deletePending = signal<Invoice | null>(null);
  protected readonly deleting = signal(false);
  protected readonly addOpen = signal(false);
  /** Bill id from the `edit/:billId` route segment, or null when not editing. */
  private readonly editingId = signal<string | null>(null);
  /**
   * The invoice the drawer should amend. Resolved from the loaded rows, so it stays
   * null until they arrive — the drawer only opens once there is something to seed it
   * with, rather than flashing an empty form.
   */
  protected readonly editingInvoice = computed(() => {
    const id = this.editingId();
    if (!id) return null;
    // Unfiltered: resolving against `filtered()` would make the drawer refuse to open
    // whenever the active status filter happened to hide the row being edited.
    return (this.state().data ?? []).find((i) => i.id === id) ?? null;
  });
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
  protected readonly searchField = signal<'room' | 'tenant'>('room');
  protected readonly searchTerm = signal('');
  protected readonly searchFieldOptions: DropdownOption[] = [
    { value: 'room', label: 'Room' },
    { value: 'tenant', label: 'Tenant' },
  ];
  private readonly debouncedTerm = toSignal(
    toObservable(this.searchTerm).pipe(debounceTime(300)),
    { initialValue: '' },
  );
  protected readonly hasActiveFilters = computed(() =>
    this.kindFilter() !== 'all' ||
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
    kind: this.kindFilter(),
    room: this.roomFilter(),
    tenant: this.tenantFilter(),
    dateFrom: this.dateFrom(),
    dateTo: this.dateTo(),
    searchTerm: this.debouncedTerm(),
  }));

  protected readonly state = toSignal(
    toObservable(this.fetchKey).pipe(
      switchMap(({ hostelId, page, status, kind, room, tenant, dateFrom, dateTo, searchTerm }) => {
        if (!hostelId) { this.fetching.set(false); return of(EMPTY_STATE); }
        this.fetching.set(true);
        const filters: Record<string, string> = {};
        if (status !== 'all') filters['f[status.slug]'] = status;
        if (kind !== 'all') filters['f[bill_type]'] = kind;
        if (room) filters['f[room.id]'] = room;
        if (tenant) filters['f[renter.id]'] = tenant;
        if (dateFrom) filters['f[issue_date][gte]'] = dayRangeStart(dateFrom);
        if (dateTo) filters['f[issue_date][lte]'] = dayRangeEnd(dateTo);
        if (searchTerm) {
          if (this.searchField() === 'room') filters['s[room.room_number]'] = searchTerm;
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
            aggs: res.aggs,
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

  // ── filter panel ───────────────────────────────────────────────────────────

  protected readonly statusOptions = computed<FilterOption[]>(() =>
    this.state().statuses.map((s) => ({ value: s.slug, label: `${s.name} (${s.count})` })),
  );

  protected readonly filterGroups = computed(() =>
    invoiceFilterGroups(this.store.selected() ?? '', this.statusOptions(), this.apiBaseUrl),
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

  protected readonly selected = computed<Invoice | undefined>(() => {
    const list = this.filtered();
    const id = this.selectedId();
    return list.find((i) => i.id === id);
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
      if (id && !list.some((i) => i.id === id)) {
        this.selectedId.set(null);
      }
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
      this.addOpen.set(segments[0]?.path === 'create');
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
    doc.text(`Room ${inv.roomNumber}`, ml, y);

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
    const isUtility = inv.kind === 'utility';
    const tagBg  = isUtility ? [254, 243, 226] : [232, 244, 253];
    const tagFg  = isUtility ? [180, 83, 9]    : [55, 65, 81];

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
      const logo = await rasterise('/hostelhive-logo.png', logoH, RASTER_SCALE);
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
    const id     = buildInvoiceId(inv);
    const name   = this.hostelName();
    const addr   = this.hostelAddress();
    const origin = window.location.origin;

    const rows = inv.lines.map((l) => `
      <tr>
        <td class="desc">
          <span class="tag ${inv.kind === 'utility' ? 'utility' : 'rent'}">${l.label}</span>
        </td>
        <td class="amt">Rs ${l.amount.toLocaleString()}</td>
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
      <div class="meta-val">${inv.tenantName}</div>
      <div class="meta-sub">Room ${inv.roomNumber}</div>
    </div>
    <div class="meta-right">
      <div class="meta-key">Issued</div>
      <div class="meta-sub">${formatInvoiceDate(inv.issued)}</div>
      <div class="meta-key">Due</div>
      <div class="meta-sub">${formatInvoiceDate(inv.due)}</div>
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
    <span class="total-amt">Rs ${inv.amount.toLocaleString()}</span>
  </div>
  ${inv.payNote ? `<p class="pay-note">${inv.payNote}</p>` : ''}
  <div class="footer">
    <img src="${origin}/hostelhive-logo.png" alt="HostelHive" />
    <a href="mailto:support@hostelhive.com">support@hostelhive.com</a>
  </div>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=700,height=900');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.document.title = `${id}.pdf`;
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

  protected onInvoiceUpdated(): void {
    this.closeEdit();
    this.refetchDelay.track('/renter_bills');
    this.refresh.update((n) => n + 1);
  }

  protected markPaid(inv: Invoice, event: MouseEvent): void {
    event.stopPropagation();
    this.closeMenu();
    const hostelId = this.store.selected();
    if (!inv || !hostelId || inv.status === 'paid') return;

    this.api.markInvoicePaid(hostelId, inv.id).subscribe({
      next: () => {
        this.notifications.success('Invoice marked paid', `${buildInvoiceId(inv)} is now settled.`);
        this.refetchDelay.track('/renter_bills');
        this.refresh.update((n) => n + 1);
      },
      error: (err: ApiError) => {
        const { title, message } = toToastCopy(err);
        this.notifications.show({ kind: 'error', title, message }, 0);
      },
    });
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

  protected onInvoiceCreated(): void {
    this.closeAdd();
    this.refetchDelay.track('/renter_bills');
    this.refresh.update((n) => n + 1);
  }

  protected exportCsv(): void {
    const rows = this.filtered();
    if (!rows.length) return;
    downloadCsv(
      `hostelhive-invoices-${this.filter()}`,
      ['ID', 'Tenant', 'Room', 'Floor', 'Type', 'Status', 'Issued', 'Due', 'Amount (PKR)'],
      rows.map((inv) => [inv.id, inv.tenantName, inv.roomNumber, inv.floor, inv.kind, inv.status, inv.issued, inv.due, inv.amount]),
    );
  }
}
