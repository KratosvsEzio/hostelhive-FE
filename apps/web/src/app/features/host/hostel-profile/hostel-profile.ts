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
import { Button, ErrorState, Skeleton } from '@hostelhive/ui';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { isNetworkError } from '@util/network-error';
import { HostelForm } from '../hostel-form/hostel-form';

interface ViewState {
  loading: boolean;
  error: boolean;
  networkError: boolean;
  data: HostelDetail | null;
}

@Component({
  selector: 'hh-hostel-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DashboardLayout, Button, ErrorState, Skeleton, HostelForm],
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

  protected save(): void {
    const id = this.hostelId();
    const f = this.form();
    if (!id || !f || !f.dirty() || this.saving() || f.uploading()) return;
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
