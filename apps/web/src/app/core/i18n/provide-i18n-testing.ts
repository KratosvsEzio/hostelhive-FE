import { EnvironmentProviders, Injectable, makeEnvironmentProviders } from '@angular/core';
import { Translation, TranslocoLoader, provideTransloco } from '@jsverse/transloco';
import { of } from 'rxjs';
import { DEFAULT_LOCALE, LOCALE_CODES } from './locales';

/**
 * Transloco for specs, with no HTTP and no translation files.
 *
 * Every key resolves to itself, so an assertion reads `'listing.contact'` rather than
 * whatever English happens to be today. That is the point: a test that asserts on display
 * copy breaks when someone rewords a button, which tells you nothing about the behaviour
 * under test.
 *
 * Without this, any spec rendering a component that uses the pipe fails with NG0201 on
 * `TRANSLOCO_TRANSPILER` — the failure is about wiring, not about the component.
 */
@Injectable()
class EmptyLoader implements TranslocoLoader {
  getTranslation() {
    return of({} as Translation);
  }
}

export function provideI18nTesting(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideTransloco({
      config: {
        availableLangs: [...LOCALE_CODES],
        defaultLang: DEFAULT_LOCALE,
        fallbackLang: DEFAULT_LOCALE,
        prodMode: true,
        missingHandler: { logMissingKey: false, useFallbackTranslation: false },
      },
      loader: EmptyLoader,
    }),
  ]);
}
