import { Injectable, InjectionToken, inject, type Provider } from '@angular/core';
import type * as L from 'leaflet';

/**
 * Basemap tiles. Leaflet only *renders* tiles — it never provides them — so the
 * provider is config, not code. Swapping providers (or moving to self-hosted
 * Protomaps on R2) is a change here and nowhere else.
 *
 * `roadmap` is the everyday basemap; `satellite` backs the host-side picker's
 * Map/Satellite toggle. `maxZoom` is the provider's real limit — overshooting it
 * serves 404s that Leaflet renders as grey squares.
 */
export interface TileLayerConfig {
  url: string;
  attribution: string;
  maxZoom: number;
  /** Subdomain placeholders for `{s}` in the URL, when the provider shards. */
  subdomains?: string;
}

export interface LeafletMapsConfig {
  roadmap: TileLayerConfig;
  satellite: TileLayerConfig;
}

/**
 * CARTO Voyager — free, no API key, and visually closest to the Google basemap
 * this replaces. It has a fair-use policy rather than a hard quota, so it is the
 * right default to launch on and the wrong one to stay on: at sustained
 * production traffic, move to MapTiler or self-hosted Protomaps tiles by
 * overriding this config. Nothing else in the app has to change.
 */
const DEFAULT_CONFIG: LeafletMapsConfig = {
  roadmap: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20,
    subdomains: 'abcd',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
    maxZoom: 19,
  },
};

export const LEAFLET_MAPS_CONFIG = new InjectionToken<LeafletMapsConfig>(
  'LEAFLET_MAPS_CONFIG',
  { factory: () => DEFAULT_CONFIG },
);

/** Override the basemap tile provider in the app config (see app.config.ts). */
export function provideLeafletMaps(
  config: Partial<LeafletMapsConfig> = {},
): Provider {
  return {
    provide: LEAFLET_MAPS_CONFIG,
    useValue: { ...DEFAULT_CONFIG, ...config },
  };
}

/**
 * Loads Leaflet once, in the browser only.
 *
 * Leaflet touches `window` at module scope, so it cannot be a static import in an
 * SSR build — it is dynamically imported here and every caller awaits `load()`
 * from `afterNextRender`. Unlike the Google loader this fetches no third-party
 * script and needs no API key, so there is no "not configured" state to degrade
 * to: the map always renders.
 */
@Injectable({ providedIn: 'root' })
export class LeafletLoader {
  private readonly config = inject(LEAFLET_MAPS_CONFIG);
  private promise?: Promise<typeof L>;

  load(): Promise<typeof L> {
    if (this.promise) return this.promise;
    this.promise = (async () => {
      if (typeof window === 'undefined') {
        throw new Error('Leaflet cannot load during SSR');
      }
      const mod = await import('leaflet');
      // Leaflet ships both ESM and CJS shapes depending on bundler interop.
      return ((mod as unknown as { default?: typeof L }).default ??
        mod) as typeof L;
    })();
    return this.promise;
  }

  /** Builds the tile layer for a basemap kind, using the configured provider. */
  tileLayer(leaflet: typeof L, kind: 'roadmap' | 'satellite' = 'roadmap'): L.TileLayer {
    const c = this.config[kind];
    return leaflet.tileLayer(c.url, {
      attribution: c.attribution,
      maxZoom: c.maxZoom,
      ...(c.subdomains ? { subdomains: c.subdomains } : {}),
    });
  }

  /** Max zoom for a basemap kind — callers clamp to this so tiles never 404. */
  maxZoom(kind: 'roadmap' | 'satellite' = 'roadmap'): number {
    return this.config[kind].maxZoom;
  }
}

const BRAND = '#F36E21';

/**
 * Brand teardrop pin, replacing Google's `PinElement`. Sized in CSS pixels and
 * anchored at the tip, so the point of the drop sits exactly on the coordinate.
 */
export function brandPinIcon(leaflet: typeof L, scale = 1): L.DivIcon {
  const w = Math.round(28 * scale);
  const h = Math.round(40 * scale);
  return leaflet.divIcon({
    className: '', // drop Leaflet's default white box
    iconSize: [w, h],
    iconAnchor: [w / 2, h], // tip of the drop, not its centre
    html:
      `<svg width="${w}" height="${h}" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg">` +
      `<path d="M14 1C6.8 1 1 6.8 1 14c0 9.9 13 25 13 25s13-15.1 13-25C27 6.8 21.2 1 14 1z" ` +
      `fill="${BRAND}" stroke="#fff" stroke-width="2"/>` +
      `<circle cx="14" cy="14" r="4.5" fill="#fff"/></svg>`,
  });
}

/**
 * Resolves once `el` has a non-zero box — or after `timeoutMs` regardless, so a
 * pane that never becomes visible degrades to a blank map rather than hanging.
 *
 * Leaflet measures its container at construction, exactly like the Google Map did.
 * Built while detached, `display:none`, or otherwise 0×0 — as on mobile, where the
 * map pane is hidden until the user taps "Map" — it decides it has no viewport and
 * renders nothing until an explicit `invalidateSize()`.
 */
export function whenSized(el: HTMLElement, timeoutMs = 2000): Promise<void> {
  if (el.offsetWidth > 0 && el.offsetHeight > 0) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearTimeout(timer);
      resolve();
    };
    const observer = new ResizeObserver(() => {
      if (el.offsetWidth > 0 && el.offsetHeight > 0) finish();
    });
    observer.observe(el);
    const timer = setTimeout(finish, timeoutMs);
  });
}
