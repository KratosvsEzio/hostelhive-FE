import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiError } from '@hostelhive/data-access';
import { HostelsApi } from '@services';
import { Button, ConfirmModal } from '@hostelhive/ui';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { HostelForm } from '../hostel-form/hostel-form';
import { LocaleLink } from '@core/i18n/locale-link';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'hh-new-hostel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DashboardLayout, RouterLink, LocaleLink, Button, ConfirmModal, HostelForm, TranslocoPipe],
  templateUrl: './new-hostel.html',
})
export class NewHostel {
  private readonly hostels = inject(HostelsApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly form = viewChild.required(HostelForm);

  protected readonly saving = signal(false);
  protected readonly apiErrors = signal<string[]>([]);
  protected readonly showValidation = signal(false);
  protected readonly showValidationModal = signal(false);

  protected objectEntries = Object.entries as (
    o: Partial<Record<string, string>>,
  ) => [string, string][];

  protected create(): void {
    this.showValidation.set(true);
    const f = this.form();
    if (!f.isValid()) {
      this.showValidationModal.set(true);
      return;
    }
    if (this.saving() || f.uploading()) return;
    this.saving.set(true);
    this.apiErrors.set([]);
    const payload = f.getPayload();
    this.hostels
      .create(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (hostel) => {
          this.router.navigate(['/host', hostel.id, 'profile']);
        },
        // The error interceptor normalises failures to ApiError, so the Rails `errors[]`
        // envelope is on `serverMessages` — NOT `err.error.errors`, which is undefined here.
        error: (err: ApiError) => {
          this.saving.set(false);
          this.apiErrors.set(
            err?.serverMessages?.length
              ? [...err.serverMessages]
              : ["Couldn't create hostel — please try again."],
          );
        },
      });
  }
}
