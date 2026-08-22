import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
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

// Boundary levels by drill depth: 0 = provinces, 1 = districts, 2 = tehsils.
const KEYS = ['adm1', 'adm2', 'adm3'] as const;
// Map zoom applied when a province / district / tehsil is selected.
const ZOOMS = [7, 9, 11] as const;

function priceLabel(price: number): string {
  return price > 0 ? `${Math.round(price / 1000)}k` : '·';
}

function priceMarkerHtml(price: number, featured?: boolean): string {
  const label = priceLabel(price);
  const crown = featured ? '<i class="ti ti-crown-filled hh-pin__crown" aria-hidden="true"></i>' : '';
  const cls = featured ? 'hh-pin hh-pin--featured' : 'hh-pin';
  return `<div class="hh-marker__anchor"><div class="${cls}">${crown}<span>${label}</span></div></div>`;
}

/**
 * "Explore Pakistan" drill-down rendered on a real base map.
 *  Boundaries (geoBoundaries, CC-BY — bundled as TopoJSON in /geo) are rendered as a
 *  Leaflet GeoJSON layer, which gives per-feature hover-highlight + click for free.
 *  Drilling province → district → tehsil swaps the layer and re-zooms; the deepest level
 *  fetches live hostel markers and offers a "Browse stays" CTA. SSR-safe.
 */
@Component({
  selector: 'app-pakistan-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LocaleLink],
  templateUrl: './pakistan-map.html',
})
export class PakistanMap {
  private readonly loader = inject(LeafletLoader);
  private readonly router = inject(Router);
  private readonly listingsApi = inject(ListingsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly mapRef = viewChild.required<ElementRef<HTMLDivElement>>('map');

  protected readonly breadcrumb = signal<string[]>(['Pakistan']);
  protected readonly hovered = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly leaf = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly listingCount = signal<number | null>(null);
  protected readonly leafCentroid = signal<{ lat: number; lng: number } | null>(null);

  protected readonly hint = computed(() => {
    if (this.leaf()) {
      const n = this.listingCount();
      if (n === null) return 'Finding stays…';
      return n > 0 ? `${n} verified stay${n > 1 ? 's' : ''} found` : 'No stays listed yet';
    }
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
        center: [30.4, 69.3],
        zoom: 5,
        zoomControl: true,
        scrollWheelZoom: false, // don't hijack the page scroll on the landing page
      });
      this.loader.tileLayer(this.leaflet, 'roadmap').addTo(this.map);
      this.renderLevel((await this.load('adm1')).features, 0);
    } catch {
      this.error.set('Could not load the map — check your connection.');
    } finally {
      this.loading.set(false);
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
    const topo = await (await fetch(`/geo/pak-${key}.json`)).json();
    const fc = feature(topo, topo.objects['data']) as unknown as FeatureCollection;
    this.cache[key] = fc;
    return fc;
  }

  private renderLevel(features: Feature[], depth: number): void {
    this.depth = depth;
    this.current = features;
    this.hovered.set(null);
    this.boundaries?.remove();
    this.boundaries = this.leaflet
      .geoJSON({ type: 'FeatureCollection', features } as FeatureCollection, {
        style: () => PakistanMap.BOUNDARY_STYLE,
        onEachFeature: (f, layer) => {
          const name = (f.properties?.['shapeName'] as string) ?? null;
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

  private async drill(name: string | null): Promise<void> {
    if (!name) return;
    const f = this.current.find(
      (c) => (c.properties?.['shapeName'] as string) === name,
    );
    if (!f) return;
    const depth = this.depth;
    if (depth >= 2) {
      this.stack[2] = f;
      this.breadcrumb.update((b) => [...b.slice(0, 3), name]);
      this.leaf.set(name);
      this.listingCount.set(null);
      const [lng, lat] = geoCentroid(f as Parameters<typeof geoCentroid>[0]);
      this.leafCentroid.set(
        Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
      );
      this.zoomToFeature(f, ZOOMS[2]);
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
      this.map.setView([30.4, 69.3], 5);
      this.renderLevel((await this.load('adm1')).features, 0);
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

  private zoomToFeature(f: Feature, zoom: number): void {
    const [lng, lat] = geoCentroid(f as Parameters<typeof geoCentroid>[0]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      this.map.setView([lat, lng], zoom);
    }
  }
}
