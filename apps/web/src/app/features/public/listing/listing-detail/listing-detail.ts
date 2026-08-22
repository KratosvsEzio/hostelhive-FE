import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DOCUMENT, DecimalPipe, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, fromEvent, map, of, switchMap, take } from 'rxjs';
import { AMENITIES, AccommodationType } from '@hostelhive/data-access';
import { Avatar, Badge, Button, EmptyState, Skeleton, TooltipFixed } from '@hostelhive/ui';
import { StaticMap } from '@hostelhive/maps';
import { HostelsApi, ListingDetailApi } from '@services';
import { Review, StudentApi } from '@services/student-api';
import { SessionStore } from '@core/auth';
import { SITE_ORIGIN, Seo } from '@core/seo';
import { MobileApp } from '@core/mobile-app';
import { AnalyticsService } from '@core/analytics/analytics.service';
import { periodForAccommodation } from '@util/pricing-period';
import { FavoritesStore } from '@util/favorites-store';
import { ListingDetail as ListingDetailModel } from '@services/listing-detail.fixture';
import { accommodationLabel } from '@util/accommodation-type';
import { CurrencySymbolPipe } from '@app/shared/currency/currency-symbol.pipe';
import { CurrencyNamePipe } from '@app/shared/currency/currency-name.pipe';
import { ApiDate } from '@util/api-date';

interface ViewState {
  loading: boolean;
  error: boolean;
  data: ListingDetailModel | null;
}

/** Maps a generic offer slug to the best-fit Tabler icon class. */
function iconForSlug(slug: string): string {
  const s = slug.toLowerCase();
  if (s === 'wifi' || s.includes('wifi') || s.includes('internet')) return 'ti-wifi';
  if (s === 'ac' || s.includes('air-con') || s.includes('cooling')) return 'ti-air-conditioning';
  if (s.includes('kitchen') || s.includes('cook') || s.includes('stove') || s.includes('oven') || s.includes('microwave')) return 'ti-tools-kitchen-2';
  if (s === 'security' || s.includes('security') || s.includes('guard')) return 'ti-shield-check';
  if (s === 'cctv' || s.includes('cctv') || s.includes('camera') || s.includes('surveillance')) return 'ti-device-cctv';
  if (s === 'parking' || s.includes('parking') || s.includes('garage')) return 'ti-car';
  if (s === 'generator' || s.includes('generator') || s.includes('backup-power')) return 'ti-bolt';
  if (s === 'laundry' || s.includes('laundry') || s.includes('washing')) return 'ti-wash-machine';
  if (s.includes('bath') || s.includes('shower') || s.includes('tub')) return 'ti-bath';
  if (s.includes('hot-water') || s.includes('geyser') || s.includes('heater')) return 'ti-temperature';
  if (s.includes('fridge') || s.includes('refrigerator')) return 'ti-fridge';
  if (s.includes('tv') || s.includes('television') || s.includes('cable') || s.includes('entertain')) return 'ti-device-tv';
  if (s.includes('bed') || s.includes('mattress')) return 'ti-bed';
  if (s === 'attached' || s.includes('attached')) return 'ti-bath';
  if (s.includes('staff') || s.includes('personnel') || s.includes('caretaker')) return 'ti-users';
  if (s.includes('clean') || s.includes('housekeep')) return 'ti-sparkles';
  if (s.includes('study') || s.includes('desk') || s.includes('workspace')) return 'ti-desk';
  if (s.includes('lift') || s.includes('elevator')) return 'ti-elevator';
  if (s.includes('gym') || s.includes('fitness')) return 'ti-barbell';
  if (s.includes('pool') || s.includes('swim')) return 'ti-swimming';
  return 'ti-star';
}

/** Tint backgrounds cycled across the room cards (matches mockup 03). */
const ROOM_TINTS = [
  'bg-tint-cream',
  'bg-tint-mint',
  'bg-tint-sky',
  'bg-tint-purple',
  'bg-tint-blue',
];

