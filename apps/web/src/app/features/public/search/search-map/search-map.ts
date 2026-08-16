import type * as L from 'leaflet';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  PLATFORM_ID,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  catchError,
  debounceTime,
  EMPTY,
  filter,
  of,
  startWith,
  switchMap,
  tap,
} from 'rxjs';
import { Gender, Listing, Paginated } from '@hostelhive/data-access';
import { FavoritesStore } from '@util/favorites-store';
import { MobileApp } from '@core/mobile-app';
import { ListingsApi, OffersApi, SearchCapacity } from '@services';
import { GeolocationService, PlaceResult, PlaceSearchField, SharedMap } from '@hostelhive/maps';
import { SearchFilters } from '@features/public/search/search-filters/search-filters';
import { ListingCard } from '@features/public/search/listing-card/listing-card';

/** Map viewport as the backend wants it — `f[bounding][…]` is a geo_bounding_box on `location`. */
interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** URL keys carrying the viewport. Named after the corners (Airbnb uses the same shape) so a
 *  shared link is self-describing; `zoom` is deliberately NOT one of them — it already means
 *  "the zoom implied by the searched place type" and is consumed by fitTo() with `center`. */
/** Same glyph per gender that hh-badge picks by default, so the map card's pill matches a
 *  listing card's. Duplicated rather than imported because this markup is built as raw DOM
 *  for a Leaflet marker and never goes through the Badge component. */
const GENDER_ICON: Record<Gender, string> = {
  boys: 'ti-gender-male',
  girls: 'ti-gender-female',
  coliving: 'ti-users',
};

const NE_LAT = 'ne_lat';
const NE_LNG = 'ne_lng';
const SW_LAT = 'sw_lat';
const SW_LNG = 'sw_lng';

/** Cleared together whenever a new place search invalidates the old viewport. */
const BOUNDS_KEYS_NULLED = {
  [NE_LAT]: null,
  [NE_LNG]: null,
  [SW_LAT]: null,
  [SW_LNG]: null,
} as const;

/** ~0.1 m — matches captureMapBounds()'s 1e-6 no-op threshold, and keeps the URL readable. */
const roundCoord = (n: number): number => +n.toFixed(6);

/** Resting positions of the mobile results sheet, from just-peeking to covering the map. */
type SheetSnap = 'peek' | 'half' | 'full';

/**
 * Unified search experience — an Airbnb-style split: a column of listing cards on the
 * left and a live Leaflet map on the right (desktop shows both; mobile toggles between
 * them). Clicking a price pin opens a rich popup card (photo carousel, gender badge,
 * rating, tags, price) anchored to the marker, mirroring Airbnb's map. SSR-safe: all
 * map work runs in afterNextRender.
 */
@Component({
  selector: 'hh-search-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SearchFilters, ListingCard, PlaceSearchField],
  templateUrl: './search-map.html',
})
export class SearchMap {
  private readonly api = inject(ListingsApi);
  private readonly favorites = inject(FavoritesStore);
  private readonly capacityStore = inject(SearchCapacity);

