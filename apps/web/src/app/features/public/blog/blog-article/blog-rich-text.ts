import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LocaleLink } from '@core/i18n/locale-link';
import { BlogSpan, BlogText } from '../blog-post.model';

/**
 * One run of prose — plain, or with emphasis and links in it.
 *
 * This exists so that `[innerHTML]` never has to. The body of an article is typed blocks, and
 * the leaf of a block is now a closed union rather than a bare string, so the only markup that
 * can reach the page is markup this template writes itself. An author cannot paste a `<script>`
 * into a field that does not accept one.
 *
 * Rendered through `@switch` on the shape of each span rather than through a pipe returning
 * HTML, for the same reason: a pipe that returns a string has to be sanitised or trusted, and
 * both of those are decisions someone can get wrong later.
 */
@Component({
  selector: 'app-blog-prose',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LocaleLink],
  // No whitespace between the spans: this renders inside a sentence, and a newline in the
  // template is a rendered space that lands in front of a comma.
  template: `@if (asSpans(); as spans) {@for (s of spans; track $index) {@if (
    isBold(s)
  ) {<strong class="font-semibold text-ink-900">{{ s.b }}</strong>} @else if (isLink(s)) {<a
      [routerLink]="s.to"
      class="rounded font-medium text-brand-700 underline decoration-brand-200 decoration-2 underline-offset-[3px] transition-colors hover:text-brand-800 hover:decoration-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
      >{{ s.text }}</a
    >} @else {{{ s }}}}} @else {{{ value() }}}`,
})
export class BlogRichText {
  readonly value = input.required<BlogText>();

  /** The span list, or null when the value is a plain sentence and needs no work at all. */
  protected asSpans(): BlogSpan[] | null {
    const v = this.value();
    return typeof v === 'string' ? null : v;
  }

  // Narrowing helpers rather than `$any()` in the template: with `strictTemplates` these keep
  // `s.b` and `s.to` type-checked at build time, so a typo in a span is a compile error.
  protected isBold(s: BlogSpan): s is { b: string } {
    return typeof s === 'object' && 'b' in s;
  }

  protected isLink(s: BlogSpan): s is { to: string; text: string } {
    return typeof s === 'object' && 'to' in s;
  }
}
