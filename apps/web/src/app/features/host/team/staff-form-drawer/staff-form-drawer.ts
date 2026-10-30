import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { take } from 'rxjs';
import { Button, DatePicker, Drawer, Input, PhoneInput, Toggle } from '@hostelhive/ui';
import { PhotoPicker } from '@app/shared/photo-picker/photo-picker';
import { Staff } from '@hostelhive/data-access';
import {
  ImageUploadKey,
  ImageUploadService,
  StaffApi,
  UploadNetworkError,
  followToday,
  hostelZone,
  selectedHostelToday,
} from '@services';
import { MoneyInput } from '@app/shared/money-input/money-input';
import { NotificationService } from '@core/notification.service';
import { errorStatus } from '@core/errors/api-error-text';
import {
  StaffForm,
  emptyStaffForm,
  isStaffFormValid,
  leavingBeforeJoining,
  emailError as emailErrorFor,
  managerPasswordError as managerPasswordErrorFor,
  staffFormFrom,
  toCreateStaffPayload,
  toUpdateStaffPayload,
} from './staff-form.model';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

/** The three attachments, so the upload handler stays one method instead of three. */
type ImageSlot = 'avatar' | 'cnicFront' | 'cnicBack';

const UPLOAD_KEY: Record<ImageSlot, ImageUploadKey> = {
  avatar: 'avatar',
  cnicFront: 'cnic_front',
  cnicBack: 'cnic_back',
};

/**
 * The toast body for a failed image upload.
 *
 * A 422 is the presign step refusing the file's type. Status 0 is the presign call never
 * connecting, and `UploadNetworkError` is the storage PUT never connecting. Everything else
 * asks the host to try again.
 */
function uploadFailureKey(failure: unknown): string {
  const status = errorStatus(failure);
  if (status === 422) return 'hostTeam.fileTypeNotSupported';
  if (status === 0 || failure instanceof UploadNetworkError) return 'common.cannotReachTheServer';
  return 'hostTeam.uploadTryAgain';
}

/**
 * Create / edit a staff member against `/api/host/hostels/:id/staffs`.
 *
 * Separate from the manager form on the same page: a manager is a login account
 * (email + password), a staff member is an employment record (salary, CNIC, dates).
 * Neither endpoint can express the other's fields.
 */
@Component({
  selector: 'hh-staff-form-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, DatePicker, Drawer, Input, MoneyInput, PhoneInput, PhotoPicker, Toggle, TranslocoPipe],
  templateUrl: './staff-form-drawer.html',
})
export class StaffFormDrawer {
  /** Hostel the record belongs to — the API is hostel-scoped. */
  readonly hostelId = input.required<string>();
  /** Existing record to edit; absent means create. */
  readonly editing = input<Staff | null>(null);

  readonly closed = output<void>();
  /**
   * The persisted record, not a bare signal that something happened.
   *
   * `StaffApi.create` and `update` both answer with the saved `Staff`, so the list already
   * has what it would otherwise refetch a page to learn. This used to emit `void` and the
   * page reloaded the whole list for one row it was being handed.
   */
  readonly saved = output<Staff>();

  private readonly api = inject(StaffApi);
  private readonly uploads = inject(ImageUploadService);
  private readonly notifications = inject(NotificationService);
  private readonly i18n = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  /** The hostel's date, which a new staff member joins on by default. */
  protected readonly today = selectedHostelToday(new Date(), hostelZone(this.hostelId));
  protected readonly form = signal<StaffForm>(emptyStaffForm(this.today()));
  protected readonly saving = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly uploading = signal<ImageSlot | null>(null);

  /** True once seeded, so the drawer does not re-seed on every change detection pass. */
  private seeded = false;

  protected readonly isEdit = computed(() => !!this.editing());

  protected readonly canSave = computed(
    () => isStaffFormValid(this.form()) && !this.saving() && !this.uploading(),
  );

  protected readonly leavingError = computed(() =>
    leavingBeforeJoining(this.form()) ? 'Leaving date is before the joining date.' : '',
  );

