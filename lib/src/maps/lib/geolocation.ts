import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';

export interface Coords {
  lat: number;
  lng: number;
}

/**
 * Current-position lookup that works on both targets: the native
 * `@capacitor/geolocation` plugin inside the Capacitor WebView (so Android/iOS
 * show the OS permission prompt), and the browser Geolocation API on the web.
 * The plugin is dynamically imported so it never enters the web bundle's eager
 * path.
 */
@Injectable({ providedIn: 'root' })
export class GeolocationService {
  async getCurrent(): Promise<Coords> {
    if (Capacitor.isNativePlatform()) {
      const { Geolocation } = await import('@capacitor/geolocation');
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    }
    return new Promise<Coords>((resolve, reject) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        reject(new Error('Geolocation is not available'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });
  }
}
