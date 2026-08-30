import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { HostelDetail } from '@hostelhive/data-access';
import { HostelsApi, HostPropertyStore } from '@services';
import { Button, ConfirmModal, ErrorState, Skeleton } from '@hostelhive/ui';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { isNetworkError } from '@util/network-error';
import { HostelForm } from '../hostel-form/hostel-form';
import { TranslocoPipe } from '@jsverse/transloco';

interface ViewState {
  loading: boolean;
  error: boolean;
  networkError: boolean;
  data: HostelDetail | null;
}

@Component({
  selector: 'hh-hostel-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DashboardLayout, Button, ConfirmModal, ErrorState, Skeleton, HostelForm, TranslocoPipe],
  templateUrl: './hostel-profile.html',
})
export class HostelProfile {
  private readonly hostels = inject(HostelsApi);
  private readonly store = inject(HostPropertyStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);

  protected readonly form = viewChild(HostelForm);

  protected readonly hostelId = toSignal(
    this.route.parent!.paramMap.pipe(map((pm) => pm.get('hostelId') ?? '')),
    { initialValue: this.store.selected() },
  );

  protected readonly previewUrl = computed(() => {
    const id = this.hostelId();
    return id ? `/hostel/${id}` : null;
  });

  private readonly refresh = signal(0);

  private readonly _syncStore = effect(() => {
    const id = this.hostelId();
    if (id && id !== untracked(() => this.store.selected())) {
      this.store.setProperty(id);
    }
  });

  protected readonly state = toSignal(
    toObservable(computed(() => ({ id: this.hostelId(), r: this.refresh() }))).pipe(
      switchMap(({ id }) => {
        if (!id) return of<ViewState>({ loading: false, error: false, networkError: false, data: null });
        return this.hostels.getForEdit(id).pipe(
          map((data): ViewState => ({ loading: false, error: false, networkError: false, data })),
          startWith<ViewState>({ loading: true, error: false, networkError: false, data: null }),
          catchError((err) => of<ViewState>({ loading: false, error: true, networkError: isNetworkError(err), data: null })),
        );
      }),
    ),
    { initialValue: { loading: true, error: false, networkError: false, data: null } as ViewState },
  );

  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly saveError = signal(false);

  /** The fields that would send this listing back to moderation, empty when none did. */
  protected readonly reviewKeys = computed(() => this.form()?.reviewTriggerKeys() ?? []);
  protected readonly reviewOpen = signal(false);

  /**
   * Asks first when the edit costs the host their visibility.
   *
   * Only for the fields a moderator re-reads — see `REVIEW_TRIGGER_FIELDS`. Everything else
   * saves straight through, because a dialogue on every edit is one nobody reads by the
   * third time, and this one has to still be worth stopping for.
   */
  protected save(): void {
    if (!this.canSave()) return;
    if (this.reviewKeys().length > 0) {
      this.reviewOpen.set(true);
      return;
    }
    this.commit();
  }

  protected confirmReview(): void {
    this.reviewOpen.set(false);
    this.commit();
  }

  protected cancelReview(): void {
    this.reviewOpen.set(false);
  }

  private canSave(): boolean {
    const f = this.form();
    // isValid is false only for a genuine conflict on this screen: every other rule in the
    // form is create-only, so this blocks the save without gating edits behind them.
    return !!this.hostelId() && !!f && f.dirty() && !this.saving() && !f.uploading() && f.isValid();
  }

  private commit(): void {
    const id = this.hostelId();
    const f = this.form();
    if (!id || !f) return;
    this.saving.set(true);
    this.saveError.set(false);
    this.saved.set(false);
    const payload = f.getPayload();
    this.hostels
      .update(id, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (hostel) => {
          this.saving.set(false);
          this.saved.set(true);
          f.onSaveSuccess(hostel);
        },
        error: () => {
          this.saving.set(false);
          this.saveError.set(true);
        },
      });
  }

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }
}
