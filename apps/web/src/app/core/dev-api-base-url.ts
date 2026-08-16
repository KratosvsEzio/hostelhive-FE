/**
 * TEMPORARY — testing only. Lets a tester point the whole app at any backend by entering
 * the BE base URL on a startup gate (see `features/dev-setup/dev-setup-gate`). The value is
 * persisted in localStorage and read at bootstrap in `app.config.ts`, so every API call
 * (ApiClient, apiGet, and any direct `API_CONFIG.baseUrl` reader) targets the chosen backend.
 *
 * TO REMOVE before go-live:
 *  - delete this file and the `dev-setup-gate` component,
 *  - drop `<hh-dev-setup-gate />` from `app.html`, unwrap the `@if (!pending())` around the
 *    shell, and drop the import + `ngSkipHydration` from `app.ts`,
 *  - restore `app.config.ts` to `provideDataAccess({ baseUrl: apiEnv.apiUrl }, …)`.
 */
import { signal } from '@angular/core';

export const DEV_API_BASE_URL_KEY = 'hh.dev.api-base-url';

/**
 * True while the startup gate is still waiting for an answer. The app shell renders only
 * once this is false.
 *
 * This has to gate the shell, not just overlay it: every reader snapshots
 * `API_CONFIG.baseUrl` at construction, so a shell that boots behind the dialog spends the
 * whole time firing requests at the *previously* stored backend — which is exactly what a
 * tester sees when their dev API's LAN IP has moved since the last session.
 *
 * Deliberately starts true on the server too. Starting false there and true in the browser
 * is an SSR/client divergence that hydration cannot reconcile — the server's shell survives
 * and the app runs behind the dialog anyway. Agreeing on "pending" costs SSR output while
 * the gate is up, which is the point: nothing should render until the backend is chosen.
 * Only ever flipped by user interaction, so the server keeps it true for every request.
 */
export const devSetupPending = signal(true);

function browserStorage(): Storage | null {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

/** The tester's chosen base URL, or null when unset (or on the server). */
export function readDevApiBaseUrl(): string | null {
  const raw = browserStorage()?.getItem(DEV_API_BASE_URL_KEY);
  return raw && raw.trim() ? raw.trim() : null;
}

export function hasDevApiBaseUrl(): boolean {
  return readDevApiBaseUrl() !== null;
}

/** Stores the base URL, trimming trailing slashes to match the `base + path` convention. */
export function setDevApiBaseUrl(url: string): void {
  browserStorage()?.setItem(DEV_API_BASE_URL_KEY, url.trim().replace(/\/+$/, ''));
}

export function clearDevApiBaseUrl(): void {
  browserStorage()?.removeItem(DEV_API_BASE_URL_KEY);
}
