import { DestroyRef, Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { LocaleStore } from './locale-store';
import { DEFAULT_LOCALE, splitLocale, withLocale } from './locales';

/**
 * Keeps the active language in step with the URL.
 *
 * The URL is the source of truth, not the stored preference. A link shared into a group
 * has to open in the language it was written in, and a crawler — which has no
 * localStorage at all — has to receive whatever the URL says. The preference only decides
 * where to send a *returning* visitor who arrives somewhere unprefixed.
 *
 * That redirect happens once per session and only from the default locale, so it can
 * never fight someone who has just picked a language from the switcher: choosing one
 * navigates to its prefix, which is then what the URL says.
 */
@Injectable({ providedIn: 'root' })
export class LocaleSync {
  private readonly router = inject(Router);
  private readonly store = inject(LocaleStore);
  private readonly destroyRef = inject(DestroyRef);

  private redirected = false;

  start(): void {
    this.applyFor(this.router.url);

    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((e) => this.applyFor(e.urlAfterRedirects));
  }

  private applyFor(url: string): void {
    const { locale, path } = splitLocale(url);
    this.store.apply(locale);

    // Send a returning visitor to their language, but only from an unprefixed URL and
    // only once — otherwise every in-app navigation would re-trigger it, and anyone who
    // deliberately opened an English link could never stay on it.
    if (this.redirected || locale !== DEFAULT_LOCALE) return;
    this.redirected = true;

    const preferred = this.store.storedPreference();
    if (!preferred || preferred === DEFAULT_LOCALE) return;

    const query = url.includes('?') ? url.slice(url.indexOf('?')) : '';
    void this.router.navigateByUrl(withLocale(preferred, path) + query, {
      replaceUrl: true,
    });
  }
}
