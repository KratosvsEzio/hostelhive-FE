/// <reference types="google.maps" />
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
import { ListingsApi } from '@services';
import { GeolocationService, GoogleMapsLoader } from '@hostelhive/maps';
import { SearchFilters } from '@features/public/search/search-filters/search-filters';
import { ListingCard } from '@features/public/search/listing-card/listing-card';

/**
 * Unified search experience — an Airbnb-style split: a column of listing cards on the
 * left and a live Google map on the right (desktop shows both; mobile toggles between
 * them). Clicking a price pin opens a rich popup card (photo carousel, gender badge,
 * rating, tags, price) anchored to the marker, mirroring Airbnb's map. SSR-safe: all
 * map work runs in afterNextRender.
 */
@Component({
  selector: 'hh-search-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SearchFilters, ListingCard],
  templateUrl: './search-map.html',
})
export class SearchMap {
  private readonly api = inject(ListingsApi);
  private readonly favorites = inject(FavoritesStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly loader = inject(GoogleMapsLoader);
  private readonly geo = inject(GeolocationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef).nativeElement as HTMLElement;
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
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

  /** Map viewport bounds — updated on every idle event (zoom/pan). */
  private readonly mapBounds = signal<{
    north: number;
    south: number;
    east: number;
    west: number;
  } | null>(null);
  protected readonly page = signal(1);

  private readonly query = computed(() => {
    const p = this.params();
    const min = p?.get('minPrice');
    const max = p?.get('maxPrice');
    const c = this.center();
    const amenities = this.amenities();
    const mb = this.mapBounds();
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
      sort:
        (this.sort() as
          | 'recommended'
          | 'newest'
          | 'oldest'
          | 'price-asc'
          | 'price-desc') || undefined,
      page: this.page(),
    };
  });

