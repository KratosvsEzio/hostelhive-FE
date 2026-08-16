import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';

/**
 * Thin wrapper over the Capacitor Camera plugin, used by {@link PhotoPicker} on the packaged
 * native app. On the web this is never called — the picker falls back to a `getUserMedia`
 * overlay — so the plugin is imported lazily to keep it out of the web bundle's initial load.
 */
@Injectable({ providedIn: 'root' })
export class NativeCamera {
  /** True inside the packaged Capacitor app, where the native camera is available. */
  get available(): boolean {
    return Capacitor.isNativePlatform();
  }

  /** Snap a photo with the device camera and return it as a File (null if cancelled). */
  async capture(): Promise<File | null> {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
    const photo = await Camera.getPhoto({
      quality: 90,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      correctOrientation: true,
    });
    const path = photo.webPath;
    if (!path) return null;
    const blob = await fetch(path).then((r) => r.blob());
    const format = (photo.format || 'jpeg').toLowerCase();
    return new File([blob], `camera-photo.${format}`, { type: `image/${format}` });
  }
}
