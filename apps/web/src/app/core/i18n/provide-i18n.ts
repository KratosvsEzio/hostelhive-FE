import { HttpClient } from '@angular/common/http';
import {
  EnvironmentProviders,
  Injectable,
  inject,
  isDevMode,
  makeEnvironmentProviders,
} from '@angular/core';
import {
  Translation,
  TranslocoLoader,
  provideTransloco,
} from '@jsverse/transloco';
import { HH_LINK_LOCALISER, HhLinkCommands } from '@hostelhive/ui';
import { DEFAULT_LOCALE, LOCALE_CODES } from './locales';
import { LinkCommands, localiseCommands } from './locale-commands';
import { LocaleStore } from './locale-store';

/**
 * Loads `public/i18n/<lang>.json` over HTTP.
 *
 * A separate file per language rather than one bundle: a visitor reading in English never
 * downloads the Japanese strings, and adding a language is adding a file rather than
 * growing every visitor's payload.
 */
@Injectable({ providedIn: 'root' })
export class HttpTranslationLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  getTranslation(lang: string) {
    return this.http.get<Translation>(`/i18n/${lang}.json`);
  }
}

/**
 * Runtime i18n.
 *
 * Angular's own `@angular/localize` is compile-time — one bundle per locale, picked at
 * build or deploy — so it cannot switch language without a reload. Transloco keeps the
 * strings as data, which is what makes an in-page language switcher possible.
 *
 * `fallbackLang` is English and `missingHandler` stays loud in development: a key with no
 * translation should be obvious while building, and degrade to readable English in
 * production rather than rendering a raw key at a visitor.
 */
export function provideI18n(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideTransloco({
      config: {
        availableLangs: [...LOCALE_CODES],
        defaultLang: DEFAULT_LOCALE,
        fallbackLang: DEFAULT_LOCALE,
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
        missingHandler: { logMissingKey: isDevMode(), useFallbackTranslation: true },
      },
      loader: HttpTranslationLoader,
    }),
    /**
     * Teach the shared components to keep their links in-language.
     *
     * `LocaleLink` matches `a[routerLink]`, and Angular matches directives against the
     * template's own component imports — so it covers every anchor written in this app and
     * none written inside `@hostelhive/ui`. The breadcrumb builds its own links, and was
     * rendering them unprefixed: the click survived, because the router sends a bare path to
     * its prefixed twin, but the href a person copies or middle-clicks did not.
     *
     * Reading `active()` inside the returned function rather than closing over its value is
     * what makes a switch rewrite links already on the page — the component calls this from a
     * `computed`, which then tracks the signal.
     */
    {
      provide: HH_LINK_LOCALISER,
      useFactory: () => {
        const store = inject(LocaleStore);
        return (link: HhLinkCommands) => localiseCommands(link as LinkCommands, store.active());
      },
    },
  ]);
}
