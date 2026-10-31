import { HttpContext } from '@angular/common/http';
import { Provider } from '@angular/core';
import { Observable, of } from 'rxjs';
import { ApiClient } from '@core/api-resource';
import { SUPPRESS_ERROR_TOAST } from '@core/tokens';

export type ApiVerb = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** One call made on the `ApiClient`, with every argument exactly as it was passed. */
export interface RecordedApiCall {
  verb: ApiVerb;
  path: string;
  /** The GET query params; `undefined` for other verbs. */
  params: Record<string, unknown> | undefined;
  /** The POST/PUT/PATCH/DELETE body; `undefined` for GET. */
  body: unknown;
  /** The trailing `HttpContext`, when one was passed. */
  context: HttpContext | undefined;
  /** How many arguments the caller actually passed, so "no trailing argument" is assertable. */
  argCount: number;
  args: readonly unknown[];
}

/**
 * An `ApiClient` stand-in that records every call, trailing context and argument count included.
 *
 * Unlike the per-spec `ApiClientStub`s, nothing is dropped: a service that forwards
 * `...requestContextArgs(opts)` is checked for passing exactly zero or one extra argument.
 * Replies default to `of({})`; set {@link reply} to answer per call.
 */
export class ApiClientRecorder {
  readonly calls: RecordedApiCall[] = [];
  reply: (call: RecordedApiCall) => Observable<unknown> = () => of({});

  get<T>(...args: Parameters<ApiClient['get']>): Observable<T> {
    return this.record('get', args, args[1], undefined, args[2]);
  }
  post<T>(...args: Parameters<ApiClient['post']>): Observable<T> {
    return this.record('post', args, undefined, args[1], args[2]);
  }
  put<T>(...args: Parameters<ApiClient['put']>): Observable<T> {
    return this.record('put', args, undefined, args[1], args[2]);
  }
  patch<T>(...args: Parameters<ApiClient['patch']>): Observable<T> {
    return this.record('patch', args, undefined, args[1], args[2]);
  }
  delete<T>(...args: Parameters<ApiClient['delete']>): Observable<T> {
    return this.record('delete', args, undefined, args[1], args[2]);
  }

  /** Answers every call with `body`. */
  replyWith(body: unknown): void {
    this.reply = () => of(body);
  }

  /** The most recent call, optionally of one verb; throws when there is none. */
  last(verb?: ApiVerb): RecordedApiCall {
    const found = [...this.calls].reverse().find((c) => !verb || c.verb === verb);
    if (!found) throw new Error(`no ${verb ?? 'api'} call was recorded`);
    return found;
  }

  provider(): Provider {
    return { provide: ApiClient, useValue: this };
  }

  private record<T>(
    verb: ApiVerb,
    args: readonly unknown[],
    params: unknown,
    body: unknown,
    context: unknown,
  ): Observable<T> {
    const call: RecordedApiCall = {
      verb,
      path: args[0] as string,
      params: params as Record<string, unknown> | undefined,
      body,
      context: context as HttpContext | undefined,
      argCount: args.length,
      args,
    };
    this.calls.push(call);
    return this.reply(call) as Observable<T>;
  }
}

/** Whether a recorded call carries the global error-toast opt-out. */
export function suppressesErrorToast(call: RecordedApiCall): boolean {
  return call.context?.get(SUPPRESS_ERROR_TOAST) === true;
}
