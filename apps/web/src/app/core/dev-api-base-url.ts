/**
 * TEMPORARY — testing only. Lets a tester point the whole app at any backend by entering
 * the BE base URL on a startup gate (see `features/dev-setup/dev-setup-gate`). The value is
 * persisted in localStorage and read at bootstrap in `app.config.ts`, so every API call
 * (ApiClient, apiGet, and any direct `API_CONFIG.baseUrl` reader) targets the chosen backend.
 *
 * TO REMOVE before go-live:
 *  - delete this file and the `dev-setup-gate` component,
 *  - drop `<hh-dev-setup-gate />` and `showDevGate` from `app.html` / `app.ts`,
 *  - restore `app.config.ts` to `provideDataAccess({ baseUrl: apiEnv.apiUrl }, …)`.
 */
import { signal } from '@angular/core';

export const DEV_API_BASE_URL_KEY = 'hh.dev.api-base-url';

/**
 * True while the startup gate is still waiting for an answer.
 *
 * **Browser only.** The gate is an overlay now, not a barrier: the shell renders
 * underneath it on both the server and the client, so the two agree and hydration has
 * nothing to reconcile. The gate component itself carries `ngSkipHydration`, which is
 * what lets it exist in the browser and not in the server's HTML.
 *
 * It used to gate the shell, on the reasoning that readers snapshot `API_CONFIG.baseUrl`
 * at construction and would fire at a stale backend. That cost far more than it saved:
 * every route server-rendered as the dialog, so crawlers saw "Set backend URL" instead of
 * the page — no listing content, no landing copy, no per-page canonical or Open Graph
 * tags, since no route component ever constructed. The stale-request worry is mostly
 * theoretical anyway: entering a *different* URL reloads the page, which throws those
 * requests away, and entering the same one was always going to the right backend.
 */
export const devSetupPending = signal(typeof window !== 'undefined');

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
