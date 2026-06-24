import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  Skeleton,
  StatusPill,
} from '@hostelhive/ui';
import { HostOpsApi, HostPropertyStore } from '@services';
import { Tenant, Invoice, UtilityBill } from '@hostelhive/data-access';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { isNetworkError } from '@util/network-error';

type Tab = 'info' | 'rent' | 'utility';

interface ProfileState {
  loading: boolean;
  error: boolean;
  networkError: boolean;
  tenant: Tenant | null;
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
    EmptyState,
    ErrorState,
    Skeleton,
    StatusPill,
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

  private readonly invoices$ = this.api.invoices();
  protected readonly allInvoices = toSignal(this.invoices$, { initialValue: [] as Invoice[] });

  private readonly utilityBatch$ = this.api.utilityBatch();
  protected readonly allUtility = toSignal(this.utilityBatch$, { initialValue: [] as UtilityBill[] });

  protected readonly tenantInvoices = computed(() => {
    const tenant = this.state().tenant;
    if (!tenant) return [];
    return this.allInvoices().filter(
      (inv) => inv.tenantName.toLowerCase() === tenant.name.toLowerCase(),
    );
  });

  protected readonly tenantUtility = computed(() => {
    const tenant = this.state().tenant;
    if (!tenant) return [];
    return this.allUtility().filter((u) => u.roomId === tenant.roomId);
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

  protected invoiceStatusTone(status: string): 'ok' | 'warn' | 'danger' | 'neutral' {
    if (status === 'paid') return 'ok';
    if (status === 'overdue') return 'danger';
    return 'warn';
  }

  protected invoiceStatusLabel(status: string): string {
    if (status === 'paid') return 'Paid';
    if (status === 'overdue') return 'Overdue';
    return 'Unpaid';
  }

  protected ordinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
  }
}
