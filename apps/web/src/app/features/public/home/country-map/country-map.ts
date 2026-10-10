import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import type * as L from 'leaflet';
import { LeafletLoader } from '@hostelhive/maps';
import { geoBounds, geoCentroid, geoContains } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection } from 'geojson';
import { ListingsApi } from '@services';
import { LocaleLink } from '@core/i18n/locale-link';
import { CountryBounds } from '@core/geo/country-bounds';
import { iso3For } from '@core/geo/country-iso3';
import { TranslocoPipe } from '@jsverse/transloco';
import { sameRegionName } from '../country-locations';
import { BOUNDARIES_ATTRIBUTION, fetchCountryBoundaries } from './country-boundaries';

// Boundary levels by drill depth: 0 = provinces, 1 = districts, 2 = tehsils.
const KEYS = ['adm1', 'adm2', 'adm3'] as const;
// Map zoom applied when a province / district / tehsil is selected.
const ZOOMS = [7, 9, 11] as const;
// The opening view of Pakistan, which the bundled boundaries were framed for.
const PAKISTAN_VIEW: [number, number] = [30.4, 69.3];

function priceLabel(price: number): string {
  return price > 0 ? `${Math.round(price / 1000)}k` : '·';
}

function priceMarkerHtml(price: number, featured?: boolean): string {
  const label = priceLabel(price);
  const crown = featured ? '<i class="ti ti-crown-filled hh-pin__crown" aria-hidden="true"></i>' : '';
  const cls = featured ? 'hh-pin hh-pin--featured' : 'hh-pin';
  return `<div class="hh-marker__anchor"><div class="${cls}">${crown}<span>${label}</span></div></div>`;
}

function shapeName(f: Feature): string | null {
  return (f.properties?.['shapeName'] as string) ?? null;
}

/**
 * "Explore <country>" rendered on a real base map.
 *
 *  Boundaries come from geoBoundaries (CC-BY) and are drawn as a Leaflet GeoJSON layer, which
 *  gives per-feature hover-highlight + click for free.
 *
 *  Pakistan drills province → district → tehsil from TopoJSON bundled in /geo; each drill
 *  swaps the layer and re-zooms. Every other country is one level deep — its provinces or
 *  states, fetched on demand — because three levels for every country on earth is far more
 *  than this page should ship or fetch. Either way the deepest level fetches live hostel
 *  markers and offers a "Browse stays" CTA. SSR-safe.
 *
 *  Emits `failed` when the map cannot be drawn at all, so the page can drop it rather than
 *  show a dead frame.
 */
@Component({
  selector: 'app-country-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LocaleLink, TranslocoPipe],
  templateUrl: './country-map.html',
})
export class CountryMap {
  private readonly loader = inject(LeafletLoader);
  private readonly router = inject(Router);
  private readonly listingsApi = inject(ListingsApi);
  private readonly countryBounds = inject(CountryBounds);
  private readonly destroyRef = inject(DestroyRef);
  private readonly mapRef = viewChild.required<ElementRef<HTMLDivElement>>('map');

  /** ISO alpha-2. Read once, when the map is built; give the component a new instance to change it. */
  readonly country = input('PK');
  /** The country as the visitor reads it, for the first breadcrumb. */
  readonly countryName = input('');
  readonly failed = output<void>();

  /** Only Pakistan ships district and tehsil boundaries. */
  private readonly drillable = computed(() => this.country().toUpperCase() === 'PK');
  private readonly maxDepth = computed(() => (this.drillable() ? 2 : 0));
  protected readonly rootLabel = computed(() => this.countryName() || this.country());

  // The first entry stands for the country; the template labels it with rootLabel().
  protected readonly breadcrumb = signal<string[]>(['']);
  protected readonly hovered = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly leaf = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly listingCount = signal<number | null>(null);
  protected readonly leafCentroid = signal<{ lat: number; lng: number } | null>(null);

  /** The province currently drilled into, or null at the country view. */
  readonly province = computed(() => this.breadcrumb()[1] ?? null);

  /** Set when a province is asked for before the map has finished loading. */
  private pendingProvince: string | null = null;
  private ready = false;

  /**
   * Shows one province, as if it had been clicked on the map — for a list beside the map.
   * Goes back to the country view first, so it works from any depth. The name may be spelled
   * the way a host typed it; see `sameRegionName`.
   */
  async showProvince(name: string): Promise<void> {
    if (!this.ready) {
      this.pendingProvince = name;
      return;
    }
    if (sameRegionName(this.province(), name) && this.breadcrumb().length === 2) return;
    if (this.breadcrumb().length > 1) {
      // Back to the province level without moving the map: the drill below zooms once. Going
      // through goTo(0) zoomed out and straight back in, and Leaflet sometimes dropped the
      // second zoom while the first was still animating, leaving the map on the whole country.
      this.leaf.set(null);
      this.listingCount.set(null);
      this.leafCentroid.set(null);
      this.clearMarkers();
      this.breadcrumb.set(['']);
      this.stack = [];
      this.renderLevel((await this.load('adm1')).features, 0);
    }
    await this.drill(name);
  }

