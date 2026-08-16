import {
  HttpClient,
  HttpContext,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
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

  beforeEach(() => {
    notify.mockReset();
    onUnauthorized.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
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
    url: string = `${BASE}/api/x`,
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

  it('puts the server text on `message`, not Angular\'s HTTP failure string', () => {
    // Several screens render `err.message` inline (the auth forms, subscription
    // notices, staff and password screens). Angular's default is
    // "Http failure response for <url>: 401 Unauthorized" — a URL and a status code —
    // which was reaching users verbatim while the body carried usable copy.
    const err = fire(unauthorized);
    expect(err.message).toBe('Invalid email or password');
    expect(err.message).not.toContain('Http failure response');
  });

  it('joins multiple server messages onto `message`', () => {
    const err = fire((req) =>
      req.flush(
        { success: false, errors: ["Email can't be blank", 'Password is too short'] },
        { status: 422, statusText: 'Unprocessable Entity' },
      ),
    );
    expect(err.message).toBe("Email can't be blank\nPassword is too short");
  });

  it('falls back to Angular\'s message when the body carries no server text', () => {
    // Network failures have an empty body — without a fallback the surface would show
    // an empty string rather than anything describable.
    const err = fire((req) =>
      req.flush(null, { status: 500, statusText: 'Server Error' }),
    );
    expect(err.message).toContain('Http failure response');
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
});
