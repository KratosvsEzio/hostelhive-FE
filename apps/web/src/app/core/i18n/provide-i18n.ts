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
import { DEFAULT_LOCALE, LOCALE_CODES } from './locales';

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
  ]);
}
