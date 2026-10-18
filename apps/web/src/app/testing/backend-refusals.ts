import { HttpErrorResponse, HttpHandlerFn, HttpRequest } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { throwError } from 'rxjs';
import { ApiError } from '@hostelhive/data-access';
import { API_CONFIG } from '@core/api-config';
import { CRM_REQUIRED_CODE, CRM_REQUIRED_MESSAGE } from '@core/host-access/host-access';
import { errorInterceptor } from '@core/interceptors/error-interceptor';
import { HOSTEL_ID } from './host-builders';

/* ── the bodies, exactly as the backend sends them ──────────────────────────── */

/** CanCan's text on a 403 for a permission the signed-in user's role lacks. */
export const CANCAN_MESSAGE = 'You are not authorized to access this page.';

/** The host API's text on a 400 for a hostel with no live plan. */
export const SUBSCRIBE_MESSAGE = 'You need to subscribe to avail the services';

/** A permission 403 from CanCan's rescue: the singular `error`, and no code. */
export const CANCAN_403_BODY = { success: false, error: CANCAN_MESSAGE } as const;

/** A permission 403 from `render_403`: an `errors` array, and no code. */
export const RENDER_403_BODY = { success: false, errors: [CANCAN_MESSAGE] } as const;

/** The billing gate's 403 for a hostel whose plan lacks CRM. */
export const CRM_REQUIRED_BODY = {
  success: false,
  code: CRM_REQUIRED_CODE,
  errors: [CRM_REQUIRED_MESSAGE],
} as const;

/** The same plan refusal without its code, so only the message tells it apart. */
export const CRM_MESSAGE_ONLY_BODY = { success: false, errors: [CRM_REQUIRED_MESSAGE] } as const;

/** The host API's 400 for a hostel with no live plan. */
export const SUBSCRIBE_400_BODY = { success: false, errors: [SUBSCRIBE_MESSAGE] } as const;

/** Rack::Attack's 403 for a throttled or blocked client: a code of the server's. */
export const RATE_LIMITED_BODY = { success: false, code: 'forbidden', errors: ['Forbidden'] } as const;

/** Rails' own 404, the bare "Not Found" that `isBareNotFound` recognises. */
export const RAILS_NOT_FOUND_BODY = { status: 404, error: 'Not Found' } as const;

/** A validation refusal whose text no classifier recognises. */
export const VALIDATION_422_BODY = { success: false, errors: ["Room number can't be blank"] } as const;

/** Rails' own 500. */
export const RAILS_SERVER_ERROR_BODY = { status: 500, error: 'Internal Server Error' } as const;

/* ── every refusal a host request can get, by kind ──────────────────────────── */

export type RefusalKind =
  | 'permissionCanCan'
  | 'permissionRender403'
  | 'crmRequired'
  | 'crmMessageOnly'
  | 'inactive'
  | 'paymentRequired'
  | 'rateLimited'
  | 'notFound'
  | 'unprocessable'
  | 'serverError'
  | 'network';

export interface BackendRefusal {
  /** The HTTP status; 0 is a request that got no response. */
  readonly status: number;
  /** The body as the backend sends it; null when there is none. Typed so `TestRequest.flush` takes it. */
  readonly body: object | null;
}

/**
 * One of each failure, keyed by kind. The two `permission*` kinds are the permission 403; the two
 * `crm*` kinds are a plan without CRM, coded and message-only. A 402 is a refusal the backend
 * sends only in principle, so `paymentRequired` carries no body: the classifiers accept it on its
 * status alone.
 */
export const REFUSALS: Readonly<Record<RefusalKind, BackendRefusal>> = {
  permissionCanCan: { status: 403, body: CANCAN_403_BODY },
  permissionRender403: { status: 403, body: RENDER_403_BODY },
  crmRequired: { status: 403, body: CRM_REQUIRED_BODY },
  crmMessageOnly: { status: 403, body: CRM_MESSAGE_ONLY_BODY },
  inactive: { status: 400, body: SUBSCRIBE_400_BODY },
  paymentRequired: { status: 402, body: null },
  rateLimited: { status: 403, body: RATE_LIMITED_BODY },
  notFound: { status: 404, body: RAILS_NOT_FOUND_BODY },
  unprocessable: { status: 422, body: VALIDATION_422_BODY },
  serverError: { status: 500, body: RAILS_SERVER_ERROR_BODY },
  network: { status: 0, body: null },
};

/** Every {@link RefusalKind}, in {@link REFUSALS} order, for `it.each`. */
export const REFUSAL_KINDS = Object.keys(REFUSALS) as readonly RefusalKind[];

/* ── through the real interceptor ───────────────────────────────────────────── */

/** The request a refusal answers. */
export interface RefusedRequest {
  /** `'GET'` unless said. */
  method?: string;
  /** The selected hostel's rooms (`https://api.test/api/host/hostels/h1/rooms`) unless said. */
  url?: string;
}

const API_BASE = 'https://api.test';

/** Only `API_CONFIG`: with no notifier and no 401 handler, nothing is toasted and nobody is signed out. */
const INTERCEPTOR_INJECTOR = Injector.create({
  providers: [{ provide: API_CONFIG, useValue: { baseUrl: API_BASE } }],
  name: 'interceptedError',
});

/**
 * The `ApiError` a page or the drawer receives when the server answers `status` with `body`: the
 * real `errorInterceptor` run over the request.
 *
 * Synchronous and TestBed-free, so it can fill an `it.each` table or a stub's reply before or
 * after a page is open. The response is built as `HttpTestingController` builds it, and status 0
 * errors with a `ProgressEvent`, whatever `body` says. The host access interceptor, which sits
 * outside this one in the app, rethrows the very same object.
 */
export function interceptedError(status: number, body: unknown, request: RefusedRequest = {}): ApiError {
  const req = new HttpRequest<unknown>(
    request.method ?? 'GET',
    request.url ?? `${API_BASE}/api/host/hostels/${HOSTEL_ID}/rooms`,
    null,
  );
  const response = new HttpErrorResponse({
    error: status === 0 ? new ProgressEvent('error') : body,
    status,
    statusText: status === 0 ? '' : 'Refused',
    url: req.urlWithParams,
  });
  const next: HttpHandlerFn = () => throwError(() => response);
  let caught: ApiError | undefined;
  runInInjectionContext(INTERCEPTOR_INJECTOR, () => errorInterceptor(req, next)).subscribe({
    error: (e: ApiError) => (caught = e),
  });
  if (!caught) throw new Error(`the interceptor did not reject ${req.method} ${req.url} → ${status}`);
  return caught;
}

/** {@link interceptedError} for one of {@link REFUSALS}. */
export function refusalError(kind: RefusalKind, request?: RefusedRequest): ApiError {
  const { status, body } = REFUSALS[kind];
  return interceptedError(status, body, request);
}
