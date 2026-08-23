import { Injectable, computed, signal } from '@angular/core';

/**
 * Longest the overlay may stay up, whatever is still outstanding.
 *
 * A backstop, not a schedule: every holder releases its own claim, and this only matters if
 * one never does. Sits just above the geo lookup's own 5s budget so a hung third-party host
 * cannot leave the app behind a spinner it has no way out of.
 */
const MAX_MS = 6000;

/**
 * Whether the app is still working out who and where the visitor is.
 *
 * Two things resolve at startup and both can change what is on screen: `GET /api/users/current`
 * decides whether there is a session, and the country lookup decides the language and the
 * currency. Language in particular is a navigation — resolving it after the page is readable
 * means the visitor starts reading and is then moved to `/de/…` underneath them.
 *
 * A counter rather than a boolean because the two overlap and finish out of order; the overlay
 * lifts when the last one releases, not the first.
 *
 * Deliberately narrow: only startup claims this. A mid-session role refresh also calls
 * `/api/users/current`, and covering the app for that would blank a page the visitor is
 * already using.
 */
@Injectable({ providedIn: 'root' })
export class StartupGate {
  private readonly holders = signal(0);
  private timer?: ReturnType<typeof setTimeout>;
  private expired = false;

  /** True while anything is still resolving — bound to the overlay. */
  readonly busy = computed(() => !this.expired && this.holders() > 0);

  /**
   * Claims the gate until the returned function is called.
   *
   * Returns a release rather than exposing `end()`, so a caller cannot release someone else's
   * claim, and calling it twice is harmless.
   */
  hold(): () => void {
    if (this.expired) return () => undefined;
    this.holders.update((n) => n + 1);
    this.timer ??= setTimeout(() => {
      this.expired = true;
      this.holders.set(0);
    }, MAX_MS);

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holders.update((n) => Math.max(0, n - 1));
    };
  }
}
