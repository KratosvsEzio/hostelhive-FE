/**
 * Gives every URL a language, so no page has two addresses.
 *
 * Routes are mounted twice: once under `:locale`, once bare. The bare tree exists only to
 * catch URLs that name no language — a legacy link, a hand-typed path, a
 * `router.navigate('/search/lahore')` — and send them to the prefixed form. Nothing is
 * meant to *stay* unprefixed, which is why this guard hangs off that tree and not the
 * other.
 *
 * It replaces two things that used to be needed when English was the unprefixed default:
 * a helper threaded through forty `router.navigate` call sites, and a one-shot redirect
 * that had to guess whether an unprefixed URL meant "English on purpose" or "the visitor's
 * language, prefix missing". With English at `/en/…` that ambiguity is gone — an
 * unprefixed URL now names no language at all, so there is nothing to second-guess.
 *
 * Which language it picks:
 * - **mid-session**, the one already active, so navigation cannot fall out of it
 * - **on arrival**, the visitor's stored choice, falling back to {@link DEFAULT_LOCALE}
 *
 * A URL that already carries a language is never touched, so a shared `/ur/hostels/lahore`
 * opens in Urdu for a reader whose preference says otherwise. The URL stays the truth.
 */
import { CanActivateChildFn, Router, RouterStateSnapshot } from '@angular/router';
import { inject } from '@angular/core';
import { LocaleStore } from './locale-store';
import { DEFAULT_LOCALE, hasLocalePrefix, withLocale } from './locales';

export const keepLocale: CanActivateChildFn = (_route, state: RouterStateSnapshot) => {
  if (hasLocalePrefix(state.url)) return true;

  const router = inject(Router);
  const store = inject(LocaleStore);
  const locale = router.navigated
    ? store.active()
    : (store.storedPreference() ?? DEFAULT_LOCALE);

  return router.parseUrl(withLocale(locale, state.url));
};
