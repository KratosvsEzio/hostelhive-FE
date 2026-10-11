import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
} from '@angular/core';
import { ACCESS_TOKEN, UNAUTHORIZED_HANDLER } from '@core/tokens';
import { SessionStore } from './session-store';

/**
 * Bridges the session into `data-access`: supplies the bearer-token getter and
 * the 401 handler the interceptors depend on (inverted dependency — `data-access`
 * never imports `auth`). Add to an authenticated app's providers.
 */
export function provideAuth(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: ACCESS_TOKEN,
      useFactory: () => {
        const session = inject(SessionStore);
        return () => session.accessToken();
      },
    },
    {
      provide: UNAUTHORIZED_HANDLER,
      useFactory: () => {
        const session = inject(SessionStore);
        // Only the token that was rejected ends a session: a late 401 for one that has since
        // been replaced, or a request sent without one, says nothing about who is signed in now.
        return (rejectedToken: string | null) => {
          if (rejectedToken !== null && session.accessToken() === rejectedToken) {
            session.clear();
          }
        };
      },
    },
  ]);
}
