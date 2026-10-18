import {
  HttpContext,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_CONFIG } from '@core/api-config';
import { errorInterceptor } from '@core/interceptors/error-interceptor';
import { API_ERROR_NOTIFIER, SUPPRESS_ERROR_TOAST } from '@core/tokens';
import { AdminApi } from './admin-api';
import { quiet } from './quiet-request';

const BASE = 'https://api.test';
const HOSTELS = `${BASE}/api/admin/hostels`;

describe('AdminApi.listings', () => {
  const notify = vi.fn();
  let api: AdminApi;
  let http: HttpTestingController;

  beforeEach(() => {
    notify.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
        { provide: API_ERROR_NOTIFIER, useValue: notify },
      ],
    });
    api = TestBed.inject(AdminApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('leaves the error toast on when no context is given', () => {
    api.listings().subscribe({ error: () => undefined });
    const req = http.expectOne((r) => r.url === HOSTELS);

    expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(false);
    req.flush('boom', { status: 500, statusText: 'Server Error' });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('passes a given context through, so a quiet call raises no toast', () => {
    api
      .listings('all', 1, undefined, undefined, null, quiet())
      .subscribe({ error: () => undefined });
    const req = http.expectOne((r) => r.url === HOSTELS);

    expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
    req.flush('boom', { status: 500, statusText: 'Server Error' });
    expect(notify).not.toHaveBeenCalled();
  });

  it('passes the very context object it was given', () => {
    const context = new HttpContext();
    api.listings('all', 1, undefined, undefined, null, context).subscribe();
    const req = http.expectOne((r) => r.url === HOSTELS);

    expect(req.request.context).toBe(context);
    req.flush({ hostels: [], pagination: {} });
  });

  it('sends the id filter as f[id] alongside the name search', () => {
    api.listings('all', 1, { id: 'hX7q2', name: 'Lodge 88' }).subscribe();
    const req = http.expectOne((r) => r.url === HOSTELS);

    expect(req.request.params.get('f[id]')).toBe('hX7q2');
    expect(req.request.params.get('s[name]')).toBe('Lodge 88');
    req.flush({ hostels: [], pagination: {} });
  });
});
