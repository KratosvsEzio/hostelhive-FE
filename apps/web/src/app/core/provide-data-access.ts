import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import {
  HttpInterceptorFn,
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { ApiConfig, provideApiConfig } from './api-config';

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
  ]);
}
