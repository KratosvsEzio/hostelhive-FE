import { DestroyRef, Injectable, inject } from '@angular/core';
import { PlatformLocation } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { LocaleStore } from './locale-store';
import { DEFAULT_LOCALE, splitLocale } from './locales';

/**
 * Keeps the active language in step with the URL.
 *
 * The URL is the source of truth, not the stored preference. A link shared into a group has
 * to open in the language it was written in, and a crawler — which has no localStorage at
 * all — has to receive whatever the URL says.
 *
 * Sending a *returning* visitor to their own language is no longer this class's job.
 * Every URL now names a language, so an unprefixed one names none, and giving it one is
 * {@link keepLocale}'s single responsibility. What used to live here — a one-shot redirect
 * that fired once per session and only from the default locale — existed to avoid
 * overriding someone who had deliberately opened an English link. Since English is now
 * `/en/…` like every other language, a deliberate choice is visible in the URL and there
 * is nothing left to guess.
 */
@Injectable({ providedIn: 'root' })
export class LocaleSync {
  private readonly router = inject(Router);
  private readonly store = inject(LocaleStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly location = inject(PlatformLocation);

  start(): void {
    // Read from the browser, not the router: this runs from `provideAppInitializer`, before
    // the first navigation, so `router.url` is still `/` and would report the wrong
    // language for every deep link. Applying it here is what puts the right `lang` and
    // `dir` into the server-rendered HTML, which is what a crawler and a slow connection
    // actually see.
    const entry = splitLocale(this.location.pathname);
    // Before the first navigation, so this is the URL as this document was served. A
    // moment later `keepLocale` will have given an unprefixed one a prefix and the
    // question becomes unanswerable from here.
    this.store.noteUrlNamedLanguage(entry.prefixed && !this.wasSentHere(entry.locale));
    this.store.apply(entry.locale);

    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((e) => this.store.apply(splitLocale(e.urlAfterRedirects).locale));
  }

  /**
   * Whether this URL is somewhere the app sent the visitor rather than somewhere they
   * asked for.
   *
   * A URL with no language is redirected to one that has it — server-side, so the address
   * bar already reads `/en/…` by the time any of this runs, and a prefix on its own can no
   * longer tell "they asked for English" from "they asked for nothing".
   *
   * Only the default locale is ever redirected *to*, so every other language is decided by
   * the prefix alone and this question never arises for them — which matters, because a
   * shared link is almost never in the default language, and that case must not depend on
   * anything as environment-specific as a redirect count. For the default it does, and it
   * errs the way the old behaviour did: an English link opened from behind some other
   * redirect (an http→https hop, say) is read as unasked-for and follows the country, as
   * every link did before this existed.
   */
  private wasSentHere(locale: string): boolean {
    if (locale !== DEFAULT_LOCALE) return false;
    // Guarded on the method, not just the object: this runs from an app initializer, so
    // anything thrown here takes the whole bootstrap with it, and Navigation Timing is not
    // universal. No answer reads as "they asked for it", which is the safe way to be wrong —
    // it leaves the URL alone rather than overriding a language somebody may have meant.
    if (typeof performance?.getEntriesByType !== 'function') return false;
    const [nav] = performance.getEntriesByType(
      'navigation',
    ) as PerformanceNavigationTiming[];
    return (nav?.redirectCount ?? 0) > 0;
  }
}
