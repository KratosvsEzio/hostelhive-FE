import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type * as L from 'leaflet';
import { brandPinIcon, LeafletLoader, whenSized } from './leaflet';
import { nominatimReverse } from './nominatim';
import { GeolocationService } from './geolocation';
import { PlaceResult, PlaceSearchField } from './place-search';

/** A location chosen on the map, with its reverse-geocoded address parts. */
export interface PickedLocation {
  lat: number;
  lng: number;
  area: string;
  city: string;
  province: string;
  country: string;
  street: string;
  formatted: string;
}

/**
 * Location picker: a search box (reusing `hh-place-search`), a draggable brand pin,
 * click-to-move, "use my location", and reverse-geocoding that resolves the pinned point
 * into area/city/province/country/street. Emits `picked` on every change.
 *
 * Fully OpenStreetMap: the map is Leaflet and the address lookup is Nominatim, so the
 * whole picker is keyless and free — no Google anywhere. Only the pin's coordinates are
 * authoritative; the resolved address is a convenience the host can fine-tune.
 */
@Component({
  selector: 'hh-location-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  imports: [PlaceSearchField],
  template: `
    <div
      class="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-card"
    >
      <!-- search + my-location -->
      <div class="relative z-10 flex items-center gap-2 border-b border-ink-100 p-3">
        <div
          class="flex flex-1 items-center gap-2 rounded-xl bg-surface px-3 py-2 transition focus-within:ring-2 focus-within:ring-brand-100"
        >
          <i class="ti ti-search text-ink-400" aria-hidden="true"></i>
          <hh-place-search
            class="block flex-1"
            placeholder="Search an address or landmark…"
            (selected)="onPlace($event)"
          />
        </div>
        <button
          type="button"
          (click)="useMyLocation()"
          [disabled]="locating()"
          class="grid h-[38px] w-[42px] place-items-center rounded-xl border border-ink-200 text-brand-500 transition hover:bg-surface disabled:opacity-60"
          aria-label="Use my current location"
        >
          <i
            class="ti"
            [class.ti-current-location]="!locating()"
            [class.ti-loader-2]="locating()"
            [class.animate-spin]="locating()"
            aria-hidden="true"
          ></i>
        </button>
      </div>

      <div class="relative z-0">
          <div #mapEl class="h-[360px] w-full bg-[#eaf0ec]"></div>

          <!-- Map / Satellite -->
          <div
            class="absolute end-3 top-3 flex flex-col overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm"
          >
            <button
              type="button"
              (click)="setMapType('roadmap')"
              class="border-b border-ink-100 px-2.5 py-1.5 text-xs font-medium transition"
              [class]="
                mapType() === 'roadmap'
                  ? 'text-brand-600'
                  : 'text-ink-500 hover:text-ink-700'
              "
            >
              Map
            </button>
            <button
              type="button"
              (click)="setMapType('satellite')"
              class="px-2.5 py-1.5 text-xs font-medium transition"
              [class]="
                mapType() === 'satellite'
                  ? 'text-brand-600'
                  : 'text-ink-500 hover:text-ink-700'
              "
            >
              Satellite
            </button>
          </div>

          <!-- coordinate readout -->
          <div
            class="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg bg-ink-900/85 px-3 py-1.5 text-xs font-medium text-white"
          >
            Lat: {{ lat().toFixed(5) }} · Lng: {{ lng().toFixed(5) }}
          </div>
        </div>

        <div
          class="flex items-center gap-1.5 border-t border-ink-100 p-3 text-sm font-medium"
          [class]="pinned() ? 'bg-tint-mint/60 text-ok' : 'text-ink-500'"
        >
          <i
            class="ti"
            [class.ti-circle-check]="pinned()"
            [class.ti-info-circle]="!pinned()"
            aria-hidden="true"
          ></i>
          {{
            pinned()
              ? 'Location pinned — drag the pin to fine-tune.'
              : 'Search, click the map, or drag the pin to set your location.'
          }}
        </div>
    </div>
  `,
})
export class LocationPicker {
  private readonly loader = inject(LeafletLoader);
  private readonly geo = inject(GeolocationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly mapEl = viewChild<ElementRef<HTMLElement>>('mapEl');

  /** Initial pin position (e.g. restored from a draft). Defaults to Pakistan's centre. */
  readonly initialLat = input<number>();
  readonly initialLng = input<number>();
  readonly initialZoom = input(15);
  readonly picked = output<PickedLocation>();

  protected readonly lat = signal(0);
  protected readonly lng = signal(0);
  protected readonly pinned = signal(false);
  protected readonly locating = signal(false);
  protected readonly mapType = signal<'roadmap' | 'satellite'>('roadmap');

  private map?: L.Map;
  private leaflet?: typeof L;
  private marker?: L.Marker;
  private tiles?: L.TileLayer;
  /** Aborts an earlier reverse-geocode when the pin moves again before it resolves. */
  private geocodeCtrl?: AbortController;

  constructor() {
    afterNextRender(() => void this.init());
    // Unlike the pooled search map, each picker owns its map outright — nothing reuses it
    // afterwards. Leaflet binds document/window listeners and keeps its layers and in-flight
    // tile requests alive until `remove()`, so dropping the component is not enough.
    this.destroyRef.onDestroy(() => {
      this.geocodeCtrl?.abort();
      this.map?.remove();
      this.map = undefined;
    });
  }

  private async init(): Promise<void> {
    const el = this.mapEl()?.nativeElement;
    if (!el) return;
    let leaflet: typeof L;
    try {
      leaflet = await this.loader.load();
    } catch {
      return;
    }
    this.leaflet = leaflet;
    await whenSized(el);

    const lat0 = this.initialLat() ?? 30.3753;
    const lng0 = this.initialLng() ?? 69.3451;
    this.lat.set(lat0);
    this.lng.set(lng0);

    this.map = leaflet.map(el, {
      center: [lat0, lng0],
      zoom: this.initialZoom(),
      zoomControl: true,
    });
    this.tiles = this.loader.tileLayer(leaflet, 'roadmap').addTo(this.map);

    this.marker = leaflet
      .marker([lat0, lng0], {
        icon: brandPinIcon(leaflet, 1.2),
        draggable: true,
        autoPan: true, // dragging to the edge scrolls the map rather than stopping
      })
      .addTo(this.map);

    // Live readout while dragging; the address lookup waits for the drop, so a single
    // drag costs one geocode rather than one per frame.
    this.marker.on('drag', () => {
      const p = this.marker?.getLatLng();
      if (!p) return;
      this.lat.set(p.lat);
      this.lng.set(p.lng);
    });
    this.marker.on('dragend', () => {
      const p = this.marker?.getLatLng();
      if (p) this.commit(p.lat, p.lng);
    });
    this.map.on('click', (e: L.LeafletMouseEvent) =>
      this.placeAt(e.latlng.lat, e.latlng.lng),
    );
  }

  protected onPlace(p: PlaceResult): void {
    this.marker?.setLatLng([p.lat, p.lng]);
    this.map?.setView([p.lat, p.lng], Math.max(p.zoom ?? 16, 15));
    this.lat.set(p.lat);
    this.lng.set(p.lng);
    this.pinned.set(true);
    // A picked place already carries its address components — use them directly (no Geocoding
    // API needed). Fall back to reverse-geocoding only when the place had none.
    if (p.area || p.city || p.province || p.country || p.street) {
      this.picked.emit({
        lat: p.lat,
        lng: p.lng,
        area: p.area ?? '',
        city: p.city ?? '',
        province: p.province ?? '',
        country: p.country ?? '',
        street: p.street ?? '',
        formatted: p.formatted ?? '',
      });
    } else {
      void this.reverseGeocode(p.lat, p.lng);
    }
  }

  protected async useMyLocation(): Promise<void> {
    this.locating.set(true);
    try {
      const c = await this.geo.getCurrent();
      this.marker?.setLatLng([c.lat, c.lng]);
      this.map?.setView([c.lat, c.lng], 16);
      this.commit(c.lat, c.lng);
    } catch {
      /* denied / unavailable — leave the pin where it is */
    } finally {
      this.locating.set(false);
    }
  }

  /** Swaps the basemap tiles in place, so the pin and camera stay exactly as they are. */
  protected setMapType(type: 'roadmap' | 'satellite'): void {
    if (this.mapType() === type) return;
    this.mapType.set(type);
    if (!this.map || !this.leaflet) return;
    this.tiles?.remove();
    this.tiles = this.loader.tileLayer(this.leaflet, type).addTo(this.map);
    // Satellite imagery stops at a shallower zoom than the road basemap; staying past it
    // would show empty tiles.
    const max = this.loader.maxZoom(type);
    if (this.map.getZoom() > max) this.map.setZoom(max);
  }

  /** Move the pin (search / click / my-location), recentre, then resolve the address. */
  private placeAt(lat: number, lng: number): void {
    this.marker?.setLatLng([lat, lng]);
    this.map?.panTo([lat, lng]);
    this.commit(lat, lng);
  }

  /** Record coordinates and reverse-geocode → emit. (Assumes the pin is already there.) */
  private commit(lat: number, lng: number): void {
    this.lat.set(lat);
    this.lng.set(lng);
    this.pinned.set(true);
    void this.reverseGeocode(lat, lng);
  }

  private async reverseGeocode(lat: number, lng: number): Promise<void> {
    // Supersede any in-flight lookup — the pin has moved, so its answer is now stale.
    this.geocodeCtrl?.abort();
    const ctrl = new AbortController();
    this.geocodeCtrl = ctrl;
    try {
      const addr = await nominatimReverse(lat, lng, ctrl.signal);
      this.picked.emit({ lat, lng, ...addr });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return; // superseded — a newer pin will emit
      // Network/lookup failure: still emit the coordinates (the authoritative part) with
      // blank address fields, so the pin is recorded even when the address can't resolve.
      this.picked.emit({
        lat,
        lng,
        area: '',
        city: '',
        province: '',
        country: '',
        street: '',
        formatted: '',
      });
    }
  }
}
