import {
  HttpClient,
  HttpContext,
  HttpInterceptorFn,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TimeoutError, throwError } from 'rxjs';
import { ApiError } from '@hostelhive/data-access';
import { API_CONFIG } from '@core/api-config';
import {
  API_ERROR_NOTIFIER,
  SUPPRESS_ERROR_TOAST,
  UNAUTHORIZED_HANDLER,
} from '@core/tokens';
import { errorInterceptor } from './error-interceptor';

/** Requests carry an absolute URL in the app (`ApiClient` builds `base + path`). */
const BASE = 'https://api.test';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  const notify = vi.fn();
  const onUnauthorized = vi.fn();
  /** When set, the request fails before reaching the backend, as the server-side timeout does. */
  let downstreamError: unknown = null;
  const failDownstream: HttpInterceptorFn = (req, next) =>
    downstreamError === null ? next(req) : throwError(() => downstreamError);

  beforeEach(() => {
    notify.mockReset();
    onUnauthorized.mockReset();
    downstreamError = null;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor, failDownstream])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
        { provide: API_ERROR_NOTIFIER, useValue: notify },
        { provide: UNAUTHORIZED_HANDLER, useValue: onUnauthorized },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function fire(
    flush: (req: ReturnType<HttpTestingController['expectOne']>) => void,
    context?: HttpContext,
    url = `${BASE}/api/x`,
  ): ApiError {
    let caught: ApiError | undefined;
    http
      .get(url, context ? { context } : undefined)
      .subscribe({ error: (e: ApiError) => (caught = e) });
    flush(httpMock.expectOne(url));
    return caught as ApiError;
  }

  const unauthorized = (
    req: ReturnType<HttpTestingController['expectOne']>,
  ): void =>
    req.flush(
      { success: false, errors: ['Invalid email or password'] },
      { status: 401, statusText: 'Unauthorized' },
    );

  describe('the diagnostic message', () => {
    it('names the method, the path and the status', () => {
      const err = fire(unauthorized);
      expect(err.message).toBe('GET /api/x → 401');
    });

    it('uses the method of a write', () => {
      let caught: ApiError | undefined;
      http.post(`${BASE}/api/hostels/1/rooms`, {}).subscribe({ error: (e: ApiError) => (caught = e) });
      httpMock
        .expectOne(`${BASE}/api/hostels/1/rooms`)
        .flush({ success: false, errors: ['Name is taken'] }, { status: 422, statusText: 'Unprocessable Entity' });
      expect(caught?.message).toBe('POST /api/hostels/1/rooms → 422');
    });

    it('drops the origin and the query string', () => {
      const url = `${BASE}/api/hostels/1/rooms?token=secret-token&page=2`;
      const err = fire((req) => req.flush(null, { status: 404, statusText: 'Not Found' }), undefined, url);
      expect(err.message).toBe('GET /api/hostels/1/rooms → 404');
    });

    // `statusText` comes from the server as well, so only the number is kept.
    it('carries the numeric status, not the status text', () => {
      const err = fire((req) => req.flush(null, { status: 500, statusText: 'Database exploded' }));
      expect(err.message).toBe('GET /api/x → 500');
    });

    const SERVER_WORDS = ['Invalid email or password', 'Card was declined', 'Email is taken', 'Not yours', 'Rails page'];
    const bodies: readonly [string, unknown, readonly string[] | undefined][] = [
      ['an array of errors', { success: false, errors: [SERVER_WORDS[0], SERVER_WORDS[1]] }, [SERVER_WORDS[0], SERVER_WORDS[1]]],
      ['a string of errors', { success: false, errors: SERVER_WORDS[1] }, [SERVER_WORDS[1]]],
      ['a field→messages object', { success: false, errors: { email: [SERVER_WORDS[2]], base: SERVER_WORDS[1] } }, [SERVER_WORDS[2], SERVER_WORDS[1]]],
      ['a singular error', { success: false, error: SERVER_WORDS[3] }, [SERVER_WORDS[3]]],
      ['an HTML page', `<!DOCTYPE html><h1>${SERVER_WORDS[4]}</h1>`, undefined],
      ['no body', null, undefined],
    ];
    const statuses = [0, 401, 403, 404, 422, 500];
    const cases = bodies.flatMap(([label, body, serverMessages]) =>
      statuses.map((status) => ({ label, body, serverMessages, status })),
    );

    it.each(cases)('never carries server text: $label at $status', ({ body, serverMessages, status }) => {
      const url = `${BASE}/api/hostels/1/rooms?token=secret-token`;
      const err = fire((req) => req.flush(body, { status, statusText: 'Server Said So' }), undefined, url);

      expect(err.message).toBe(`GET /api/hostels/1/rooms → ${status}`);
      for (const words of SERVER_WORDS) expect(err.message).not.toContain(words);
      expect(err.message).not.toContain('Server Said So');
      expect(err.message.toLowerCase()).not.toContain('http');
      expect(err.message).not.toContain('api.test');
      expect(err.message).not.toContain('?');

      expect(err.status).toBe(status);
      expect(err.code).toBe(status === 0 ? 'network_error' : 'unknown_error');
      expect(err.serverMessages).toEqual(serverMessages);
      expect(err.method).toBe('GET');
    });

    it('names the error when the failure has no status', () => {
      downstreamError = new TimeoutError();
      let caught: ApiError | undefined;
      http.get(`${BASE}/public/hostels?page=1`).subscribe({ error: (e: ApiError) => (caught = e) });

      expect(caught?.message).toBe('GET /public/hostels → TimeoutError');
      expect(caught?.message).not.toContain('undefined');
    });

    it('falls back to a generic word when the failure has neither status nor name', () => {
      downstreamError = {};
      let caught: ApiError | undefined;
      http.delete(`${BASE}/api/x`).subscribe({ error: (e: ApiError) => (caught = e) });

      expect(caught?.message).toBe('DELETE /api/x → error');
    });
  });

  it('notifies with server text for a 422 envelope', () => {
    const err = fire((req) =>
      req.flush(
        { success: false, errors: ["Full name can't be blank"] },
        { status: 422, statusText: 'Unprocessable Entity' },
      ),
    );
    expect(notify).toHaveBeenCalledOnce();
    expect(err.serverMessages).toEqual(["Full name can't be blank"]);
  });

  it('notifies with the singular error for a 403', () => {
    const err = fire((req) =>
      req.flush(
        { success: false, error: 'You are not authorized.' },
        { status: 403, statusText: 'Forbidden' },
      ),
    );
    expect(notify).toHaveBeenCalledOnce();
    expect(err.serverMessages).toEqual(['You are not authorized.']);
  });

  it('notifies without server text for a routing-404 HTML body (no leak)', () => {
    const err = fire((req) =>
      req.flush('<!DOCTYPE html><h1>Not Found</h1>', {
        status: 404,
        statusText: 'Not Found',
      }),
    );
    expect(notify).toHaveBeenCalledOnce();
    expect(err.serverMessages).toBeUndefined();
  });

  it('notifies with no server text for a 500', () => {
    const err = fire((req) =>
      req.flush('<html>500</html>', {
        status: 500,
        statusText: 'Internal Server Error',
      }),
    );
    expect(notify).toHaveBeenCalledOnce();
    expect(err.serverMessages).toBeUndefined();
  });

  it('routes a 401 to the unauthorized handler and does NOT notify', () => {
    fire(unauthorized);
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(notify).not.toHaveBeenCalled();
  });

  it('tells the unauthorized handler which bearer the rejected request carried', () => {
    http
      .get(`${BASE}/api/x`, { headers: { Authorization: 'Bearer tok-A' } })
      .subscribe({ error: () => undefined });
    unauthorized(httpMock.expectOne(`${BASE}/api/x`));
    expect(onUnauthorized).toHaveBeenCalledExactlyOnceWith('tok-A');
  });

  it('passes null to the unauthorized handler when the request carried no Authorization', () => {
    fire(unauthorized);
    expect(onUnauthorized).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('passes null when the Authorization header is not a bearer', () => {
    http
      .get(`${BASE}/api/x`, { headers: { Authorization: 'Basic abc' } })
      .subscribe({ error: () => undefined });
    unauthorized(httpMock.expectOne(`${BASE}/api/x`));
    expect(onUnauthorized).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('passes null when the bearer header carries no token after the scheme', () => {
    http
      .get(`${BASE}/api/x`, { headers: { Authorization: 'Bearer ' } })
      .subscribe({ error: () => undefined });
    unauthorized(httpMock.expectOne(`${BASE}/api/x`));
    expect(onUnauthorized).toHaveBeenCalledExactlyOnceWith(null);
  });

  // The handler clears the session, so anything that reaches it signs the user out.
  it('ignores a 401 from a third-party host', () => {
    fire(unauthorized, undefined, 'https://ipapi.co/json');
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it.each([
    '/api/user/sign_in',
    '/api/user/sign_up',
    '/api/user/google_login',
    '/api/user/confirm_invitation',
  ])('does not sign the user out when %s rejects the credentials', (path) => {
    fire(unauthorized, undefined, `${BASE}${path}`);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  // A 403 refuses one action of a user whose session is fine, so it must never sign them out.
  describe('a 403 on a stay move', () => {
    const move = `${BASE}/api/host/hostels/Xk9pQ/bookings/bk-1/mark_as_confirmed`;
    const cancan = 'You are not authorized to access this page.';
    const refusals: readonly [string, unknown][] = [
      ['a CanCan refusal', { success: false, error: cancan }],
      ['a refusal of a user who is neither host nor manager', { errors: [cancan] }],
      ['a plan without CRM', { success: false, code: 'crm_required', errors: ['Your plan does not include CRM'] }],
      ['a rate-limited request', { success: false, code: 'forbidden', errors: ['Forbidden'] }],
      ['a bare body', null],
    ];
    const cases = refusals.flatMap(([label, body]) =>
      [true, false].map((suppressed) => ({ label, body, suppressed })),
    );

    it.each(cases)(
      'never reaches the unauthorized handler: $label, toast suppressed: $suppressed',
      ({ body, suppressed }) => {
        let caught: ApiError | undefined;
        http
          .post(move, {}, {
            headers: { Authorization: 'Bearer tok-A' },
            context: new HttpContext().set(SUPPRESS_ERROR_TOAST, suppressed),
          })
          .subscribe({ error: (e: ApiError) => (caught = e) });
        httpMock.expectOne(move).flush(body, { status: 403, statusText: 'Forbidden' });

        expect(onUnauthorized).not.toHaveBeenCalled();
        expect(caught?.status).toBe(403);
      },
    );
  });

  // The host area's billing gate answers `{ code: 'crm_required', errors, success: false }`.
  // The code is the only thing that tells it apart from any other 403, so it must survive.
  it('keeps the server\'s machine code', () => {
    const err = fire((req) =>
      req.flush(
        { success: false, errors: ['Your plan does not include CRM'], code: 'crm_required' },
        { status: 403, statusText: 'Forbidden' },
      ),
    );

    expect(err.code).toBe('crm_required');
    expect(err.serverMessages).toEqual(['Your plan does not include CRM']);
  });

  it('falls back to unknown_error when the envelope has no code', () => {
    const err = fire((req) =>
      req.flush({ success: false, errors: ['Nope'] }, { status: 422, statusText: 'Unprocessable' }),
    );

    expect(err.code).toBe('unknown_error');
  });

  it('keeps network_error for a failure with no response', () => {
    const err = fire((req) => req.error(new ProgressEvent('error')));

    expect(err.status).toBe(0);
    expect(err.code).toBe('network_error');
    expect(err.message).toBe('GET /api/x → 0');
  });

  it('ignores an empty or non-string code', () => {
    const empty = fire((req) =>
      req.flush({ success: false, code: '' }, { status: 400, statusText: 'Bad Request' }),
    );
    const numeric = fire((req) =>
      req.flush({ success: false, code: 42 }, { status: 400, statusText: 'Bad Request' }),
    );

    expect(empty.code).toBe('unknown_error');
    expect(numeric.code).toBe('unknown_error');
  });

  describe('host plan refusals', () => {
    const rooms = `${BASE}/api/host/hostels/Xk9pQ/rooms`;
    const subscribe = { success: false, errors: ['You need to subscribe to avail the services'] };
    const noCrm = { success: false, code: 'crm_required', errors: ['Your plan does not include CRM'] };

    it('does not toast a GET refused for want of a plan', () => {
      fire((req) => req.flush(subscribe, { status: 400, statusText: 'Bad Request' }), undefined, rooms);
      expect(notify).not.toHaveBeenCalled();
    });

    it('does not toast a GET refused for want of CRM, and still rethrows', () => {
      const err = fire((req) => req.flush(noCrm, { status: 403, statusText: 'Forbidden' }), undefined, rooms);
      expect(notify).not.toHaveBeenCalled();
      expect(err.status).toBe(403);
    });

    it('still toasts a write the plan refused', () => {
      http.post(rooms, {}).subscribe({ error: () => undefined });
      httpMock.expectOne(rooms).flush(noCrm, { status: 403, statusText: 'Forbidden' });
      expect(notify).toHaveBeenCalledOnce();
    });

    it('still toasts the same refusal from outside a host hostel', () => {
      fire((req) => req.flush(subscribe, { status: 400, statusText: 'Bad Request' }));
      expect(notify).toHaveBeenCalledOnce();
    });
  });

  it('does not notify when the request suppresses the toast', () => {
    fire(
      (req) =>
        req.flush(
          { success: false, errors: ['nope'] },
          { status: 422, statusText: 'Unprocessable Entity' },
        ),
      new HttpContext().set(SUPPRESS_ERROR_TOAST, true),
    );
    expect(notify).not.toHaveBeenCalled();
  });

  // The opt-out silences the toast only; an expired session must still sign the user out.
  it('still routes a 401 to the unauthorized handler when the request suppresses the toast', () => {
    const url = `${BASE}/api/host/hostels/Xk9pQ/bookings/bk-1/mark_as_confirmed`;
    let caught: ApiError | undefined;
    http
      .post(url, {}, { context: new HttpContext().set(SUPPRESS_ERROR_TOAST, true) })
      .subscribe({ error: (e: ApiError) => (caught = e) });
    unauthorized(httpMock.expectOne(url));

    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(notify).not.toHaveBeenCalled();
    expect(caught?.status).toBe(401);
  });
});
