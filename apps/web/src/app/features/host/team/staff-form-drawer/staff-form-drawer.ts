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
import { ApiError, Staff } from '@hostelhive/data-access';
import { ImageUploadKey, ImageUploadService, StaffApi } from '@services';
import { MoneyInput } from '@app/shared/money-input/money-input';
import { NotificationService } from '@core/notification.service';
import {
  StaffForm,
  emptyStaffForm,
  isStaffFormValid,
  leavingBeforeJoining,
  managerEmailError as managerEmailErrorFor,
  managerPasswordError as managerPasswordErrorFor,
  staffFormFrom,
  toCreateStaffPayload,
  toUpdateStaffPayload,
} from './staff-form.model';

/** The three attachments, so the upload handler stays one method instead of three. */
type ImageSlot = 'avatar' | 'cnicFront' | 'cnicBack';

const UPLOAD_KEY: Record<ImageSlot, ImageUploadKey> = {
  avatar: 'avatar',
  cnicFront: 'cnic_front',
  cnicBack: 'cnic_back',
};

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
  imports: [Button, DatePicker, Drawer, Input, MoneyInput, PhoneInput, Toggle],
  templateUrl: './staff-form-drawer.html',
})
export class StaffFormDrawer {
  /** Hostel the record belongs to — the API is hostel-scoped. */
  readonly hostelId = input.required<string>();
  /** Existing record to edit; absent means create. */
  readonly editing = input<Staff | null>(null);

  readonly closed = output<void>();
  readonly saved = output<void>();

  private readonly api = inject(StaffApi);
  private readonly uploads = inject(ImageUploadService);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly form = signal<StaffForm>(emptyStaffForm());
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

  // Manager-access problems surface on the same trigger as the rest of the form, so the
  // drawer never shows a red field before the host has tried to save.
  protected readonly managerEmailError = computed(() =>
    this.showErrors() ? managerEmailErrorFor(this.form()) : '',
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
      this.form.set(existing ? staffFormFrom(existing) : emptyStaffForm());
    });
  }

  protected patch<K extends keyof StaffForm>(key: K, value: StaffForm[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  /**
   * Turning manager access off clears the credentials rather than keeping them hidden — a
   * stashed password would otherwise be submitted by a later save the host thought was
   * staff-only.
   */
  protected onManagerToggle(on: boolean): void {
    this.form.update((f) => ({
      ...f,
      isManager: on,
      managerEmail: on ? f.managerEmail : '',
      managerPassword: on ? f.managerPassword : '',
    }));
  }

  protected fieldError(key: keyof StaffForm): string {
    if (!this.showErrors()) return '';
    return String(this.form()[key] ?? '').trim() ? '' : 'Required.';
  }

  protected onFile(slot: ImageSlot, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // let the same file be re-picked after a failure
    if (!file) return;

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
        error: (err: ApiError) => {
          this.uploading.set(null);
          this.notifications.error("Couldn't upload image", err.message);
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
      next: () => {
        this.saving.set(false);
        this.notifications.success(
          f.id ? 'Staff updated' : 'Staff added',
          f.isManager
            ? `${f.name.trim()} has been saved and can now manage this hostel.`
            : `${f.name.trim()} has been saved.`,
        );
        this.saved.emit();
      },
      error: (err: ApiError) => {
        this.saving.set(false);
        this.notifications.error(
          f.id ? "Couldn't update staff" : "Couldn't add staff",
          err.message,
        );
      },
    });
  }
}
