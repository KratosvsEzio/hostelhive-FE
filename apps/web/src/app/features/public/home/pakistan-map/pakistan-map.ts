/// <reference types="google.maps" />
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
import { GoogleMapsLoader } from '@hostelhive/maps';
import { geoBounds, geoCentroid, geoContains } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection } from 'geojson';
import { ListingsApi } from '@services';

// Boundary levels by drill depth: 0 = provinces, 1 = districts, 2 = tehsils.
const KEYS = ['adm1', 'adm2', 'adm3'] as const;
// Map zoom applied when a province / district / tehsil is selected.
const ZOOMS = [7, 9, 11] as const;

function priceMarkerSvg(price: number): string {
  const label = price > 0 ? `${Math.round(price / 1000)}k` : '·';
  const w = Math.max(44, label.length * 9 + 20);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="28">` +
    `<rect rx="14" ry="14" width="${w}" height="28" fill="#F36E21" stroke="#fff" stroke-width="2"/>` +
    `<text x="${w / 2}" y="19" text-anchor="middle" fill="white" ` +
    `font-family="sans-serif" font-size="12" font-weight="700">${label}</text></svg>`
  );
}

/**
 * "Explore Pakistan" drill-down rendered on a real Google base map.
 *  Boundaries (geoBoundaries, CC-BY — bundled as TopoJSON in /geo) are loaded into the
 *  Google Maps Data layer, which gives hover-highlight + click for free. Drilling
 *  province → district → tehsil swaps the Data layer + fitBounds-zooms; the deepest level
 *  fetches live hostel markers and offers a "Browse stays" CTA. SSR-safe.
 */
@Component({
  selector: 'app-pakistan-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './pakistan-map.html',
})
export class PakistanMap {
  private readonly loader = inject(GoogleMapsLoader);
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

  private map!: google.maps.Map;
  private readonly cache: Record<string, FeatureCollection> = {};
  private current: Feature[] = [];
  private stack: Feature[] = [];
  private depth = 0;
  private gMarkers: google.maps.Marker[] = [];
  private markerSub?: Subscription;

  constructor() {
    afterNextRender(() => void this.init());
  }

  private async init(): Promise<void> {
    if (!this.loader.configured) {
      this.error.set('Add a Google Maps API key (.env) to enable the map.');
      this.loading.set(false);
      return;
    }
    try {
      await this.loader.load();
      this.map = new google.maps.Map(this.mapRef().nativeElement, {
        center: { lat: 30.4, lng: 69.3 },
        zoom: 5,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'cooperative',
        backgroundColor: '#eef2f6',
      });
      this.setupData();
      this.renderLevel((await this.load('adm1')).features, 0);
    } catch {
      this.error.set('Could not load Google Maps — check the API key.');
    } finally {
      this.loading.set(false);
    }
  }

  private setupData(): void {
    const d = this.map.data;
    d.setStyle({
      fillColor: '#F36E21',
      fillOpacity: 0.32,
      strokeColor: '#ffffff',
      strokeWeight: 1.5,
    });
    d.addListener('mouseover', (e: google.maps.Data.MouseEvent) => {
      d.overrideStyle(e.feature, {
        fillColor: '#D2560F',
        fillOpacity: 0.55,
        strokeWeight: 2.5,
      });
      this.hovered.set((e.feature.getProperty('shapeName') as string) ?? null);
    });
    d.addListener('mouseout', () => {
      d.revertStyle();
      this.hovered.set(null);
    });
    d.addListener(
      'click',
      (e: google.maps.Data.MouseEvent) =>
        void this.drill(e.feature.getProperty('shapeName') as string),
    );
  }

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
    this.map.data.forEach((f) => this.map.data.remove(f));
    this.hovered.set(null);
    this.map.data.addGeoJson({ type: 'FeatureCollection', features } as FeatureCollection);
  }

  private clearMarkers(): void {
    this.markerSub?.unsubscribe();
    this.gMarkers.forEach((m) => m.setMap(null));
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
          const svgUrl = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(priceMarkerSvg(h.priceFrom))}`;
          const marker = new google.maps.Marker({
            position: { lat: h.lat, lng: h.lng },
            map: this.map,
            title: h.name,
            icon: { url: svgUrl, anchor: new google.maps.Point(22, 14) },
          });
          marker.addListener('click', () => this.router.navigate(['/hostel', h.slug]));
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
      this.map.setCenter({ lat: 30.4, lng: 69.3 });
      this.map.setZoom(5);
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
      this.map.setCenter({ lat, lng });
      this.map.setZoom(zoom);
    }
  }
}
