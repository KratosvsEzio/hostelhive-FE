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
  untracked,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, debounceTime, filter, forkJoin, map, of, startWith, switchMap, take } from 'rxjs';
import {
  Button,
  DatePicker,
  Dropdown,
  DropdownOption,
  Input,
  Toggle,
} from '@hostelhive/ui';

import { MoneyInput } from '@app/shared/money-input/money-input';
import { PhotoPicker } from '@app/shared/photo-picker/photo-picker';
import { HostOpsApi, HostPropertyStore, ImageUploadKey, ImageUploadService, RoomRenter } from '@services';
import { Tenant } from '@hostelhive/data-access';
import { NotificationService } from '@core/notification.service';
import { PAGE_SIZE } from '@util/pagination';
import { BILLING_DAY_OPTIONS } from '@util/billing-day';
import {
  CheckInForm,
  RoomOption,
  checkInFormFromTenant,
  emptyCheckInForm,
  fieldErrorFor,
  isCheckInFormValid,
  RenterFormContext,
  pendingEditForm,
  toCreateRenterPayload,
  toUpdateRenterPayload,
} from './tenant-form.model';
import { HostBookingsApi } from '@features/host/bookings/host-bookings-api';
import { toRoomMonth } from '@features/host/rooms/room-calendar/room-stays';
import {
  AvailabilityVerdict,
  OPEN_ENDED_HORIZON_DAYS,
  assessAvailability,
  stayWindow,
} from '../room-availability';
import { TranslocoPipe } from '@jsverse/transloco';

/** The lookup's three states: idle, in flight, answered. */
interface AvailabilityState {
  loading: boolean;
  verdict: AvailabilityVerdict | null;
}

/**
 * Side drawer that checks a tenant in or edits an existing one.
 *
 * The drawer owns nothing but the form: it never navigates and never touches the host
 * page's data, reporting instead through {@link saved} and {@link closed} so the same
 * markup serves both the tenant list and the tenant profile.
 */
@Component({
  selector: 'hh-tenant-form-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PhotoPicker, Button, DatePicker, Dropdown, Input, Toggle, MoneyInput, TranslocoPipe],
  host: { class: 'contents' },
  templateUrl: './tenant-form-drawer.html',
})
export class TenantFormDrawer {
  /** Whether the drawer creates a new tenant or edits {@link tenantId}. */
  readonly mode = input.required<'create' | 'edit'>();

  /** Tenant to load and edit. Required in `edit` mode, ignored in `create` mode. */
  readonly tenantId = input<string | null>(null);

  /** Room to pre-select on a fresh check-in. Ignored in `edit` mode. */
  readonly initialRoomId = input<string | null>(null);

  /** Emits the persisted tenant once a create or update succeeds. */
  readonly saved = output<Tenant>();

  /** Emits when the drawer wants to go away — cancelled, dismissed, or failed to load. */
  readonly closed = output<void>();

  private readonly api = inject(HostOpsApi);
  private readonly bookingsApi = inject(HostBookingsApi);
  private readonly store = inject(HostPropertyStore);
  private readonly imageUpload = inject(ImageUploadService);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Everything about this form that depends on how the hostel bills reads one signal:
   * {@link monthlyBilling}. The billing day is collected only where a monthly cycle exists,
   * and the two dates are named for what they mean under it.
   *
   * It was `accommodationType === 'backpacker'`, which answers a different question. The two
   * are set independently, so a backpacker hostel billed monthly had its billing day dropped
   * from the payload, and a PG billed nightly was made to supply one it would never use.
   */
  private formContext(): RenterFormContext {
    return { nightly: !this.monthlyBilling() };
  }

  /**
   * What the two dates are called, which follows how the hostel **bills**.
   *
   * A nightly hostel sells a stay: a guest checks in and checks out. A monthly one lets a
   * bed: a tenant joins and eventually leaves. Same two fields, and calling a six-month
   * tenancy a "check-out" reads as though the person is going home in the morning.
   *
   * Keyed off `billingFrequency`, not the accommodation type these labels used to read. The
   * type says what kind of place it is; the frequency says what a date on this form means,
   * and the two are set independently — a backpacker hostel can bill monthly.
   *
   * Keys, not finished strings: the template resolves them with the pipe, which waits for
   * the language file. Translating inside a computed runs before it has loaded and returns
   * the key itself, which is the trap `hh-tabs` was just rebuilt to avoid.
   */
  protected readonly joiningLabelKey = computed(() =>
    this.monthlyBilling() ? 'common.joiningDate' : 'hostTenants.checkIn',
  );

