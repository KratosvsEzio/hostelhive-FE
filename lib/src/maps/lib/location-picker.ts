/// <reference types="google.maps" />
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { GoogleMapsLoader } from './google-maps';
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

const BRAND = '#F36E21';

/**
 * Real Google Map location picker: a Places search box (reusing `hh-place-search`),
 * a draggable brand pin, click-to-move, "use my location", and reverse-geocoding that
 * resolves the pinned point into area/city/province/country/street. Emits `picked` on
 * every change. Degrades to a notice when no Maps API key is configured.
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
      <div class="flex items-center gap-2 border-b border-ink-100 p-3">
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

      @if (!loader.configured) {
        <div
          class="grid h-[360px] place-items-center bg-surface px-6 text-center"
        >
          <div class="text-ink-400">
            <i
              class="ti ti-map-off text-3xl text-ink-300"
              aria-hidden="true"
            ></i>
            <p class="mt-2 text-sm">
              Map unavailable — add a Google Maps API key to <code>.env</code>.
            </p>
          </div>
        </div>
      } @else {
        <div class="relative">
          <div #mapEl class="h-[360px] w-full bg-[#eaf0ec]"></div>

          <!-- Map / Satellite -->
          <div
            class="absolute right-3 top-3 flex flex-col overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm"
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
              (click)="setMapType('hybrid')"
              class="px-2.5 py-1.5 text-xs font-medium transition"
              [class]="
                mapType() === 'hybrid'
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
      }
    </div>
  `,
})
export class LocationPicker {
  protected readonly loader = inject(GoogleMapsLoader);
  private readonly geo = inject(GeolocationService);
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
  protected readonly mapType = signal<'roadmap' | 'hybrid'>('roadmap');

  private map?: google.maps.Map;
  private marker?: google.maps.marker.AdvancedMarkerElement;
  private geocoder?: google.maps.Geocoder;

  constructor() {
    afterNextRender(() => void this.init());
  }

  private async init(): Promise<void> {
    const el = this.mapEl()?.nativeElement;
    if (!el || !this.loader.configured) return;
    try {
      await this.loader.load();
    } catch {
      return;
    }

    const lat0 = this.initialLat() ?? 30.3753;
    const lng0 = this.initialLng() ?? 69.3451;
    this.lat.set(lat0);
    this.lng.set(lng0);

    this.geocoder = new google.maps.Geocoder();
    this.map = new google.maps.Map(el, {
      center: { lat: lat0, lng: lng0 },
      zoom: this.initialZoom(),
      mapId: this.loader.mapId,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: true,
      clickableIcons: false,
      gestureHandling: 'greedy',
    });

    const pin = new google.maps.marker.PinElement({
      background: BRAND,
      borderColor: '#ffffff',
      glyphColor: '#ffffff',
      scale: 1.2,
    });
    this.marker = new google.maps.marker.AdvancedMarkerElement({
      map: this.map,
      position: { lat: lat0, lng: lng0 },
      gmpDraggable: true,
      content: pin.element,
    });

    this.marker.addListener('drag', () => {
      const c = this.toCoords(this.marker?.position);
      if (c) {
        this.lat.set(c.lat);
        this.lng.set(c.lng);
      }
    });
    this.marker.addListener('dragend', () => {
      const c = this.toCoords(this.marker?.position);
      if (c) this.commit(c.lat, c.lng);
    });
    this.map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng) this.placeAt(e.latLng.lat(), e.latLng.lng());
    });
  }

  protected onPlace(p: PlaceResult): void {
    if (this.marker) this.marker.position = { lat: p.lat, lng: p.lng };
    this.map?.setZoom(Math.max(p.zoom ?? 16, 15));
    this.map?.panTo({ lat: p.lat, lng: p.lng });
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
      this.map?.setZoom(16);
      this.placeAt(c.lat, c.lng);
    } catch {
      /* denied / unavailable — leave the pin where it is */
    } finally {
      this.locating.set(false);
    }
  }

  protected setMapType(type: 'roadmap' | 'hybrid'): void {
    this.mapType.set(type);
    this.map?.setMapTypeId(type);
  }

  /** Move the pin (search / click / my-location), recentre, then resolve the address. */
  private placeAt(lat: number, lng: number): void {
    if (this.marker) this.marker.position = { lat, lng };
    this.map?.panTo({ lat, lng });
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
    const base = {
      lat,
      lng,
      area: '',
      city: '',
      province: '',
      country: '',
      street: '',
      formatted: '',
    };

    // Try Google Geocoder first (requires billing on the Cloud project).
    if (this.geocoder) {
      try {
        const { results } = await this.geocoder.geocode({
          location: { lat, lng },
        });
        const r = results?.[0];
        if (r) {
          this.picked.emit({ lat, lng, ...parseAddress(r) });
          return;
        }
      } catch {
        // Billing not enabled or quota exceeded — fall through to Nominatim.
      }
    }

    // Nominatim (OpenStreetMap) fallback — free, no API key or billing needed.
    try {
      const addr = await nominatimReverseGeocode(lat, lng);
      this.picked.emit({ lat, lng, ...addr });
    } catch {
      this.picked.emit(base);
    }
  }

  /** AdvancedMarkerElement.position may be a LatLng (methods) or a literal (numbers). */
  private toCoords(
    pos: google.maps.marker.AdvancedMarkerElement['position'],
  ): { lat: number; lng: number } | null {
    if (!pos) return null;
    const p = pos as {
      lat: number | (() => number);
      lng: number | (() => number);
    };
    const lat = typeof p.lat === 'function' ? p.lat() : p.lat;
    const lng = typeof p.lng === 'function' ? p.lng() : p.lng;
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }
}

/** Map Google geocoder address components → our flat address shape. */
function parseAddress(
  r: google.maps.GeocoderResult,
): Omit<PickedLocation, 'lat' | 'lng'> {
  const get = (type: string): string =>
    r.address_components.find((c) => c.types.includes(type))?.long_name ?? '';
  const street = [get('street_number'), get('route')].filter(Boolean).join(' ');
  return {
    street,
    area:
      get('sublocality_level_1') ||
      get('sublocality') ||
      get('neighborhood') ||
      get('administrative_area_level_3'),
    city:
      get('locality') ||
      get('postal_town') ||
      get('administrative_area_level_2'),
    province: get('administrative_area_level_1'),
    country: get('country'),
    formatted: r.formatted_address ?? '',
  };
}

/** Nominatim (OpenStreetMap) reverse geocoding — used as a fallback when the
 *  Google Geocoding API is unavailable (billing not enabled, quota exceeded, etc.).
 *  Free with no API key; throttled to one request per second by OSM policy. */
async function nominatimReverseGeocode(
  lat: number,
  lng: number,
): Promise<Omit<PickedLocation, 'lat' | 'lng'>> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const data = (await res.json()) as {
    display_name?: string;
    address?: Record<string, string>;
  };
  const a = data.address ?? {};
  const street = [a['house_number'], a['road']].filter(Boolean).join(' ');
  return {
    street,
    area:
      a['suburb'] ||
      a['neighbourhood'] ||
      a['quarter'] ||
      a['city_district'] ||
      '',
    city: a['city'] || a['town'] || a['village'] || a['county'] || '',
    province: a['state'] || a['region'] || '',
    country: a['country'] || '',
    formatted: data.display_name || '',
  };
}
