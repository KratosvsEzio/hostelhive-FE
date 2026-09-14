import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  Directive,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';

/**
 * Whether a clipped element is actually clipping anything.
 *
 * CSS can hide the overflow but cannot tell you there was any, so a "Show more" next to a
 * `max-h-*` box is normally rendered unconditionally — and then appears under two-word
 * descriptions, opening a modal that shows the same two words. Hosts type "asd" into these
 * fields; the design has to survive that.
 *
 * Measured rather than guessed from the text length: the content is host-authored HTML, and
 * how much of it fits depends on the width, the font and whatever markup came with it.
 *
 * ```html
 * <div class="max-h-[168px] overflow-hidden" hhOverflows #clip="hhOverflows">…</div>
 * @if (clip.overflowing()) { <button>Show more</button> }
 * ```
 */
@Directive({
  selector: '[hhOverflows]',
  exportAs: 'hhOverflows',
})
export class OverflowProbe implements AfterViewInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private observer?: ResizeObserver;

  /** False until measured, which is also the right answer on the server. */
  readonly overflowing = signal(false);

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;

    // Out of the current change detection pass: this writes a signal the template reads, and
    // doing that synchronously inside `ngAfterViewInit` is the textbook way to earn NG0100.
    queueMicrotask(() => this.measure());

    if (typeof ResizeObserver === 'undefined') return;
    this.observer = new ResizeObserver(() => this.measure());
    // The box itself for width changes, and its content for the moment `[innerHTML]` lands —
    // the element is its final height long before the HTML inside it has been parsed.
    this.observer.observe(this.host.nativeElement);
    const content = this.host.nativeElement.firstElementChild;
    if (content) this.observer.observe(content);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  private measure(): void {
    const el = this.host.nativeElement;
    // A pixel of slack: sub-pixel line heights make `scrollHeight` exceed `clientHeight` by
    // fractions on text that visibly fits.
    this.overflowing.set(el.scrollHeight > el.clientHeight + 1);
  }
}
