import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { XhrFactory } from '@angular/common';
import {
  HttpInterceptorFn,
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { ApiConfig, provideApiConfig } from './api-config';

/**
 * `XhrFactory` is an abstract class with no default binding, and `withFetch()` swaps
 * the fetch backend in without ever providing one. Anything that reaches
 * `HttpXhrBackend` instead of the fetch backend therefore dies with
 * "NG0201: No provider found for XhrFactory".
 *
 * `ngx-material-intl-tel-input` (behind `hh-phone-input`) is the case that hit us: it
 * injects `HttpClient` to geo-locate the caller via ipapi.co and pre-select the
 * country, and the failure left its country dropdown permanently empty on the sign-up
 * form. Binding the factory costs nothing when the fetch backend is used and makes
 * the XHR path work when something asks for it.
 */
class BrowserXhrFactory extends XhrFactory {
  build(): XMLHttpRequest {
    if (typeof XMLHttpRequest === 'undefined') {
      // Nothing reaches this during SSR today; throw loudly rather than return a
      // half-working object if that ever changes.
      throw new Error('XMLHttpRequest is not available outside the browser.');
    }
    return new XMLHttpRequest();
  }
}

/**
 * Wires HttpClient (fetch, SSR-friendly) + the API base. The app supplies its own
 * HTTP interceptors (auth, error handling) — they live in the app since they bridge
 * app-provided tokens (session, notifier) and aren't part of the shared data layer.
 * Add to an app's providers: `provideDataAccess({ baseUrl: env.apiUrl }, [authInterceptor, errorInterceptor])`.
 */
export function provideDataAccess(
  config: ApiConfig,
  interceptors: HttpInterceptorFn[] = [],
): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideApiConfig(config),
    provideHttpClient(withFetch(), withInterceptors(interceptors)),
    { provide: XhrFactory, useClass: BrowserXhrFactory },
  ]);
}
