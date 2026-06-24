/// <reference types="google.maps" />
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { GoogleMapsLoader } from './google-maps';

const BRAND = '#F36E21';

/**
 * Read-only Google Map showing a single brand pin at the given coordinates — for
 * detail/review screens that just need to *display* a location (no search, drag, or
 * geocoding; that's `hh-location-picker`). Set the height with a utility class on the
 * host, e.g. `<hh-static-map class="h-56" [lat]="…" [lng]="…" />`.
 *
 * Degrades gracefully: a notice when no coordinates are set, and another when no Maps
 * API key is configured. SSR-safe — the map only initialises after the first render.
 */
@Component({
  selector: 'hh-static-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (!coords()) {
      <div
        class="grid h-full min-h-44 place-items-center rounded-xl border border-ink-100 bg-surface px-6 text-center"
      >
        <div class="text-ink-400">
          <i
            class="ti ti-map-pin-off text-2xl text-ink-300"
            aria-hidden="true"
          ></i>
          <p class="mt-2 text-sm">No coordinates set for this listing.</p>
        </div>
      </div>
    } @else if (!loader.configured) {
      <div
        class="grid h-full min-h-44 place-items-center rounded-xl border border-ink-100 bg-surface px-6 text-center"
      >
        <div class="text-ink-400">
          <i class="ti ti-map-off text-2xl text-ink-300" aria-hidden="true"></i>
          <p class="mt-2 text-sm">
            Map unavailable — add a Google Maps API key to <code>.env</code>.
          </p>
        </div>
      </div>
    } @else {
      <div #mapEl class="h-full w-full rounded-xl bg-[#eaf0ec]"></div>
    }
  `,
})
export class StaticMap {
  protected readonly loader = inject(GoogleMapsLoader);
  private readonly mapEl = viewChild<ElementRef<HTMLElement>>('mapEl');

  readonly lat = input<number | string | null>(null);
  readonly lng = input<number | string | null>(null);
  readonly label = input('');
  readonly zoom = input(15);

  /** Parsed coordinates, or null when unset/invalid/(0,0). */
  protected readonly coords = computed<{ lat: number; lng: number } | null>(
    () => {
      const lat = toNum(this.lat());
      const lng = toNum(this.lng());
      if (lat === null || lng === null || (lat === 0 && lng === 0)) return null;
      return { lat, lng };
    },
  );

  private readonly browserReady = signal(false);
  private map?: google.maps.Map;
  private marker?: google.maps.marker.AdvancedMarkerElement;
  private rendered = false;

  constructor() {
    afterNextRender(() => this.browserReady.set(true));
    // Initialise once the map element exists and coordinates are known; re-centre on change.
    effect(() => {
      const el = this.mapEl()?.nativeElement;
      const c = this.coords();
      if (!this.browserReady() || !el || !c || !this.loader.configured) return;
      void this.render(el, c);
    });
  }

  private async render(
    el: HTMLElement,
    c: { lat: number; lng: number },
  ): Promise<void> {
    if (this.rendered) {
      this.map?.setCenter(c);
      if (this.marker) this.marker.position = c;
      return;
    }
    this.rendered = true; // set synchronously — guards against a double-create race
    try {
      await this.loader.load();
    } catch {
      this.rendered = false;
      return;
    }

    this.map = new google.maps.Map(el, {
      center: c,
      zoom: this.zoom(),
      mapId: this.loader.mapId,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: true,
      clickableIcons: false,
      gestureHandling: 'cooperative', // don't hijack page scroll
    });

    const pin = new google.maps.marker.PinElement({
      background: BRAND,
      borderColor: '#ffffff',
      glyphColor: '#ffffff',
      scale: 1.1,
    });
    this.marker = new google.maps.marker.AdvancedMarkerElement({
      map: this.map,
      position: c,
      content: pin.element,
      title: this.label(),
    });
  }
}

/** Coerce a decimal that Rails may serialize as a string; null for blank/non-finite. */
function toNum(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
