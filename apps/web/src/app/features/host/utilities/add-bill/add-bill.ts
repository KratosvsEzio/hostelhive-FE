import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, combineLatest, filter, map, of, startWith, switchMap, take } from 'rxjs';
import {
  Avatar,
  Button,
  DatePicker,
  Dropdown,
  DropdownOption,
  EmptyState,
  ErrorState,
  Skeleton,
} from '@hostelhive/ui';
import { HostOpsApi, HostPropertyStore } from '@services';
import {
  HostRoom as Room,
  Tenant,
  UtilityBill,
  UtilityType,
  UtilityTypeMeta,
} from '@hostelhive/data-access';
import { MoneyInput } from '@app/shared/money-input/money-input';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { SubscriptionGate } from '@layout/components/subscription-gate/subscription-gate';
import { isSubscriptionError } from '@util/subscription-error';
import { isNetworkError } from '@util/network-error';
import { splitByDays, SplitRow } from '../split';
import { localToday } from '@util/api-date';

interface ViewState {
  loading: boolean;
  error: boolean;
  subscriptionError: boolean;
  networkError: boolean;
  rooms: Room[] | null;
  tenants: Tenant[] | null;
  types: UtilityTypeMeta[] | null;
}

const TONES = ['sky', 'cream', 'mint', 'brand'] as const;

@Component({
  selector: 'hh-add-bill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    DashboardLayout,
    SubscriptionGate,
    Avatar,
    Button,
    DatePicker,
    Dropdown,
    Skeleton,
    EmptyState,
    ErrorState,
    MoneyInput,
  ],
  templateUrl: './add-bill.html',
})
export class AddBill {
  private readonly api = inject(HostOpsApi);
  private readonly store = inject(HostPropertyStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly refresh = signal(0);

  protected readonly type = signal<UtilityType>('electricity');
  protected readonly roomId = signal('');
  protected readonly totalInput = signal('');
  protected readonly unitsInput = signal('');
  protected readonly prevReadingInput = signal('');
  protected readonly currReadingInput = signal('');
  protected readonly rateInput = signal('');
  private readonly overrides = signal<Record<string, number>>({});
  private readonly daysOverrides = signal<Record<string, number>>({});
  private readonly daysErrors = signal<Record<string, boolean>>({});
  protected readonly dueDateInput = signal<string | null>((() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    return localToday(d);
  })());
  protected readonly submitting = signal(false);
  protected readonly submitError = signal(false);

  protected readonly billId = signal<string | null>(null);
  protected readonly isEdit = computed(() => !!this.billId());
  private readonly splitIds = signal<string[]>([]);
  protected readonly editLoading = signal(false);
  protected readonly editError = signal(false);

