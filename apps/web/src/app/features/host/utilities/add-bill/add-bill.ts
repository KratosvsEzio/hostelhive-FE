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
import { HostOpsApi, HostPropertyStore, followToday, selectedHostelToday } from '@services';
import { addDays, dayToLocalDate } from '@util/plain-day';
import {
  HostRoom as Room,
  Tenant,
  TenantBillSplit,
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
import { localDay } from '@util/api-date';
import { TranslocoPipe } from '@jsverse/transloco';

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

/** A new bill falls due this many days after the hostel's today. */
const DUE_IN_DAYS = 5;

/** The month dropdown's value for the month containing `d`: `yyyy-m`, month 0-indexed. */
const monthValue = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}`;

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
    TranslocoPipe,
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
  /** The hostel's date: the due-date default counts from it and the month list ends on its month. */
  protected readonly today = selectedHostelToday();
  protected readonly dueDateInput = signal<string | null>(addDays(this.today(), DUE_IN_DAYS));
  protected readonly submitting = signal(false);
  protected readonly submitError = signal(false);

  protected readonly billId = signal<string | null>(null);
  protected readonly isEdit = computed(() => !!this.billId());
  /** The bill being edited, as saved: its total and its renter bills. */
  private readonly stored = signal<{ total: number; splits: TenantBillSplit[] } | null>(null);
  protected readonly editLoading = signal(false);
  protected readonly editError = signal(false);

  protected readonly monthOptions = computed<DropdownOption[]>(() => {
    const t = dayToLocalDate(this.today());
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(t.getFullYear(), t.getMonth() - i, 1);
      return {
        value: monthValue(d),
        label: d.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      };
    });
  });
  protected readonly selectedMonthValue = signal(monthValue(dayToLocalDate(this.today())));

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

  /**
   * Who the bill is split across. A new bill goes to the room's active tenants; an edited one
   * stays with the renters it was issued to, because those are the renter bills the save
   * updates. A tenant who moved in since has no renter bill, and one who moved out still has.
   */
  private readonly participants = computed<{ id: string; name: string; initials: string }[]>(() => {
    const stored = this.stored();
    if (!stored) return this.tenantsOf(this.roomId());
    const tenants = this.state().tenants ?? [];
    return stored.splits.map((s) => ({
      id: s.tenantId,
      name: s.name,
      initials:
        tenants.find((t) => t.id === s.tenantId)?.initials ??
        (s.name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?'),
    }));
  });

  protected readonly totalDays = computed(() =>
    this.participants().reduce((n, t) => n + this.effectiveDays(t.id), 0),
  );

  protected readonly rows = computed<SplitRow[]>(() => {
    const rows = splitByDays(
      this.participants().map((t) => ({
        tenantId: t.id,
        name: t.name,
        initials: t.initials,
        days: this.effectiveDays(t.id),
      })),
      this.total(),
      this.overrides(),
    );
    // Until the host changes the total or someone's days, an edited bill shows the shares it
    // was saved with. Recomputing them could show, and then save, different amounts from the
    // ones the tenants were billed.
    const stored = this.stored();
    if (!stored || this.total() !== stored.total) return rows;
    const saved = new Map(stored.splits.map((s) => [s.tenantId, s]));
    const unchanged = rows.every((r) => {
      const s = saved.get(r.tenantId);
      return !!s && r.days === (s.days > 0 ? s.days : this.maxDaysInMonth());
    });
    return unchanged ? rows.map((r) => ({ ...r, share: saved.get(r.tenantId)!.amount })) : rows;
  });

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
    // The zone lands after the form was seeded from the device's date: move the untouched
    // defaults onto the hostel's. A bill being edited keeps its own month and due date.
    followToday(this.today, (from, to) => {
      if (this.isEdit()) return;
      if (this.dueDateInput() === addDays(from, DUE_IN_DAYS)) {
        this.dueDateInput.set(addDays(to, DUE_IN_DAYS));
      }
      if (this.selectedMonthValue() === monthValue(dayToLocalDate(from))) {
        this.selectedMonthValue.set(monthValue(dayToLocalDate(to)));
      }
    });

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
    const splits = (bill.splits ?? []).filter((s) => !!s.id && !!s.tenantId);
    this.daysOverrides.set(
      Object.fromEntries(splits.filter((s) => s.days > 0).map((s) => [s.tenantId, s.days])),
    );
    this.stored.set({ total: bill.total, splits });
  }

  protected addToBatch(): void {
    const room = this.currentRoom();
    const hostelId = this.store.selected();
    if (!room || !hostelId || this.total() <= 0) return;
    // Until the bill has loaded there is nothing to update, and falling through would create one.
    if (this.isEdit() && !this.stored()) return;

    this.submitting.set(true);
    this.submitError.set(false);

    const isElec = this.isElectricity();
    const { year, month } = this.selectedMonth();
    // Date-only, matching what the invoice form sends for these same fields. A full
    // toISOString() would convert the local day to UTC and land the bill a day early for
    // anyone east of UTC — 1 Sep in +05:00 serialises as 2026-08-31T19:00Z.
    const issuedDate = localDay(new Date(year, month, 1));
    const dueDateInput = this.dueDateInput();
    const dueDate = dueDateInput ?? localDay(new Date(year, month + 1, 0));
    const rate = isElec ? (Number(this.rateInput()) || 0) : 0;

    const figures = {
      total_amount: this.total(),
      consumed_units: isElec ? this.units() : undefined,
      previous_units: isElec ? (Number(this.prevReadingInput()) || undefined) : undefined,
      current_units: isElec ? (Number(this.currReadingInput()) || undefined) : undefined,
      issued_date: issuedDate,
      due_date: dueDate,
      cost_per_unit: rate || undefined,
    };

    const stored = this.stored();
    if (this.isEdit() && stored) {
      // Type and room are locked while editing, so they are not sent; the renter bills are
      // matched by renter, the same renters `participants` lists.
      const idOf = new Map(stored.splits.map((s) => [s.tenantId, s.id]));
      this.api
        .updateUtilityBill(hostelId, this.billId()!, {
          ...figures,
          renter_bills_attributes: this.rows().map((row) => ({
            id: idOf.get(row.tenantId)!,
            amount: row.share,
            bill_days: this.effectiveDays(row.tenantId),
            due_date: dueDate,
            issued_date: issuedDate,
            break_down: { [`${this.type()}_bill`]: row.share },
          })),
        })
        .subscribe({
          next: () => { this.back(); },
          error: () => { this.submitting.set(false); this.submitError.set(true); },
        });
      return;
    }

    const body = {
      ...figures,
      utility_type: this.type(),
      room_id: this.roomId() || undefined,
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
