import { EnvironmentProviders, Injectable, makeEnvironmentProviders } from '@angular/core';
import { Translation, TranslocoLoader, provideTransloco } from '@jsverse/transloco';
import { of } from 'rxjs';

/**
 * Transloco for lib specs, with no HTTP and no translation files.
 *
 * Every key resolves to itself, so an assertion reads `'common.select'` rather than
 * whatever English happens to be today — a spec should break on behaviour, not on copy.
 *
 * Without this, any spec rendering a lib component that uses the pipe fails with NG0201
 * on `TRANSLOCO_TRANSPILER`, which is about wiring rather than the component under test.
 *
 * The app has its own `provideI18nTesting` (apps/web/src/app/core/i18n); lib cannot import
 * from the app, so this is the same shape without the app's locale list.
 */
@Injectable()
class EmptyLoader implements TranslocoLoader {
  getTranslation() {
    return of({} as Translation);
  }
}

export function provideTranslocoTesting(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideTransloco({
      config: {
        availableLangs: ['en'],
        defaultLang: 'en',
        fallbackLang: 'en',
        prodMode: true,
        missingHandler: { logMissingKey: false, useFallbackTranslation: false },
      },
      loader: EmptyLoader,
    }),
  ]);
}