  protected readonly leavingLabelKey = computed(() =>
    this.monthlyBilling() ? 'hostTenants.leavingDate' : 'hostTenants.checkOut',
  );

  protected readonly form = signal<CheckInForm | null>(null);
  protected readonly saving = signal(false);
  protected readonly formLoading = signal(false);
  protected readonly transportEnabled = signal(false);
  protected readonly messEnabled = signal(false);
  protected readonly photoMenuOpen = signal(false);
  protected readonly cameraOpen = signal(false);
  protected readonly avatarUploading = signal(false);
  protected readonly avatarUploadError = signal<string | null>(null);
  protected readonly cnicFrontUploading = signal(false);
  protected readonly cnicBackUploading = signal(false);
  protected readonly cnicFrontUploadError = signal<string | null>(null);
  protected readonly cnicBackUploadError = signal<string | null>(null);
  protected readonly leaveConfirmOpen = signal(false);
  protected readonly leaveConfirmInput = signal('');
  protected readonly leaveConfirmEnabled = computed(() =>
    this.leaveConfirmInput().trim() === 'I Confirm',
  );
  protected readonly leaveInfo = computed(() => {
    const f = this.form();
    if (!f?.leaveDate) return null;
    const leave = new Date(f.leaveDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    leave.setHours(0, 0, 0, 0);
    const diff = Math.ceil((leave.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return { date: f.leaveDate, days: diff };
  });

  private readonly panelEl = viewChild<ElementRef<HTMLElement>>('panel');
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

  /**
   * Room, and the nights being asked for. Null whenever there is nothing to check.
   *
   * A room with no joining date is not a question — every room is available for no dates —
   * so the lookup stays quiet until both halves are chosen rather than firing on each
   * keystroke of a half-typed form.
   */
  private readonly availabilityQuery = computed(() => {
    const f = this.form();
    const hostelId = this.store.selected();
    if (!f?.roomId || !f.joiningDate || !hostelId) return null;
    const { from, to, openEnded } = stayWindow(f.joiningDate, f.leaveDate);
    return {
      hostelId,
      roomId: f.roomId,
      from,
      to,
      openEnded,
      tenantId: this.tenantId(),
      monthly: this.monthlyBilling(),
    };
  });

  /**
   * True when this hostel is billed by the month rather than the night.
   *
   * The same rule that hides the room calendar: a monthly hostel does not sell nights, so it
   * has no bookings to collide with. Its beds are held by tenants, and those come back with
   * the room.
   */
  protected readonly monthlyBilling = computed(() => this.store.isMonthlyBilled());

  /**
   * Whether this room has a bed free for every night asked for.
   *
   * Two paths, because the two kinds of hostel are asking different questions.
   *
   * **Monthly: no request at all.** There are no nightly bookings to collide with, and the
   * rooms list this drawer already loaded carries `capacity` and `occupied` for every room —
   * the same two numbers the dropdown's "Full" badge is built from. Fetching the room again
   * would spend a round trip to be told what is already in memory, and the bookings endpoint
   * a second one to be told nothing.
   *
   * **Nightly: both sources.** The bookings endpoint for stays, and the room's own renters
   * for tenants a host placed by hand. Checking bookings alone reports an empty room for the
   * very case this form creates, so the second tenant into a full room would sail through and
   * the clash would surface later on a calendar nobody was looking at.
   *
   * `null` while there is nothing to check or the answer is still in flight — the form is not
   * blocked on a question that has not been asked.
   */
  protected readonly availability = toSignal(
    toObservable(this.availabilityQuery).pipe(
      switchMap((q) => {
        if (!q) return of<AvailabilityState>({ loading: false, verdict: null });
        if (q.monthly) return of(this.fromRoomList(q.roomId, q.openEnded));
        return forkJoin({
          detail: this.api.roomShow(q.hostelId, q.roomId),
          bookings: this.bookingsApi.bookingsInRoom(q.hostelId, q.roomId, q.from, q.to),
        }).pipe(
          map(({ detail, bookings }): AvailabilityState => {
            // Editing: the tenant already in this room must not be counted against
            // themselves, or saving an untouched form would report the room full.
            const residents = detail.renters.filter((r: RoomRenter) => r.id !== q.tenantId);
            const { days } = toRoomMonth(bookings, detail.room.capacity, q.from, q.to, residents);
            return {
              loading: false,
              verdict: { ...assessAvailability(days, detail.room.capacity), openEnded: q.openEnded },
            };
          }),
          // A lookup that fails must not become a refusal: the host still knows their own
          // rooms, and blocking a check-in because a request timed out is the worse error.
          catchError(() => of<AvailabilityState>({ loading: false, verdict: null })),
          startWith<AvailabilityState>({ loading: true, verdict: null }),
        );
      }),
    ),
    { initialValue: { loading: false, verdict: null } as AvailabilityState },
  );

  /**
   * The monthly answer, from the rooms list already in memory.
   *
   * `occupied` here is a present-tense count — how full the room is *now* — because that is
   * all the list carries. On a monthly hostel that is close enough to the question being
   * asked: tenancies are open-ended, so a bed taken today is taken on the joining date too.
   * A nightly hostel needs the date-by-date version, which is why it still goes to the wire.
   *
   * A room the list has not reached yet answers `null` rather than "available". The dropdown
   * seeds the current room as a bare label when editing, and treating an unknown room as free
   * would wave through the one case with no numbers behind it.
   */
  /**
   * The room this tenant already holds a bed in, or null.
   *
   * Only set for an **active** tenant being edited: an inactive one is not counted in the
   * room's occupancy, so crediting them a bed back would invent a free one.
   *
   * Captured when the tenant loads rather than read off the form, because the form is what
   * the host is changing. Moving somebody from room A to room B has to check B against its
   * real occupancy — the bed they are vacating in A is not a bed free in B.
   */
  private readonly occupiesRoom = signal<string | null>(null);

  /** Beds in this room already held by the tenant being edited: their own, or none. */
  private heldByThisTenant(roomId: string): number {
    return this.occupiesRoom() === roomId ? 1 : 0;
  }

  private fromRoomList(roomId: string, openEnded: boolean): AvailabilityState {
    const room = this.roomOptions().find((r) => r.id === roomId);
    if (!room || room.capacity <= 0) return { loading: false, verdict: null };
    // Editing somebody already in this room: their own bed is not competition for
    // themselves. Without this, opening an occupied single room's tenant and changing their
    // phone number reported the room full and refused the save.
    const taken = room.occupied - this.heldByThisTenant(roomId);
    return {
      loading: false,
      verdict: {
        basis: 'occupancy',
        ok: taken < room.capacity,
        capacity: room.capacity,
        peakBooked: taken,
        firstBlocked: null,
        blockedNights: 0,
        from: '',
        to: '',
        openEnded,
      },
    };
  }

  protected readonly availabilityChecking = computed(() => this.availability().loading);
  protected readonly roomUnavailable = computed(() => this.availability().verdict?.ok === false);

  /** Why the room cannot take them, in the terms the room is sold in. */
  protected readonly unavailableReason = computed(() => {
    const v = this.availability().verdict;
    if (!v || v.ok) return '';
    const day = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, {
      day: 'numeric', month: 'short',
    });
    const scope = v.capacity <= 1
      ? 'This room is already taken'
      : `All ${v.capacity} beds are taken`;

    // A present-tense count says nothing about a date, so it does not pretend to. A monthly
    // hostel's tenancies are open-ended: a bed that is taken is taken, and moving the joining
    // date would not free it.
    if (v.basis === 'occupancy') {
      return `${scope}. Move somebody out of it first, or pick a room with a free bed.`;
    }

    const nights = v.blockedNights === 1 ? '1 night' : `${v.blockedNights} nights`;
    const when = v.blockedNights === 1
      ? `on ${day(v.firstBlocked!)}`
      : `for ${nights}, from ${day(v.firstBlocked!)}`;
    const window = v.openEnded
      ? ` No leave date was given, so the next ${OPEN_ENDED_HORIZON_DAYS} days were checked.`
      : '';
    return `${scope} ${when}. Pick different dates, or a room with a free bed.${window}`;
  });

  protected readonly dirtyFields = signal<Set<keyof CheckInForm>>(new Set());
  protected readonly submitAttempted = signal(false);
  protected readonly formValid = computed(() => {
    const f = this.form();
    if (!f || !isCheckInFormValid(f, this.formContext())) return false;
    // A known clash blocks the save. An unfinished or failed check does not — see
    // {@link availability}.
    return !this.roomUnavailable();
  });

  protected readonly billingDayOptions = BILLING_DAY_OPTIONS;

  constructor() {
    const trigger = isPlatformBrowser(inject(PLATFORM_ID))
      ? (document.activeElement as HTMLElement | null)
      : null;

    // Keyed on mode + tenantId only; the other inputs are seeds, not triggers.
    effect(() => {
      const mode = this.mode();
      const tenantId = this.tenantId();
      untracked(() => {
        if (mode === 'create') {
          this.startCheckIn(this.initialRoomId() ?? undefined);
          return;
        }
        if (tenantId) this.loadForEdit(tenantId);
      });
    });

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
        capacity: r.capacity,
        occupied: r.occupied,
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

    // Reactive so it still lands when the panel first renders a tick after construction.
    afterRenderEffect(() => this.panelEl()?.nativeElement.focus());

    this.destroyRef.onDestroy(() => {
      this.stopCamera();
      trigger?.focus();
    });
  }

  // ── Form lifecycle ────────────────────────────────────────────────────────

  private startCheckIn(preselectedRoomId?: string): void {
    this.resetFormChrome();
    this.transportEnabled.set(false);
    this.messEnabled.set(false);
    this.roomLoad$.next({ query: '', page: 1, append: false });
    this.form.set(emptyCheckInForm(preselectedRoomId));
  }

  private loadForEdit(tenantId: string): void {
    const hostelId = this.store.selected();
    if (!hostelId) return;
    this.resetFormChrome();
    this.formLoading.set(true);
    this.form.set(pendingEditForm(tenantId));
    this.api.getRenter(hostelId, tenantId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tenant) => {
          const f = checkInFormFromTenant(tenant);
          // Where this tenant already is, kept before the form can be edited — see
          // {@link heldByThisTenant}.
          this.occupiesRoom.set(
            tenant.status === 'active' ? tenant.roomId ?? null : null,
          );
          this.form.set(f);
          this.transportEnabled.set(!!f.transportationCharges && f.transportationCharges !== '0');
          this.messEnabled.set(
            (!!f.messCharges && f.messCharges !== '0') || f.messBreakfast || f.messLunch || f.messDinner,
          );
          this.formLoading.set(false);
          this.roomLoad$.next({ query: '', page: 1, append: false });
        },
        error: () => {
          this.formLoading.set(false);
          this.form.set(null);
          // One toast, from the interceptor. See the save handler below.
          this.closed.emit();
        },
      });
  }

