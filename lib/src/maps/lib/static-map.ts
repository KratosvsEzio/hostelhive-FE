import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type * as L from 'leaflet';
import { brandPinIcon, LeafletLoader, whenSized } from './leaflet';

/**
 * Read-only map showing a single brand pin at the given coordinates — for
 * detail/review screens that just need to *display* a location (no search, drag, or
 * geocoding; that's `hh-location-picker`). Set the height with a utility class on the
 * host, e.g. `<hh-static-map class="h-56" [lat]="…" [lng]="…" />`.
 *
 * Degrades gracefully: a notice when no coordinates are set. SSR-safe — the map only
 * initialises after the first render.
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
    } @else {
      <div #mapEl class="h-full w-full rounded-xl bg-[#eaf0ec]"></div>
    }
  `,
})
export class StaticMap {
  private readonly loader = inject(LeafletLoader);
  private readonly destroyRef = inject(DestroyRef);
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
  private map?: L.Map;
  private marker?: L.Marker;
  private rendered = false;

  constructor() {
    afterNextRender(() => this.browserReady.set(true));
    // Initialise once the map element exists and coordinates are known; re-centre on change.
    effect(() => {
      const el = this.mapEl()?.nativeElement;
      const c = this.coords();
      if (!this.browserReady() || !el || !c) return;
      void this.render(el, c);
    });
    // This map lives inline on the listing-detail page and is never reused — Leaflet keeps
    // its document/window listeners and tile requests alive until `remove()`, so leaving it
    // out leaks one map per listing the user opens.
    this.destroyRef.onDestroy(() => {
      this.map?.remove();
      this.map = undefined;
    });
  }

  private async render(
    el: HTMLElement,
    c: { lat: number; lng: number },
  ): Promise<void> {
    if (this.rendered) {
      this.map?.setView([c.lat, c.lng], this.map.getZoom());
      this.marker?.setLatLng([c.lat, c.lng]);
      return;
    }
    this.rendered = true; // set synchronously — guards against a double-create race
    let leaflet: typeof L;
    try {
      leaflet = await this.loader.load();
    } catch {
      this.rendered = false;
      return;
    }
    // The host sets the height with a utility class, which may not have resolved yet;
    // Leaflet measures once at construction, so wait for a real box first.
    await whenSized(el);

    this.map = leaflet.map(el, {
      center: [c.lat, c.lng],
      zoom: this.zoom(),
      zoomControl: true,
      // Don't hijack page scroll — this map sits inline in a scrolling detail page.
      scrollWheelZoom: false,
    });
    this.loader.tileLayer(leaflet, 'roadmap').addTo(this.map);

    this.marker = leaflet
      .marker([c.lat, c.lng], {
        icon: brandPinIcon(leaflet, 1.1),
        title: this.label(),
        interactive: false, // display-only: no hover cursor, no click target
      })
      .addTo(this.map);
  }
}

/** Coerce a decimal that Rails may serialize as a string; null for blank/non-finite. */
function toNum(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
