import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { TRANSLOCO_LOADER } from '@jsverse/transloco';
import { FsTranslationLoader } from '@core/i18n/fs-translation-loader';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    // Translations come off disk during SSR. The browser loader fetches a relative URL,
    // which the server cannot resolve — it would silently render English under a
    // non-English lang attribute. See fs-translation-loader.ts.
    { provide: TRANSLOCO_LOADER, useClass: FsTranslationLoader },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
