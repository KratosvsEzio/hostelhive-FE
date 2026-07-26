import {
  HttpClient,
  HttpContext,
  HttpResourceRef,
  httpResource,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_CONFIG } from './api-config';

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
  ): Observable<T> {
    return this.http.get<T>(this.base + path, { params });
  }
  post<T>(path: string, body: unknown, context?: HttpContext): Observable<T> {
    return this.http.post<T>(this.base + path, body, context ? { context } : undefined);
  }
  put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<T>(this.base + path, body);
  }
  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<T>(this.base + path, body);
  }
  delete<T>(path: string, body?: unknown): Observable<T> {
    return this.http.delete<T>(this.base + path, body !== undefined ? { body } : undefined);
  }
}
