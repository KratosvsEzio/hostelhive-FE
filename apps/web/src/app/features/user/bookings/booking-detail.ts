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
import { Button, ConfirmModal, ErrorState, PhotoPlaceholder, Skeleton, StatusPill } from '@hostelhive/ui';
import { LocaleLink } from '@core/i18n/locale-link';
import { TranslocoPipe, translate } from '@jsverse/transloco';
import { CurrencySymbolPipe } from '@app/shared/currency/currency-symbol.pipe';
import { NotificationService } from '@core/notification.service';
import { ListingDetailApi } from '@services';
import {
  GuestBooking,
  GuestBookingPatch,
  MyBookingsApi,
  STAGE_ORDER,
  canCancel,
  canEdit,
  mapsUrl,
  timingOf,
} from './my-bookings-api';
import { BookingEditModal } from './booking-edit-modal';
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
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    LocaleLink,
    Button,
    ConfirmModal,
    BookingEditModal,
    ErrorState,
    PhotoPlaceholder,
    Skeleton,
    StatusPill,
    CurrencySymbolPipe,
    TranslocoPipe,
  ],
  templateUrl: './booking-detail.html',
})
export class AccountBookingDetail {
  private readonly api = inject(MyBookingsApi);
  private readonly listings = inject(ListingDetailApi);
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

  /**
   * The hostel as its public listing describes it — for the photo, which no booking payload
   * carries, and as a second source for the location. Fetched once per hostel, alongside the
   * booking rather than after it, and never allowed to fail the page: a booking without its
   * photo is still the whole booking.
   */
  private readonly listing = signal<{
    photo: string;
    lat: number | null;
    lng: number | null;
    address: string;
    currency: string;
    phones: string[];
  } | null>(null);
  /** The hostel lookup has answered, either way — so "no phone" can be said, not guessed. */
  protected readonly listingSettled = signal(false);

  /** The hostel's own numbers, as dialable `tel:` links beside the display text. */
  protected readonly phones = computed(() =>
    (this.listing()?.phones ?? []).map((display) => ({ display, href: `tel:${display.replace(/[^\d+]/g, '')}` })),
  );
  private listingFor = '';
  protected readonly photoBroken = signal(false);

  protected readonly photo = computed(() => (this.photoBroken() ? '' : (this.listing()?.photo ?? '')));

  /**
   * The currency the hostel prices in, from the hostel itself; the booking's own field until
   * the hostel answers. Blank lets the symbol pipe fall back to the app default.
   */
  protected readonly currency = computed(() => this.listing()?.currency || this.booking()?.currency || '');

  /** The street address when either source has one, else the area and city. */
  protected readonly address = computed(() => {
    const b = this.booking();
    return b?.hostel.address || this.listing()?.address || b?.hostel.place || '';
  });

  /** Google Maps, at the pin when either source has coordinates, else searching the address. */
  protected readonly mapLink = computed(() => {
    const b = this.booking();
    if (!b) return '';
    const own = { lat: b.hostel.lat ?? null, lng: b.hostel.lng ?? null };
    const l = this.listing();
    const pin = own.lat !== null && own.lng !== null ? own : { lat: l?.lat ?? null, lng: l?.lng ?? null };
    // `address()` falls back to the place, so the two can be the same string.
    const query = [...new Set([b.hostel.name, this.address(), b.hostel.place])].filter(Boolean).join(', ');
    return mapsUrl({ ...pin, query });
  });

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.copiedTimer));
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = params.get('id') ?? '';
      const handed = this.handedOver(id);
      this.booking.set(handed);
      // No token on the server render — stay on the skeleton until the browser has one.
      if (this.browser) {
        if (handed) this.loadListing(handed.hostel.id);
        this.load(id);
      }
    });
  }

  private loadListing(hostelId: string): void {
    if (!hostelId || hostelId === this.listingFor) return;
    this.listingFor = hostelId;
    this.photoBroken.set(false);
    this.listingSettled.set(false);
    this.listings
      .getBySlug(hostelId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (l) => {
          this.listingSettled.set(true);
          if (!l) return;
          const lat = Number.isFinite(l.lat) && l.lat !== 0 ? l.lat : null;
          const lng = Number.isFinite(l.lng) && l.lng !== 0 ? l.lng : null;
          this.listing.set({
            photo: l.images[0] ?? '',
            lat,
            lng,
            address: l.address ?? '',
            currency: l.currency?.trim().toUpperCase() ?? '',
            phones: l.publicPhones ?? [],
          });
        },
        // Decoration: the page is complete without it.
        error: () => this.listingSettled.set(true),
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
          this.loadListing(b.hostel.id);
        },
        error: () => {
          this.loading.set(false);
          if (!this.booking()) this.error.set(true);
        },
      });
  }

  // ── changing it ─────────────────────────────────────────────────────────────────
  private readonly notifications = inject(NotificationService);

  /** What the server allows now. It re-checks both, and answers 422 if the booking moved on. */
  protected readonly editable = computed(() => {
    const b = this.booking();
    return !!b && canEdit(b);
  });
  protected readonly cancellable = computed(() => {
    const b = this.booking();
    return !!b && canCancel(b);
  });

  protected readonly editOpen = signal(false);
  protected readonly cancelOpen = signal(false);
  /** One request at a time: both dialogs lock while it is out. */
  protected readonly busy = signal(false);
  protected readonly actionError = signal('');

  protected openEdit(): void {
    this.actionError.set('');
    this.editOpen.set(true);
  }

  protected openCancel(): void {
    this.actionError.set('');
    this.cancelOpen.set(true);
  }

  protected closeDialogs(): void {
    if (this.busy()) return;
    this.editOpen.set(false);
    this.cancelOpen.set(false);
  }

  protected saveEdit(patch: GuestBookingPatch): void {
    const b = this.booking();
    if (!b || this.busy()) return;
    this.run(this.api.update(b.id, patch), () => {
      this.editOpen.set(false);
      this.notifications.success(translate('userBookings.detailsUpdated'));
    });
  }

  protected confirmCancel(): void {
    const b = this.booking();
    if (!b || this.busy()) return;
    this.run(this.api.cancel(b.id), () => {
      this.cancelOpen.set(false);
      this.notifications.success(translate('userBookings.bookingCancelled'));
    });
  }

  /**
   * Sends a change and takes the server's copy of the booking back as the new truth.
   *
   * The reply, not the form: the server may have changed more than was asked — a cancel moves
   * the status and the disposition together — and the page should show what is now stored.
   * A failure stays in the dialog, where the guest is looking, with the server's own reason
   * ("Only pending bookings can be updated" when the hostel confirmed it meanwhile).
   */
  private run(request: ReturnType<MyBookingsApi['update']>, done: () => void): void {
    this.busy.set(true);
    this.actionError.set('');
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.booking.set(updated);
        done();
      },
      error: (err: { message?: string } | null) => {
        this.busy.set(false);
        this.actionError.set(err?.message || translate('userBookings.changeFailed'));
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
