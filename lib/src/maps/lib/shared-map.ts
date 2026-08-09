import { inject, Injectable } from '@angular/core';
import type * as L from 'leaflet';
import { LeafletLoader, whenSized } from './leaflet';

/** Starting camera. Applied at creation, and re-applied whenever the map is re-mounted. */
export interface SharedMapOptions {
  center: L.LatLngExpression;
  zoom: number;
}

/**
 * Keeps a single Leaflet map alive across route changes.
 *
 * Leaflet has no per-load billing, so unlike the Google map this replaces there is no
 * invoice to avoid — what reuse buys now is warmth. Search → listing → back is this app's
 * most-travelled path, and rebuilding the map on each return re-downloads the whole
 * visible tile set and re-runs Leaflet's setup, giving the user a grey flash every time.
 * A borrowed map comes back with its tiles already painted.
 *
 * It also keeps tile requests down, which matters on a fair-use basemap like the default
 * CARTO one — see `leaflet.ts`.
 *
 * Single-borrower by design: one component holds the map at a time, mounts it in its own
 * element, and returns it on destroy.
 */
@Injectable({ providedIn: 'root' })
export class SharedMap {
  private readonly loader = inject(LeafletLoader);
  private container?: HTMLDivElement;
  private map?: L.Map;
  private leaflet?: typeof L;
  /** Registered by the current borrower — detached on release, so handlers never stack
   *  up across navigations. Leaflet's `off` matches on the handler reference, so the
   *  exact pair has to be kept. */
  private listeners: { event: string; handler: () => void }[] = [];

  /**
   * Mounts the shared map inside `parent`, building it on the first call only.
   * Returns the Leaflet namespace alongside the map so callers can construct layers,
   * icons and bounds without importing Leaflet statically — it is browser-only.
   */
  async acquire(
    parent: HTMLElement,
    options: SharedMapOptions,
  ): Promise<{ map: L.Map; leaflet: typeof L }> {
    const leaflet = (this.leaflet ??= await this.loader.load());
    this.container ??= createContainer();
    parent.appendChild(this.container);
    // Leaflet measures its container once, at construction — see `whenSized`.
    await whenSized(this.container);

    if (!this.map) {
      this.map = leaflet.map(this.container, {
        center: options.center,
        zoom: options.zoom,
        maxZoom: this.loader.maxZoom(),
        zoomControl: false,
      });
      leaflet.control.zoom({ position: 'bottomright' }).addTo(this.map);
      this.loader.tileLayer(leaflet).addTo(this.map);
    } else {
      // Re-mounted into a different element, whose box Leaflet has never measured; its
      // cached size is from the previous host and everything would render offset.
      this.map.invalidateSize();
      this.map.setView(options.center, options.zoom);
    }
    return { map: this.map, leaflet };
  }

  /** Adds a map listener scoped to the current borrow; detached by `release()`. */
  listen(event: string, handler: () => void): void {
    if (!this.map) return;
    this.map.on(event, handler);
    this.listeners.push({ event, handler });
  }

  /**
   * Detaches the map from the borrower's DOM and drops its listeners. The map instance
   * itself is deliberately kept, so the next `acquire()` re-mounts it warm.
   */
  release(): void {
    for (const { event, handler } of this.listeners) this.map?.off(event, handler);
    this.listeners = [];
    this.container?.remove();
  }
}

function createContainer(): HTMLDivElement {
  const el = document.createElement('div');
  el.style.width = '100%';
  el.style.height = '100%';
  return el;
}
