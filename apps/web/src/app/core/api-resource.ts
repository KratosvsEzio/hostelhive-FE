import {
  HttpClient,
  HttpContext,
  HttpResourceRef,
  httpResource,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_CONFIG } from './api-config';
import { SUPPRESS_ERROR_TOAST } from './tokens';

/**
 * Per-call request options a service method can take as its trailing argument.
 *
 * `suppressErrorToast` is for callers that render the failure inline themselves, where the
 * global error toast would say the same thing a second time. Off by default, so a caller that
 * shows nothing of its own still gets the toast.
 */
export interface ApiRequestOptions {
  suppressErrorToast?: boolean;
}

/**
 * The trailing `ApiClient` arguments for `opts`: none by default, so a plain call stays
 * exactly as it was, and an `HttpContext` carrying the toast opt-out when asked for.
 */
export function requestContextArgs(opts?: ApiRequestOptions): [] | [HttpContext] {
  return opts?.suppressErrorToast ? [new HttpContext().set(SUPPRESS_ERROR_TOAST, true)] : [];
}

/**
 * Reactive GET resource bound to the API base URL — read-heavy, signal-driven.
 * Call in an injection context: `data = apiGet<Listing[]>(() => '/listings');`
 * Return `undefined` from the path fn to keep the request idle.
 */
export function apiGet<T>(
  path: () => string | undefined,
): HttpResourceRef<T | undefined> {
  const base = inject(API_CONFIG).baseUrl;
  return httpResource<T>(() => {
    const p = path();
    return p == null ? undefined : base + p;
  });
}

/** Thin typed HttpClient wrapper for mutations + imperative reads. */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_CONFIG).baseUrl;

  get<T>(
    path: string,
    params?: Record<string, string | number | boolean | ReadonlyArray<string | number | boolean>>,
    context?: HttpContext,
  ): Observable<T> {
    return this.http.get<T>(this.base + path, context ? { params, context } : { params });
  }
  post<T>(path: string, body: unknown, context?: HttpContext): Observable<T> {
    return this.http.post<T>(this.base + path, body, context ? { context } : undefined);
  }
  put<T>(path: string, body: unknown, context?: HttpContext): Observable<T> {
    return this.http.put<T>(this.base + path, body, context ? { context } : undefined);
  }
  patch<T>(path: string, body: unknown, context?: HttpContext): Observable<T> {
    if (!context) return this.http.patch<T>(this.base + path, body);
    return this.http.patch<T>(this.base + path, body, { context });
  }
  delete<T>(path: string, body?: unknown, context?: HttpContext): Observable<T> {
    if (!context) {
      return this.http.delete<T>(this.base + path, body !== undefined ? { body } : undefined);
    }
    return this.http.delete<T>(this.base + path, body !== undefined ? { body, context } : { context });
  }
}