  private resetFormChrome(): void {
    this.resetValidation();
    this.saving.set(false);
    this.formLoading.set(false);
    this.avatarUploading.set(false);
    this.avatarUploadError.set(null);
    this.cnicFrontUploading.set(false);
    this.cnicBackUploading.set(false);
    this.cnicFrontUploadError.set(null);
    this.cnicBackUploadError.set(null);
    this.roomOptions.set([]);
    this.roomQuery.set('');
    this.roomCurrentPage = 1;
    // Cleared on every open, so a bed credited back to the last tenant edited is not still
    // credited to the next one — the drawer is reused for both create and edit.
    this.occupiesRoom.set(null);
  }

  protected requestClose(): void {
    // Bailing out mid-write would abort the request the server is already applying.
    if (this.saving()) return;
    this.stopCamera();
    this.photoMenuOpen.set(false);
    this.closed.emit();
  }

  // ── Validation ────────────────────────────────────────────────────────────

  protected markDirty(key: keyof CheckInForm): void {
    this.dirtyFields.update(s => new Set([...s, key]));
  }

  protected fieldError(key: keyof CheckInForm): string {
    const f = this.form();
    if (!f) return '';
    // Nothing is wrong until the host has been near the field, or has pressed Register.
    if (!this.dirtyFields().has(key) && !this.submitAttempted()) return '';
    return fieldErrorFor(f, key, this.formContext());
  }