  /** Slug → offer ID map, populated once the offer-categories API resolves. */
  private readonly _offerCategories = toSignal(
    inject(OffersApi).categories().pipe(catchError(() => of([]))),
  );
  private readonly _slugToId = computed(() =>
    new Map(
      (this._offerCategories() ?? []).flatMap((c) => c.offers).map((o) => [o.slug, +o.id]),
    ),
  );
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sharedMap = inject(SharedMap);
  private readonly geo = inject(GeolocationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef).nativeElement as HTMLElement;
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  /**
   * The mobile app renders the seeker bottom tab bar over this route, and it sits at
   * the same `z-40` as the floating List/Map pill — so without lifting, the pill is
   * drawn behind it. Search is inside the seeker area, so `isMobile` matches the
   * app-level `showSeekerTabs` condition here.
   */
  protected readonly mobile = inject(MobileApp);
  private readonly mapEl = viewChild.required<ElementRef<HTMLElement>>('mapEl');

  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: null,
  });
  protected readonly gender = computed<Gender | 'all'>(
    () => (this.params()?.get('gender') as Gender | 'all') ?? 'all',
  );
  protected readonly sort = computed(
    () => this.params()?.get('sort') ?? 'recommended',
  );
  protected readonly amenities = computed(
    () => this.params()?.get('amenities')?.split(',').filter(Boolean) ?? [],
  );
  private readonly center = computed(
    () => {
      const p = this.params();
      const lat = p?.get('lat');
      const lng = p?.get('lng');
      return lat && lng ? { lat: +lat, lng: +lng } : null;
    },
    // Only emit when the coordinates actually change, so the recenter effect ignores
    // unrelated query-param edits (budget, sharing, sort, page…).
    { equal: (a, b) => a?.lat === b?.lat && a?.lng === b?.lng },
  );
  /** Map zoom carried by the searched place's type (province 8 · city 10 · area 15…). */
  private readonly placeZoom = computed(() => {
    const z = this.params()?.get('zoom');
    return z ? +z : null;
  });
  protected readonly placeLabel = computed(() => {
    const place = this.params()?.get('place') || this.params()?.get('city');
    return place ? ' near ' + place : ' in this area';
  });

  /** Current place label shown in the mobile search input, kept in sync with the URL. */
  protected readonly placeText = computed(
    () => this.params()?.get('place') ?? this.params()?.get('city') ?? '',
  );

  /**
   * Viewport carried in the URL, if any. Read at construction to seed `mapBounds` and to
   * point the initial camera, so a refresh or a pasted link reproduces the same map area
   * — NOT a live dependency of `query()`, which tracks the real map via `mapBounds`.
   * Keeping it seed-only is what lets `recenterTo()` drop the viewport by nulling
   * `mapBounds`; a standing fallback here would resurrect the stale box.
   */
  private readonly urlBounds = computed<Bounds | null>(() => {
    const p = this.params();
    const raw = [p?.get(NE_LAT), p?.get(NE_LNG), p?.get(SW_LAT), p?.get(SW_LNG)];
    if (raw.some((v) => !v)) return null;
    const [north, east, south, west] = raw.map(Number);
    if (![north, east, south, west].every(Number.isFinite)) return null;
    // A degenerate or inverted box would silently match nothing server-side.
    if (north <= south || east <= west) return null;
    return { north, south, east, west };
  });

  /** Map viewport bounds — updated on every idle event (zoom/pan), seeded from the URL. */
  private readonly mapBounds = signal<Bounds | null>(this.urlBounds());
  protected readonly page = signal(1);

  private readonly query = computed(() => {
    const p = this.params();
    const min = p?.get('minPrice');
    const max = p?.get('maxPrice');
    const c = this.center();
    const amenities = this.amenities();
    const mb = this.mapBounds();
    const slugToId = this._slugToId();
    const offerIds = amenities
      .map((slug) => slugToId.get(slug))
      .filter((id): id is number => id != null);
    return {
      gender: this.gender(),
      propertyType: p?.get('propertyType') || undefined,
      capacity: p?.get('capacity') || undefined,
      city: c || mb ? undefined : p?.get('city') || undefined,
      near: !mb && c ? { lat: c.lat, lng: c.lng } : undefined,
      bounds: mb ?? undefined,
      minPrice: min ? +min : undefined,
      maxPrice: max ? +max : undefined,
      amenities: amenities.length ? amenities : undefined,
      offerIds: offerIds.length ? offerIds : undefined,
      sort:
        (this.sort() as
          | 'recommended'
          | 'newest'
          | 'oldest'
          | 'price-asc'
          | 'price-desc') || undefined,
      page: this.page(),
    };
  },
  // `query()` reads the whole ParamMap, so ANY query-param edit recomputes it and — with a
  // fresh object literal each time — would re-fire the search. Mirroring the viewport into
  // the URL does exactly that, so compare by value: a structurally identical query is a no-op.
  { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) });

  /** True while a search request is in flight — drives the skeleton cards. */
  protected readonly loading = signal(true);
  /** True while an append fetch (page > 1) is in flight — drives the bottom spinner row. */
  protected readonly loadingMore = signal(false);
  /** Results accumulated across pages — the infinite-scroll list. */
  private readonly accumulated = signal<Listing[]>([]);
  /** Guards against double page-increments while an append is queued/in flight. */
  private pendingMore = false;
  /** Query identity (minus page) of the in-flight request / last applied result. */
  private inFlightKey = '';
  private lastQueryKey = '';
  /** Set when a search fails for a non-transient reason (5xx / network) — drives the inline
   *  error panel + "Try again", as distinct from an empty result set (0 hostels found). */
  protected readonly loadError = signal(false);
  /** Placeholder slots rendered as skeleton cards while a search loads. */
  protected readonly skeletons = [0, 1, 2, 3, 4, 5];
  /** Seconds until the search auto-retries after a 429 (rate limit); 0 = not throttled. */
  protected readonly cooldown = signal(0);
  /** Bumped to re-fire the search once the cooldown elapses (or via "Retry now"). */
  private readonly retryTick = signal(0);
  private cooldownTimer?: ReturnType<typeof setInterval>;
  private readonly result = toSignal(
    toObservable(
      computed(() => {
        this.retryTick(); // dependency: bumping this re-fires the search after a cooldown
        return this.query();
      }),
    ).pipe(
      debounceTime(600),
      // While rate-limited, ignore query changes (map pans, filter edits) so we don't keep
      // hammering the throttled endpoint — only the post-cooldown retry re-fires the call.
      filter(() => this.cooldown() === 0),
      tap((q) => {
        // Page 1 = fresh search (skeletons); page > 1 = append (keep the list, show the spinner row).
        if (q.page && q.page > 1) this.loadingMore.set(true);
        else this.loading.set(true);
        this.loadError.set(false); // a fresh attempt clears any prior error
      }),
      switchMap((q) => {
        this.inFlightKey = JSON.stringify({ ...q, page: 0 });
        return this.api.list(q).pipe(
          catchError((err: unknown) => {
            this.loading.set(false);
            this.loadingMore.set(false);
            this.pendingMore = false;
            // The error interceptor normalises failures to ApiError ({ status, code, message }).
            const status = (err as { status?: number } | null)?.status;
            if (status === 429) {
              this.beginCooldown();
              return EMPTY; // keep the last results visible while throttled (see the cooldown banner)
            }
            // Hard failure (5xx / network): clear the stale list and show the error state. The
            // app-wide toast already fired from the interceptor; this is the in-context recovery.
            this.loadError.set(true);
            return of({
              items: [],
              total: 0,
              page: 1,
              pageSize: 20,
            } as Paginated<Listing>);
          }),
        );
      }),
      tap((res) => {
        this.loading.set(false);
        this.loadingMore.set(false);
        this.pendingMore = false;
        this.cooldown.set(0); // a successful response clears any lingering throttle state
        this.applyResult(res);
      }),
      startWith({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
      } as Paginated<Listing>),
    ),
    {
      initialValue: {
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
      } as Paginated<Listing>,
    },
  );

  /** The infinite list: pages accumulate here (page 1 replaces, page n appends). */
  protected readonly listings = computed(() => this.accumulated());
  protected readonly totalResults = computed(() => this.result().total);
  /** Airbnb-style heading, e.g. "54 stays near Karachi" / "391 stays in this area". */
  protected readonly resultsLabel = computed(() => {
    const n = this.totalResults();
    return `${n.toLocaleString('en-US')} hostel${n === 1 ? '' : 's'} within map area`;
  });
  protected readonly totalPages = computed(() => {
    const r = this.result();
    // Prefer the API's own page count; fall back to deriving it from total / pageSize.
    return Math.max(1, r.totalPages ?? Math.ceil(r.total / r.pageSize));
  });

  /** More pages exist beyond what the infinite list has loaded. */
  protected readonly hasMore = computed(
    () => this.listings().length > 0 && this.page() < this.totalPages(),
  );

  /** Sentinel div at the tail of the results — intersecting it loads the next page. */
  private readonly sentinel = viewChild<ElementRef<HTMLElement>>('sentinel');
  private observer?: IntersectionObserver;

  /**
   * Replace or append the accumulated list. Page 1 (or any change to the
   * non-page query — filters, place, map bounds) restarts the list; later
   * pages append, deduped by id in case the backend shifts between fetches.
   */
  private applyResult(res: Paginated<Listing>): void {
    if ((res.page ?? 1) <= 1 || this.inFlightKey !== this.lastQueryKey) {
      this.accumulated.set(res.items);
    } else {
      const seen = new Set(this.accumulated().map((l) => l.id));
      this.accumulated.update((list) => [
        ...list,
        ...res.items.filter((l) => !seen.has(l.id)),
      ]);
    }
    this.lastQueryKey = this.inFlightKey;
  }

  /** Advance the infinite list by one page (no-op while a fetch is queued/in flight). */
  protected loadMore(): void {
    if (this.pendingMore || this.loading() || this.loadingMore()) return;
    if (this.cooldown() > 0 || this.loadError()) return;
    if (this.page() >= this.totalPages()) return;
    this.pendingMore = true;
    this.page.update((p) => p + 1);
  }

  protected readonly active = signal<string | null>(null);
  /** Listing whose Airbnb-style popup card is open on the map (null = none). */
  protected readonly selected = signal<string | null>(null);

  // ── Mobile bottom sheet ────────────────────────────────────────────────────
  /**
   * Below the split breakpoint the results are an Airbnb-style bottom sheet dragged over
   * a full-screen map, instead of a pane the List/Map toggle swaps in. Reactive (not a
   * one-off matchMedia read) so the template re-renders when the viewport crosses 950px.
   */
  protected readonly narrow = signal(false);
  /** Where the sheet is parked: a peeking header, half height, or covering the map. */
  protected readonly snap = signal<SheetSnap>('peek');
  /** Live translateY while a drag is in flight; null when the sheet is resting on a snap. */
  private readonly dragOffset = signal<number | null>(null);
  protected readonly dragging = computed(() => this.dragOffset() !== null);
  /** Viewport height, tracked so the snap offsets survive rotation and browser-chrome shifts. */
  private readonly viewportH = signal(0);
  /** Height of the peeking header (drag handle + result count) left visible at 'peek'. */
  private readonly PEEK_H = 108;

  private dragStartY = 0;
  private dragStartOffset = 0;

  /** Listing backing the mobile bottom card (desktop anchors its card to the pin instead). */
  protected readonly selectedListing = computed(() => {
    const id = this.selected();
    return id ? (this.listings().find((l) => l.id === id) ?? null) : null;
  });

  /**
   * Sheet height: everything below the site header. Dragged fully open the sheet covers
   * the filter bar too, so the list gets the whole screen — only the header stays put, to
   * keep a way out of the page.
   */
  /**
   * Space the fixed bottom tab bar occupies, measured rather than assumed so the
   * device's safe-area inset is included. 0 when the bar is not rendered (web, or
   * anything wider than the phone breakpoint).
   *
   * The sheet has to stop short of it: at 'peek' the sheet is translated down until
   * only PEEK_H of it remains on screen, and without this that strip lands *behind*
   * the tab bar — the grab handle and result count end up unreachable.
   */
  private readonly tabBarH = signal(0);

  private measureTabBar(): void {
    const nav = document.querySelector('app-seeker-tab-bar nav');
    this.tabBarH.set(nav ? Math.round(nav.getBoundingClientRect().height) : 0);
  }

  /** Height the sheet is laid out at — viewport minus the header above and the tab bar below. */
  protected readonly sheetHeightCss = computed(() =>
    this.narrow()
      ? `calc(100dvh - var(--hh-header-top, 0px) - ${this.tabBarH()}px)`
      : null,
  );

  private sheetHeight(): number {
    const top =
      parseFloat(
        getComputedStyle(this.host).getPropertyValue('--hh-header-top'),
      ) || 0;
    return Math.max(0, this.viewportH() - top - this.tabBarH());
  }

  /** translateY (px) that parks the sheet at a given snap — 0 covers the map. */
  private snapOffset(s: SheetSnap): number {
    const h = this.sheetHeight();
    if (s === 'full') return 0;
    if (s === 'half') return Math.round(h * 0.46);
    return Math.max(0, h - this.PEEK_H);
  }

  protected readonly sheetTransform = computed(() => {
    if (!this.narrow()) return '';
    const y = this.dragOffset() ?? this.snapOffset(this.snap());
    return `translate3d(0, ${y}px, 0)`;
  });

  protected onSheetPointerDown(e: PointerEvent): void {
    if (!this.narrow()) return;
    this.dragStartY = e.clientY;
    this.dragStartOffset = this.snapOffset(this.snap());
    this.dragOffset.set(this.dragStartOffset);
    // Capture keeps the move/up events coming to the handle even once the finger slides
    // off it. It throws for a pointer id the element never saw, which must not abort the
    // drag we have already started.
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* drag still works without capture */
    }
  }

  protected onSheetPointerMove(e: PointerEvent): void {
    if (this.dragOffset() === null) return;
    const max = Math.max(0, this.sheetHeight() - this.PEEK_H);
    const next = this.dragStartOffset + (e.clientY - this.dragStartY);
    this.dragOffset.set(Math.min(Math.max(0, next), max));
  }

  protected onSheetPointerUp(): void {
    const y = this.dragOffset();
    if (y === null) return;
    this.dragOffset.set(null);
    // A press that never really moved is a tap on the header, not a drag — toggle instead
    // of snapping, so the sheet still opens for anyone who taps rather than swipes.
    if (Math.abs(y - this.dragStartOffset) < 6) {
      this.snap.update((s) => (s === 'peek' ? 'full' : 'peek'));
      return;
    }
    // Settle on whichever snap the sheet was released nearest to.
    let best: SheetSnap = this.snap();
    let bestDist = Infinity;
    for (const s of ['full', 'half', 'peek'] as const) {
      const d = Math.abs(this.snapOffset(s) - y);
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    this.snap.set(best);
  }

  /** Whole-card tap on the mobile bottom card — same tab, so Back returns to the map. */
  protected openListing(l: Listing): void {
    void this.router.navigate(['/hostel', l.slug]);
  }

  protected closeCard(e: Event): void {
    e.stopPropagation();
    this.selected.set(null);
  }

  protected isSaved(l: Listing): boolean {
    return this.favorites.isFavorite(l.id);
  }

  protected toggleSaved(l: Listing, e: Event): void {
    e.stopPropagation();
    this.favorites.toggle(l);
  }

  protected cardImage(l: Listing): string {
    return l.images[0] ?? 'https://picsum.photos/seed/hh-fallback/800/800';
  }

  protected cardPrice(l: Listing): string {
    return this.capacityStore
      .priceFor(l.priceByCapacity, l.priceFrom)
      .toLocaleString('en-PK');
  }
  /** Extra px to raise the mobile floating List/Map pill so it rests above the footer. */
  protected readonly footerLift = signal(0);
  /** Bottom offset (px) for the floating toggle: its resting 24px plus any footer lift. */
  protected readonly toggleBottom = computed(() => 24 + this.footerLift());
  protected readonly locating = signal(false);
  protected readonly mapError = signal(false);
  private readonly ready = signal(false);

  private map?: L.Map;
  private leaflet?: typeof L;
  private readonly markers = new Map<
    string,
    {
      marker: L.Marker;
      pinEl: HTMLElement;
      listing: Listing;
    }
  >();
  private lastKey = '';
  /** True after the user manually drags or zooms the map — suppresses auto-fitBounds. */
  private userInteracted = false;
  /** True while we move the camera in code — keeps scripted zooms out of `userInteracted`. */
  private programmaticMove = false;
  /** Guards `setup()` so the map is built at most once, however it gets revealed. */
  private mapInitStarted = false;
  /** Mirrors the `min-[950px]` split-pane breakpoint used in the template. */
  private readonly desktopSplitMq = '(min-width: 950px)';

  constructor() {
    afterNextRender(() => {
      this.measureStickyOffsets();
      this.measureTabBar();
      this.viewportH.set(window.innerHeight);
      this.narrow.set(!this.isDesktopSplit());
      const onResize = () => {
        this.measureStickyOffsets();
        this.viewportH.set(window.innerHeight);
        this.narrow.set(!this.isDesktopSplit());
        // The map pane is laid out at every width now, so keep it sized to its container.
        void this.ensureMap().then(() => this.map?.invalidateSize());
      };
      window.addEventListener('resize', onResize);
      this.destroyRef.onDestroy(() =>
        window.removeEventListener('resize', onResize),
      );

      // Lift the mobile floating List/Map pill so it rests above the site footer
      // instead of overlapping it once the footer scrolls into view (Airbnb-style).
      // The footer lives in the app shell, so measure it from the document rather
      // than a viewChild. rAF-throttled to keep the scroll handler cheap.
      const footer = document.querySelector('app-site-footer');
      const updateFooterLift = (): void => {
        if (!footer) return;
        const lift = Math.max(
          0,
          Math.round(window.innerHeight - 12 - footer.getBoundingClientRect().top),
        );
        if (lift !== this.footerLift()) this.footerLift.set(lift);
      };
      let liftRaf = 0;
      const scheduleFooterLift = (): void => {
        if (liftRaf) return;
        liftRaf = requestAnimationFrame(() => {
          liftRaf = 0;
          updateFooterLift();
        });
      };
      updateFooterLift();
      window.addEventListener('scroll', scheduleFooterLift, { passive: true });
      window.addEventListener('resize', scheduleFooterLift);
      this.destroyRef.onDestroy(() => {
        window.removeEventListener('scroll', scheduleFooterLift);
        window.removeEventListener('resize', scheduleFooterLift);
        if (liftRaf) cancelAnimationFrame(liftRaf);
      });

      // The map pane is laid out at every width — on mobile the results sheet floats over
      // it rather than replacing it — so it can be built straight away.
      void this.ensureMap();
    });
    // Rebuild markers when the result set changes (after the map is ready).
    effect(() => {
      const items = this.listings();
      if (this.ready()) this.buildMarkers(items);
    });
    // Update pin labels and re-render any open popup when the user changes sharing capacity.
    effect(() => {
      const cap = this.capacityStore.active();
      if (!this.ready()) return;
      for (const [, m] of this.markers) {
        const span = m.pinEl.querySelector('span');
        if (span) span.textContent = 'Rs ' + Math.round(this.capacityStore.priceFor(m.listing.priceByCapacity, m.listing.priceFrom) / 1000) + 'k';
      }
      untracked(() => { if (this.selected()) this.renderSelection(); });
    });
    // Toggle the hover highlight without rebuilding markers. Depends on active() only;
    // applyActive() runs untracked so its own active()/selected() reads don't leak in.
    effect(() => {
      this.active();
      if (this.ready()) untracked(() => this.applyActive());
    });
    // Open / close the popup card without rebuilding markers. MUST depend on selected()
    // ONLY — renderSelection() calls applyActive(), which reads active(); left tracked,
    // that made this effect re-run on every pill hover, rebuilding the card's DOM node and
    // restarting its entry animation (the visible jitter). untracked() severs that leak so
    // the card is rebuilt on genuine selection changes, not on hover.
    effect(() => {
      const id = this.selected();
      // Crossing the split breakpoint swaps the card between anchored-to-pin and
      // docked-to-bottom, so the markers must be re-rendered for the new mode too.
      this.narrow();
      if (this.ready()) untracked(() => this.renderSelection());
      // The mobile card docks where the sheet's peeking header sits — drop the sheet out
      // of the way so the two never stack.
      if (id && untracked(() => this.narrow())) this.snap.set('peek');
    });
    // Recenter the map when a *new* place is searched (lat/lng change via the search bar
    // or "Near me"). setup() already centers on the location present at load, so skip that
    // first emission and only react to subsequent coordinate changes.
    let initialCenter = true;
    effect(() => {
      const c = this.center();
      if (!this.ready()) return;
      if (initialCenter) {
        initialCenter = false;
        return;
      }
      if (c) untracked(() => this.recenterTo(c));
    });
    // Any filter / place / sort change restarts the infinite list from page 1.
    effect(() => {
      this.params();
      untracked(() => this.page.set(1));
    });
    // Infinite scroll: watch the tail sentinel (it mounts/unmounts with @if) and
    // fetch the next page as it approaches the viewport.
    effect(() => {
      const el = this.sentinel()?.nativeElement;
      this.observer?.disconnect();
      if (!el || !this.isBrowser || typeof IntersectionObserver === 'undefined') return;
      this.observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) this.loadMore();
        },
        // Start loading ~two card-heights early so the scroll never hits a wall.
        { rootMargin: '600px 0px' },
      );
      this.observer.observe(el);
    });
    this.destroyRef.onDestroy(() => this.observer?.disconnect());
    this.destroyRef.onDestroy(() => this.clearMarkers());
    this.destroyRef.onDestroy(() => clearInterval(this.cooldownTimer));
    // Hand the map back before this component's DOM goes away, so the instance survives
    // for the next visit instead of being destroyed with its container.
    this.destroyRef.onDestroy(() => this.sharedMap.release());
  }

  /**
   * Expose two sticky offsets as CSS vars on the host: the filter bar pins directly below
   * the site header (`--hh-header-top`), and the map pins below both (`--hh-map-top`), so
   * the header + filters stay fixed while the results scroll. Re-run on resize because the
   * header height is breakpoint-dependent.
   */
  private measureStickyOffsets(): void {
    const headerH =
      document.querySelector('header')?.getBoundingClientRect().height ?? 0;
    const filterH =
      this.host.querySelector('.hh-search-filter-bar')?.getBoundingClientRect()
        .height ?? 0;
    this.host.style.setProperty('--hh-header-top', `${headerH}px`);
    this.host.style.setProperty('--hh-map-top', `${headerH + filterH}px`);
  }

  /** True when the viewport shows the desktop list+map split (map pane always visible). */
  private isDesktopSplit(): boolean {
    return window.matchMedia(this.desktopSplitMq).matches;
  }

  /**
   * Builds the map on first reveal and never again. The pane is `display:none` on mobile
   * until the user taps "Map", and Leaflet sizes itself from its container at
   * construction — so building it early would produce a permanently blank map.
   */
  private async ensureMap(): Promise<void> {
    if (this.mapInitStarted) return;
    this.mapInitStarted = true;
    await this.setup();
  }

  private async setup(): Promise<void> {
    const c = this.center();
    const restored = this.urlBounds();
    try {
      // Borrowed, not built: returning here from a listing reuses the instance from the
      // previous visit, so the map and its visible tiles are already warm.
      const { map, leaflet } = await this.sharedMap.acquire(
        this.mapEl().nativeElement,
        {
          center: c ? [c.lat, c.lng] : [30.3753, 69.3451],
          zoom: this.placeZoom() ?? (c ? 15 : 6),
        },
      );
      this.map = map;
      this.leaflet = leaflet;
      if (restored) {
        // A viewport came in on the URL, so it — not the pins — decides the camera.
        // `userInteracted` marks it as chosen rather than derived, which stops the first
        // marker rebuild from fitting the camera to the results and undoing the restore.
        this.userInteracted = true;
        this.programmaticMove = true;
        map.fitBounds(
          leaflet.latLngBounds(
            [restored.south, restored.west],
            [restored.north, restored.east],
          ),
        );
      }
    } catch {
      this.mapError.set(true);
      return;
    }
    // Registered through the service so they are torn down on release — a reused map
    // would otherwise accumulate a duplicate set of handlers per navigation.
    // `moveend` is Leaflet's equivalent of Google's `idle`: it fires once the camera
    // settles, after both pans and zooms.
    this.sharedMap.listen('moveend', () => {
      this.programmaticMove = false; // the scripted move (if any) has settled
      this.captureMapBounds();
    });
    this.sharedMap.listen('dragstart', () => {
      this.userInteracted = true;
    });
    this.sharedMap.listen('zoomend', () => {
      // Flag as user-interacted only for real gestures: skip the initial setup zoom
      // (not ready yet) and our own recenter zoom (programmaticMove).
      if (this.ready() && !this.programmaticMove) this.userInteracted = true;
    });
    // Click empty map → dismiss the open popup card (Airbnb behaviour).
    this.sharedMap.listen('click', () => this.selected.set(null));
    this.ready.set(true);
  }

  /**
   * Wraps marker content in an anchor element. Leaflet drives a marker's position with a
   * `transform` on the icon root, so the root itself cannot carry one — the inner wrapper
   * is what shifts the content to sit bottom-centred over the point, matching the
   * anchoring Google's AdvancedMarkerElement gave us for free.
   */
  private markerIcon(content: HTMLElement): L.DivIcon {
    const anchor = document.createElement('div');
    anchor.className = 'hh-marker__anchor';
    anchor.appendChild(content);
    return this.leaflet!.divIcon({
      html: anchor,
      className: 'hh-marker', // replaces Leaflet's default white box
      iconSize: undefined, // let the pill/card size itself
    });
  }

  private buildMarkers(items: Listing[]): void {
    const map = this.map;
    const leaflet = this.leaflet;
    if (!map || !leaflet) return;
    this.clearMarkers();
    if (!items.length) return;
    const points: L.LatLngExpression[] = [];
    for (const l of items) {
      const pinEl = document.createElement('div');
      pinEl.className = l.isFeatured ? 'hh-pin hh-pin--featured' : 'hh-pin';
      if (l.isFeatured) {
        const crown = document.createElement('i');
        crown.className = 'ti ti-crown-filled hh-pin__crown';
        crown.setAttribute('aria-hidden', 'true');
        pinEl.appendChild(crown);
      }
      const priceSpan = document.createElement('span');
      priceSpan.textContent = 'Rs ' + Math.round(this.capacityStore.priceFor(l.priceByCapacity, l.priceFrom) / 1000) + 'k';
      pinEl.appendChild(priceSpan);
      pinEl.addEventListener('mouseenter', () => this.active.set(l.id));
      pinEl.addEventListener('mouseleave', () => this.active.set(null));
      pinEl.addEventListener('click', (e) => {
        // Without this the click also reaches the map, whose handler closes the popup
        // we are about to open.
        e.stopPropagation();
        this.selected.set(l.id);
      });
      const marker = leaflet
        .marker([l.lat, l.lng], { icon: this.markerIcon(pinEl) })
        .addTo(map);
      this.markers.set(l.id, { marker, pinEl, listing: l });
      points.push([l.lat, l.lng]);
    }
    const key = items.map((l) => l.id).join(',');
    // Appended pages must not refit the camera — a mid-scroll pan/zoom would shift the
    // viewport bounds and restart the infinite list from page 1.
    const isAppend = untracked(() => this.page()) > 1;
    if (!isAppend && key !== this.lastKey && !this.userInteracted) {
      this.lastKey = key;
      this.fitTo(points);
    } else {
      this.lastKey = key;
    }
    // Re-open the popup if its listing is still in view, else it simply stays closed.
    untracked(() => this.renderSelection());
  }

  /**
   * Points the camera at a set of pins: an explicit place zoom wins, a lone result gets a
   * fixed close zoom, and anything else fits the bounding box. Scripted either way, so
   * `programmaticMove` keeps the resulting zoom out of `userInteracted`.
   */
  private fitTo(points: L.LatLngExpression[]): void {
    const map = this.map;
    const leaflet = this.leaflet;
    if (!map || !leaflet || !points.length) return;
    const pz = this.placeZoom();
    const pc = this.center();
    this.programmaticMove = true;
    if (pz != null && pc) {
      map.setView([pc.lat, pc.lng], pz);
    } else if (points.length === 1) {
      map.setView(points[0], 16);
    } else {
      map.fitBounds(leaflet.latLngBounds(points), { padding: [64, 64] });
    }
  }

  /** Swap the selected marker's content for the popup card; every other marker shows its pin. */
  private renderSelection(): void {
    const id = this.selected();
    // On mobile the selected listing surfaces as a card docked to the bottom of the screen
    // (rendered in the template), so the marker only needs its selected pin styling — an
    // anchored card that wide would spill off a phone viewport.
    if (this.narrow()) {
      for (const [lid, m] of this.markers) {
        if (m.marker.getElement()?.firstElementChild?.firstElementChild !== m.pinEl) {
          m.marker.setIcon(this.markerIcon(m.pinEl));
        }
        m.pinEl.classList.toggle('hh-pin--selected', lid === id);
        m.marker.setZIndexOffset(lid === id ? 1000 : 0);
      }
      this.applyActive();
      return;
    }
    for (const [lid, m] of this.markers) {
      m.pinEl.classList.remove('hh-pin--selected');
      if (lid === id) {
        // Stack the card above this listing's own pill rather than replacing it, so the
        // pill stays visible under the card and the nub has something to point at.
        const stack = document.createElement('div');
        stack.className = 'hh-mapcard__stack';
        stack.append(this.buildCard(m.listing), m.pinEl);
        m.marker.setIcon(this.markerIcon(stack));
        m.marker.setZIndexOffset(1000);
      } else if (m.marker.getElement()?.firstElementChild?.firstElementChild !== m.pinEl) {
        // Only rebuild the icon when this marker is not already showing its pin —
        // setIcon() replaces the DOM node, which would drop the pin's listeners.
        m.marker.setIcon(this.markerIcon(m.pinEl));
        m.marker.setZIndexOffset(0);
      }
    }
    this.applyActive();
  }

  /** Builds the Airbnb-style popup card (photo carousel + details) as DOM, anchored to the pin. */
  private buildCard(l: Listing): HTMLElement {
    const images = l.images.length
      ? l.images
      : ['https://picsum.photos/seed/hh-fallback/800/800'];
    let idx = 0;

    const card = document.createElement('div');
    card.className = 'hh-mapcard';
    // Whole-card click opens the listing in a new tab so the map stays put
    // (controls below stop propagation).
    card.addEventListener('click', () => {
      const url = this.router.serializeUrl(
        this.router.createUrlTree(['/hostel', l.slug]),
      );
      window.open(url, '_blank', 'noopener');
    });

    const media = document.createElement('div');
    media.className = 'hh-mapcard__media';

    const img = document.createElement('img');
    img.src = images[0];
    img.alt = '';
    img.loading = 'lazy';
    media.appendChild(img);

    // Icon + label, matching hh-badge's default glyph per variant so the pill is identical
    // to the one on a listing card. textContent on a child, never innerHTML on the label,
    // so a hostel name can't inject markup here.
    const badge = document.createElement('span');
    badge.className = 'hh-mapcard__badge hh-mapcard__badge--' + l.gender;
    const badgeIcon = document.createElement('i');
    badgeIcon.className = 'ti ' + GENDER_ICON[l.gender];
    badgeIcon.setAttribute('aria-hidden', 'true');
    const badgeText = document.createElement('span');
    badgeText.textContent = this.genderLabel(l.gender);
    badge.append(badgeIcon, badgeText);
    media.appendChild(badge);

    const heart = document.createElement('button');
    heart.type = 'button';
    heart.className = 'hh-mapcard__heart';
    heart.setAttribute('aria-label', 'Save to favourites');
    const paintHeart = (on: boolean): void => {
      heart.innerHTML = on
        ? '<i class="ti ti-heart-filled"></i>'
        : '<i class="ti ti-heart"></i>';
      heart.classList.toggle('is-saved', on);
    };
    paintHeart(this.favorites.isFavorite(l.id)); // reflect persisted state on open
    heart.addEventListener('click', (e) => {
      e.stopPropagation();
      paintHeart(this.favorites.toggle(l));
    });
    media.appendChild(heart);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'hh-mapcard__close';
    close.setAttribute('aria-label', 'Close');
    close.innerHTML = '<i class="ti ti-x"></i>';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selected.set(null);
    });
    media.appendChild(close);

    if (l.verified) {
      const v = document.createElement('span');
      v.className = 'hh-mapcard__verified';
      v.innerHTML =
        '<i class="ti ti-rosette-discount-check-filled"></i> Verified';
      media.appendChild(v);
    }

    if (images.length > 1) {
      const dots = document.createElement('div');
      dots.className = 'hh-mapcard__dots';
      images.forEach(() => dots.appendChild(document.createElement('span')));
      const sync = () => {
        img.src = images[idx];
        Array.from(dots.children).forEach((c, i) =>
          c.classList.toggle('is-on', i === idx),
        );
      };
      const step = (dir: number, e: Event) => {
        e.stopPropagation();
        idx = (idx + dir + images.length) % images.length;
        sync();
      };
      const prev = document.createElement('button');
      prev.type = 'button';
      prev.className = 'hh-mapcard__nav hh-mapcard__nav--prev';
      prev.setAttribute('aria-label', 'Previous photo');
      prev.innerHTML = '<i class="ti ti-chevron-left"></i>';
      prev.addEventListener('click', (e) => step(-1, e));
      const next = document.createElement('button');
      next.type = 'button';
      next.className = 'hh-mapcard__nav hh-mapcard__nav--next';
      next.setAttribute('aria-label', 'Next photo');
      next.innerHTML = '<i class="ti ti-chevron-right"></i>';
      next.addEventListener('click', (e) => step(1, e));
      media.append(prev, next, dots);
      sync();
    }

    card.appendChild(media);

    const body = document.createElement('div');
    body.className = 'hh-mapcard__body';
    const rating = l.rating
      ? `<span class="hh-mapcard__rating"><i class="ti ti-star-filled"></i>${l.rating}<span>(${l.reviews ?? 0})</span></span>`
      : '';
    const tags = l.sharing.length ? l.sharing.join(' · ') : 'Shared rooms';
    body.innerHTML = `
      <div class="hh-mapcard__row">
        <span class="hh-mapcard__name">${this.esc(l.name)}</span>
        ${rating}
      </div>
      <p class="hh-mapcard__sub">${this.esc(l.area)} · ${this.esc(l.city)}</p>
      <p class="hh-mapcard__sub hh-mapcard__tags">${this.esc(tags)}</p>
      <p class="hh-mapcard__price"><b>Rs ${this.capacityStore.priceFor(l.priceByCapacity, l.priceFrom).toLocaleString('en-PK')}</b> / month</p>
    `;
    card.appendChild(body);

    return card;
  }

  private applyActive(): void {
    const activeId = this.active();
    const selectedId = this.selected();
    for (const [id, { pinEl, marker }] of this.markers) {
      const isActive = id === activeId;
      pinEl.classList.toggle('hh-pin--active', isActive);
      // Bring the hovered marker to the very front. Leaflet stacks markers by a z-index
      // derived from latitude plus this offset, so the content's own CSS z-index cannot
      // lift one marker above another — the offset has to do it.
      marker.setZIndexOffset(isActive ? 99999 : id === selectedId ? 1000 : 0);
    }
  }

  private clearMarkers(): void {
    for (const { marker } of this.markers.values()) marker.remove();
    this.markers.clear();
  }

  private genderLabel(g: Gender): string {
    return g === 'coliving' ? 'Co-living' : g === 'boys' ? 'Boys' : 'Girls';
  }

  private esc(s: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
    };
    return s.replace(/[&<>"]/g, (c) => map[c] ?? c);
  }

  protected toggleAmenity(key: string): void {
    const set = new Set(this.amenities());
    if (set.has(key)) set.delete(key);
    else set.add(key);
    const joined = Array.from(set).join(',');
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { amenities: joined || null },
      queryParamsHandling: 'merge',
    });
  }

  /** Typed text in the mobile place input — no navigation until a suggestion is picked. */
  protected onPlaceText(_text: string): void {}

  /** A Place was picked from the autocomplete dropdown → recenter the map and refetch. */
  protected onPlaceSelected(r: PlaceResult): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        place: r.label,
        city: null,
        lat: r.lat,
        lng: r.lng,
        zoom: r.zoom ?? null,
      },
      queryParamsHandling: 'merge',
    });
  }

  /** Drops the results sheet back to its peek so the map fills the screen again. */
  protected showMap(): void {
    this.snap.set('peek');
    this.selected.set(null);
    void this.ensureMap().then(() =>
      setTimeout(() => this.map?.invalidateSize(), 60),
    );
  }

  /**
   * Jump the camera to a freshly searched location and refetch for that area. Clears the
   * interaction flags so the upcoming marker rebuild may fit the new results, and drops the
   * stale viewport bounds so the query reflects the new place (idle re-captures the bounds).
   */
  private recenterTo(c: { lat: number; lng: number }): void {
    if (!this.map) return;
    this.userInteracted = false; // a new search overrides any earlier manual pan/zoom
    this.lastKey = ''; // let the next rebuild refit to the new area's pins
    this.programmaticMove = true; // cleared on the next moveend; keeps this zoom out of userInteracted
    this.mapBounds.set(null);
    // Drop the old viewport from the URL as well, or a refresh would restore the area the
    // user just navigated away from. The next moveend writes the new one.
    if (this.isBrowser) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { ...BOUNDS_KEYS_NULLED },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
    this.map.setView([c.lat, c.lng], 15);
  }

  /** "Near me" — native geolocation (Capacitor) or the browser API → recenter + proximity search. */
  protected async locateMe(): Promise<void> {
    if (this.locating()) return;
    this.locating.set(true);
    try {
      const { lat, lng } = await this.geo.getCurrent();
      await this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { lat, lng, place: 'My location', city: null },
        queryParamsHandling: 'merge',
      });
    } catch {
      // Permission denied or unavailable — leave the map as-is.
    } finally {
      this.locating.set(false);
    }
  }

  /**
   * Enter a rate-limit cooldown after a 429: keep the last results visible and count down
   * 60s before auto-retrying. New queries are suppressed meanwhile (see the `filter` in the
   * result pipeline) so we stop hammering the throttled endpoint.
   */
  private beginCooldown(): void {
    if (this.cooldown() > 0) return; // already counting down
    this.cooldown.set(60); // one-minute cooldown before the search auto-retries
    if (!this.isBrowser) return; // no timers during SSR
    this.cooldownTimer = setInterval(() => {
      const left = this.cooldown() - 1;
      if (left <= 0) this.retryNow();
      else this.cooldown.set(left);
    }, 1000);
  }

  /** Cancel the cooldown and immediately re-fire the search (timer end or "Retry now"). */
  protected retryNow(): void {
    clearInterval(this.cooldownTimer);
    this.cooldownTimer = undefined;
    this.cooldown.set(0);
    this.retryTick.update((v) => v + 1);
  }

  private captureMapBounds(): void {
    const b = this.map?.getBounds();
    if (!b) return;
    const next = {
      north: b.getNorth(),
      south: b.getSouth(),
      east: b.getEast(),
      west: b.getWest(),
    };
    // moveend fires after every camera settle, including no-op ones. Only a real viewport
    // change should refetch and restart the infinite list.
    const prev = this.mapBounds();
    const unchanged =
      prev &&
      Math.abs(prev.north - next.north) < 1e-6 &&
      Math.abs(prev.south - next.south) < 1e-6 &&
      Math.abs(prev.east - next.east) < 1e-6 &&
      Math.abs(prev.west - next.west) < 1e-6;
    if (unchanged) return;
    this.mapBounds.set(next);
    // Reset to page 1 when the viewport changes.
    this.page.set(1);
    this.syncBoundsToUrl(next);
  }

  /**
   * Mirror the viewport into the URL so a refresh or a shared link lands on the same area.
   * `replaceUrl` because a pan is a refinement of the current search, not a new destination —
   * one history entry per pan would make Back unusable. The write re-emits the ParamMap, which
   * `query()`'s value comparator absorbs (see there); the round-trip does not refetch.
   */
  private syncBoundsToUrl(b: Bounds): void {
    if (!this.isBrowser) return; // no address bar to sync during SSR
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        [NE_LAT]: roundCoord(b.north),
        [NE_LNG]: roundCoord(b.east),
        [SW_LAT]: roundCoord(b.south),
        [SW_LNG]: roundCoord(b.west),
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