  /** True while a search request is in flight — drives the skeleton cards. */
  protected readonly loading = signal(true);
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
      tap(() => {
        this.loading.set(true);
        this.loadError.set(false); // a fresh attempt clears any prior error
      }),
      switchMap((q) =>
        this.api.list(q).pipe(
          catchError((err: unknown) => {
            this.loading.set(false);
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
        ),
      ),
      tap(() => {
        this.loading.set(false);
        this.cooldown.set(0); // a successful response clears any lingering throttle state
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

  protected readonly listings = computed(() => this.result().items);
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

  /** Build a condensed page number array with ellipses (e.g. [1, 2, 3, -1, 10]). */
  protected readonly pageNumbers = computed(() => {
    const total: number = this.totalPages();
    const current: number = this.page();
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: number[] = [1];
    const lo: number = Math.max(2, current - 1);
    const hi: number = Math.min(total - 1, current + 1);
    if (lo > 2) pages.push(-1);
    for (let i = lo; i <= hi; i++) pages.push(i);
    if (hi < total - 1) pages.push(-1);
    pages.push(total);
    return pages;
  });

  protected readonly active = signal<string | null>(null);
  /** Listing whose Airbnb-style popup card is open on the map (null = none). */
  protected readonly selected = signal<string | null>(null);
  protected readonly view = signal<'list' | 'map'>('list');
  protected readonly locating = signal(false);
  protected readonly needsKey = signal(false);
  protected readonly mapError = signal(false);
  private readonly ready = signal(false);

  private map?: google.maps.Map;
  private readonly markers = new Map<
    string,
    {
      marker: google.maps.marker.AdvancedMarkerElement;
      pinEl: HTMLElement;
      listing: Listing;
    }
  >();
  private lastKey = '';
  /** True after the user manually drags or zooms the map — suppresses auto-fitBounds. */
  private userInteracted = false;
  /** True while we move the camera in code — keeps scripted zooms out of `userInteracted`. */
  private programmaticMove = false;

  constructor() {
    afterNextRender(() => {
      this.measureStickyOffsets();
      const onResize = () => this.measureStickyOffsets();
      window.addEventListener('resize', onResize);
      this.destroyRef.onDestroy(() =>
        window.removeEventListener('resize', onResize),
      );
      void this.setup();
    });
    // Rebuild markers when the result set changes (after the map is ready).
    effect(() => {
      const items = this.listings();
      if (this.ready()) this.buildMarkers(items);
    });
    // Toggle the hover highlight without rebuilding markers.
    effect(() => {
      this.active();
      if (this.ready()) this.applyActive();
    });
    // Open / close the popup card without rebuilding markers.
    effect(() => {
      this.selected();
      if (this.ready()) this.renderSelection();
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
    this.destroyRef.onDestroy(() => this.clearMarkers());
    this.destroyRef.onDestroy(() => clearInterval(this.cooldownTimer));
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

  private async setup(): Promise<void> {
    if (!this.loader.configured) {
      this.needsKey.set(true);
      return;
    }
    try {
      await this.loader.load();
    } catch {
      this.mapError.set(true);
      return;
    }
    const c = this.center();
    this.map = new google.maps.Map(this.mapEl().nativeElement, {
      center: c ?? { lat: 30.3753, lng: 69.3451 },
      zoom: this.placeZoom() ?? (c ? 15 : 6),
      mapId: this.loader.mapId,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: true,
      clickableIcons: false,
      gestureHandling: 'greedy',
      // NOTE: the base-map appearance (muted colours, hidden POIs) is controlled by the Cloud
      // style bound to `mapId` — Google IGNORES the JS `styles` option whenever a Map ID is set.
      // To restyle: Google Cloud Console → Map Styles, edit the style, link it to a real Map ID,
      // publish, and set GOOGLE_MAPS_MAP_ID in the repo-root .env (a demo Map ID can't be styled).
    });
    this.map.addListener('idle', () => {
      this.programmaticMove = false; // the scripted move (if any) has settled
      this.captureMapBounds();
    });
    this.map.addListener('dragstart', () => {
      this.userInteracted = true;
    });
    this.map.addListener('zoom_changed', () => {
      // Flag as user-interacted only for real gestures: skip the initial setup zoom
      // (not ready yet) and our own recenter zoom (programmaticMove).
      if (this.ready() && !this.programmaticMove) this.userInteracted = true;
    });
    // Click empty map → dismiss the open popup card (Airbnb behaviour).
    this.map.addListener('click', () => this.selected.set(null));
    this.ready.set(true);
  }

  private buildMarkers(items: Listing[]): void {
    if (!this.map) return;
    this.clearMarkers();
    if (!items.length) return;
    const bounds = new google.maps.LatLngBounds();
    for (const l of items) {
      const pinEl = document.createElement('div');
      pinEl.className = 'hh-pin';
      pinEl.textContent = 'Rs ' + Math.round(l.priceFrom / 1000) + 'k';
      pinEl.addEventListener('mouseenter', () => this.active.set(l.id));
      pinEl.addEventListener('mouseleave', () => this.active.set(null));
      pinEl.addEventListener('click', () => this.selected.set(l.id));
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map: this.map,
        position: { lat: l.lat, lng: l.lng },
        content: pinEl,
      });
      this.markers.set(l.id, { marker, pinEl, listing: l });
      bounds.extend({ lat: l.lat, lng: l.lng });
    }
    const key = items.map((l) => l.id).join(',');
    if (key !== this.lastKey && !this.userInteracted) {
      this.lastKey = key;
      const pz = this.placeZoom();
      const pc = this.center();
      if (pz != null && pc) {
        this.map.setCenter(pc);
        this.map.setZoom(pz);
      } else if (items.length === 1) {
        this.map.setCenter(bounds.getCenter());
        this.map.setZoom(16);
      } else {
        this.map.fitBounds(bounds, 64);
      }
    } else {
      this.lastKey = key;
    }
    // Re-open the popup if its listing is still in view, else it simply stays closed.
    untracked(() => this.renderSelection());
  }

  /** Swap the selected marker's content for the popup card; every other marker shows its pin. */
  private renderSelection(): void {
    const id = this.selected();
    for (const [lid, m] of this.markers) {
      if (lid === id) {
        m.marker.content = this.buildCard(m.listing);
        m.marker.zIndex = 1000;
      } else if (m.marker.content !== m.pinEl) {
        m.marker.content = m.pinEl;
        m.marker.zIndex = null;
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
    // Whole-card click navigates to the listing (controls below stop propagation).
    card.addEventListener(
      'click',
      () => void this.router.navigate(['/hostel', l.slug]),
    );

    const media = document.createElement('div');
    media.className = 'hh-mapcard__media';

    const img = document.createElement('img');
    img.src = images[0];
    img.alt = '';
    img.loading = 'lazy';
    media.appendChild(img);

    const badge = document.createElement('span');
    badge.className = 'hh-mapcard__badge hh-mapcard__badge--' + l.gender;
    badge.textContent = this.genderLabel(l.gender);
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
      <p class="hh-mapcard__price"><b>Rs ${l.priceFrom.toLocaleString('en-PK')}</b> / month</p>
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
      // Bring the hovered marker to the very front (Google stacks AdvancedMarkers by
      // their zIndex, not the content's CSS z-index); keep the selected popup marker
      // elevated; everything else returns to the default stacking.
      marker.zIndex = isActive ? 99999 : id === selectedId ? 1000 : null;
    }
  }

  private clearMarkers(): void {
    for (const { marker } of this.markers.values()) marker.map = null;
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

  /** Mobile list â‡„ full-screen map toggle (desktop always shows both panes). */
  protected setView(v: 'list' | 'map'): void {
    this.view.set(v);
    // The map may have initialised while its container was display:none (0Ã—0) —
    // nudge it to re-fit to the markers once it becomes visible.
    if (v === 'map') setTimeout(() => this.fitToMarkers(), 60);
  }

  private fitToMarkers(): void {
    if (!this.map || !this.markers.size) return;
    const bounds = new google.maps.LatLngBounds();
    for (const { marker } of this.markers.values()) {
      if (marker.position) bounds.extend(marker.position);
    }
    const pz = this.placeZoom();
    const pc = this.center();
    if (pz != null && pc) {
      this.map.setCenter(pc);
      this.map.setZoom(pz);
    } else if (this.markers.size === 1) {
      this.map.setCenter(bounds.getCenter());
      this.map.setZoom(16);
    } else {
      this.map.fitBounds(bounds, 64);
    }
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
    this.programmaticMove = true; // cleared on the next idle; keeps this zoom out of userInteracted
    this.mapBounds.set(null);
    this.map.setCenter(c);
    this.map.setZoom(15);
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

  protected goToPage(p: number): void {
    if (p < 1 || p > this.totalPages()) return;
    this.page.set(p);
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
    const ne = b.getNorthEast();
    const sw = b.getSouthWest();
    this.mapBounds.set({
      north: ne.lat(),
      south: sw.lat(),
      east: ne.lng(),
      west: sw.lng(),
    });
    // Reset to page 1 when the viewport changes.
    this.page.set(1);
  }
}