@Component({
  selector: 'hh-listing-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ApiDate,
    DecimalPipe,
    RouterLink,
    Avatar,
    Badge,
    Button,
    EmptyState,
    Skeleton,
    StaticMap,
    TooltipFixed,
    CurrencySymbolPipe,
    CurrencyNamePipe,
  ],
  templateUrl: './listing-detail.html',
})
export class ListingDetail {
  private readonly api = inject(ListingDetailApi);
  private readonly hostelsApi = inject(HostelsApi);
  private readonly studentApi = inject(StudentApi);
  private readonly session = inject(SessionStore);
  private readonly favorites = inject(FavoritesStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  /** Drives the contact bar's lift over the seeker tab bar — see listing-detail.html. */
  protected readonly mobile = inject(MobileApp);
  private readonly destroyRef = inject(DestroyRef);
  private readonly doc = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly seo = inject(Seo);
  private readonly analytics = inject(AnalyticsService);

  protected readonly phoneValue = signal<string | null>(null);
  protected readonly phoneLoading = signal(false);
  protected readonly phoneError = signal(false);
  protected readonly modalOpen = signal(false);
  protected readonly loginGateOpen = signal(false);
  protected readonly copied = signal(false);
  protected readonly shareOpen = signal(false);
  protected readonly shareLinkCopied = signal(false);
  protected readonly descriptionModalOpen = signal(false);
  protected readonly reviewsOpen = signal(false);
  protected readonly reviewScore = signal(0);
  protected readonly reviewComment = signal('');
  protected readonly reviewHover = signal<number | null>(null);
  protected readonly reviewSubmitting = signal(false);
  protected readonly reviewSubmitError = signal('');
  protected readonly reviewSubmitSuccess = signal(false);
  protected readonly reviews = signal<Review[]>([]);
  protected readonly reviewsLoading = signal(false);
  protected readonly reviewsError = signal(false);
  /**
   * The review-request notification this review is submitted against. Reviews POST to
   * `/api/notifications/:id/add_review`, so a review can only be left when the user arrived
   * from a review-request notification (deep-linked as `?review=<notificationId>`); the rating
   * form is hidden otherwise and the modal just shows existing reviews.
   */
  protected readonly reviewNotificationId = signal('');

  protected readonly isLoggedIn = computed(() => this.session.isAuthenticated());
  protected readonly canReview = computed(() => !!this.reviewNotificationId());
  protected readonly displayScore = computed(() => this.reviewHover() ?? this.reviewScore());
  protected readonly canSubmitReview = computed(() => this.reviewScore() > 0 && this.reviewComment().trim().length > 0);
  protected readonly stars = [1, 2, 3, 4, 5];

  /** Indexes of review comments expanded ("Show more"). Keyed by position because the API
   *  returns the hostel id on every review, so review.id is not unique. */
  protected readonly expandedReviews = signal<ReadonlySet<number>>(new Set());

  /** How many reviews the in-page section shows before deferring to the modal. */
  protected readonly previewReviewCount = 6;

  /**
   * Expansion state for the in-page preview. Deliberately separate from
   * {@link expandedReviews}: closeReviews() clears the modal's set, which would otherwise
   * collapse whatever the user had opened on the page behind it.
   */
  protected readonly expandedPreview = signal<ReadonlySet<number>>(new Set());

  /** Airbnb-style header: average score + per-star distribution, derived from the real reviews. */
  protected readonly reviewStats = computed(() => {
    const list = this.reviews();
    const total = list.length;
    const buckets = [5, 4, 3, 2, 1].map((star) => {
      const count = list.filter((r) => Math.round(r.score) === star).length;
      return { star, count, pct: total ? Math.round((count / total) * 100) : 0 };
    });
    const avg = total
      ? list.reduce((sum, r) => sum + r.score, 0) / total
      : (this.state().data?.rating ?? 0);
    return { total, buckets, avg };
  });

  protected pendingAction: 'modal' | 'whatsapp' | null = null;

  protected readonly currentPath = computed(() => {
    const slug = this.state().data?.slug;
    return slug ? `/hostel/${slug}` : '/';
  });

  protected readonly skeletons = [1, 2, 3];

  protected readonly saved = computed(() => {
    const id = this.state().data?.id;
    return id ? this.favorites.isFavorite(id) : false;
  });

  protected toggleSaved(): void {
    // Saving hits the authenticated favourites API — firing it signed-out returns 401.
    // Send unauthenticated users straight to the Log in tab (?mode=login), returning
    // here after — favouriting implies they likely already have an account (B3).
    if (!this.session.isAuthenticated()) {
      void this.router.navigate(['/auth'], {
        queryParams: { mode: 'login', returnUrl: this.currentPath() },
      });
      return;
    }
    const listing = this.state().data;
    if (listing) this.favorites.toggle(listing);
  }

  private readonly _state = signal<ViewState>({ loading: true, error: false, data: null });
  protected readonly state = this._state.asReadonly();

  protected readonly lightboxIndex = signal<number | null>(null);
  protected readonly lightboxImages = computed(() => this.state().data?.images ?? []);

  /** Gallery thumbnails — up to 4 images after the hero to fill the 2×2 grid. */
  protected readonly thumbs = computed(
    () => this.state().data?.images.slice(1, 5) ?? [],
  );

  /** Offer rows with resolved icon and human-readable label. */
  protected readonly amenityList = computed(() => {
    const d = this.state().data;
    const items = d?.offers?.length
      ? d.offers
      : (d?.amenities ?? []).map((slug) => ({ slug, name: AMENITIES[slug]?.label ?? slug }));
    return items.map((item) => ({
      key: item.slug,
      icon: AMENITIES[item.slug]?.icon ?? iconForSlug(item.slug),
      label: item.name,
    }));
  });

  protected readonly roomSummary = computed(() => {
    const l = this.state().data;
    if (!l?.rooms?.length) return '';
    const beds = l.rooms.reduce((sum, r) => sum + r.capacity, 0);
    return `${beds} beds · ${l.rooms.length} room types · ${l.sharing.length} sharing options`;
  });

  protected readonly sharingSummary = computed(() => {
    const sharing = this.state().data?.sharing ?? [];
    const labels = sharing.map((s) => s.replace('-sharing', ''));
    return labels.length ? `${labels.join(', ')}-sharing available` : '';
  });

  protected readonly revealed = computed(() => this.phoneValue() !== null);

  protected readonly whatsAppUrl = computed(() => {
    const phone = this.phoneValue();
    const l = this.state().data;
    if (!phone || !l) return null;
    const digits = phone.replace(/\D/g, '');
    const listingUrl = `${this.doc.location.origin}/hostel/${l.slug}`;
    const text = encodeURIComponent(
      `Hi, I am interested in renting a room at your hostel ${l.name} for Rs ${l.priceFrom.toLocaleString()} / month in ${l.area}, ${l.city}.\n\nLink: ${listingUrl}`,
    );
    return `https://api.whatsapp.com/send/?phone=${digits}&text=${text}&type=phone_number&app_absent=0`;
  });

  protected openShare(): void {
    this.shareOpen.set(true);
  }

  protected closeShare(): void {
    this.shareOpen.set(false);
    this.shareLinkCopied.set(false);
  }

  protected copyShareLink(): void {
    navigator.clipboard.writeText(this.doc.location.href).then(() => {
      this.shareLinkCopied.set(true);
      setTimeout(() => this.shareLinkCopied.set(false), 2500);
    });
  }

  protected shareVia(platform: 'whatsapp' | 'facebook' | 'twitter' | 'email' | 'native'): void {
    const href = this.doc.location.href;
    const url = encodeURIComponent(href);
    const l = this.state().data;
    const title = encodeURIComponent(l?.name ?? 'Check out this hostel on HostelHive');
    const text = encodeURIComponent(`Check out ${l?.name ?? 'this hostel'} on HostelHive: ${href}`);

    if (platform === 'native') {
      if (navigator.share) navigator.share({ title: l?.name ?? '', url: href }).catch(() => {});
      return;
    }

    if (platform === 'email') {
      window.location.href = `mailto:?subject=${title}&body=${text}`;
      return;
    }

    const links: Record<string, string> = {
      whatsapp: `https://wa.me/?text=${text}`,
      facebook: `https://www.facebook.com/sharer.php?u=${url}`,
      twitter: `https://twitter.com/intent/tweet?url=${url}&text=${title}`,
    };

    const link = links[platform];
    if (link) window.open(link, '_blank', 'noopener,noreferrer');
  }

  protected openModal(): void {
    if (!this.session.isAuthenticated()) {
      this.loginGateOpen.set(true);
      this.analytics.track('lead_wall_shown', { intent: 'contact' });
      return;
    }
    if (this.revealed()) { this.modalOpen.set(true); return; }
    this.pendingAction = 'modal';
    this.fetchPhone();
  }

  protected openWhatsApp(): void {
    if (!this.session.isAuthenticated()) {
      this.loginGateOpen.set(true);
      this.analytics.track('lead_wall_shown', { intent: 'whatsapp' });
      return;
    }
    const url = this.whatsAppUrl();
    if (url) { window.open(url, '_blank', 'noopener'); return; }
    this.pendingAction = 'whatsapp';
    this.fetchPhone();
  }

  protected closeLoginGate(): void {
    this.loginGateOpen.set(false);
  }

  protected goToAuth(): void {
    this.loginGateOpen.set(false);
    void this.router.navigate(['/auth'], { queryParams: { returnUrl: this.currentPath() } });
  }

  protected closeModal(): void {
    this.modalOpen.set(false);
  }

  protected copyPhone(): void {
    const phone = this.phoneValue();
    if (!phone) return;
    navigator.clipboard.writeText(phone).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  private fetchPhone(): void {
    const id = this.state().data?.id;
    if (!id || this.phoneLoading()) return;
    this.phoneLoading.set(true);
    this.phoneError.set(false);
    this.hostelsApi.showPhone(id)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (phone) => {
          this.phoneLoading.set(false);
          if (phone) {
            this.phoneValue.set(phone);
            const listing = this.state().data;
            if (listing) {
              this.analytics.track('lead_submitted', {
                listing_id: listing.id,
                city: listing.city,
              });
            }
            if (this.pendingAction === 'modal') this.modalOpen.set(true);
            if (this.pendingAction === 'whatsapp') {
              const url = this.whatsAppUrl();
              if (url) window.open(url, '_blank', 'noopener');
            }
          } else {
            this.phoneError.set(true);
          }
          this.pendingAction = null;
        },
        error: () => {
          this.phoneLoading.set(false);
          this.phoneError.set(true);
          this.pendingAction = null;
        },
      });
  }

