import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_CONFIG } from '@core/api-config';
import { errorInterceptor } from '@core/interceptors/error-interceptor';
import { API_ERROR_NOTIFIER, UNAUTHORIZED_HANDLER } from '@core/tokens';
import { UsersApi } from './users-api';

const BASE = 'https://api.test';

/**
 * Whether a failed lookup raises the app-wide error toast.
 *
 * Runs through the real `errorInterceptor`, because the toast is decided there: a request is
 * quiet only if it carries `SUPPRESS_ERROR_TOAST`, and nothing short of the interceptor shows
 * whether `getById` actually attached it.
 */
describe('UsersApi.getById — the error toast', () => {
  const notify = vi.fn();
  let api: UsersApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    notify.mockReset();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
        { provide: API_ERROR_NOTIFIER, useValue: notify },
        { provide: UNAUTHORIZED_HANDLER, useValue: vi.fn() },
      ],
    });
    api = TestBed.inject(UsersApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function refuse(): void {
    httpMock
      .expectOne(`${BASE}/api/users/tDzjiS`)
      .flush({ errors: ['You are not authorized to access this page.'] }, { status: 403, statusText: 'Forbidden' });
  }

  it('raises no toast for a refused lookup made quietly', () => {
    let failed = false;
    api.getById('tDzjiS', { quiet: true }).subscribe({ error: () => (failed = true) });
    refuse();

    expect(notify).not.toHaveBeenCalled();
    // Still an error for the caller to handle; only the toast is skipped.
    expect(failed).toBe(true);
  });

  // Admin payments and user settings call it without the flag and must keep their toast.
  it('still raises the toast by default', () => {
    api.getById('tDzjiS').subscribe({ error: () => undefined });
    refuse();

    expect(notify).toHaveBeenCalledTimes(1);
  });
});
