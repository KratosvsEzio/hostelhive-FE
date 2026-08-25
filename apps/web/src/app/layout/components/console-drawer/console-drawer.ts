import { Injectable, computed, signal } from '@angular/core';

/** Icons only. */
export const RAIL_WIDTH = '4rem';

/** Icons and labels. */
export const FULL_WIDTH = '16rem';

/** Remembered across visits, so expanding once does not have to be done every morning. */
const KEY = 'hh.sidebar.expanded';

/**
 * How wide the console's sidebar is (HostShell + StaffShell).
 *
 * **Collapsed is the default, at every width.** Not a width rule: the console's own content
 * — a seven-column calendar, a six-column table, a drawer beside a grid — is what the screen
 * is for, and 256px of permanent navigation is a standing tax on it. The icons are the same
 * ten a host already knows the position of, so the labels are worth their space only while
 * somebody is looking for something.
 *
 * There is no open/closed any more, only narrow and wide. The sidebar used to hide behind a
 * hamburger under 1024px; now it narrows instead, so navigation is always on screen and
 * there is nothing left for a menu button to reveal. Below phone width it is not rendered at
 * all — the bottom tab bar takes over, see {@link MobileApp}.
 */
@Injectable({ providedIn: 'root' })
export class ConsoleDrawer {
  /**
   * Whether the visitor has expanded it.
   *
   * Starts from storage rather than from the window, so the answer survives a reload. A
   * host who expanded the sidebar yesterday is not asked again today, and one who never
   * touched it keeps the rail.
   */
  private readonly expanded = signal(read());

  /** True when the sidebar is a rail of icons — which is the starting state. */
  readonly railed = computed(() => !this.expanded());

  /** The sidebar's width, and so the inset the content needs to clear it. */
  readonly width_ = computed(() => (this.railed() ? RAIL_WIDTH : FULL_WIDTH));

  /** The chevron. */
  toggleRail(): void {
    const next = !this.expanded();
    this.expanded.set(next);
    try {
      localStorage.setItem(KEY, next ? '1' : '0');
    } catch {
      /* private mode — the choice still holds for this session */
    }
  }
}

/** Absent means collapsed: the default is the rail, and only an explicit `1` opts out. */
function read(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
