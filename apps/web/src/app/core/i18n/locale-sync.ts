import { DestroyRef, Injectable, inject } from '@angular/core';
import { PlatformLocation } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { LocaleStore } from './locale-store';
import { splitLocale } from './locales';

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
    this.store.apply(splitLocale(this.location.pathname).locale);

    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((e) => this.store.apply(splitLocale(e.urlAfterRedirects).locale));
  }
}
