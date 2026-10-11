import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_CONFIG } from '@core/api-config';
import { GeoPreference } from '@core/geo/geo-preference';
import { SUPPRESS_ERROR_TOAST } from '@core/tokens';
import { AuthApi } from './auth-api';

const BASE = 'https://api.test';
const CURRENT = `${BASE}/api/users/current`;

describe('AuthApi.currentUser — the error toast', () => {
  let api: AuthApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
        { provide: GeoPreference, useValue: { refresh: vi.fn() } },
      ],
    });
    api = TestBed.inject(AuthApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('suppresses the global error toast when the caller handles failures inline', () => {
    api.currentUser({ inlineErrors: true }).subscribe();

    const req = httpMock.expectOne(CURRENT);
    expect(req.request.method).toBe('GET');
    expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
    req.flush({ success: true, user: { id: 1 } });
  });

  it('keeps the global error toast when called with no options', () => {
    api.currentUser().subscribe();

    const req = httpMock.expectOne(CURRENT);
    expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(false);
    req.flush({ success: true, user: { id: 1 } });
  });
});

describe('AuthApi.signOut — the error toast', () => {
  const SIGN_OUT = `${BASE}/api/user/sign_out`;
  let api: AuthApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
        { provide: GeoPreference, useValue: { refresh: vi.fn() } },
      ],
    });
    api = TestBed.inject(AuthApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('suppresses the global error toast when the caller handles failures inline', () => {
    api.signOut({ inlineErrors: true }).subscribe();

    const req = httpMock.expectOne(SIGN_OUT);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
    req.flush({ success: true });
  });

  it('keeps the global error toast when called with no options', () => {
    api.signOut().subscribe();

    const req = httpMock.expectOne(SIGN_OUT);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(false);
    req.flush({ success: true });
  });

  it('keeps the global error toast when inlineErrors is false', () => {
    api.signOut({ inlineErrors: false }).subscribe();

    const req = httpMock.expectOne(SIGN_OUT);
    expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(false);
    req.flush({ success: true });
  });
});

describe('AuthApi.resetPassword — the error toast', () => {
  const RESET = `${BASE}/api/user/reset_password`;
  let api: AuthApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
        { provide: GeoPreference, useValue: { refresh: vi.fn() } },
      ],
    });
    api = TestBed.inject(AuthApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('suppresses the global error toast, because the page explains every failure itself', () => {
    api.resetPassword({ token: 'abc123', new_password: 'Secret123' }).subscribe();

    const req = httpMock.expectOne(RESET);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ token: 'abc123', new_password: 'Secret123' });
    expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
    req.flush({ success: true });
  });
});
