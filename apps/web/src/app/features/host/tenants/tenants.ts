import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  EMPTY,
  Subject,
  catchError,
  debounceTime,
  filter,
  fromEvent,
  map,
  of,
  startWith,
  switchMap,
  take,
} from 'rxjs';
import { NavigationEnd, NavigationStart } from '@angular/router';
import {
  Button,
  Card,
  ContextMenu,
  ContextMenuDivider,
  DataTable,
  DatePicker,
  Dropdown,
  DropdownOption,
  EmptyState,
  ErrorState,
  FilterChips,
  Input,
  PaginationConfig,
  Search,
  Skeleton,
  Toggle,
} from '@hostelhive/ui';

import { HostOpsApi, HostPropertyStore, ImageUploadService, ImageUploadKey } from '@services';
import { ApiError, Tenant } from '@hostelhive/data-access';
import { NotificationService } from '@core/notification.service';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { SubscriptionGate } from '@layout/components/subscription-gate/subscription-gate';
import { isSubscriptionError } from '@util/subscription-error';
import { isNetworkError } from '@util/network-error';
import { PAGE_SIZE } from '@util/pagination';
import { BILLING_DAY_OPTIONS, normalizeBillingDay } from '@util/billing-day';
import { TENANTS_TABLE_COLS } from '@app/util/table-configs/tenants-table-cols';

interface ViewState {
  loading: boolean;
  error: boolean;
  subscriptionError: boolean;
  networkError: boolean;
  data: Tenant[] | null;
  total: number;
  statuses?: { name: string; slug: string; count: number; dispositionId: number }[];
}

interface CheckInForm {
  id?: string;
  fullName: string;
  email: string;
  phone: string;
  emergencyContact: string;
  cnicNumber: string;
  address: string;
  roomId: string;
  roomNumber: string;
  joiningDate: string;
  leaveDate: string;
  rent: string;
  advanceDeposit: string;
  messCharges: string;
  messBreakfast: boolean;
  messLunch: boolean;
  messDinner: boolean;
  transportationCharges: string;
  billingDate: string;
  billingDueDate: string;
  imageName: string;
  imagePreview: string;
  avatarUploadId: string;
  cnicFrontName: string;
  cnicFrontPreview: string;
  cnicFrontUploadId: string;
  cnicBackName: string;
  cnicBackPreview: string;
  cnicBackUploadId: string;
}

interface RoomOption {
  id: string;
  number: string;
  label: string;
  isFull: boolean;
}

const TONES = ['sky', 'cream', 'mint'] as const;

