import {
  EnvironmentProviders,
  InjectionToken,
  makeEnvironmentProviders,
} from '@angular/core';

export interface ApiConfig {
  /** Base URL for the HostelHive API, e.g. `https://api.hostelhive.pk/v1` (no trailing slash). */
  baseUrl: string;
}

export const API_CONFIG = new InjectionToken<ApiConfig>('hh.api.config');

/** Registers the API base config. Call inside `provideDataAccess()` or an app's providers. */
export function provideApiConfig(config: ApiConfig): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: API_CONFIG, useValue: config }]);
}
