/**
 * Keeps every `<a routerLink>` inside the active language.
 *
 * Matches the same elements Angular's own `RouterLink` does and rewrites the target it was
 * given, so templates keep writing plain absolute paths — `/hostels/lahore` — and none of
 * the 117 links in the app had to change. Rewriting the *binding* rather than the rendered
 * `href` is deliberate: the href and the click then derive from one value, so a crawler
 * following the link and a person clicking it land in the same place.
 *
 * Import it wherever `RouterLink` is imported. Without it a link silently leaves the
 * language: `/de` → click → `/hostels/lahore`, which the URL-is-truth rule reads as English.
 */
import { DoCheck, Directive, Input, effect, inject, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LocaleStore } from './locale-store';
import { LinkCommands, localiseCommands } from './locale-commands';

// The selector has to be the attribute Angular's own RouterLink answers to. An
// `hh`-prefixed one would mean editing all 117 links, which is what this avoids.
// eslint-disable-next-line @angular-eslint/directive-selector
@Directive({ selector: 'a[routerLink]' })
export class LocaleLink implements DoCheck {
  private readonly link = inject(RouterLink, { self: true });
  private readonly store = inject(LocaleStore);

  /** The target as the template wrote it, before any prefix. */
  private source: LinkCommands;
  private appliedSource: LinkCommands;
  private appliedLocale = '';

  @Input()
  set routerLink(value: LinkCommands) {
    this.source = value;
  }

  constructor() {
    // Switching language has to rewrite the links already on the page — otherwise the
    // header and footer of the page you switched *on* still point at the old language.
    // An effect rather than change detection, because a component that never reads the
    // locale is never marked dirty and its `ngDoCheck` would not run.
    effect(() => {
      this.store.active();
      untracked(() => this.apply());
    });
  }

  /**
   * Both this directive and `RouterLink` bind the same `routerLink` input, in an order
   * this one cannot choose — writing from the setter could be overwritten by `RouterLink`'s
   * own setter in the same pass. `ngDoCheck` runs after the element's inputs are set, so
   * applying here is what gets the last word.
   */
  ngDoCheck(): void {
    this.apply();
  }

  private apply(): void {
    const locale = this.store.active();
    if (this.source === this.appliedSource && locale === this.appliedLocale) return;
    this.appliedSource = this.source;
    this.appliedLocale = locale;
    this.link.routerLink = localiseCommands(this.source, locale) as never;
  }
}
