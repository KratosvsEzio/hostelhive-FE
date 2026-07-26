import { Injectable, signal } from '@angular/core';

export type ToastKind = 'error' | 'info' | 'success';

export interface Toast {
  readonly id: number;
  readonly kind: ToastKind;
  readonly title: string;
  readonly message?: string;
}

/** Most toasts kept on screen at once; the oldest is dropped when a new one overflows the cap. */
const MAX_TOASTS = 4;

/**
 * App-wide, non-blocking notifications (toasts). Signal-backed so {@link ToastHost} renders
 * reactively. Wired to the data-access error interceptor via `API_ERROR_NOTIFIER` (see
 * app.config), so any failed API call surfaces here with no per-call code — while the page
 * itself stays interactive.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private seq = 0;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  /** Currently visible toasts, oldest first. */
  readonly toasts = signal<readonly Toast[]>([]);

  /**
   * Show a toast; auto-dismisses after `ttlMs` (0 keeps it until dismissed). Returns its id.
   * An identical, still-visible toast (same kind/title/message) is coalesced: its timer is
   * refreshed and its existing id returned instead of stacking a duplicate.
   */
  show(toast: Omit<Toast, 'id'>, ttlMs = 6000): number {
    // Toasts are a browser-only surface — skip on the server so SSR never renders one
    // (which would hydrate-mismatch against the empty client-initial state).
    if (typeof window === 'undefined') return -1;

    const existing = this.toasts().find(
      (t) =>
        t.kind === toast.kind &&
        t.title === toast.title &&
        t.message === toast.message,
    );
    if (existing) {
      this.arm(existing.id, ttlMs);
      return existing.id;
    }

    const id = ++this.seq;
    this.toasts.update((list) => [...list, { ...toast, id }].slice(-MAX_TOASTS));
    this.arm(id, ttlMs);
    return id;
  }

  error(title: string, message?: string): number {
    return this.show({ kind: 'error', title, message });
  }

  info(title: string, message?: string): number {
    return this.show({ kind: 'info', title, message });
  }

  success(title: string, message?: string): number {
    return this.show({ kind: 'success', title, message });
  }

  dismiss(id: number): void {
    this.clearTimer(id);
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  /** (Re)arms the auto-dismiss timer for a toast; a non-positive ttl pins it until dismissed. */
  private arm(id: number, ttlMs: number): void {
    this.clearTimer(id);
    if (ttlMs > 0) this.timers.set(id, setTimeout(() => this.dismiss(id), ttlMs));
  }

  private clearTimer(id: number): void {
    const timer = this.timers.get(id);
    if (timer === undefined) return;
    clearTimeout(timer);
    this.timers.delete(id);
  }
}
