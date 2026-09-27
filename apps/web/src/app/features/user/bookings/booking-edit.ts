import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe, translate } from '@jsverse/transloco';
import { ErrorState, Skeleton } from '@hostelhive/ui';
import { LocaleLink } from '@core/i18n/locale-link';
import { NotificationService } from '@core/notification.service';
import { ListingDetailApi } from '@services';
import { ListingDetail } from '@services/listing-detail.fixture';
import { PricingPeriod, periodForAccommodation, periodFromBillingFrequency } from '@util/pricing-period';
import { BookingBasket } from '@features/public/listing/booking/booking-basket';
import { BookingRail } from '@features/public/listing/booking/booking-rail';
import { RoomPicker } from '@features/public/listing/booking/room-picker';
import { RoomOffer, lineTotal } from '@features/public/listing/booking/room-offer';
import { BookingEditModal, StayChangeSummary } from './booking-edit-modal';
import { GuestBooking, GuestBookingPatch, MyBookingsApi, canEdit, withinChangeCutoff } from './my-bookings-api';

/** A wall date (`yyyy-MM-dd`) as the local midnight the date picker works in. */
function localDay(date: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function sameDay(a: Date | null, b: Date | null): boolean {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Changing a pending booking: its dates, its rooms and how many of each, how many people are
 * in them, and who it is for — everything that was chosen when it was made, on the same
 * controls it was made with.
 *
 * The listing page's own room picker and rail, over a basket seeded from the booking, so the
 * guest meets the screen they booked on with their booking already in it. Saving opens a
 * review with the new total beside the old and the guest's details, and sends one PATCH.
 *
 * Only while pending; the server refuses anything later with a 422, and the page says so
 * rather than offering controls that cannot save.
 */
@Component({
  selector: 'app-account-booking-edit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LocaleLink, TranslocoPipe, ErrorState, Skeleton, RoomPicker, BookingRail, BookingEditModal],
  providers: [BookingBasket],
  templateUrl: './booking-edit.html',
})
export class AccountBookingEdit {
  private readonly api = inject(MyBookingsApi);
  private readonly listings = inject(ListingDetailApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notifications = inject(NotificationService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly basket = inject(BookingBasket);

  protected readonly booking = signal<GuestBooking | null>(null);
  protected readonly listing = signal<ListingDetail | null>(null);
  protected readonly loadError = signal(false);

  protected readonly loading = computed(() => !this.loadError() && (!this.booking() || !this.listing()));
  protected readonly editable = computed(() => {
    const b = this.booking();
    return !!b && canEdit(b);
  });
  protected readonly inCutoff = computed(() => {
    const b = this.booking();
    return !!b && withinChangeCutoff(b);
  });
  /** A confirmed booking goes back to pending on any change; the review says so first. */
  protected readonly reconfirm = computed(() => this.booking()?.statusSlug === 'confirmed');

  protected readonly offers = computed<readonly RoomOffer[]>(() => this.listing()?.roomOffers ?? []);
  protected readonly currency = computed(() => this.listing()?.currency || this.booking()?.currency || '');
  protected readonly period = computed<PricingPeriod>(() => {
    const l = this.listing();
    if (!l) return 'nightly';
    return periodFromBillingFrequency(l.billingFrequency) ?? periodForAccommodation(l.accommodationType);
  });

  /** Rooms on the booking the hostel no longer offers — said, not silently dropped. */
  protected readonly droppedRooms = signal<string[]>([]);
  private seeded = false;

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = params.get('id') ?? '';
      const handed = this.browser
        ? (history.state as { booking?: GuestBooking } | null)?.booking
        : undefined;
      if (handed?.id === id) {
        this.booking.set(handed);
        this.loadListing(handed.hostel.id);
      }
      if (this.browser) this.load(id);
    });

    // Seed the basket once both halves are here: the booking says what was chosen, the
    // listing says what each room is and costs.
    effect(() => {
      const b = this.booking();
      const offers = this.offers();
      if (this.seeded || !b || !offers.length) return;
      this.seeded = true;
      this.seed(b, offers);
    });
  }

  protected reload(): void {
    this.load(this.route.snapshot.paramMap.get('id') ?? '');
  }

  private load(id: string): void {
    this.loadError.set(false);
    this.api
      .get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (b) => {
          // A refresh never reseeds: once the guest has started changing it, the basket is theirs.
          if (!this.seeded) this.booking.set(b);
          this.loadListing(b.hostel.id);
        },
        error: () => {
          if (!this.booking()) this.loadError.set(true);
        },
      });
  }

  private listingFor = '';
  private loadListing(hostelId: string): void {
    if (!hostelId || hostelId === this.listingFor) return;
    this.listingFor = hostelId;
    this.listings
      .getBySlug(hostelId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (l) => (l ? this.listing.set(l) : this.loadError.set(true)),
        error: () => this.loadError.set(true),
      });
  }

  private seed(b: GuestBooking, offers: readonly RoomOffer[]): void {
    this.basket.checkIn.set(localDay(b.checkIn.date));
    this.basket.checkOut.set(localDay(b.checkOut.date));
    const dropped: string[] = [];
    for (const line of b.lines) {
      const offer = offers.find((o) => o.id === line.roomTypeId);
      if (!offer) {
        dropped.push(line.name);
        continue;
      }
      this.basket.setQuantity(offer, line.units);
      // Only private lines carry a headcount of their own; a shared line is its bed count.
      if (offer.kind === 'private') this.basket.setGuests(offer.id, line.guests);
    }
    this.droppedRooms.set(dropped);
  }

  /** Whether the dates or rooms differ from the booking — if not, only the details are sent. */
  private readonly stayChanged = computed(() => {
    const b = this.booking();
    if (!b) return false;
    if (!sameDay(this.basket.checkIn(), localDay(b.checkIn.date))) return true;
    if (!sameDay(this.basket.checkOut(), localDay(b.checkOut.date))) return true;
    const now = this.basket.lines();
    if (now.length !== b.lines.length) return true;
    return b.lines.some((was) => {
      const line = now.find((l) => l.roomId === was.roomTypeId);
      return !line || line.quantity !== was.units || line.guests !== was.guests;
    });
  });

  // ── review and save ────────────────────────────────────────────────────────────
  protected readonly reviewOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');

  protected readonly summary = computed<StayChangeSummary | null>(() => {
    const b = this.booking();
    const from = this.basket.checkIn();
    const to = this.basket.checkOut();
    if (!b || !from || !to || !this.stayChanged()) return null;
    const nights = this.basket.nights();
    return {
      checkIn: from,
      checkOut: to,
      nights,
      lines: this.basket.lines().map((l) => ({
        title: l.title,
        units: l.quantity,
        shared: l.kind === 'shared',
        guests: l.guests,
        total: lineTotal(l, nights),
      })),
      total: this.basket.total(),
      previousTotal: b.total,
      currency: this.currency(),
    };
  });

  protected review(): void {
    if (!this.basket.canBook() || !this.editable()) return;
    this.saveError.set('');
    this.reviewOpen.set(true);
  }

  protected closeReview(): void {
    if (!this.saving()) this.reviewOpen.set(false);
  }

  protected save(details: Omit<GuestBookingPatch, 'stay'>): void {
    const b = this.booking();
    const from = this.basket.checkIn();
    const to = this.basket.checkOut();
    if (!b || !from || !to || this.saving()) return;
    const patch: GuestBookingPatch = this.stayChanged()
      ? {
          ...details,
          stay: {
            checkIn: from,
            checkOut: to,
            hostelCountry: this.listing()?.country,
            lines: this.basket.lines(),
          },
        }
      : details;

    this.saving.set(true);
    this.saveError.set('');
    this.api
      .update(b.id, patch)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.reviewOpen.set(false);
          this.notifications.success(translate('userBookings.bookingUpdated'));
          // Back to the booking, carrying what the server stored so it draws at once.
          void this.router.navigate(['..'], { relativeTo: this.route, state: { booking: updated } });
        },
        error: (err: { message?: string } | null) => {
          this.saving.set(false);
          this.saveError.set(err?.message || translate('userBookings.changeFailed'));
        },
      });
  }

  /** The picker's "choose a room" from an empty rail: bring the rooms into view. */
  protected toRooms(): void {
    if (!this.browser) return;
    document.getElementById('edit-rooms')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