  protected openReviews(): void {
    this.reviewsOpen.set(true);
    // Reviews are fetched on listing load; only (re)fetch if that hasn't produced any yet.
    if (!this.reviews().length) this.fetchReviews();
  }

  protected closeReviews(): void {
    this.reviewsOpen.set(false);
    this.reviewScore.set(0);
    this.reviewComment.set('');
    this.reviewHover.set(null);
    this.reviewSubmitError.set('');
    this.reviewSubmitSuccess.set(false);
    this.reviewNotificationId.set('');
    this.expandedReviews.set(new Set());
  }

  protected isReviewExpanded(index: number): boolean {
    return this.expandedReviews().has(index);
  }

  protected isPreviewExpanded(index: number): boolean {
    return this.expandedPreview().has(index);
  }

  protected togglePreviewExpanded(index: number): void {
    this.expandedPreview.update((s) => {
      const next = new Set(s);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  protected toggleReviewExpanded(index: number): void {
    this.expandedReviews.update((s) => {
      const next = new Set(s);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  /** Long comments get a "Show more" toggle; short ones render in full with no control. */
  protected isLongComment(text: string): boolean {
    return (text?.length ?? 0) > 200;
  }

  protected submitReview(): void {
    // Reviews are submitted against the review-request notification, not the hostel.
    const notificationId = this.reviewNotificationId();
    if (!notificationId || !this.canSubmitReview() || this.reviewSubmitting()) return;
    this.reviewSubmitting.set(true);
    this.reviewSubmitError.set('');
    this.studentApi
      .addReview(notificationId, this.reviewScore(), this.reviewComment().trim())
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.reviewSubmitting.set(false);
          this.reviewSubmitSuccess.set(true);
          this.reviewScore.set(0);
          this.reviewComment.set('');
          this.fetchReviews();
          setTimeout(() => this.closeReviews(), 1200);
        },
        error: () => {
          this.reviewSubmitting.set(false);
          this.reviewSubmitError.set('Failed to submit review. Please try again.');
        },
      });
  }

  protected fetchReviews(): void {
    const hostelId = this.state().data?.id;
    if (!hostelId) return;
    this.reviewsLoading.set(true);
    this.reviewsError.set(false);
    this.studentApi
      .getReviews(hostelId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.reviews.set(r);
          this.reviewsLoading.set(false);
        },
        error: () => {
          this.reviewsLoading.set(false);
          this.reviewsError.set(true);
        },
      });
  }

  protected openLightbox(index: number): void {
    this.lightboxIndex.set(index);
    this.doc.body.style.overflow = 'hidden';
  }

  protected closeLightbox(): void {
    this.lightboxIndex.set(null);
    this.doc.body.style.overflow = '';
  }

  protected prevImage(): void {
    const i = this.lightboxIndex();
    if (i !== null && i > 0) this.lightboxIndex.set(i - 1);
  }

  protected nextImage(): void {
    const i = this.lightboxIndex();
    const max = this.lightboxImages().length - 1;
    if (i !== null && i < max) this.lightboxIndex.set(i + 1);
  }

  constructor() {
    // Deep-link from a "review request" notification: /hostel/:slug?review=<notificationId>
    // opens the review modal once the listing has loaded, carrying the notification id the
    // review is submitted against. Browser-only — there is no modal to open during SSR.
    const reviewParam = this.isBrowser
      ? this.route.snapshot.queryParamMap.get('review')
      : null;
    let openReviewOnLoad = !!reviewParam;

    // Runs on the server too, deliberately. This is the app's most valuable page for
    // search, and a crawler that does not execute JavaScript only ever sees the
    // server-rendered HTML — skipping the fetch here served every listing as an empty
    // skeleton with no name, price or description to index.
    //
    // It is safe because `getBySlug` hits `GET /public/hostel_detail/:id`, which needs
    // no token. (An older comment here claimed it called `/api/hostels/:id` and could
    // not authenticate on the server; that is not the endpoint it uses. The search
    // page already fetches `/public/hostels` during SSR on the same basis.)
    this.route.paramMap.pipe(
      map((p) => p.get('slug') ?? ''),
      distinctUntilChanged(),
      switchMap((slug) => {
        this._state.set({ loading: true, error: false, data: null });
        return this.api.getBySlug(slug).pipe(
          map((data): ViewState => ({ loading: false, error: false, data: data ?? null })),
          catchError(() => of<ViewState>({ loading: false, error: true, data: null })),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((s) => {
      this._state.set(s);
      this.applySeo(s);
      // Everything below touches the DOM or the address bar — browser only.
      if (!this.isBrowser) return;
      if (s.data) {
        this.analytics.track('listing_viewed', {
          listing_id: s.data.id,
          city: s.data.city,
          accommodation_type: s.data.accommodationType,
        });
      }
      // Load reviews up front so the in-page reviews section renders them without a click.
      if (s.data) this.fetchReviews();
      if (s.data && openReviewOnLoad) {
        openReviewOnLoad = false;
        this.reviewNotificationId.set(reviewParam ?? '');
        this.openReviews();
        // Drop the param so a refresh (or the back button) doesn't reopen the modal.
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { review: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }
    });

    fromEvent<KeyboardEvent>(this.doc, 'keydown').pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((e) => {
      if (e.key === 'Escape') {
        if (this.lightboxIndex() !== null) this.closeLightbox();
        else if (this.reviewsOpen()) this.closeReviews();
        else if (this.modalOpen()) this.closeModal();
        else if (this.descriptionModalOpen()) this.descriptionModalOpen.set(false);
      } else if (this.lightboxIndex() !== null) {
        if (e.key === 'ArrowLeft') this.prevImage();
        else if (e.key === 'ArrowRight') this.nextImage();
      }
    });
  }

  /**
   * Head metadata + structured data for the loaded listing.
   *
   * Runs on the server as well as the browser: without it every listing shared the
   * app's single default title and description, so thousands of pages looked identical
   * to a crawler and competed with one another for the same terms.
   *
   * The JSON-LD is `LodgingBusiness` — the closest schema.org type for a hostel that
   * takes an address, geo coordinates, a price range and an aggregate rating. Optional
   * blocks are omitted rather than emitted empty: an `aggregateRating` with zero
   * reviews, or an address with blank fields, is treated as invalid markup and can cost
   * the rich result entirely.
   */
  private applySeo(s: ViewState): void {
    this.seo.clearJsonLd('listing');
    const l = s.data;

    if (!l) {
      // Missing or failed: never let a not-found page into the index.
      this.seo.apply({
        title: 'Listing not found — HostelHive',
        description: 'This hostel listing is unavailable or the link is incorrect.',
        noindex: true,
      });
      return;
    }

    const location = [l.area, l.city].filter(Boolean).join(', ');
    const genderLabel = this.genderLabel(l.accommodationType);
    // Backpacker beds are priced per night, everything else per month. The old copy said
    // "/month" for both, which misprices a backpacker hostel in every search result.
    const per = periodForAccommodation(l.accommodationType) === 'nightly' ? 'night' : 'month';
    const price = l.priceFrom
      ? `from Rs ${l.priceFrom.toLocaleString('en-PK')}/${per}`
      : '';

    // Front-load the terms people actually search: name, then gender + location, then
    // price. Descriptions are truncated around 160 characters in results, so the
    // listing's own copy goes last where a cut costs least.
    const description = [
      `${genderLabel} hostel in ${location}${price ? `, ${price}` : ''}.`,
      l.verified ? 'Verified listing on HostelHive.' : '',
      l.description?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() ?? '',
    ]
      .filter(Boolean)
      .join(' ')
      .slice(0, 300);

    // The shared card, which is where this site actually spreads. Leads with what the
    // place is rather than its name, and carries the two facts that decide a click here:
    // price, and whether meals are included.
    const socialTitle = [
      `${genderLabel} hostel in ${location}`,
      l.priceFrom ? `Rs ${l.priceFrom.toLocaleString('en-PK')}/${per === 'night' ? 'night' : 'mo'}` : '',
      this.hasMess(l) ? 'Mess included' : '',
      l.verified ? 'Verified' : '',
    ]
      .filter(Boolean)
      .join(' · ');

    this.seo.apply({
      title: `${l.name} — ${genderLabel} hostel in ${location} | HostelHive`,
      socialTitle,
      description,
      path: `/hostel/${l.slug ?? ''}`,
      image: l.images?.[0],
    });

    const jsonLd: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'LodgingBusiness',
      name: l.name,
      url: `${SITE_ORIGIN}/hostel/${l.slug ?? ''}`,
      address: {
        '@type': 'PostalAddress',
        addressLocality: l.city,
        addressRegion: l.area,
        addressCountry: 'PK',
      },
    };
    if (l.description) jsonLd['description'] = description;
    if (l.images?.length) jsonLd['image'] = l.images.slice(0, 6);
    if (l.priceFrom) {
      jsonLd['priceRange'] = `From PKR ${l.priceFrom}`;
    }
    if (l.lat && l.lng) {
      jsonLd['geo'] = { '@type': 'GeoCoordinates', latitude: l.lat, longitude: l.lng };
    }
    // Only with at least one real review — Google rejects a rating with no count.
    if (l.rating && l.reviews) {
      jsonLd['aggregateRating'] = {
        '@type': 'AggregateRating',
        ratingValue: l.rating,
        reviewCount: l.reviews,
        bestRating: 5,
        worstRating: 1,
      };
    }
    if (l.amenities?.length) {
      jsonLd['amenityFeature'] = l.amenities.map((a) => ({
        '@type': 'LocationFeatureSpecification',
        name: a,
        value: true,
      }));
    }

    this.seo.setJsonLd('listing', jsonLd);
  }

  protected roomTint(index: number): string {
    return ROOM_TINTS[index % ROOM_TINTS.length];
  }

  /**
   * Whether the hostel feeds its residents.
   *
   * Not a field: mess is one of the host's free-text offers, so this matches the same
   * words `offerIcon` does. It is the single most asked question about a Pakistani
   * hostel, which is why it earns a place in the shared card and the structured data.
   */
  private hasMess(l: { offerNames?: string[]; amenities?: string[] }): boolean {
    const words = [...(l.offerNames ?? []), ...(l.amenities ?? [])].join(' ').toLowerCase();
    return /\bmess\b|meal|food|dining/.test(words);
  }

  protected genderLabel(g: AccommodationType): string {
    return accommodationLabel(g);
  }

  protected initials(name: string): string {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
}
