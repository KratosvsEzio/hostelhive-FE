import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DecimalPipe } from '@angular/common';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, debounceTime, filter, map, switchMap, take } from 'rxjs';
import { Button, DatePicker, Dropdown, DropdownOption, Input } from '@hostelhive/ui';
import { MoneyInput } from '@app/shared/money-input/money-input';

import { HostOpsApi, HostPropertyStore } from '@services';
import { ApiError, Invoice, Tenant } from '@hostelhive/data-access';
import { NotificationService } from '@core/notification.service';
import { PAGE_SIZE } from '@util/pagination';
import {
  InvoiceForm,
  TenantOption,
  emptyInvoiceForm,
  fromInvoice,
  invoiceTotal,
  isInvoiceFormValid,
  prefillFromTenant,
  toCreateInvoicePayload,
} from './invoice-form.model';
import { TranslocoPipe } from '@jsverse/transloco';

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
  imports: [Button, DatePicker, Dropdown, Input, DecimalPipe, MoneyInput, TranslocoPipe],
  host: { class: 'contents' },
  templateUrl: './invoice-form-drawer.html',
})
export class InvoiceFormDrawer {
  /**
   * The bill being amended, or null to issue a new one. Set once when the drawer opens;
   * the page recreates the component per request rather than reusing it.
   */
  readonly invoice = input<Invoice | null>(null);

  /** True when amending an existing bill — drives the copy and the verb used on save. */
  protected readonly isEdit = computed(() => this.invoice() !== null);

  /** Emits when a bill is created or amended so the host page can refresh its list. */
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
  protected readonly formValid = computed(() => isInvoiceFormValid(this.form()));
  /** Backpacker hostels bill per night, so the invoice carries no due-date cycle. */
  protected readonly nightly = computed(
    () => this.store.activeProperty()?.accommodationType === 'backpacker',
  );

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

    // Seed the form from the bill being edited. An effect rather than a field
    // initialiser because `input()` is not readable while fields are initialising.
    effect(() => {
      const inv = this.invoice();
      if (inv) this.form.set(fromInvoice(inv));
    });

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

  protected fieldError(key: 'renterId'): string {
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

    // Create and update take an identical `renter_bill` body — only the verb and
    // whether the URL carries a bill id differ.
    const payload = toCreateInvoicePayload(f);
    const existing = this.invoice();
    const request$ = existing
      ? this.api.updateInvoice(hostelId, existing.id, payload)
      : this.api.createInvoice(hostelId, payload);

    this.saving.set(true);
    request$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.notifications.success(
            existing ? 'Invoice updated' : 'Invoice created',
            existing
              ? `The bill for ${f.renterName} has been amended.`
              : `A new bill for ${f.renterName} has been issued.`,
          );
          this.saved.emit();
        },
        error: (err) => {
          this.saving.set(false);
          const msg = (err as ApiError).message;
          this.notifications.error(
            existing ? "Couldn't update invoice" : "Couldn't create invoice",
            msg ?? 'Please try again.',
          );
        },
      });
  }
}
