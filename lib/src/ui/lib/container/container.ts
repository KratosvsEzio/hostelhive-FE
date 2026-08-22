import { Directive } from '@angular/core';

/**
 * The page content band: centred, capped at `max-w-7xl`, with the standard responsive
 * gutter. Twelve templates repeated `mx-auto max-w-7xl px-5 sm:px-8` verbatim, so a change
 * to the site's width or gutter meant finding all of them.
 *
 * A directive rather than a wrapper component, for three reasons:
 *  - it applies to the semantic element that is already there (`<main>`, `<footer>`,
 *    `<section>`), instead of nesting one inside a generic host element;
 *  - several call sites put `grid`, `relative` or `flex` on the *same* element as the width
 *    cap — `home.html` centres a two-column grid this way — and a wrapper would separate
 *    the two onto different elements, changing the layout;
 *  - it adds no DOM node, so nothing that depends on parent/child relationships shifts.
 *
 * Vertical padding stays with the caller: every site wants a different one
 * (`py-6` on the console, `pb-28 pt-6` on a listing, `py-16 lg:py-24` on a marketing
 * section), and folding a default in here would mean overriding it almost everywhere.
 *
 *   <main hhContainer class="pb-28 pt-6">…</main>
 */
@Directive({
  selector: '[hhContainer]',
  host: { class: 'mx-auto max-w-7xl px-5 sm:px-8' },
})
export class Container {}
