import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorState, Skeleton, StatusPill } from '@hostelhive/ui';
import { LocaleLink } from '@core/i18n/locale-link';
import { TranslocoPipe } from '@jsverse/transloco';
import { GuestBooking, MyBookingsApi, STAGE_ORDER, timingOf } from './my-bookings-api';
import { STEP_LABEL, TrackStep, asDay, stageIndex, statusOf } from './booking-status';

/**
 * One booking, in full: where it has got to, the stay, the money, and who it is for.
 *
 * Opened from the list, it draws at once from the booking the row handed over in the
 * navigation state, then refreshes from `GET /api/bookings/:id` — a stay the hostel moved on
 * since the list loaded should not read stale here. Opened cold (a refresh, a shared link) it
 * fetches.
 *
 * If the refresh fails but the handed-over booking is on screen, it stays on screen: a
 * slightly old copy of the guest's own booking beats an error page in its place.
 */
@Component({
  selector: 'app-account-booking-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, RouterLink, LocaleLink, ErrorState, Skeleton, StatusPill, TranslocoPipe],
  templateUrl: './booking-detail.html',
})
export class AccountBookingDetail {
  private readonly api = inject(MyBookingsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly booking = signal<GuestBooking | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);

  protected readonly steps = STAGE_ORDER;
  protected readonly day = asDay;

  protected readonly status = computed(() => {
    const b = this.booking();
    return b ? statusOf(b) : null;
  });
  protected readonly at = computed(() => {
    const b = this.booking();
    return b ? stageIndex(b) : -1;
  });
  /** A stay that is over draws its last step as done rather than in progress. */
  protected readonly past = computed(() => {
    const b = this.booking();
    return b ? timingOf(b, Date.now()) === 'past' : false;
  });

  protected readonly copied = signal(false);
  private copiedTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.copiedTimer));
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = params.get('id') ?? '';
      this.booking.set(this.handedOver(id));
      // No token on the server render — stay on the skeleton until the browser has one.
      if (this.browser) this.load(id);
    });
  }

  /** The booking the list row passed along, if it is this one. */
  private handedOver(id: string): GuestBooking | null {
    if (!this.browser) return null;
    const b = (history.state as { booking?: GuestBooking } | null)?.booking;
    return b && b.id === id ? b : null;
  }

  protected reload(): void {
    this.load(this.route.snapshot.paramMap.get('id') ?? '');
  }

  private load(id: string): void {
    this.loading.set(!this.booking());
    this.error.set(false);
    this.api
      .get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (b) => {
          this.booking.set(b);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          if (!this.booking()) this.error.set(true);
        },
      });
  }

  protected stepLabel(step: TrackStep): string {
    return STEP_LABEL[step];
  }

  protected copyRef(): void {
    const ref = this.booking()?.ref;
    if (!ref) return;
    void navigator.clipboard
      ?.writeText(ref)
      .then(() => {
        this.copied.set(true);
        clearTimeout(this.copiedTimer);
        this.copiedTimer = setTimeout(() => this.copied.set(false), 2000);
      })
      // The reference is on screen and selectable; a refused clipboard is not an error.
      .catch(() => undefined);
  }
}
