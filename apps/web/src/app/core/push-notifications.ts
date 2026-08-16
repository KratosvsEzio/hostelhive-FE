import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';

/**
 * Header names carrying the push identity to the API. `X-FCM-Token` is the name the
 * backend reads; `X-Device-Id` rides alongside it so the backend can key the row on a
 * stable id and overwrite the token when it rotates, instead of accumulating a dead
 * row per rotation.
 */
export const FCM_TOKEN_HEADER = 'X-FCM-Token';
export const DEVICE_ID_HEADER = 'X-Device-Id';

type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

/**
 * Owns the device's FCM registration.
 *
 * The token is issued by Firebase, not derived from anything we control, and it
 * arrives asynchronously via the `registration` listener — so it is exposed as a
 * signal that starts null and fills in once Firebase answers. It also **rotates**
 * (reinstall, cleared data, restore), which is why `deviceId` is carried alongside
 * it: the backend can key on the stable id and overwrite the token rather than
 * accumulating a dead row per rotation.
 *
 * `deviceId` is stable per *install*, not true hardware identity — Android does not
 * expose a durable hardware id to apps, and iOS gives `identifierForVendor`. It
 * survives token rotation but resets on reinstall.
 *
 * No-ops off-native, and the plugins are imported dynamically so they stay out of the
 * web bundle's eager path (same reasoning as `capacitor/native.ts`).
 */
@Injectable({ providedIn: 'root' })
export class PushNotificationsService {
  /** FCM registration token, or null until Firebase issues one (or if unavailable). */
  readonly token = signal<string | null>(null);
  /** Stable-per-install device identifier, sent alongside the token. */
  readonly deviceId = signal<string | null>(null);
  readonly permission = signal<PermissionState>('unsupported');
  /** Last error reported by the platform's registration attempt, for diagnostics. */
  readonly registrationError = signal<string | null>(null);

  private started = false;

  /**
   * Requests notification permission and registers with FCM.
   *
   * Safe to call more than once; only the first call does any work. On Android 13+
   * this triggers the POST_NOTIFICATIONS runtime prompt, so call it at a point where
   * a permission dialog makes sense to the user rather than on cold start.
   */
  async init(): Promise<void> {
    if (this.started || !Capacitor.isNativePlatform()) return;
    this.started = true;

    const [{ Device }, { PushNotifications: Push }] = await Promise.all([
      import('@capacitor/device'),
      import('@capacitor/push-notifications'),
    ]);

    // Independent of notification permission — worth having even if the user declines,
    // so the backend can still identify the device on later attempts.
    try {
      this.deviceId.set((await Device.getId()).identifier);
    } catch {
      this.deviceId.set(null);
    }

    // Register the listeners before calling register(), or a fast callback is missed.
    await Push.addListener('registration', (t) => {
      this.registrationError.set(null);
      this.token.set(t.value);
    });

    await Push.addListener('registrationError', (err) => {
      this.registrationError.set(String(err?.error ?? 'registration failed'));
      this.token.set(null);
    });

    try {
      let status = await Push.checkPermissions();
      if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') {
        status = await Push.requestPermissions();
      }
      this.permission.set(status.receive === 'granted' ? 'granted' : 'denied');
      if (status.receive !== 'granted') return;

      await Push.register();
    } catch (e) {
      this.registrationError.set(String(e));
      this.permission.set('denied');
    }
  }

  /** Clears the local copy on sign-out. Does not unregister the device with FCM. */
  reset(): void {
    this.token.set(null);
  }
}
