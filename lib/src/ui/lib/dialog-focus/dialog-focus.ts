import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { AfterViewInit, Directive, ElementRef, OnDestroy, PLATFORM_ID, inject } from '@angular/core';

/**
 * What `role="dialog" aria-modal="true"` promises but cannot deliver on its own.
 *
 * The attribute tells assistive technology to ignore the page behind the dialog. It does
 * nothing to the Tab key: focus stays wherever it was when the dialog opened — on the button
 * that opened it, outside the dialog — and tabbing walks straight into the page underneath an
 * opaque overlay, where a keyboard user is operating controls they cannot see. Closing then
 * drops focus to the top of the document, so the place they were reading is lost.
 *
 * Three things, which are the whole of the contract:
 *
 * - **Enter.** Focus moves to the first focusable element inside, or to the dialog itself when
 *   it holds none.
 * - **Stay.** Tab and Shift+Tab cycle within the dialog rather than escaping it.
 * - **Return.** On close, focus goes back to whatever opened it.
 *
 * Applied to the element that carries `role="dialog"`, and scoped by that element's own
 * lifetime — so a dialog behind `@if` needs no open/close bookkeeping of its own:
 *
 * ```html
 * @if (shareOpen()) {
 *   <div hhDialogFocus role="dialog" aria-modal="true" [aria-label]="…">…</div>
 * }
 * ```
 *
 * Deliberately not `inert` on the rest of the page: these dialogs render inside `<main>`
 * rather than in a portal at the body, so inerting the page would inert the dialog with it.
 * A trap plus `aria-modal` covers keyboard and assistive technology both.
 */
@Directive({
  selector: '[hhDialogFocus]',
  host: {
    '(keydown)': 'onKeydown($event)',
  },
})
export class DialogFocus implements AfterViewInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly doc = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * Captured in the constructor, which is the only moment it is still true — by the time
   * anything inside the dialog has been focused, the element that opened it is no longer
   * `activeElement` and there is nothing left to read it from.
   */
  private readonly returnTo = this.doc.activeElement as HTMLElement | null;

  /** Whether focus was actually taken, and so is ours to give back. */
  private trapped = false;

  /**
   * `ngAfterViewInit`, not `afterNextRender`.
   *
   * The obvious choice is `afterNextRender`, since the dialog's children do not exist while
   * the constructor runs. It does not work here and fails silently: the directive is
   * constructed *during* the render that creates the dialog, so the callback is queued for
   * the render after that one — which, in an idle zoneless app, never comes. Opening a dialog
   * changes nothing else, so nothing schedules another pass and focus simply stays on the
   * trigger. It appears to work exactly once, on the first open of a freshly loaded page,
   * while other work is still causing renders.
   *
   * `ngAfterViewInit` runs inside the same pass, once the view's nodes are in the document —
   * which is the moment being waited for. It does not run on the server, where there is no
   * focus to move; the platform check is belt and braces.
   */
  ngAfterViewInit(): void {
    if (!this.isBrowser) return;

    // The dialog itself, not its first focusable child.
    //
    // "First focusable" is the textbook answer and it is wrong here: every one of these
    // dialogs opens with a full-bleed dismiss scrim, which is first in DOM order. Focus
    // landed on a 1948×911 button labelled "Close", so a screen reader announced "Close,
    // button" instead of the dialog's title and the first Enter threw the dialog away.
    //
    // Focusing the container is also what makes the title heard: it carries `role="dialog"`
    // and the accessible name, so the announcement is "Photo gallery, dialog" rather than
    // whichever control happened to be first. Tab then moves inward normally.
    const el = this.host.nativeElement;
    el.tabIndex = -1;
    el.focus();
    this.trapped = true;
  }

  ngOnDestroy(): void {
    // Only give back what was taken, and only if there is still something to give it to: the
    // opener is often inside the same `@if` as whatever replaced it, and focusing a detached
    // node silently sends focus to `<body>` — worse than leaving it alone.
    if (this.trapped && this.returnTo?.isConnected) this.returnTo.focus();
  }

  /**
   * Visible, focusable, in document order.
   *
   * Recomputed per keystroke rather than cached at open, because these dialogs change shape
   * while they are up — the phone modal swaps a spinner for a number, the review form grows
   * an error — and a list captured on open would send Tab to an element that has gone.
   */
  private focusable(): HTMLElement[] {
    const nodes = this.host.nativeElement.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
        'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
    );
    // `getClientRects()` rather than `offsetParent`, which is null for anything inside a
    // `position: fixed` subtree — which is every one of these dialogs.
    return Array.from(nodes).filter((el) => el.getClientRects().length > 0);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;

    const items = this.focusable();
    if (!items.length) {
      event.preventDefault();
      return;
    }

    const first = items[0];
    const last = items[items.length - 1];
    const active = this.doc.activeElement;
    const host = this.host.nativeElement;
    const inside = host.contains(active);
    // The container counts as standing before the first control — it is where focus starts,
    // and `contains` reports it as inside, so without this Shift+Tab from the opening
    // position would walk straight out into the page behind.
    const atStart = active === first || active === host;

    if (event.shiftKey && (atStart || !inside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !inside)) {
      event.preventDefault();
      first.focus();
    }
  }
}
