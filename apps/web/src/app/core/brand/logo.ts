import { Directive, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { BRAND_LOGOS, BrandLogo } from './brand-logos';

/**
 * The brand mark, inlined into an `<i>`.
 *
 * `<i hhLogo class="h-7 w-auto text-ink-900"></i>`
 * `<i hhLogo="mark" class="h-6 w-auto text-white"></i>`
 *
 * An `<i>` rather than an `<img>` so the ink is reachable from CSS. The logo is two colours —
 * an icon font could not carry it — but the half that changes is the ink, and inline SVG lets
 * a Tailwind text colour drive it. That removes the white duplicate of every file and the
 * `brightness-0 invert` filter the footer used to need, which flipped the orange too.
 *
 * Sizing works the way it did on the `<img>`: `h-7 w-auto` on the element, and the SVG fills
 * it. The `.hh-logo` rule in global.css is what makes that true.
 */
@Directive({
  selector: 'i[hhLogo]',
  host: {
    class: 'hh-logo',
    '[innerHTML]': 'svg()',
    // Named, not hidden — this replaced an <img alt="HostelHive">, and every call site relied
    // on that alt. In the header the mark is the only thing inside the home link, so hiding it
    // would leave a link a screen reader announces as nothing at all. Decorative placements
    // override with aria-hidden="true".
    role: 'img',
    'aria-label': 'HostelHive',
  },
})
export class Logo {
  /** Which mark. Empty (the bare attribute) is the full wordmark. */
  readonly hhLogo = input<BrandLogo | ''>('');

  private readonly sanitizer = inject(DomSanitizer);

  /**
   * Trusted deliberately.
   *
   * Angular's HTML sanitizer strips `<svg>` wholesale from `[innerHTML]`, so binding the raw
   * string renders an empty `<i>` and no error. The content is a compile-time constant in this
   * repo with no interpolation — the one shape where bypassing is not a risk.
   */
  protected readonly svg = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(BRAND_LOGOS[this.hhLogo() || 'wordmark']),
  );
}