  protected readonly hint = computed(() => {
    if (this.leaf()) {
      const n = this.listingCount();
      if (n === null) return 'Finding stays…';
      return n > 0 ? `${n} verified stay${n > 1 ? 's' : ''} found` : 'No stays listed yet';
    }
    if (!this.drillable()) return 'Hover a region · click for stays';
    return (
      [
        'Hover a province · click to zoom in',
        'Hover a district · click to zoom in',
        'Hover a tehsil · click for stays',
      ][this.breadcrumb().length - 1] ?? ''
    );
  });

  private map!: L.Map;
  private leaflet!: typeof L;
  private readonly cache: Record<string, FeatureCollection> = {};
  private current: Feature[] = [];
  private stack: Feature[] = [];
  private depth = 0;
  /** The boundary layer for the level currently on screen; replaced on every drill. */
  private boundaries?: L.GeoJSON;
  private gMarkers: L.Marker[] = [];
  private markerSub?: Subscription;

  constructor() {
    // The host template wraps this component in `@defer (on viewport)`, so it is not
    // instantiated until the section actually scrolls into view.
    afterNextRender(() => void this.init());
    // `map!` may still be unset if the component is torn down before init() resolves, hence
    // the optional call. Leaflet holds document/window listeners and tile requests until
    // `remove()`, so this releases them when the user navigates away from the landing page.
    this.destroyRef.onDestroy(() => this.map?.remove());
  }

  private async init(): Promise<void> {
    try {
      this.leaflet = await this.loader.load();
      this.map = this.leaflet.map(this.mapRef().nativeElement, {
        center: PAKISTAN_VIEW,
        zoom: 5,
        zoomControl: true,
        scrollWheelZoom: false, // don't hijack the page scroll on the landing page
      });
      this.loader.tileLayer(this.leaflet, 'roadmap').addTo(this.map);
      this.map.attributionControl?.addAttribution(BOUNDARIES_ATTRIBUTION);
      this.renderLevel((await this.load('adm1')).features, 0);
      await this.frameCountry();
      this.ready = true;
    } catch {
      this.error.set('Could not load the map — check your connection.');
      this.failed.emit();
    } finally {
      this.loading.set(false);
    }
    if (this.pendingProvince) {
      const name = this.pendingProvince;
      this.pendingProvince = null;
      await this.showProvince(name);
    }
  }

  private static readonly BOUNDARY_STYLE: L.PathOptions = {
    fillColor: '#F36E21',
    fillOpacity: 0.32,
    color: '#ffffff',
    weight: 1.5,
  };

  private async load(key: string): Promise<FeatureCollection> {
    if (this.cache[key]) return this.cache[key];
    const fc = this.drillable() ? await this.loadBundled(key) : await this.loadRemote();
    this.cache[key] = fc;
    return fc;
  }

  private async loadBundled(key: string): Promise<FeatureCollection> {
    const topo = await (await fetch(`/geo/pak-${key}.json`)).json();
    return feature(topo, topo.objects['data']) as unknown as FeatureCollection;
  }

  private loadRemote(): Promise<FeatureCollection> {
    const iso3 = iso3For(this.country());
    if (!iso3) return Promise.reject(new Error(`Unknown country ${this.country()}`));
    return fetchCountryBoundaries(iso3);
  }

  /**
   * The whole country in view.
   *
   * Pakistan keeps the fixed view it always had. Anywhere else is framed on the boundaries
   * just drawn — unless they straddle the antimeridian (the United States with the Aleutians,
   * Russia, Fiji), where a plain box spans the globe; those fall back to the box around the
   * main landmass that the search page frames on.
   */
  private async frameCountry(): Promise<void> {
    if (this.drillable()) {
      this.map.setView(PAKISTAN_VIEW, 5);
      return;
    }
    const drawn = this.boundaries?.getBounds();
    if (drawn && this.fits(drawn)) {
      this.map.fitBounds(drawn, { padding: [12, 12] });
      return;
    }
    const box = await this.countryBounds.forCountry(this.country());
    if (box) this.map.fitBounds([[box.south, box.west], [box.north, box.east]]);
  }

  /** Whether a box can be framed without spanning the whole globe. */
  private fits(bounds: L.LatLngBounds): boolean {
    return bounds.isValid() && bounds.getEast() - bounds.getWest() <= 180;
  }