  // Email and manager-access problems surface on the same trigger as the rest of the form, so
  // the drawer never shows a red field before the host has tried to save.
  protected readonly emailError = computed(() =>
    this.showErrors() ? emailErrorFor(this.form()) : '',
  );
  protected readonly managerPasswordError = computed(() =>
    this.showErrors() ? managerPasswordErrorFor(this.form()) : '',
  );

  constructor() {
    // Seed once from the input rather than in an effect that would clobber the host's
    // typing every time the parent re-renders.
    queueMicrotask(() => {
      if (this.seeded) return;
      this.seeded = true;
      const existing = this.editing();
      this.form.set(existing ? staffFormFrom(existing) : emptyStaffForm(this.today()));
    });

    // The zone lands after the form was seeded: move an untouched joining date onto the
    // hostel's today. A record being edited keeps its own.
    followToday(this.today, (from, to) => {
      if (this.editing()) return;
      this.form.update((f) => (f.joiningDate === from ? { ...f, joiningDate: to } : f));
    });
  }

  protected patch<K extends keyof StaffForm>(key: K, value: StaffForm[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  /**
   * Turning manager access off clears the password rather than keeping it hidden — a stashed
   * password would otherwise be submitted by a later save the host thought was staff-only.
   * The email stays: every staff record needs one.
   */
  protected onManagerToggle(on: boolean): void {
    this.form.update((f) => ({
      ...f,
      isManager: on,
      managerPassword: on ? f.managerPassword : '',
    }));
  }

  protected fieldError(key: keyof StaffForm): string {
    if (!this.showErrors()) return '';
    return String(this.form()[key] ?? '').trim() ? '' : 'Required.';
  }

  /** A file or a camera shot from the picker — the upload is the same either way. */
  protected onPicked(slot: ImageSlot, file: File): void {
    this.startUpload(slot, file);
  }

  protected onFile(slot: ImageSlot, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // let the same file be re-picked after a failure
    if (!file) return;
    this.startUpload(slot, file);
  }

  private startUpload(slot: ImageSlot, file: File): void {
    this.uploading.set(slot);
    this.uploads
      .upload(UPLOAD_KEY[slot], file)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ id, url }) => {
          this.uploading.set(null);
          if (slot === 'avatar') {
            this.form.update((f) => ({ ...f, avatarUploadId: id, avatarUrl: url }));
          } else if (slot === 'cnicFront') {
            this.form.update((f) => ({ ...f, cnicFrontUploadId: id, cnicFrontUrl: url }));
          } else {
            this.form.update((f) => ({ ...f, cnicBackUploadId: id, cnicBackUrl: url }));
          }
        },
        error: (failure: unknown) => {
          this.uploading.set(null);
          this.notifications.error(
            this.i18n.translate('hostTeam.couldNotUploadImage'),
            this.i18n.translate(uploadFailureKey(failure)),
          );
        },
      });
  }

  protected save(): void {
    const f = this.form();
    if (!isStaffFormValid(f)) {
      this.showErrors.set(true);
      return;
    }
    if (this.saving()) return;

    this.saving.set(true);
    const hostelId = this.hostelId();
    // Manager access rides on this same payload (`is_manager` + credentials) rather than a
    // second call, so there is nothing to chain here.
    const request = f.id
      ? this.api.update(hostelId, f.id, toUpdateStaffPayload(f))
      : this.api.create(hostelId, toCreateStaffPayload(f));

    request.pipe(take(1), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (persisted) => {
        this.saving.set(false);
        this.notifications.success(
          f.id ? 'Staff updated' : 'Staff added',
          f.isManager
            ? `${f.name.trim()} has been saved and can now manage this hostel.`
            : `${f.name.trim()} has been saved.`,
        );
        this.saved.emit(persisted);
      },
      // One toast, from `errorInterceptor`. The image-upload handler above keeps its own
      // because it names a step the interceptor cannot see — see there.
      error: () => this.saving.set(false),
    });
  }
}
