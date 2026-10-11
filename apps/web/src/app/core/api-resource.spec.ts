import { HttpContext, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_CONFIG } from './api-config';
import { ApiClient } from './api-resource';
import { SUPPRESS_ERROR_TOAST } from './tokens';

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
