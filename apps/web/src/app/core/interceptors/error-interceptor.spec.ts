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
import {
  API_ERROR_NOTIFIER,
  SUPPRESS_ERROR_TOAST,
  UNAUTHORIZED_HANDLER,
} from '@core/tokens';
import { errorInterceptor } from './error-interceptor';

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
  ): ApiError {
    let caught: ApiError | undefined;
    http
      .get('/api/x', context ? { context } : undefined)
      .subscribe({ error: (e: ApiError) => (caught = e) });
    flush(httpMock.expectOne('/api/x'));
    return caught as ApiError;
  }

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
    fire((req) =>
      req.flush(
        { success: false, errors: ['Invalid email or password'] },
        { status: 401, statusText: 'Unauthorized' },
      ),
    );
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(notify).not.toHaveBeenCalled();
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