  private renderLevel(features: Feature[], depth: number): void {
    this.depth = depth;
    this.current = features;
    this.hovered.set(null);
    this.boundaries?.remove();
    this.boundaries = this.leaflet
      .geoJSON({ type: 'FeatureCollection', features } as FeatureCollection, {
        style: () => CountryMap.BOUNDARY_STYLE,
        onEachFeature: (f, layer) => {
          const name = shapeName(f);
          layer.on({
            mouseover: (e) => {
              (e.target as L.Path).setStyle({
                fillColor: '#D2560F',
                fillOpacity: 0.55,
                weight: 2.5,
              });
              (e.target as L.Path).bringToFront();
              this.hovered.set(name);
            },
            // resetStyle restores the layer's declared style, so hover changes never
            // have to be undone by hand.
            mouseout: (e) => {
              this.boundaries?.resetStyle(e.target as L.Path);
              this.hovered.set(null);
            },
            click: () => void this.drill(name),
          });
        },
      })
      .addTo(this.map);
  }

  private clearMarkers(): void {
    this.markerSub?.unsubscribe();
    this.gMarkers.forEach((m) => m.remove());
    this.gMarkers = [];
  }

  private fetchMarkers(f: Feature): void {
    this.clearMarkers();
    const [[west, south], [east, north]] = geoBounds(
      f as Parameters<typeof geoBounds>[0],
    );
    this.markerSub = this.listingsApi
      .list({ bounds: { north, south, east, west }, pageSize: 50 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ items }) => {
        this.listingCount.set(items.length);
        for (const h of items) {
          if (!h.lat || !h.lng) continue;
          const marker = this.leaflet
            .marker([h.lat, h.lng], {
              title: h.name,
              icon: this.leaflet.divIcon({
                className: 'hh-marker',
                html: priceMarkerHtml(h.priceFrom, h.isFeatured),
                iconSize: undefined,
              }),
            })
            .addTo(this.map);
          marker.on('click', () => this.router.navigate(['/hostel', h.slug]));
          this.gMarkers.push(marker);
        }
      });
  }

  /** The shape a name refers to: its own name first, then a looser spelling of it. */
  private findShape(name: string): Feature | undefined {
    return (
      this.current.find((c) => shapeName(c) === name) ??
      this.current.find((c) => sameRegionName(shapeName(c), name))
    );
  }

  private async drill(requested: string | null): Promise<void> {
    if (!requested) return;
    const f = this.findShape(requested);
    if (!f) return;
    const name = shapeName(f) ?? requested;
    const depth = this.depth;
    if (depth >= this.maxDepth()) {
      this.stack[depth] = f;
      this.breadcrumb.update((b) => [...b.slice(0, depth + 1), name]);
      this.leaf.set(name);
      this.listingCount.set(null);
      const [lng, lat] = geoCentroid(f as Parameters<typeof geoCentroid>[0]);
      this.leafCentroid.set(
        Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
      );
      this.focus(f, depth);
      this.fetchMarkers(f);
      return;
    }
    this.loading.set(true);
    this.leaf.set(null);
    this.listingCount.set(null);
    this.leafCentroid.set(null);
    this.clearMarkers();
    this.stack = this.stack.slice(0, depth);
    this.stack.push(f);
    this.breadcrumb.update((b) => [...b.slice(0, depth + 1), name]);
    try {
      const all = await this.load(KEYS[depth + 1]);
      const kids = all.features.filter((c) =>
        geoContains(f, geoCentroid(c as Parameters<typeof geoCentroid>[0])),
      );
      this.zoomToFeature(f, ZOOMS[depth]);
      this.renderLevel(kids.length ? kids : all.features, depth + 1);
    } finally {
      this.loading.set(false);
    }
  }

  protected async goTo(index: number): Promise<void> {
    this.leaf.set(null);
    this.listingCount.set(null);
    this.leafCentroid.set(null);
    this.clearMarkers();
    this.breadcrumb.update((b) => b.slice(0, index + 1));
    this.stack = this.stack.slice(0, index);
    if (index === 0) {
      this.renderLevel((await this.load('adm1')).features, 0);
      await this.frameCountry();
      return;
    }
    const parent = this.stack[index - 1];
    const all = await this.load(KEYS[index]);
    const kids = all.features.filter((c) =>
      geoContains(parent, geoCentroid(c as Parameters<typeof geoCentroid>[0])),
    );
    this.zoomToFeature(parent, ZOOMS[index - 1]);
    this.renderLevel(kids.length ? kids : all.features, index);
  }

  /**
   * Brings a selected shape into view. Pakistan's levels have known sizes, so a fixed zoom per
   * level reads well; a province elsewhere may be a city-state or half a continent, so it is
   * framed on its own outline instead.
   */
  private focus(f: Feature, depth: number): void {
    if (this.drillable()) {
      this.zoomToFeature(f, ZOOMS[depth]);
      return;
    }
    const bounds = this.leaflet.geoJSON(f).getBounds();
    if (this.fits(bounds)) this.map.fitBounds(bounds, { padding: [12, 12] });
    else this.zoomToFeature(f, 5);
  }

  private zoomToFeature(f: Feature, zoom: number): void {
    const [lng, lat] = geoCentroid(f as Parameters<typeof geoCentroid>[0]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      this.map.setView([lat, lng], zoom);
    }
  }
}