  protected readonly monthOptions: DropdownOption[] = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
    return {
      value: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    };
  });
  protected readonly selectedMonthValue = signal(
    `${new Date().getFullYear()}-${new Date().getMonth()}`,
  );

  private readonly fetched = toSignal(
    toObservable(this.refresh).pipe(
      switchMap(() => {
        const hostelId = this.store.selected();
        if (!hostelId) {
          return of<ViewState>({
            loading: false,
            error: false,
            subscriptionError: false,
            networkError: false,
            rooms: [],
            tenants: [],
            types: [],
          });
        }
        return combineLatest([
          this.api.rooms(hostelId).pipe(map((res) => res.rooms)),
          this.api.renters(hostelId).pipe(map((res) => res.renters)),
          this.api.utilityBillFormOptions(hostelId),
        ]).pipe(
          map(([rooms, tenants, types]): ViewState => ({
            loading: false,
            error: false,
            subscriptionError: false,
            networkError: false,
            rooms,
            tenants,
            types,
          })),
          startWith<ViewState>({
            loading: true,
            error: false,
            subscriptionError: false,
            networkError: false,
            rooms: null,
            tenants: null,
            types: null,
          }),
          catchError((err) => {
            const sub = isSubscriptionError(err);
            const net = isNetworkError(err);
            return of<ViewState>({
              loading: false,
              error: !sub,
              subscriptionError: sub,
              networkError: net,
              rooms: null,
              tenants: null,
              types: null,
            });
          }),
        );
      }),
    ),
    {
      initialValue: {
        loading: true,
        error: false,
        subscriptionError: false,
        networkError: false,
        rooms: null,
        tenants: null,
        types: null,
      } as ViewState,
    },
  );

  protected readonly state = this.fetched;

  protected readonly meta = computed<UtilityTypeMeta>(() =>
    this.api.utilityMeta(this.type()),
  );
  protected readonly splitLabel = computed(() =>
    this.meta().split === 'prorata'
      ? 'Pro-rata by occupancy days'
      : 'Split equally',
  );
  protected readonly isElectricity = computed(() => this.type() === 'electricity');
  protected readonly prevReadingNegError = computed(() =>
    this.isElectricity() && this.prevReadingInput() !== '' && Number(this.prevReadingInput()) < 0,
  );
  protected readonly currReadingNegError = computed(() =>
    this.isElectricity() && this.currReadingInput() !== '' && Number(this.currReadingInput()) < 0,
  );
  protected readonly rateNegError = computed(() =>
    this.isElectricity() && this.rateInput() !== '' && Number(this.rateInput()) < 0,
  );
  protected readonly readingError = computed(() => {
    if (!this.isElectricity() || this.currReadingInput() === '') return false;
    return (Number(this.currReadingInput()) || 0) < (Number(this.prevReadingInput()) || 0);
  });
  protected readonly dueDateMin = computed(() => {
    const { year, month } = this.selectedMonth();
    return `${year}-${String(month + 1).padStart(2, '0')}-01`;
  });
  protected readonly dueDateMax = computed(() => {
    const { year, month } = this.selectedMonth();
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(this.maxDaysInMonth()).padStart(2, '0')}`;
  });
  protected readonly dueDateError = computed(() => {
    const val = this.dueDateInput();
    if (!val) return false;
    return val < this.dueDateMin() || val > this.dueDateMax();
  });

  protected readonly selectedMonth = computed(() => {
    const [year, month] = this.selectedMonthValue().split('-').map(Number);
    return { year, month };
  });
  protected readonly maxDaysInMonth = computed(() => {
    const { year, month } = this.selectedMonth();
    return new Date(year, month + 1, 0).getDate();
  });
  protected readonly monthLabel = computed(() => {
    const { year, month } = this.selectedMonth();
    return new Date(year, month, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  });

  protected readonly total = computed(() => {
    if (this.isElectricity()) {
      const consumed = Math.max(0, (Number(this.currReadingInput()) || 0) - (Number(this.prevReadingInput()) || 0));
      return consumed * (Number(this.rateInput()) || 0);
    }
    return Math.max(0, Number(this.totalInput().replace(/,/g, '')) || 0);
  });
  protected readonly units = computed(() => {
    if (this.isElectricity()) {
      return Math.max(0, (Number(this.currReadingInput()) || 0) - (Number(this.prevReadingInput()) || 0));
    }
    return Math.max(0, Number(this.unitsInput().replace(/,/g, '')) || 0);
  });
  protected readonly effectiveRate = computed(() =>
    this.units() > 0 ? this.total() / this.units() : null,
  );

  protected readonly currentRoom = computed<Room | undefined>(() =>
    (this.state().rooms ?? []).find((r) => r.id === this.roomId()),
  );

  protected readonly roomOptions = computed<DropdownOption[]>(() =>
    (this.state().rooms ?? []).map((r) => ({
      value: r.id,
      label: `Room ${r.number} · ${r.type} (${this.tenantsOf(r.id).length} tenants)`,
    })),
  );

  private effectiveDays(tenantId: string): number {
    const d = this.daysOverrides()[tenantId];
    return d !== undefined ? d : this.maxDaysInMonth();
  }

  protected tenantsOf(roomId: string): Tenant[] {
    return (this.state().tenants ?? []).filter(
      (t) => t.roomId === roomId && t.status === 'active',
    );
  }

  private readonly roomTenants = computed(() => this.tenantsOf(this.roomId()));

  protected readonly totalDays = computed(() =>
    this.roomTenants().reduce((n, t) => n + this.effectiveDays(t.id), 0),
  );

  protected readonly rows = computed<SplitRow[]>(() =>
    splitByDays(
      this.roomTenants().map((t) => ({
        tenantId: t.id,
        name: t.name,
        initials: t.initials,
        days: this.effectiveDays(t.id),
      })),
      this.total(),
      this.overrides(),
    ),
  );

  protected readonly allocated = computed(() =>
    this.rows().reduce((n, r) => n + r.share, 0),
  );
  protected readonly unallocated = computed(() => this.total() - this.allocated());
  protected readonly hasOverrides = computed(
    () => Object.keys(this.overrides()).length > 0,
  );

  protected toneFor(index: number): (typeof TONES)[number] {
    return TONES[index % TONES.length];
  }

  protected typeBtnClass(type: UtilityType): string {
    const base =
      'flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition';
    return type === this.type()
      ? `${base} bg-brand-500 text-white`
      : `${base} border border-ink-200 text-ink-700 hover:border-brand-300 hover:bg-brand-50`;
  }

  protected selectType(type: UtilityType): void {
    this.type.set(type);
    this.resetOverrides();
    if (!this.api.utilityMeta(type).metered) this.unitsInput.set('');
    if (type !== 'electricity') {
      this.prevReadingInput.set('');
      this.currReadingInput.set('');
      this.rateInput.set('');
    }
  }

  protected override(tenantId: string, value: string): void {
    const amount = Math.max(0, Math.round(Number(value) || 0));
    this.overrides.update((o) => ({ ...o, [tenantId]: amount }));
  }

  protected resetOverrides(): void {
    this.overrides.set({});
  }

  protected setDays(tenantId: string, value: string): void {
    const trimmed = value.trim();
    const isNegative = trimmed !== '' && trimmed.startsWith('-');
    this.daysErrors.update((e) => ({ ...e, [tenantId]: isNegative }));
    const raw = Math.round(Number(trimmed) || 0);
    const days = Math.min(Math.max(0, raw), this.maxDaysInMonth());
    this.daysOverrides.update((d) => ({ ...d, [tenantId]: days }));
  }

  protected daysError(tenantId: string): boolean {
    return !!(this.daysErrors()[tenantId]);
  }

  protected readonly hasDaysError = computed(() =>
    Object.values(this.daysErrors()).some(Boolean),
  );

  protected setMonth(v: string | string[] | null): void {
    if (typeof v === 'string' && v) {
      this.selectedMonthValue.set(v);
      this.daysErrors.set({});
    }
  }

  protected setRoom(v: string | string[] | null): void {
    if (typeof v === 'string' && v) {
      this.roomId.set(v);
      this.daysOverrides.set({});
      this.daysErrors.set({});
    }
  }

  constructor() {
    const bid = this.route.snapshot.paramMap.get('billId');
    if (bid) {
      this.billId.set(bid);
      toObservable(this.store.selected).pipe(
        filter((id): id is string => !!id),
        take(1),
        switchMap((hostelId) => {
          this.editLoading.set(true);
          return this.api.getUtilityBill(hostelId, bid).pipe(
            catchError(() => {
              this.editLoading.set(false);
              this.editError.set(true);
              return EMPTY;
            }),
          );
        }),
      ).subscribe((bill) => {
        this.seedEditForm(bill);
        this.editLoading.set(false);
      });
    }
  }

  private seedEditForm(bill: UtilityBill): void {
    this.type.set(bill.type);
    this.roomId.set(String(bill.roomId));
    this.totalInput.set(String(bill.total));
    if (bill.startReading !== null) this.prevReadingInput.set(String(bill.startReading));
    if (bill.endReading !== null) this.currReadingInput.set(String(bill.endReading));
    if (bill.rate > 0) this.rateInput.set(String(bill.rate));
    if (bill.units !== null) this.unitsInput.set(String(bill.units));
    if (bill.dueDate) this.dueDateInput.set(bill.dueDate.slice(0, 10));
    if (bill.issuedDate) {
      const [yearStr, monthStr] = bill.issuedDate.slice(0, 7).split('-');
      this.selectedMonthValue.set(`${yearStr}-${Number(monthStr) - 1}`);
    }
    // Store renter_bill IDs in order for the update payload
    this.splitIds.set((bill.splits ?? []).map((s) => s.id));
  }

  protected addToBatch(): void {
    const room = this.currentRoom();
    const hostelId = this.store.selected();
    if (!room || !hostelId || this.total() <= 0) return;

    this.submitting.set(true);
    this.submitError.set(false);

    if (this.isEdit()) {
      const ids = this.splitIds();
      const renterBills = ids
        .map((id, i) => ({ id, amount: this.rows()[i]?.share ?? 0 }))
        .filter((r): r is { id: string; amount: number } => !!r.id);
      this.api.updateUtilityBill(hostelId, this.billId()!, renterBills).subscribe({
        next: () => { this.back(); },
        error: () => { this.submitting.set(false); this.submitError.set(true); },
      });
      return;
    }

    const isElec = this.isElectricity();
    const { year, month } = this.selectedMonth();
    // Date-only, matching what the invoice form sends for these same fields. A full
    // toISOString() would convert the local day to UTC and land the bill a day early for
    // anyone east of UTC — 1 Sep in +05:00 serialises as 2026-08-31T19:00Z.
    const issuedDate = localToday(new Date(year, month, 1));
    const dueDateInput = this.dueDateInput();
    const dueDate = dueDateInput ?? localToday(new Date(year, month + 1, 0));
    const rate = isElec ? (Number(this.rateInput()) || 0) : 0;

    const body = {
      utility_type: this.type(),
      total_amount: this.total(),
      consumed_units: isElec ? this.units() : undefined,
      previous_units: isElec ? (Number(this.prevReadingInput()) || undefined) : undefined,
      current_units: isElec ? (Number(this.currReadingInput()) || undefined) : undefined,
      room_id: this.roomId() || undefined,
      issued_date: issuedDate,
      due_date: dueDate,
      cost_per_unit: rate || undefined,
      notes: '',
      renter_bills_attributes: this.rows().map((row) => ({
        renter_id: row.tenantId,
        room_id: this.roomId() || undefined,
        amount: row.share,
        bill_days: this.effectiveDays(row.tenantId),
        due_date: dueDate,
        issued_date: issuedDate,
        break_down: { [`${this.type()}_bill`]: row.share },
      })),
    };

    this.api.createUtilityBill(hostelId, body).subscribe({
      next: () => { this.back(); },
      error: () => { this.submitting.set(false); this.submitError.set(true); },
    });
  }

  protected back(): void {
    if (this.isEdit()) {
      const hostelId = this.store.selected();
      if (hostelId) { this.router.navigate(['/host', hostelId, 'utilities']); return; }
    }
    this.router.navigate(['..'], { relativeTo: this.route });
  }

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }
}
