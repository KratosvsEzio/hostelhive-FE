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
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, debounceTime, filter, map, switchMap, take } from 'rxjs';
import {
  Button,
  DatePicker,
  Dropdown,
  DropdownOption,
  Input,
  Toggle,
} from '@hostelhive/ui';

import { HostOpsApi, HostPropertyStore, ImageUploadKey, ImageUploadService } from '@services';
import { ApiError, Tenant } from '@hostelhive/data-access';
import { NotificationService } from '@core/notification.service';
import { PAGE_SIZE } from '@util/pagination';
import { BILLING_DAY_OPTIONS } from '@util/billing-day';
import {
  CheckInForm,
  RoomOption,
  checkInFormFromTenant,
  emptyCheckInForm,
  isCheckInFormValid,
  pendingEditForm,
  toCreateRenterPayload,
  toUpdateRenterPayload,
} from './tenant-form.model';

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
  imports: [Button, DatePicker, Dropdown, Input, Toggle],
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
  private readonly store = inject(HostPropertyStore);
  private readonly imageUpload = inject(ImageUploadService);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly form = signal<CheckInForm | null>(null);
  protected readonly saving = signal(false);
  protected readonly formLoading = signal(false);
  protected readonly photoMenuOpen = signal(false);
  protected readonly cameraOpen = signal(false);
  protected readonly avatarUploading = signal(false);
  protected readonly avatarUploadError = signal<string | null>(null);
  protected readonly cnicFrontUploading = signal(false);
  protected readonly cnicBackUploading = signal(false);
  protected readonly cnicFrontUploadError = signal<string | null>(null);
  protected readonly cnicBackUploadError = signal<string | null>(null);

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

  protected readonly dirtyFields = signal<Set<keyof CheckInForm>>(new Set());
  protected readonly submitAttempted = signal(false);

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
          this.form.set(checkInFormFromTenant(tenant));
          this.formLoading.set(false);
          this.roomLoad$.next({ query: '', page: 1, append: false });
        },
        error: () => {
          this.formLoading.set(false);
          this.form.set(null);
          this.notifications.error(
            'Couldn\'t open tenant',
            'We couldn\'t load this tenant\'s details. Please try again.',
          );
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
    if (!this.dirtyFields().has(key) && !this.submitAttempted()) return '';
    return (f[key] as string).trim() ? '' : 'This field is required';
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

  protected patchFile(key: 'image' | 'cnicFront' | 'cnicBack', event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
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
    if (!isCheckInFormValid(f)) {
      this.submitAttempted.set(true);
      return;
    }
    const hostelId = this.store.selected();
    if (!hostelId) return;

    const name = f.fullName.trim();
    const editing = f.id;
    const request$ = editing
      ? this.api.updateRenter(hostelId, editing, toUpdateRenterPayload(f))
      : this.api.createRenter(hostelId, toCreateRenterPayload(f));

    this.saving.set(true);
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (tenant) => {
        this.saving.set(false);
        if (editing) this.notifications.success('Changes saved', `${name} has been updated.`);
        else this.notifications.success('Tenant checked in', `${name} has been added.`);
        this.saved.emit(tenant);
      },
      error: (err) => {
        this.saving.set(false);
        const msg = (err as ApiError).message;
        if (editing) {
          this.notifications.error(
            'Couldn\'t save tenant',
            msg ?? 'Failed to update. Please try again.',
          );
        } else {
          this.notifications.error(
            'Couldn\'t check in tenant',
            msg ?? 'Failed to check in. Please try again.',
          );
        }
      },
    });
  }
}
