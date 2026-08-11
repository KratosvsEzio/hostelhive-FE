import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, combineLatest, filter, map, of, startWith, switchMap, take } from 'rxjs';
import {
  Avatar,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  PaginationConfig,
  Skeleton,
} from '@hostelhive/ui';
import { HostOpsApi, HostPropertyStore } from '@services';
import { Tenant, Invoice } from '@hostelhive/data-access';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { isNetworkError } from '@util/network-error';
import { ordinal } from '@util/ordinal';
import { tenantRentCols, tenantUtilityCols } from '@app/util/table-configs/invoice-table-cols';
import { TenantFormDrawer } from '../tenant-form-drawer/tenant-form-drawer';

type Tab = 'info' | 'rent' | 'utility';

interface ProfileState {
  loading: boolean;
  error: boolean;
  networkError: boolean;
  tenant: Tenant | null;
}

interface BillState {
  loading: boolean;
  bills: Invoice[];
  total: number;
  totalPages: number;
}

@Component({
  selector: 'hh-tenant-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    DashboardLayout,
    Avatar,
    Button,
    DataTable,
    EmptyState,
    ErrorState,
    Skeleton,
    TenantFormDrawer,
  ],
  templateUrl: './tenant-profile.html',
})
export class TenantProfile {
  private readonly api = inject(HostOpsApi);
  private readonly store = inject(HostPropertyStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly activeTab = signal<Tab>('info');
  protected readonly cnicPreview = signal<string | null>(null);
  protected readonly rentPage = signal(1);
  protected readonly utilityPage = signal(1);
  private readonly refresh = signal(0);

  protected readonly invoiceRowId = (row: unknown) => (row as Invoice).id;
  protected readonly rentCols = tenantRentCols();
  protected readonly utilityCols = tenantUtilityCols();

  private readonly tenantId = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('tenantId') ?? '')),
    { initialValue: this.route.snapshot.paramMap.get('tenantId') ?? '' },
  );

  private readonly editParam = toSignal(
    this.route.queryParamMap.pipe(map((q) => q.get('edit'))),
    { initialValue: this.route.snapshot.queryParamMap.get('edit') },
  );

  private readonly fetchKey = computed(() => ({
    hostelId: this.store.selected(),
    tenantId: this.tenantId(),
    refresh: this.refresh(),
  }));

  private readonly tenant$ = toObservable(this.fetchKey).pipe(
    switchMap(({ hostelId, tenantId }) =>
      hostelId && tenantId
        ? this.api.getRenter(hostelId, tenantId).pipe(
            map((t) => ({ loading: false, error: false, networkError: false, tenant: t })),
            catchError((err) => of({ loading: false, error: true, networkError: isNetworkError(err), tenant: null })),
          )
        : of({ loading: false, error: true, networkError: false, tenant: null }),
    ),
  );

  // Deliberately no `startWith` — a refresh keeps the current tenant on screen and swaps
  // the fresh one in, so saving an edit never flashes the skeleton.
  protected readonly state = toSignal(this.tenant$, {
    initialValue: { loading: true, error: false, networkError: false, tenant: null } as ProfileState,
  });

  /** Room the invoice tabs filter on. Tracked, so a saved room change re-runs both queries. */
  private readonly currentRoomId = computed(() => this.state().tenant?.roomId ?? '');

  private readonly rentHistory$ = combineLatest([
    toObservable(this.activeTab),
    toObservable(this.rentPage),
    toObservable(this.currentRoomId),
    toObservable(this.refresh),
  ]).pipe(
    filter(([tab]) => tab === 'rent'),
    switchMap(([, page, roomId]) =>
      this.route.paramMap.pipe(
        take(1),
        map((p) => ({
          hostelId: this.store.selected(),
          tenantId: p.get('tenantId') ?? '',
          roomId,
          page,
        })),
      ),
    ),
    switchMap(({ hostelId, tenantId, roomId, page }) => {
      if (!hostelId || !tenantId) return of({ loading: false, bills: [] as Invoice[], total: 0, totalPages: 1 });
      return this.api.invoices(hostelId, page, 10, {
        'f[bill_type]': 'rental',
        'f[room.id]': roomId,
        'f[renter.id]': tenantId,
      }).pipe(
        map((res) => ({ loading: false, bills: res.bills, total: res.total, totalPages: res.totalPages })),
        startWith({ loading: true, bills: [] as Invoice[], total: 0, totalPages: 1 }),
        catchError(() => of({ loading: false, bills: [] as Invoice[], total: 0, totalPages: 1 })),
      );
    }),
  );
  protected readonly rentState = toSignal(this.rentHistory$, {
    initialValue: { loading: true, bills: [] as Invoice[], total: 0, totalPages: 1 } as BillState,
  });
  protected readonly tenantInvoices = computed(() => this.rentState().bills);
  protected readonly rentLoading = computed(() => this.rentState().loading);
  protected readonly rentPagination = computed<PaginationConfig | null>(() => {
    const s = this.rentState();
    if (s.totalPages <= 1) return null;
    return { page: this.rentPage(), total: s.total, totalPages: s.totalPages, hasNextPage: this.rentPage() < s.totalPages, itemLabel: 'invoice' };
  });

  private readonly utilityHistory$ = combineLatest([
    toObservable(this.activeTab),
    toObservable(this.utilityPage),
    toObservable(this.currentRoomId),
    toObservable(this.refresh),
  ]).pipe(
    filter(([tab]) => tab === 'utility'),
    switchMap(([, page, roomId]) =>
      this.route.paramMap.pipe(
        take(1),
        map((p) => ({
          hostelId: this.store.selected(),
          tenantId: p.get('tenantId') ?? '',
          roomId,
          page,
        })),
      ),
    ),
    switchMap(({ hostelId, tenantId, roomId, page }) => {
      if (!hostelId || !tenantId) return of({ loading: false, bills: [] as Invoice[], total: 0, totalPages: 1 });
      return this.api.invoices(hostelId, page, 10, {
        'f[bill_type]': 'utility',
        'f[room.id]': roomId,
        'f[renter.id]': tenantId,
      }).pipe(
        map((res) => ({ loading: false, bills: res.bills, total: res.total, totalPages: res.totalPages })),
        startWith({ loading: true, bills: [] as Invoice[], total: 0, totalPages: 1 }),
        catchError(() => of({ loading: false, bills: [] as Invoice[], total: 0, totalPages: 1 })),
      );
    }),
  );
  protected readonly utilityState = toSignal(this.utilityHistory$, {
    initialValue: { loading: true, bills: [] as Invoice[], total: 0, totalPages: 1 } as BillState,
  });
  protected readonly tenantUtility = computed(() => this.utilityState().bills);
  protected readonly utilityLoading = computed(() => this.utilityState().loading);
  protected readonly utilityPagination = computed<PaginationConfig | null>(() => {
    const s = this.utilityState();
    if (s.totalPages <= 1) return null;
    return { page: this.utilityPage(), total: s.total, totalPages: s.totalPages, hasNextPage: this.utilityPage() < s.totalPages, itemLabel: 'invoice' };
  });

  protected readonly backUrl = computed(() => `/host/${this.store.selected()}/tenants`);

  protected readonly breadcrumbs = computed(() => [
    { label: 'Tenants', url: this.backUrl() },
    { label: this.state().tenant?.name ?? 'Tenant Profile' },
  ]);

  protected goBack(): void {
    this.router.navigate(['/host', this.store.selected(), 'tenants']);
  }

  /** Opens the edit drawer over this page. Never rendered on an errored or absent tenant. */
  protected readonly editOpen = computed(
    () => this.editParam() === '1' && !!this.state().tenant,
  );

  protected openEdit(): void {
    if (!this.state().tenant) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { edit: 1 },
      queryParamsHandling: 'merge',
    });
  }

  protected onDrawerSaved(): void {
    // Re-read through `getRenter`; the write response is not the show serializer.
    this.refresh.update((n) => n + 1);
    this.closeEdit();
  }

  protected onDrawerClosed(): void {
    this.closeEdit();
  }

  private closeEdit(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { edit: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected readonly ordinal = ordinal;
}
