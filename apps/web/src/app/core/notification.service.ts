import { Injectable, signal } from '@angular/core';

export type ToastKind = 'error' | 'info' | 'success';

export interface Toast {
  readonly id: number;
  readonly kind: ToastKind;
  readonly title: string;
  readonly message?: string;
}

/**
 * App-wide, non-blocking notifications (toasts). Signal-backed so {@link ToastHost} renders
 * reactively. Wired to the data-access error interceptor via `API_ERROR_NOTIFIER` (see
 * app.config), so any unexpected API failure surfaces here with no per-call code — while the
 * page itself stays interactive.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private seq = 0;
  /** Currently visible toasts, oldest first. */
  readonly toasts = signal<readonly Toast[]>([]);

  /** Show a toast; auto-dismisses after `ttlMs` (0 keeps it until dismissed). Returns its id. */
  show(toast: Omit<Toast, 'id'>, ttlMs = 6000): number {
    // Toasts are a browser-only surface — skip on the server so SSR never renders one
    // (which would hydrate-mismatch against the empty client-initial state).
    if (typeof window === 'undefined') return -1;
    const id = ++this.seq;
    this.toasts.update((list) => [...list, { ...toast, id }]);
    if (ttlMs > 0) setTimeout(() => this.dismiss(id), ttlMs);
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
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