@Component({
  selector: 'hh-tenants',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DashboardLayout,
    SubscriptionGate,
    Button,
    Card,
    DataTable,
    DatePicker,
    Dropdown,
    FilterChips,
    Input,
    ContextMenu,
    ContextMenuDivider,
    Skeleton,
    Search,
    EmptyState,
    ErrorState,
    Toggle,
  ],
  templateUrl: './tenants.html',
})
export class Tenants {
  private readonly api = inject(HostOpsApi);
  private readonly store = inject(HostPropertyStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly refresh = signal(0);
  private readonly local = signal<Tenant[] | null>(null);

  protected readonly search = signal('');
  protected readonly statusFilter = signal(
    this.route.snapshot.queryParams['status'] ?? 'all',
  );
  protected readonly statuses = signal<{ name: string; slug: string; count: number; dispositionId: number }[]>([]);
  protected readonly tabs = computed(() => [
    { label: 'All', value: 'all' },
    ...this.statuses().map((s) => ({ label: s.name, value: s.slug })),
  ]);
  protected readonly page = signal(1);
  protected readonly form = signal<CheckInForm | null>(null);
  protected readonly menuOpenId = signal<string | null>(null);
  protected readonly menuPos = signal<{ top: number; right: number } | null>(null);
  private readonly deletedIds = signal(new Set<string>());
  protected readonly photoMenuOpen = signal(false);
  protected readonly cameraOpen = signal(false);
  protected readonly avatarUploading = signal(false);
  protected readonly avatarUploadError = signal<string | null>(null);
  protected readonly cnicFrontUploading = signal(false);
  protected readonly cnicBackUploading = signal(false);
  protected readonly cnicFrontUploadError = signal<string | null>(null);
  protected readonly cnicBackUploadError = signal<string | null>(null);
  private readonly imageUpload = inject(ImageUploadService);
  private readonly notifications = inject(NotificationService);
  protected readonly saving = signal(false);
  protected readonly formLoading = signal(false);
  private readonly cameraVideoEl = viewChild<ElementRef<HTMLVideoElement>>('cameraVideo');
  private activeStream: MediaStream | null = null;

  // Room selector state
  protected readonly roomQuery = signal('');
  protected readonly roomOptions = signal<RoomOption[]>([]);
  protected readonly roomLoading = signal(false);
  protected readonly roomHasMore = signal(false);
  private roomCurrentPage = 1;
  private readonly roomLoad$ = new Subject<{ query: string; page: number; append: boolean }>();
  private readonly hostelId$ = toObservable(this.store.selected);

  /** Maps internal RoomOption list → DropdownOption[], seeding the current room so the
   *  trigger always shows a label even while the full list is still loading. */
  protected readonly roomDropdownOptions = computed<DropdownOption[]>(() => {
    const loaded = this.roomOptions().map(r => ({
      value: r.id,
      label: r.label,
      disabled: r.isFull,
      badge: r.isFull ? 'Full' : undefined,
      disabledTooltip: r.isFull ? 'Room is fully occupied' : undefined,
    }));
    const f = this.form();
    if (f?.roomId && f.roomNumber && !loaded.find(o => o.value === f.roomId)) {
      return [{ value: f.roomId, label: f.roomNumber }, ...loaded];
    }
    return loaded;
  });

  private readonly fetchKey = computed(() => ({
    hostelId: this.store.selected(),
    page: this.page(),
    search: this.search(),
    statusFilter: this.statusFilter(),
    refresh: this.refresh(),
  }));

  private readonly fetched = toSignal(
    toObservable(this.fetchKey).pipe(
      switchMap(({ hostelId, page, search, statusFilter }) => {
        if (!hostelId)
          return of<ViewState>({ loading: false, error: false, subscriptionError: false, networkError: false, data: null, total: 0 });
        const filters: Record<string, string> = {};
        if (search.trim()) filters['q'] = search.trim();
        if (statusFilter !== 'all') filters['f[status.slug]'] = statusFilter;
        return this.api.renters(hostelId, page, PAGE_SIZE, filters).pipe(
          map((res): ViewState => ({
            loading: false, error: false, subscriptionError: false, networkError: false,
            data: res.renters, total: res.total,
            statuses: res.statuses,
          })),
          startWith<ViewState>({ loading: true, error: false, subscriptionError: false, networkError: false, data: null, total: 0 }),
          catchError((err) => {
            const sub = isSubscriptionError(err);
            const net = isNetworkError(err);
            return of<ViewState>({ loading: false, error: !sub, subscriptionError: sub, networkError: net, data: null, total: 0 });
          }),
        );
      }),
    ),
    { initialValue: { loading: true, error: false, subscriptionError: false, networkError: false, data: null, total: 0 } as ViewState },
  );

  private readonly _persistStatuses = effect(() => {
    const s = this.fetched().statuses;
    if (s?.length) this.statuses.set(s);
  });

  protected readonly state = computed<ViewState>(() => {
    const base = this.fetched();
    const overlay = this.local();
    return overlay && !base.loading && !base.error
      ? { ...base, data: overlay }
      : base;
  });

  protected readonly filtered = computed<Tenant[]>(() => {
    const data = this.state().data ?? [];
    const deleted = this.deletedIds();
    return deleted.size ? data.filter((t) => !deleted.has(t.id)) : data;
  });


  protected readonly isValid = computed(() => {
    const f = this.form();
    if (!f) return false;
    return !!(
      f.fullName.trim() &&
      f.email.trim() &&
      f.phone.trim() &&
      f.emergencyContact.trim() &&
      f.cnicNumber.trim() &&
      f.address.trim() &&
      f.joiningDate.trim() &&
      f.rent.trim() &&
      f.advanceDeposit.trim() &&
      f.billingDate.trim() &&
      f.billingDueDate.trim()
    );
  });

  protected readonly dirtyFields = signal<Set<keyof CheckInForm>>(new Set());
  protected readonly submitAttempted = signal(false);

  protected markDirty(key: keyof CheckInForm): void {
    this.dirtyFields.update(s => new Set([...s, key]));
  }

  protected fieldError(key: keyof CheckInForm): string {
    const f = this.form();
    if (!f) return '';
    if (!this.dirtyFields().has(key) && !this.submitAttempted()) return '';
    return (f[key] as string).trim() ? '' : 'This field is required';
  }

  private resetValidation(): void {
    this.dirtyFields.set(new Set());
    this.submitAttempted.set(false);
  }

  protected readonly totalPages = computed(() => {
    const total = this.state().total;
    return total > 0 ? Math.ceil(total / PAGE_SIZE) : null;
  });

  protected readonly hasNextPage = computed(() => {
    const pages = this.totalPages();
    if (pages !== null) return this.page() < pages;
    return (this.state().data?.length ?? 0) >= PAGE_SIZE;
  });

  constructor() {
    fromEvent(window, 'scroll', { capture: true, passive: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.closeMenu());

    // Close panel immediately when navigating away
    this.router.events.pipe(
      filter(e => e instanceof NavigationStart),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => this.closeFormState());

    // Drive the form drawer from the URL
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      startWith(null),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => this.syncFromRoute());

    // Room search subscription — waits for hostelId to be available before calling API
    this.roomLoad$.pipe(
      debounceTime(200),
      switchMap(payload =>
        this.hostelId$.pipe(
          filter((id): id is string => !!id),
          take(1),
          map(hostelId => ({ ...payload, hostelId })),
        ),
      ),
      switchMap(({ query, page, append, hostelId }) => {
        this.roomLoading.set(true);
        const filters: Record<string, string> = {};
        if (query.trim()) filters['f[room_number]'] = query.trim();
        return this.api.rooms(hostelId, page, PAGE_SIZE, filters).pipe(
          map(res => ({ res, append })),
          catchError(() => {
            this.roomLoading.set(false);
            return EMPTY;
          }),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(({ res, append }) => {
      const options = res.rooms.map(r => ({
        id: r.id,
        number: r.number,
        label: `${r.number} · ${r.type}`,
        isFull: r.capacity > 0 && r.occupied >= r.capacity,
      }));
      if (append) {
        this.roomOptions.update(prev => [...prev, ...options]);
      } else {
        this.roomOptions.set(options);
      }
      this.roomHasMore.set(res.rooms.length >= PAGE_SIZE);
      this.roomLoading.set(false);

      // When form has a pre-selected roomId but no roomNumber yet, fill it in
      const f = this.form();
      if (f?.roomId && !f.roomNumber) {
        const match = res.rooms.find(r => r.id === f.roomId);
        if (match) {
          this.form.update(form => form ? { ...form, roomNumber: match.number } : form);
        }
      }
    });

  }

  // ── Room dropdown handlers (used by hh-dropdown) ─────────────────────────

  protected onRoomOpened(): void {
    if (this.roomOptions().length === 0 && !this.roomLoading()) {
      this.roomCurrentPage = 1;
      this.roomLoad$.next({ query: this.roomQuery(), page: 1, append: false });
    }
  }

  protected onRoomSearch(query: string): void {
    this.roomQuery.set(query);
    this.roomCurrentPage = 1;
    this.roomLoad$.next({ query, page: 1, append: false });
  }

  protected onLoadMoreRooms(): void {
    this.roomCurrentPage++;
    this.roomLoad$.next({ query: this.roomQuery(), page: this.roomCurrentPage, append: true });
  }

  protected onRoomValueChange(value: string | string[] | null): void {
    if (typeof value !== 'string') return;
    const room = this.roomOptions().find(r => r.id === value);
    this.form.update(f => f ? { ...f, roomId: value, roomNumber: room?.number ?? f.roomNumber } : f);
  }

  protected clearRoom(): void {
    this.form.update(f => f ? { ...f, roomId: '', roomNumber: '' } : f);
  }

  // ── Billing day dropdowns ─────────────────────────────────────────────────

  protected readonly billingDayOptions = BILLING_DAY_OPTIONS;

  protected setBillingDay(
    key: 'billingDate' | 'billingDueDate',
    value: string | string[] | null,
  ): void {
    if (typeof value !== 'string') return;
    this.patch(key, value);
    this.markDirty(key);
  }

  // ── Tenant list methods ───────────────────────────────────────────────────

  protected toneFor(index: number): (typeof TONES)[number] {
    return TONES[index % TONES.length];
  }

  protected readonly tableCols = TENANTS_TABLE_COLS;
  protected readonly tenantsRowId = (row: unknown) => (row as Tenant).id;

  protected readonly paginationConf = computed<PaginationConfig | null>(() => {
    const total = this.state().total;
    const pages = this.totalPages();
    if (!pages || pages <= 1) return null;
    return {
      page: this.page(),
      total,
      totalPages: pages,
      hasNextPage: this.hasNextPage(),
      itemLabel: 'tenant',
    };
  });

  protected readonly menuActionActive = (row: unknown) =>
    this.menuOpenId() === (row as Tenant).id;

  private readonly inactiveDispositionId = computed(() =>
    this.statuses().find((s) => s.slug === 'inactive')?.dispositionId ?? 0,
  );
  private readonly activeDispositionId = computed(() =>
    this.statuses().find((s) => s.slug === 'active')?.dispositionId ?? 0,
  );

  protected setInactive(t: Tenant): void {
    this.closeMenu();
    const hostelId = this.store.selected();
    const dispositionId = this.inactiveDispositionId();
    if (!hostelId || !dispositionId) return;
    this.api.patchRenter(hostelId, t.id, { disposition_id: dispositionId })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.refresh.update((n) => n + 1) });
  }

  protected setActive(t: Tenant): void {
    this.closeMenu();
    const hostelId = this.store.selected();
    const dispositionId = this.activeDispositionId();
    if (!hostelId || !dispositionId) return;
    this.api.patchRenter(hostelId, t.id, { disposition_id: dispositionId })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.refresh.update((n) => n + 1) });
  }

  protected onTenantAction(ev: { row: unknown; event: MouseEvent }): void {
    this.toggleMenu((ev.row as Tenant).id, ev.event);
  }

  // ── Route-driven form drawer ──────────────────────────────────────────────

  protected openCheckIn(preselectedRoomId?: string): void {
    const hostelId = this.store.selected();
    if (!hostelId) return;
    const extras = preselectedRoomId ? { queryParams: { roomId: preselectedRoomId } } : {};
    this.router.navigate(['/host', hostelId, 'tenants', 'create'], extras);
  }

  protected openEdit(t: Tenant): void {
    const hostelId = this.store.selected();
    if (!hostelId) return;
    this.router.navigate(['/host', hostelId, 'tenants', 'edit', t.id]);
  }

  private openCheckInInternal(preselectedRoomId?: string): void {
    this.resetValidation();
    this.roomOptions.set([]);
    this.roomQuery.set('');
    this.roomCurrentPage = 1;
    this.roomLoad$.next({ query: '', page: 1, append: false });
    this.avatarUploading.set(false);
    this.avatarUploadError.set(null);
    this.cnicFrontUploading.set(false);
    this.cnicBackUploading.set(false);
    this.cnicFrontUploadError.set(null);
    this.cnicBackUploadError.set(null);
    this.form.set({
      fullName: '', email: '', phone: '', emergencyContact: '',
      cnicNumber: '', address: '', roomId: preselectedRoomId ?? '', roomNumber: '',
      joiningDate: new Date().toISOString().slice(0, 10), leaveDate: '',
      rent: '', advanceDeposit: '', messCharges: '',
      messBreakfast: false, messLunch: false, messDinner: false,
      transportationCharges: '',
      billingDate: '1', billingDueDate: '5',
      imageName: '', imagePreview: '', avatarUploadId: '',
      cnicFrontName: '', cnicFrontPreview: '', cnicFrontUploadId: '',
      cnicBackName: '', cnicBackPreview: '', cnicBackUploadId: '',
    });
  }

  private openEditByIdInternal(tenantId: string): void {
    const hostelId = this.store.selected();
    if (!hostelId) return;
    this.resetValidation();
    this.saving.set(false);
    this.formLoading.set(true);
    this.avatarUploading.set(false);
    this.avatarUploadError.set(null);
    this.cnicFrontUploading.set(false);
    this.cnicBackUploading.set(false);
    this.cnicFrontUploadError.set(null);
    this.cnicBackUploadError.set(null);
    this.roomOptions.set([]);
    this.roomQuery.set('');
    this.roomCurrentPage = 1;
    this.form.set({
      id: tenantId,
      fullName: '', email: '', phone: '', emergencyContact: '',
      cnicNumber: '', address: '', roomId: '', roomNumber: '',
      joiningDate: '', leaveDate: '', rent: '', advanceDeposit: '',
      messCharges: '', messBreakfast: true, messLunch: true, messDinner: true,
      transportationCharges: '', billingDate: '', billingDueDate: '',
      imageName: '', imagePreview: '', avatarUploadId: '',
      cnicFrontName: '', cnicFrontPreview: '', cnicFrontUploadId: '',
      cnicBackName: '', cnicBackPreview: '', cnicBackUploadId: '',
    });
    this.api.getRenter(hostelId, tenantId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tenant) => {
          this.fillFormFromTenant(tenant);
          this.formLoading.set(false);
          this.roomLoad$.next({ query: '', page: 1, append: false });
        },
        error: () => {
          this.formLoading.set(false);
          this.form.set(null);
          this.router.navigate(['.'], { relativeTo: this.route });
        },
      });
  }

  private closeFormState(): void {
    this.resetValidation();
    this.saving.set(false);
    this.formLoading.set(false);
    this.stopCamera();
    this.photoMenuOpen.set(false);
    this.form.set(null);
  }

  private fillFormFromTenant(t: Tenant): void {
    this.form.set({
      id: t.id,
      fullName: t.name,
      email: t.email ?? '',
      phone: t.phone,
      emergencyContact: t.emergencyContact ?? '',
      cnicNumber: t.cnic ?? '',
      address: t.address ?? '',
      roomId: t.roomId ?? '',
      roomNumber: t.roomNumber,
      joiningDate: t.joined,
      leaveDate: t.leaveDate ?? '',
      rent: String(t.rent),
      advanceDeposit: String(t.deposit),
      messCharges: t.messCharges != null ? String(t.messCharges) : '',
      messBreakfast: t.messBreakfast,
      messLunch: t.messLunch,
      messDinner: t.messDinner,
      transportationCharges:
        t.transportationCharges != null ? String(t.transportationCharges) : '',
      billingDate: normalizeBillingDay(t.billingDate),
      billingDueDate: normalizeBillingDay(t.billingDueDate),
      imageName: t.avatarUrl || t.avatarId ? 'Photo on file' : '',
      imagePreview: t.avatarUrl ?? '',
      avatarUploadId: t.avatarId ?? '',
      cnicFrontName: t.cnicFrontUrl || t.cnicFrontId ? 'Photo on file' : '',
      cnicFrontPreview: t.cnicFrontUrl ?? '',
      cnicFrontUploadId: t.cnicFrontId ?? '',
      cnicBackName: t.cnicBackUrl || t.cnicBackId ? 'Photo on file' : '',
      cnicBackPreview: t.cnicBackUrl ?? '',
      cnicBackUploadId: t.cnicBackId ?? '',
    });
  }

  protected onImageCapture(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.photoMenuOpen.set(false);
    if (!file) return;
    this.form.update((f) =>
      f ? { ...f, imageName: file.name, imagePreview: URL.createObjectURL(file), avatarUploadId: '' } : f,
    );
    this.uploadAvatar(file);
  }

  protected async openCamera(): Promise<void> {
    this.photoMenuOpen.set(false);
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      this.activeStream = stream;
      this.cameraOpen.set(true);
      // Defer srcObject assignment until the <video> element is in the DOM
      setTimeout(() => {
        const el = this.cameraVideoEl()?.nativeElement;
        if (el) {
          el.srcObject = stream;
          void el.play();
        }
      });
    } catch {
      // Permission denied or no camera — silently ignore
    }
  }

  protected capturePhoto(): void {
    const el = this.cameraVideoEl()?.nativeElement;
    if (!el?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = el.videoWidth;
    canvas.height = el.videoHeight;
    canvas.getContext('2d')?.drawImage(el, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      this.form.update((f) => (f ? { ...f, imageName: 'photo.jpg', imagePreview: url, avatarUploadId: '' } : f));
      this.stopCamera();
      this.uploadAvatar(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  }

  protected stopCamera(): void {
    this.activeStream?.getTracks().forEach((t) => t.stop());
    this.activeStream = null;
    this.cameraOpen.set(false);
  }

  private uploadAvatar(file: File): void {
    this.avatarUploading.set(true);
    this.avatarUploadError.set(null);
    this.imageUpload
      .upload('avatar', file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ id }) => {
          this.avatarUploading.set(false);
          this.form.update((f) => (f ? { ...f, avatarUploadId: id } : f));
        },
        error: () => {
          this.avatarUploading.set(false);
          this.avatarUploadError.set('Photo upload failed. Please try again.');
        },
      });
  }

  protected close(): void {
    this.closeFormState();
    const hostelId = this.store.selected();
    if (hostelId) this.router.navigate(['/host', hostelId, 'tenants']);
  }

  protected patch(key: keyof CheckInForm, value: string): void {
    this.form.update((f) => (f ? { ...f, [key]: value } : f));
  }

  protected patchBool(key: keyof CheckInForm, value: boolean): void {
    this.form.update((f) => (f ? { ...f, [key]: value } : f));
  }

  protected patchFile(key: 'image' | 'cnicFront' | 'cnicBack', event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    if (key === 'image') {
      this.form.update((f) => (f ? { ...f, imageName: file.name, imagePreview: preview } : f));
    } else {
      const nameKey: keyof CheckInForm = key === 'cnicFront' ? 'cnicFrontName' : 'cnicBackName';
      const previewKey: keyof CheckInForm =
        key === 'cnicFront' ? 'cnicFrontPreview' : 'cnicBackPreview';
      const idKey: keyof CheckInForm =
        key === 'cnicFront' ? 'cnicFrontUploadId' : 'cnicBackUploadId';
      this.form.update((f) =>
        f ? { ...f, [nameKey]: file.name, [previewKey]: preview, [idKey]: '' } : f,
      );
      const uploadKey: ImageUploadKey = key === 'cnicFront' ? 'cnic_front' : 'cnic_back';
      this.uploadCnicDoc(uploadKey, file, key === 'cnicFront' ? 'front' : 'back');
    }
  }

  private uploadCnicDoc(key: ImageUploadKey, file: File, side: 'front' | 'back'): void {
    const uploadingSignal = side === 'front' ? this.cnicFrontUploading : this.cnicBackUploading;
    const errorSignal = side === 'front' ? this.cnicFrontUploadError : this.cnicBackUploadError;
    const idKey: keyof CheckInForm = side === 'front' ? 'cnicFrontUploadId' : 'cnicBackUploadId';

    uploadingSignal.set(true);
    errorSignal.set(null);
    this.imageUpload
      .upload(key, file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ id }) => {
          uploadingSignal.set(false);
          this.form.update((f) => (f ? { ...f, [idKey]: id } : f));
        },
        error: () => {
          uploadingSignal.set(false);
          errorSignal.set('Upload failed. Please try again.');
        },
      });
  }

  protected save(): void {
    if (!this.isValid()) {
      this.submitAttempted.set(true);
      return;
    }
    const f = this.form();
    if (!f) return;

    const initials = f.fullName
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    if (f.id) {
      const hostelId = this.store.selected();
      if (!hostelId) return;

      this.saving.set(true);
  
      this.api
        .updateRenter(hostelId, f.id, {
          full_name: f.fullName.trim(),
          email: f.email.trim(),
          phone: f.phone.trim(),
          emergency_contact: f.emergencyContact.trim(),
          room_id: f.roomId || null,
          mess_charges: f.messCharges.trim() ? Number(f.messCharges) : null,
          breakfast_enabled: f.messBreakfast,
          lunch_enabled: f.messLunch,
          dinner_enabled: f.messDinner,
          transportation_charges: f.transportationCharges.trim()
            ? Number(f.transportationCharges)
            : null,
          advance_deposit: Number(f.advanceDeposit),
          joining_date: f.joiningDate,
          leave_date: f.leaveDate || undefined,
          rent: f.rent.trim(),
          address: f.address.trim(),
          billing_due_date: Number(f.billingDueDate),
          billing_date: Number(f.billingDate),
          cnic_number: f.cnicNumber.trim() || undefined,
          avatar_id: f.avatarUploadId || undefined,
          cnic_front_id: f.cnicFrontUploadId || undefined,
          cnic_back_id: f.cnicBackUploadId || undefined,
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.saving.set(false);
            this.notifications.success('Changes saved', `${f.fullName.trim()} has been updated.`);
            this.local.set(null);
            this.refresh.update((n) => n + 1);
            this.close();
          },
          error: (err) => {
            this.saving.set(false);
            const msg = (err as ApiError).message ?? 'Failed to update. Please try again.';
            this.notifications.error('Couldn\'t save tenant', msg);
          },
        });
      return;
    }

    const hostelId = this.store.selected();
    if (!hostelId) return;

    this.saving.set(true);

    this.api
      .createRenter(hostelId, {
        full_name: f.fullName.trim(),
        email: f.email.trim(),
        phone: f.phone.trim(),
        emergency_contact: f.emergencyContact.trim(),
        room_id: f.roomId || undefined,
        mess_charges: f.messCharges.trim() ? Number(f.messCharges) : undefined,
        breakfast_enabled: f.messBreakfast,
        lunch_enabled: f.messLunch,
        dinner_enabled: f.messDinner,
        transportation_charges: f.transportationCharges.trim()
          ? Number(f.transportationCharges)
          : undefined,
        advance_deposit: Number(f.advanceDeposit),
        joining_date: f.joiningDate,
        leave_date: f.leaveDate || undefined,
        rent: f.rent.trim(),
        address: f.address.trim(),
        billing_due_date: Number(f.billingDueDate),
        billing_date: Number(f.billingDate),
        cnic_number: f.cnicNumber.trim() || undefined,
        avatar_id: f.avatarUploadId || undefined,
        cnic_front_id: f.cnicFrontUploadId || undefined,
        cnic_back_id: f.cnicBackUploadId || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.notifications.success('Tenant checked in', `${f.fullName.trim()} has been added.`);
          this.local.set(null);
          this.refresh.update((n) => n + 1);
          this.close();
        },
        error: (err) => {
          this.saving.set(false);
          const msg = (err as ApiError).message ?? 'Failed to check in. Please try again.';
          this.notifications.error('Couldn\'t check in tenant', msg);
        },
      });
  }

  protected toggleMenu(id: string, event: Event): void {
    event.stopPropagation();
    if (this.menuOpenId() === id) {
      this.menuOpenId.set(null);
      this.menuPos.set(null);
    } else {
      this.menuOpenId.set(id);
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      this.menuPos.set({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
  }

  protected closeMenu(): void {
    this.menuOpenId.set(null);
    this.menuPos.set(null);
  }

  protected checkOut(t: Tenant): void {
    this.closeMenu();
    const current = this.state().data ?? [];
    this.local.set(
      current.map((x) =>
        x.id === t.id
          ? { ...x, status: 'checked-out', checkedOut: new Date().toISOString().slice(0, 10) }
          : x,
      ),
    );
  }

  protected goToProfile(t: Tenant): void {
    this.closeMenu();
    this.router.navigate(['/host', this.store.selected(), 'tenants', 'profile', t.id]);
  }

  private syncFromRoute(): void {
    const snapshot = this.route.snapshot;
    const seg = snapshot.url[0]?.path;

    if (seg === 'create') {
      if (!this.form() || this.form()?.id) {
        const roomId = snapshot.queryParamMap.get('roomId') ?? undefined;
        this.openCheckInInternal(roomId);
      }
    } else if (seg === 'edit') {
      const tenantId = snapshot.paramMap.get('tenantId')!;
      if (this.form()?.id !== tenantId) {
        this.openEditByIdInternal(tenantId);
      }
    } else {
      if (this.form()) this.closeFormState();
    }
  }

  protected setSearch(v: string): void {
    this.search.set(v);
    this.page.set(1);
    this.local.set(null);
  }

  protected setFilter(f: string): void {
    if (f === this.statusFilter()) return;
    this.statusFilter.set(f);
    this.page.set(1);
    this.local.set(null);
    void this.router.navigate([], {
      queryParams: { status: f === 'all' ? null : f },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected goToPage(n: number): void {
    this.local.set(null);
    this.page.set(n);
  }

  protected retry(): void {
    this.local.set(null);
    this.page.set(1);
    this.refresh.update((n) => n + 1);
  }
}
