import { Injectable, signal } from '@angular/core';

/** Shared open/close state for the console's mobile navigation drawer (HostShell + StaffShell). */
@Injectable({ providedIn: 'root' })
export class ConsoleDrawer {
  readonly open = signal(
    typeof window !== 'undefined' && window.innerWidth >= 1024,
  );
  toggle(): void {
    this.open.update((o) => !o);
  }
  close(): void {
    this.open.set(false);
  }
}
