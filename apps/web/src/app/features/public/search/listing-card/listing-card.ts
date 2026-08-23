import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AccommodationType, Listing } from '@hostelhive/data-access';
import { FavoritesStore } from '@util/favorites-store';
import { SearchCapacity } from '@services';
import { Badge, TooltipFixed } from '@hostelhive/ui';
import { CurrencySymbolPipe } from '@app/shared/currency/currency-symbol.pipe';
import { CurrencyNamePipe } from '@app/shared/currency/currency-name.pipe';
import { periodForAccommodation, periodSuffix } from '@util/pricing-period';
import { accommodationLabel } from '@util/accommodation-type';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocaleLink } from '@core/i18n/locale-link';

/** Amenity pills shown before collapsing the rest into a "+N". */
const MAX_AMENITY_PILLS = 2;

/**
 * Listing card (HostelHive theme): a contained white card with an image carousel on
 * top — gender + property-type pills and a rating badge over the photo — then title,
 * location, price, review count, and amenity pills. Uses the "stretched link" pattern
 * so the whole card navigates while the heart/arrows stay independently clickable
 * (valid HTML — no interactive controls nested in the <a>).
 */
@Component({
  selector: 'hh-listing-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, RouterLink, LocaleLink, DecimalPipe, Badge, TooltipFixed, CurrencySymbolPipe, CurrencyNamePipe],
  templateUrl: './listing-card.html',
})
export class ListingCard {
  readonly listing = input.required<Listing>();
  /** Highlights the card (e.g. when its map pin is hovered). */
  readonly active = input(false);
  /**
   * Shows the overlay heart. Turn it off where the page owns its own remove control —
   * the favorites list confirms before unsaving, which the heart's instant toggle would
   * bypass.
   */
  readonly savable = input(true);

  private readonly platformId = inject(PLATFORM_ID);
  private readonly favorites = inject(FavoritesStore);
  private readonly capacityStore = inject(SearchCapacity);

  protected readonly newTab = isPlatformBrowser(this.platformId)
    ? window.matchMedia('(min-width: 950px)').matches
    : true;

  protected readonly img = signal(0);
  /** Reactive saved state, backed by the localStorage-persisted FavoritesStore. */
  protected readonly saved = computed(() =>
    this.favorites.isFavorite(this.listing().id),
  );
  /** Price to display — capacity-adjusted when the user has selected a sharing option. */
  protected readonly displayPrice = computed(() =>
    this.capacityStore.priceFor(
      this.listing().priceByCapacity,
      this.listing().priceFrom,
      periodForAccommodation(this.listing().accommodationType),
    ),
  );
  /** Suffix for the amount above. Never hardcoded in the template, so a nightly rate
   *  cannot render under a monthly label. */
  protected readonly priceSuffix = computed(() => periodSuffix(this.displayPrice().period));

  /**
   * The discounted figure, but only while it is the one `displayPrice()` is quoting.
   *
   * Both come off the "from" room. Selecting a capacity moves `displayPrice()` onto a
   * different room's price, and pairing that with a discount taken from another would strike
   * through a number the seeker was never offered.
   */
  protected readonly discounted = computed(() => {
    const l = this.listing();
    return this.displayPrice().amount === l.priceFrom ? l.discountedPriceFrom : undefined;
  });

  /** What the seeker actually pays — the discount when there is one, otherwise the list price. */
  protected readonly payable = computed(
    () => this.discounted() ?? this.displayPrice().amount,
  );

  /**
   * `25` for a quarter off. Derived rather than read: a stored percentage is a third number
   * that can disagree with the two it describes. Rounded, because "−24.9%" reads as a bug.
   */
  protected readonly discountPercent = computed(() => {
    const off = this.discounted();
    const full = this.displayPrice().amount;
    if (off == null || full <= 0) return null;
    return Math.round((1 - off / full) * 100);
  });
  /** Lazy image loading: indices 0..loadedThrough() have their <img> mounted.
   *  Starts at 2 (first 3 images), then advances one slide ahead as the user pages. */
  private readonly loadedThrough = signal(2);
  /** Image indices whose <img> has finished downloading — a shimmer shows until then. */
  private readonly readyImgs = signal<ReadonlySet<number>>(new Set<number>());

  protected readonly images = computed(() => {
    const im = this.listing().images;
    return im.length ? im : ['https://picsum.photos/seed/hh-fallback/800/800'];
  });

