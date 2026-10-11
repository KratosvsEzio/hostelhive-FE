import {
  HttpClient,
  HttpRequest,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { ApiError } from '@hostelhive/data-access';
import { API_CONFIG } from '@core/api-config';
import { API_ERROR_NOTIFIER } from '@core/tokens';
import { SessionStore } from '@app/core/auth/session-store';
import { HostAccessEvents } from '@core/host-access/host-access';
import { errorInterceptor } from './error-interceptor';
import { hostAccessInterceptor } from './host-access-interceptor';

const BASE = 'https://api.test';
const ROOMS = `${BASE}/api/host/hostels/Xk9pQ/rooms`;
const SUBSCRIBE = { success: false, errors: ['You need to subscribe to avail the services'] };
const NO_CRM = {
  success: false,
  code: 'crm_required',
  errors: ['Your plan does not include CRM'],
};

describe('hostAccessInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let events: HostAccessEvents;
  const notify = vi.fn();

  beforeEach(() => {
    notify.mockReset();
    TestBed.configureTestingModule({
      providers: [
        // The app's order: outside errorInterceptor, so it sees the normalised error.
        provideHttpClient(withInterceptors([hostAccessInterceptor, errorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
        { provide: API_ERROR_NOTIFIER, useValue: notify },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    events = TestBed.inject(HostAccessEvents);
    TestBed.inject(SessionStore).setSession(
      {
        id: 'uA',
        name: 'Imran',
        email: 'i@h.pk',
        role: 'host',
        allRoles: ['host'],
        permissions: [],
      },
      'tok',
    );
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.inject(SessionStore).clear();
  });

  function send(
    method: 'GET' | 'POST',
    url: string,
    body: object,
    status: number,
  ): ApiError | undefined {
    let caught: ApiError | undefined;
    const call = method === 'GET' ? http.get(url) : http.post(url, {});
    call.subscribe({ error: (e: ApiError) => (caught = e) });
    httpMock.expectOne(url).flush(body, { status, statusText: 'Refused' });
    return caught;
  }

  it('records a GET 400 subscribe refusal and does not toast it', () => {
    const err = send('GET', ROOMS, SUBSCRIBE, 400);
    expect(events.observations()).toEqual([
      { hostelId: 'Xk9pQ', kind: 'inactive', owner: 'uA', seq: 0 },
    ]);
    expect(notify).not.toHaveBeenCalled();
    expect(err?.status).toBe(400);
  });

  it('records a GET 403 crm_required refusal and does not toast it', () => {
    const err = send('GET', ROOMS, NO_CRM, 403);
    expect(events.observations().map((o) => o.kind)).toEqual(['crmRequired']);
    expect(notify).not.toHaveBeenCalled();
    expect(err?.code).toBe('crm_required');
  });

  it('records a POST refusal and still toasts it', () => {
    send('POST', ROOMS, NO_CRM, 403);
    expect(events.observations().map((o) => o.kind)).toEqual(['crmRequired']);
    expect(notify).toHaveBeenCalledOnce();
  });

  it('ignores any other 403, which still toasts', () => {
    send('GET', ROOMS, { success: false, error: 'You are not authorized.' }, 403);
    expect(events.observations()).toEqual([]);
    expect(notify).toHaveBeenCalledOnce();
  });

  it('ignores a refusal from the hostel index', () => {
    send('GET', `${BASE}/api/host/hostels`, SUBSCRIBE, 400);
    expect(events.observations()).toEqual([]);
    expect(notify).toHaveBeenCalledOnce();
  });

  it.each([
    ['a matching refusal', { status: 403, code: 'crm_required', message: '' }],
    ['any other failure', { status: 500, code: 'unknown_error', message: '' }],
  ])('rethrows the very error object it received for %s', (_, thrown: ApiError) => {
    let caught: unknown;
    TestBed.runInInjectionContext(() =>
      hostAccessInterceptor(new HttpRequest('GET', ROOMS), () => throwError(() => thrown)),
    ).subscribe({ error: (e: unknown) => (caught = e) });
    expect(caught).toBe(thrown);
  });

  it('passes successes through untouched', () => {
    let body: unknown;
    http.get(ROOMS).subscribe((b) => (body = b));
    httpMock.expectOne(ROOMS).flush({ ok: true });
    expect(body).toEqual({ ok: true });
    expect(events.observations()).toEqual([]);
  });
});
