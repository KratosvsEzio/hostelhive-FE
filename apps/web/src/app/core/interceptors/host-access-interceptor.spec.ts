import {
  HttpClient,
  HttpContext,
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
import { API_ERROR_NOTIFIER, SUPPRESS_ERROR_TOAST } from '@core/tokens';
import { SessionStore, SessionUser } from '@app/core/auth/session-store';
import { HostAccessEvents } from '@core/host-access/host-access';
import { errorInterceptor } from './error-interceptor';
import { hostAccessInterceptor } from './host-access-interceptor';

const BASE = 'https://api.test';
const ROOMS = `${BASE}/api/host/hostels/Xk9pQ/rooms`;
const CONFIRM = `${BASE}/api/host/hostels/Xk9pQ/bookings/bk-1/mark_as_confirmed`;
const SUBSCRIBE = { success: false, errors: ['You need to subscribe to avail the services'] };
const NO_CRM = {
  success: false,
  code: 'crm_required',
  errors: ['Your plan does not include CRM'],
};
const USER: SessionUser = {
  id: 'uA',
  name: 'Imran',
  email: 'i@h.pk',
  role: 'host',
  allRoles: ['host'],
  permissions: [],
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
    TestBed.inject(SessionStore).setSession(USER, 'tok');
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
    context?: HttpContext,
  ): ApiError | undefined {
    let caught: ApiError | undefined;
    const options = context ? { context } : undefined;
    const call = method === 'GET' ? http.get(url, options) : http.post(url, {}, options);
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

  // The page that sends a quiet write reports the failure itself, but the console still has to learn the plan refusal.
  it.each([
    ['400 subscribe', SUBSCRIBE, 400, 'inactive'],
    ['403 crm_required', NO_CRM, 403, 'crmRequired'],
  ] as const)('records a quiet POST %s refusal the same as a loud one and does not toast it', (_, body, status, kind) => {
    const err = send('POST', CONFIRM, body, status, new HttpContext().set(SUPPRESS_ERROR_TOAST, true));
    expect(events.observations()).toEqual([{ hostelId: 'Xk9pQ', kind, owner: 'uA', seq: 0 }]);
    expect(notify).not.toHaveBeenCalled();
    expect(err?.status).toBe(status);
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

  describe('on success', () => {
    function succeed(method: 'GET' | 'POST', url: string): void {
      (method === 'GET' ? http.get(url) : http.post(url, {})).subscribe();
      httpMock.expectOne(url).flush({ success: true });
    }

    function refuse(hostel: string, kind: 'inactive' | 'crmRequired'): void {
      const url = `${BASE}/api/host/hostels/${hostel}/rooms`;
      if (kind === 'inactive') send('GET', url, SUBSCRIBE, 400);
      else send('GET', url, NO_CRM, 403);
    }

    const kinds = () => events.observations().map((o) => [o.hostelId, o.kind]);

    it.each([
      ['a GET', 'GET', `${BASE}/api/host/hostels/Xk9pQ/bookings?page=1`],
      ['a write', 'POST', `${BASE}/api/host/hostels/Xk9pQ/renters`],
    ] as const)('clears both refusals of that hostel after %s', (_, method, url) => {
      refuse('Xk9pQ', 'inactive');
      refuse('Xk9pQ', 'crmRequired');
      succeed(method, url);
      expect(events.observations()).toEqual([]);
    });

    it('clears only the inactive refusal after the hostel record, which skips the CRM check', () => {
      refuse('Xk9pQ', 'inactive');
      refuse('Xk9pQ', 'crmRequired');
      succeed('GET', `${BASE}/api/host/hostels/Xk9pQ`);
      expect(kinds()).toEqual([['Xk9pQ', 'crmRequired']]);
    });

    it.each([
      ['another hostel', `${BASE}/api/host/hostels/Other/rooms`],
      ['the hostel index', `${BASE}/api/host/hostels`],
      ['a non-host route', `${BASE}/api/hostels/Xk9pQ/billing`],
    ])('keeps the refusals after a success on %s', (_, url) => {
      refuse('Xk9pQ', 'crmRequired');
      succeed('GET', url);
      expect(kinds()).toEqual([['Xk9pQ', 'crmRequired']]);
    });

    it('keeps a refusal recorded while the successful request was in flight', () => {
      http.get(`${BASE}/api/host/hostels/Xk9pQ/expenses`).subscribe();
      refuse('Xk9pQ', 'crmRequired');
      httpMock.expectOne(`${BASE}/api/host/hostels/Xk9pQ/expenses`).flush({ success: true });
      expect(kinds()).toEqual([['Xk9pQ', 'crmRequired']]);
    });

    it('keeps another user\'s refusals', () => {
      const session = TestBed.inject(SessionStore);
      refuse('Xk9pQ', 'crmRequired');
      session.setSession({ ...USER, id: 'uB' }, 'tok2');
      succeed('GET', ROOMS);
      session.setSession(USER, 'tok');
      expect(kinds()).toEqual([['Xk9pQ', 'crmRequired']]);
    });

    it('clears nothing while signed out', () => {
      const session = TestBed.inject(SessionStore);
      refuse('Xk9pQ', 'crmRequired');
      session.clear();
      succeed('GET', ROOMS);
      session.setSession(USER, 'tok');
      expect(kinds()).toEqual([['Xk9pQ', 'crmRequired']]);
    });
  });
});