  /** Airbnb-style sliding dot window: show max 5 dots, shrink edge dots. */
  protected readonly visibleDots = computed(() => {
    const total: number = this.images().length;
    const current: number = this.img();
    const maxDots = 5;
    if (total <= maxDots) {
      return Array.from({ length: total }, (_, i) => ({
        idx: i,
        scale: 'full' as const,
      }));
    }
    // Sliding window centered on current
    let start: number = Math.max(0, current - Math.floor(maxDots / 2));
    const end: number = Math.min(total, start + maxDots);
    if (end - start < maxDots) start = end - maxDots;
    const dots: { idx: number; scale: 'full' | 'sm' }[] = [];
    for (let i = start; i < end; i++) {
      const isEdge: boolean = i === start || i === end - 1;
      dots.push({ idx: i, scale: isEdge && total > maxDots ? 'sm' : 'full' });
    }
    return dots;
  });

  protected readonly genderLabel = computed(() =>
    this.label(this.listing().accommodationType),
  );
  /** Property type pill ('Building', 'Apartment', …) — hidden when the BE sends none. */
  protected readonly propertyType = computed(() => this.listing().propertyType ?? '');

  protected readonly featured = computed(() => !!this.listing().isFeatured);
  protected readonly rating = computed(() => this.listing().rating ?? 0);
  protected readonly reviewCount = computed(() => this.listing().reviews ?? 0);
  /**
   * "New" badge — shown alongside the score when the listing has no reviews yet AND was
   * created within the last 3 months. The 0.0 (0) score always shows regardless; only this
   * badge is gated, so an old unreviewed listing isn't flagged as new forever.
   */
  protected readonly isNew = computed(() => {
    if (this.reviewCount() > 0) return false;
    const created = this.listing().createdAt;
    if (!created) return false;
    const createdAt = new Date(created);
    if (Number.isNaN(createdAt.getTime())) return false;
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    return createdAt >= threeMonthsAgo;
  });

  /** "area, city" — the parts we have, blanks dropped so there's never a stray comma. */
  protected readonly locationLine = computed(() => {
    const l = this.listing();
    return [l.area, l.city].filter(Boolean).join(', ');
  });

  /** Names the room type the displayed price belongs to — "2 Sharing" — so the price on
   *  the card is never unattributed. Deliberately mirrors SearchCapacity.priceFor(), which
   *  displayPrice() runs through: the selected capacity wins only when this listing
   *  actually prices it, otherwise the price falls back to priceFrom and the label has to
   *  follow it there rather than keep advertising the filter. That fallback is resolved by
   *  matching the shown price back to a capacity, so a listing whose cheapest tier is the
   *  4-bed still reads "4 Sharing" with no filter applied. Empty when the listing has no
   *  per-capacity pricing, which hides the line instead of printing a placeholder. */
  protected readonly roomTypeLabel = computed(() => {
    const byCapacity = this.listing().priceByCapacity ?? {};
    const selected = this.capacityStore.active();
    const capacity = selected && byCapacity[selected] != null
      ? selected
      : Object.keys(byCapacity).find((c) => byCapacity[c] === this.displayPrice().amount);
    if (!capacity) return '';
    const n = parseInt(capacity, 10);
    if (n === 1) return 'Private';
    if (n >= 5) return 'Dormitory';
    return `Sharing of ${n}`;
  });

  /** Amenity pills. Capped so a hostel with many offers can't push the card taller than
   *  its neighbours in the grid; the overflow becomes a "+N" pill. */
  protected readonly amenityPills = computed(() =>
    (this.listing().offerNames ?? []).slice(0, MAX_AMENITY_PILLS),
  );
  protected readonly extraAmenities = computed(() =>
    Math.max(0, (this.listing().offerNames ?? []).length - MAX_AMENITY_PILLS),
  );

  protected isLoaded(i: number): boolean {
    return i <= this.loadedThrough();
  }

  protected isImgReady(i: number): boolean {
    return this.readyImgs().has(i);
  }

  protected onImgReady(i: number): void {
    this.readyImgs.update((s) => new Set(s).add(i));
  }

  protected step(dir: number, e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    const n = this.images().length;
    this.img.update((i) => Math.max(0, Math.min(n - 1, i + dir)));
    // Keep one slide loaded ahead of the current position (first 3 are already loaded).
    this.loadedThrough.update((m) => Math.max(m, this.img() + 1));
  }

  protected toggleSaved(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    this.favorites.toggle(this.listing());
  }


  private label(g: AccommodationType): string {
    return accommodationLabel(g);
  }
}
