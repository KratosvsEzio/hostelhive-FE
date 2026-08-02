import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  afterRenderEffect,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DecimalPipe } from '@angular/common';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, debounceTime, filter, map, switchMap, take } from 'rxjs';
import { Button, DatePicker, Dropdown, DropdownOption, Input } from '@hostelhive/ui';

import { HostOpsApi, HostPropertyStore } from '@services';
import { ApiError, Tenant } from '@hostelhive/data-access';
import { NotificationService } from '@core/notification.service';
import { PAGE_SIZE } from '@util/pagination';
import {
  InvoiceForm,
  TenantOption,
  emptyInvoiceForm,
  invoiceTotal,
  isInvoiceFormValid,
  prefillFromTenant,
  toCreateInvoicePayload,
} from './invoice-form.model';

/**
 * Side drawer that issues a new rent invoice for a tenant.
 *
 * Mirrors the tenant check-in drawer: it owns nothing but the form, never navigates and
 * never touches the invoices page's data, reporting through {@link saved} / {@link closed}.
 * Picking a tenant prefills their contracted rent / mess / transport charges (all editable);
 * the total is the sum of the three breakdown lines.
 */
@Component({
  selector: 'hh-invoice-form-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, DatePicker, Dropdown, Input, DecimalPipe],
  host: { class: 'contents' },
  templateUrl: './invoice-form-drawer.html',
})
export class InvoiceFormDrawer {
  /** Emits when a bill is created so the host page can refresh its list. */
  readonly saved = output<void>();

  /** Emits when the drawer wants to go away — cancelled or dismissed. */
  readonly closed = output<void>();

  private readonly api = inject(HostOpsApi);
  private readonly store = inject(HostPropertyStore);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly form = signal<InvoiceForm>(emptyInvoiceForm());
  protected readonly saving = signal(false);
  protected readonly submitAttempted = signal(false);

  private readonly panelEl = viewChild<ElementRef<HTMLElement>>('panel');

  // Tenant selector state
  protected readonly tenantOptions = signal<TenantOption[]>([]);
  protected readonly tenantLoading = signal(false);
  protected readonly tenantHasMore = signal(false);
  private readonly tenantRecords = new Map<string, Tenant>();
  private readonly tenantQuery = signal('');
  private tenantCurrentPage = 1;
  private readonly tenantLoad$ = new Subject<{ query: string; page: number; append: boolean }>();
  private readonly hostelId$ = toObservable(this.store.selected);

  protected readonly total = computed(() => invoiceTotal(this.form()));

  /** Maps internal TenantOption list → DropdownOption[], seeding the current pick so the
   *  trigger always shows a label even while the full list is still loading. */
  protected readonly tenantDropdownOptions = computed<DropdownOption[]>(() => {
    const loaded = this.tenantOptions().map((t) => ({ value: t.id, label: t.label }));
    const f = this.form();
    if (f.renterId && f.renterName && !loaded.find((o) => o.value === f.renterId)) {
      return [{ value: f.renterId, label: f.renterName }, ...loaded];
    }
    return loaded;
  });

  constructor() {
    const trigger = isPlatformBrowser(inject(PLATFORM_ID))
      ? (document.activeElement as HTMLElement | null)
      : null;

    // Tenant search — waits for hostelId before calling the API.
    this.tenantLoad$
      .pipe(
        debounceTime(200),
        switchMap((payload) =>
          this.hostelId$.pipe(
            filter((id): id is string => !!id),
            take(1),
            map((hostelId) => ({ ...payload, hostelId })),
          ),
        ),
        switchMap(({ query, page, append, hostelId }) => {
          this.tenantLoading.set(true);
          const filters: Record<string, string> = {};
          if (query.trim()) filters['s[full_name]'] = query.trim();
          return this.api.renters(hostelId, page, PAGE_SIZE, filters).pipe(
            map((res) => ({ res, append })),
            catchError(() => {
              this.tenantLoading.set(false);
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ res, append }) => {
        for (const t of res.renters) this.tenantRecords.set(t.id, t);
        const options = res.renters.map((t) => ({
          id: t.id,
          name: t.name,
          label: t.roomNumber && t.roomNumber !== '—' ? `${t.name} · Room ${t.roomNumber}` : t.name,
        }));
        if (append) this.tenantOptions.update((prev) => [...prev, ...options]);
        else this.tenantOptions.set(options);
        this.tenantHasMore.set(res.renters.length >= PAGE_SIZE);
        this.tenantLoading.set(false);
      });

    afterRenderEffect(() => this.panelEl()?.nativeElement.focus());

    this.destroyRef.onDestroy(() => trigger?.focus());
  }

  // ── Tenant dropdown handlers ────────────────────────────────────────────────

  protected onTenantOpened(): void {
    if (this.tenantOptions().length === 0 && !this.tenantLoading()) {
      this.tenantCurrentPage = 1;
      this.tenantLoad$.next({ query: this.tenantQuery(), page: 1, append: false });
    }
  }

  protected onTenantSearch(query: string): void {
    this.tenantQuery.set(query);
    this.tenantCurrentPage = 1;
    this.tenantLoad$.next({ query, page: 1, append: false });
  }

  protected onLoadMoreTenants(): void {
    this.tenantCurrentPage++;
    this.tenantLoad$.next({ query: this.tenantQuery(), page: this.tenantCurrentPage, append: true });
  }

  protected onTenantValueChange(value: string | string[] | null): void {
    if (typeof value !== 'string') {
      this.form.update((f) => ({ ...f, renterId: '', renterName: '', roomId: '', roomNumber: '' }));
      return;
    }
    const tenant = this.tenantRecords.get(value);
    this.form.update((f) => (tenant ? prefillFromTenant(f, tenant) : { ...f, renterId: value }));
  }

  // ── Field patching ──────────────────────────────────────────────────────────

  protected patch(key: keyof InvoiceForm, value: string): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected fieldError(key: 'renterId' | 'issuedDate' | 'dueDate'): string {
    if (!this.submitAttempted()) return '';
    const f = this.form();
    return f[key].trim() ? '' : 'This field is required';
  }

  protected get totalError(): string {
    if (!this.submitAttempted()) return '';
    return invoiceTotal(this.form()) > 0 ? '' : 'Enter at least one charge above zero.';
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  protected requestClose(): void {
    if (this.saving()) return;
    this.closed.emit();
  }

  protected save(): void {
    const f = this.form();
    if (!isInvoiceFormValid(f)) {
      this.submitAttempted.set(true);
      return;
    }
    const hostelId = this.store.selected();
    if (!hostelId) return;

    this.saving.set(true);
    this.api
      .createInvoice(hostelId, toCreateInvoicePayload(f))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.notifications.success('Invoice created', `A new bill for ${f.renterName} has been issued.`);
          this.saved.emit();
        },
        error: (err) => {
          this.saving.set(false);
          const msg = (err as ApiError).message;
          this.notifications.error('Couldn\'t create invoice', msg ?? 'Failed to create the invoice. Please try again.');
        },
      });
  }
}
