import { Injectable, computed, signal } from '@angular/core';

/** Icons only. */
export const RAIL_WIDTH = '4rem';

/** Icons and labels. */
export const FULL_WIDTH = '16rem';

/** Remembered across visits, so expanding once does not have to be done every morning. */
const KEY = 'hh.sidebar.expanded';

/**
 * How long the sidebar's width takes to settle, mirroring `duration-200` on the `<aside>`
 * in both shells. A hair under it, so the labels go as the slide lands rather than after
 * it has visibly stopped.
 */
export const RAIL_SETTLE_MS = 180;

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

  private readonly _railVisual = signal(!read());

  /** True when the sidebar is a rail of icons — which is the starting state. */
  readonly railed = computed(() => !this.expanded());


  /**
   * What the sidebar's *contents* should look like, which is not what its width is doing.
   *
   * The box takes 200ms to travel between 4rem and 16rem. Switching the labels on
   * {@link railed} threw them away on the first frame, so the text vanished while the panel
   * was still at full width and the slide that followed looked like a separate, unrelated
   * animation.
   *
   * So this lags {@link railed} in one direction only. **Collapsing**, it waits for the
   * width to almost land, and the labels clip away under the closing edge. **Expanding**, it
   * flips at once and they slide in behind the opening edge. Either way the text moves with
   * the panel instead of blinking beside it.
   *
   * Bind layout to {@link railed} and anything that reads as content — labels, the rail
   * class, tooltips — to this.
   */
  readonly railVisual = this._railVisual.asReadonly();

  private settleTimer: ReturnType<typeof setTimeout> | undefined;

  /** The sidebar's width, and so the inset the content needs to clear it. */
  readonly width_ = computed(() => (this.railed() ? RAIL_WIDTH : FULL_WIDTH));

  /** The chevron. */
  toggleRail(): void {
    const next = !this.expanded();
    this.expanded.set(next);

    // Expanding shows the labels at once; collapsing holds them until the width has run.
    clearTimeout(this.settleTimer);
    if (next) this._railVisual.set(false);
    else this.settleTimer = setTimeout(() => this._railVisual.set(true), RAIL_SETTLE_MS);

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
