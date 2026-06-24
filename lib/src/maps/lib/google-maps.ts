/// <reference types="google.maps" />
import {
  inject,
  Injectable,
  InjectionToken,
  type Provider,
} from '@angular/core';

export interface GoogleMapsConfig {
  /** Maps JS + Places API key — a public, referrer-restricted client key. Empty ⇒ "add key" notice. */
  apiKey: string;
  /** Map ID for AdvancedMarkerElement price pins. 'DEMO_MAP_ID' works for testing. */
  mapId: string;
}

export const GOOGLE_MAPS_CONFIG = new InjectionToken<GoogleMapsConfig>(
  'GOOGLE_MAPS_CONFIG',
  {
    factory: () => ({ apiKey: '', mapId: 'DEMO_MAP_ID' }),
  },
);

/** Provide Google Maps credentials in the app config (see app.config.ts). */
export function provideGoogleMaps(config: GoogleMapsConfig): Provider {
  return { provide: GOOGLE_MAPS_CONFIG, useValue: config };
}

/**
 * Loads the Google Maps JS API (Places + Marker libraries) once, in the browser.
 * Components call `load()` from `afterNextRender`, so nothing touches `window`/`google`
 * during SSR.
 */
@Injectable({ providedIn: 'root' })
export class GoogleMapsLoader {
  private readonly config = inject(GOOGLE_MAPS_CONFIG);
  private promise?: Promise<void>;

  /** True once an API key is configured; components show a notice otherwise. */
  get configured(): boolean {
    return this.config.apiKey.trim().length > 0;
  }

  /** Map ID used for the AdvancedMarkerElement price pins. */
  get mapId(): string {
    return this.config.mapId || 'DEMO_MAP_ID';
  }

  load(): Promise<void> {
    if (this.promise) return this.promise;
    this.promise = new Promise<void>((resolve, reject) => {
      if (typeof window === 'undefined') {
        reject(new Error('Google Maps cannot load during SSR'));
        return;
      }
      if (typeof google !== 'undefined' && google.maps) {
        resolve();
        return;
      }
      if (!this.configured) {
        reject(new Error('Google Maps API key not configured'));
        return;
      }
      const cb = '__hhGoogleMapsReady';
      (window as unknown as Record<string, unknown>)[cb] = () => resolve();
      const s = document.createElement('script');
      s.src =
        'https://maps.googleapis.com/maps/api/js' +
        `?key=${encodeURIComponent(this.config.apiKey)}` +
        `&libraries=places,marker&loading=async&callback=${cb}`;
      s.async = true;
      s.onerror = () =>
        reject(new Error('Failed to load the Google Maps JS API'));
      document.head.appendChild(s);
    });
    return this.promise;
  }
}
