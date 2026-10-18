import { HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_CONFIG } from './api-config';
import { ApiClient, requestContextArgs } from './api-resource';
import { errorInterceptor } from './interceptors/error-interceptor';
import { API_ERROR_NOTIFIER, SUPPRESS_ERROR_TOAST, UNAUTHORIZED_HANDLER } from './tokens';

const BASE = 'https://api.test';
const URL = `${BASE}/api/thing`;

describe('ApiClient.delete', () => {
  let client: ApiClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
      ],
    });
    client = TestBed.inject(ApiClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('carries the given context on the request', () => {
    const context = new HttpContext().set(SUPPRESS_ERROR_TOAST, true);
    client.delete('/api/thing', undefined, context).subscribe();

    const req = httpMock.expectOne(URL);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
    expect(req.request.body).toBeNull();
    req.flush({});
  });

  it('sends both the body and the context when given both', () => {
    const context = new HttpContext().set(SUPPRESS_ERROR_TOAST, true);
    client.delete('/api/thing', { id: 7 }, context).subscribe();

    const req = httpMock.expectOne(URL);
    expect(req.request.body).toEqual({ id: 7 });
    expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
    req.flush({});
  });

  it('leaves the context at its defaults when none is given', () => {
    client.delete('/api/thing').subscribe();

    const req = httpMock.expectOne(URL);
    expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(false);
    expect(req.request.body).toBeNull();
    req.flush({});
  });

  it('still sends a body when there is no context', () => {
    client.delete('/api/thing', { id: 7 }).subscribe();

    const req = httpMock.expectOne(URL);
    expect(req.request.body).toEqual({ id: 7 });
    expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(false);
    req.flush({});
  });
});

describe('ApiClient.patch', () => {
  let client: ApiClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
      ],
    });
    client = TestBed.inject(ApiClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('sends the body and carries the given context', () => {
    const context = new HttpContext().set(SUPPRESS_ERROR_TOAST, true);
    client.patch('/api/thing', { id: 7 }, context).subscribe();

    const req = httpMock.expectOne(URL);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ id: 7 });
    expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
    req.flush({});
  });

  it('sends the body and leaves the context at its defaults when none is given', () => {
    client.patch('/api/thing', { id: 7 }).subscribe();

    const req = httpMock.expectOne(URL);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ id: 7 });
    expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(false);
    req.flush({});
  });
});

describe('requestContextArgs', () => {
  it('returns no trailing arguments when called with nothing, an empty object or the opt-out off', () => {
    expect(requestContextArgs()).toEqual([]);
    expect(requestContextArgs({})).toEqual([]);
    expect(requestContextArgs({ suppressErrorToast: false })).toEqual([]);
  });

  it('returns one context carrying the toast opt-out when asked to suppress', () => {
    const args = requestContextArgs({ suppressErrorToast: true });

    expect(args).toHaveLength(1);
    const ctx = args[0] as HttpContext;
    expect(ctx).toBeInstanceOf(HttpContext);
    expect(ctx.get(SUPPRESS_ERROR_TOAST)).toBe(true);
  });
});

describe('ApiClient.put', () => {
  let api: ApiClient;
  let httpMock: HttpTestingController;
  const notify = vi.fn();

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
    api = TestBed.inject(ApiClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('forwards the context it is given onto the request', () => {
    const ctx = new HttpContext().set(SUPPRESS_ERROR_TOAST, true);
    api.put('/api/x', { a: 1 }, ctx).subscribe();

    const req = httpMock.expectOne(`${BASE}/api/x`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ a: 1 });
    expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
    req.flush({});
  });

  it('leaves the toast opt-out at its default of false when no context is given', () => {
    api.put('/api/x', {}).subscribe();

    const req = httpMock.expectOne(`${BASE}/api/x`);
    expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(false);
    req.flush({});
  });

  it('raises no toast for a 422 when the call opts out, but still rejects the caller', () => {
    let caught: { serverMessages?: string[] } | undefined;
    api
      .put('/api/x', {}, new HttpContext().set(SUPPRESS_ERROR_TOAST, true))
      .subscribe({ error: (e) => (caught = e) });

    httpMock
      .expectOne(`${BASE}/api/x`)
      .flush({ success: false, errors: ['nope'] }, { status: 422, statusText: 'Unprocessable Entity' });

    expect(notify).not.toHaveBeenCalled();
    expect(caught?.serverMessages).toEqual(['nope']);
  });

  it('raises exactly one toast for a 422 when the call does not opt out', () => {
    api.put('/api/x', {}).subscribe({ error: () => undefined });

    httpMock
      .expectOne(`${BASE}/api/x`)
      .flush({ success: false, errors: ['nope'] }, { status: 422, statusText: 'Unprocessable Entity' });

    expect(notify).toHaveBeenCalledOnce();
  });
});