  private resetValidation(): void {
    this.dirtyFields.set(new Set());
    this.submitAttempted.set(false);
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

  protected setBillingDay(
    key: 'billingDate' | 'billingDueDate',
    value: string | string[] | null,
  ): void {
    if (typeof value !== 'string') return;
    this.patch(key, value);
    this.markDirty(key);
  }

  // ── Field patching ────────────────────────────────────────────────────────

  protected patch(key: keyof CheckInForm, value: string): void {
    this.form.update((f) => (f ? { ...f, [key]: value } : f));
  }

  protected patchBool(key: keyof CheckInForm, value: boolean): void {
    this.form.update((f) => (f ? { ...f, [key]: value } : f));
  }

  protected onTransportToggle(enabled: boolean): void {
    this.transportEnabled.set(enabled);
    if (!enabled) this.patch('transportationCharges', '');
  }

  protected onMessToggle(enabled: boolean): void {
    this.messEnabled.set(enabled);
    if (!enabled) {
      this.patch('messCharges', '');
      this.patchBool('messBreakfast', false);
      this.patchBool('messLunch', false);
      this.patchBool('messDinner', false);
    }
  }

  /** A document from the picker — file or camera. Same path as a file pick from here. */
  protected onPickedDoc(key: 'cnicFront' | 'cnicBack', file: File): void {
    this.applyFile(key, file);
  }

  protected patchFile(key: 'image' | 'cnicFront' | 'cnicBack', event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // let the same file be re-picked after a failure
    if (!file) return;
    this.applyFile(key, file);
  }

  private applyFile(key: 'image' | 'cnicFront' | 'cnicBack', file: File): void {
    const preview = URL.createObjectURL(file);
    if (key === 'image') {
      this.form.update((f) => (f ? { ...f, imageName: file.name, imagePreview: preview } : f));
      return;
    }
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

  // ── Photo capture & uploads ───────────────────────────────────────────────

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

  // ── Submit ────────────────────────────────────────────────────────────────

  protected save(): void {
    const f = this.form();
    if (!f) return;
    if (!isCheckInFormValid(f, this.formContext())) {
      this.submitAttempted.set(true);
      setTimeout(() => {
        const err = this.panelEl()?.nativeElement.querySelector<HTMLElement>('.text-danger');
        if (!err) return;
        err.scrollIntoView({ behavior: 'smooth', block: 'center' });
        err.closest('div')?.querySelector<HTMLElement>('input, textarea')?.focus();
      });
      return;
    }
    if (!f.id && f.leaveDate) {
      this.leaveConfirmInput.set('');
      this.leaveConfirmOpen.set(true);
      return;
    }
    this.submitForm();
  }

  protected confirmAndSave(): void {
    this.leaveConfirmOpen.set(false);
    this.submitForm();
  }

  protected closeLeaveConfirm(): void {
    this.leaveConfirmOpen.set(false);
    this.leaveConfirmInput.set('');
  }

  private submitForm(): void {
    const f = this.form();
    if (!f) return;
    const hostelId = this.store.selected();
    if (!hostelId) return;

    const name = f.fullName.trim();
    const editing = f.id;
    const request$ = editing
      ? this.api.updateRenter(hostelId, editing, toUpdateRenterPayload(f, this.formContext()))
      : this.api.createRenter(hostelId, toCreateRenterPayload(f, this.formContext()));

    this.saving.set(true);
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (tenant) => {
        this.saving.set(false);
        if (editing) this.notifications.success('Changes saved', `${name} has been updated.`);
        else this.notifications.success('Tenant registered', `${name} has been added.`);
        this.saved.emit(tenant);
      },
      // No toast here. `errorInterceptor` already raises one for every failed request, with
      // the server's own wording and — for a 4xx — pinned open, because "Email has already
      // been taken" is worth reading. Raising a second one stacked two messages saying the
      // same thing, and the more specific of the two was the one that timed out after six
      // seconds while the generic one stayed. The interceptor owns the toast; a feature's
      // job is the inline state, which is what `saving` is.
      error: () => this.saving.set(false),
    });
  }
}
