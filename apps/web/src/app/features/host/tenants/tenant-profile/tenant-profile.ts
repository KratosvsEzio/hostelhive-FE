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
import { tenantRentCols, tenantUtilityCols } from '@app/util/table-configs/invoice-table-cols';

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

  protected readonly invoiceRowId = (row: unknown) => (row as Invoice).id;
  protected readonly rentCols = tenantRentCols();
  protected readonly utilityCols = tenantUtilityCols();

  private readonly tenant$ = toObservable(this.store.selected).pipe(
    switchMap((hostelId) =>
      this.route.paramMap.pipe(
        map((p) => ({ hostelId, tenantId: p.get('tenantId') ?? '' })),
      ),
    ),
    switchMap(({ hostelId, tenantId }) =>
      hostelId && tenantId
        ? this.api.getRenter(hostelId, tenantId).pipe(
            map((t) => ({ loading: false, error: false, networkError: false, tenant: t })),
            catchError((err) => of({ loading: false, error: true, networkError: isNetworkError(err), tenant: null })),
          )
        : of({ loading: false, error: true, networkError: false, tenant: null }),
    ),
  );

  protected readonly state = toSignal(this.tenant$, {
    initialValue: { loading: true, error: false, networkError: false, tenant: null } as ProfileState,
  });

  private readonly rentHistory$ = combineLatest([
    toObservable(this.activeTab),
    toObservable(this.rentPage),
  ]).pipe(
    filter(([tab]) => tab === 'rent'),
    switchMap(([, page]) =>
      this.route.paramMap.pipe(
        take(1),
        map((p) => ({
          hostelId: this.store.selected(),
          tenantId: p.get('tenantId') ?? '',
          roomId: this.state().tenant?.roomId ?? '',
          page,
        })),
      ),
    ),
    switchMap(({ hostelId, tenantId, roomId, page }) => {
      if (!hostelId || !tenantId) return of({ loading: false, bills: [] as Invoice[], total: 0, totalPages: 1 });
      return this.api.invoices(hostelId, page, 10, {
        'f[bill_type]': 'rent',
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
  ]).pipe(
    filter(([tab]) => tab === 'utility'),
    switchMap(([, page]) =>
      this.route.paramMap.pipe(
        take(1),
        map((p) => ({
          hostelId: this.store.selected(),
          tenantId: p.get('tenantId') ?? '',
          roomId: this.state().tenant?.roomId ?? '',
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

  protected openEdit(): void {
    const tenant = this.state().tenant;
    const hostelId = this.store.selected();
    if (!tenant || !hostelId) return;
    this.router.navigate(['/host', hostelId, 'tenants', 'edit', tenant.id]);
  }

  protected ordinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
  }
}
