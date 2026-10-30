import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { REQUEST_CONTEXT, RESPONSE_INIT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideApiConfig } from '@core/api-config';
import { OUTAGE_RETRY_AFTER_SECONDS } from '@core/ssr-response';
import {
  SSR_CLIENT_IP_HEADER,
  SSR_SECRET_HEADER,
  SsrApiContext,
  ssrApiHeadersInterceptor,
} from './ssr-api-headers-interceptor';

const API = 'https://api.example.test';
const PUBLIC_URL = `${API}/public/hostels`;
const SECRET = 'test-ssr-secret';
const VISITOR = '203.0.113.7';

/**
 * The server's own `/public` calls carry the shared secret and the visitor's IP, so the API
 * limits each visitor rather than the renderer. Nothing else does: not a browser call, not an
 * authenticated `/api` call, and never a request to another host.
 */
describe('ssrApiHeadersInterceptor', () => {
  let http: HttpClient;
  let mock: HttpTestingController;
  let responseInit: ResponseInit | null;

  /** `context: null` is the browser (and the build-time prerender): no REQUEST_CONTEXT. */
  function setUp(context: SsrApiContext | null, init: ResponseInit | null = {}): void {
    responseInit = init;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideApiConfig({ baseUrl: API }),
        provideHttpClient(withInterceptors([ssrApiHeadersInterceptor])),
        provideHttpClientTesting(),
        ...(context ? [{ provide: REQUEST_CONTEXT, useValue: context }] : []),
        { provide: RESPONSE_INIT, useValue: init },
      ],
    });
    http = TestBed.inject(HttpClient);
    mock = TestBed.inject(HttpTestingController);
  }

  afterEach(() => mock.verify());

  describe('on the server', () => {
    it('sends the secret and the visitor IP on a /public call', () => {
      setUp({ ssrSecret: SECRET, clientIp: VISITOR });
      http.get(PUBLIC_URL).subscribe();
      const req = mock.expectOne(PUBLIC_URL);
      expect(req.request.headers.get(SSR_SECRET_HEADER)).toBe(SECRET);
      expect(req.request.headers.get(SSR_CLIENT_IP_HEADER)).toBe(VISITOR);
      req.flush({});
    });

    it('sends the secret alone when the visitor IP is unknown', () => {
      setUp({ ssrSecret: SECRET, clientIp: null });
      http.get(PUBLIC_URL).subscribe();
      const req = mock.expectOne(PUBLIC_URL);
      expect(req.request.headers.get(SSR_SECRET_HEADER)).toBe(SECRET);
      expect(req.request.headers.has(SSR_CLIENT_IP_HEADER)).toBe(false);
      req.flush({});
    });

    // The API ignores the IP without a matching secret, so an IP on its own says nothing.
    it('sends neither header when the server has no secret', () => {
      setUp({ ssrSecret: null, clientIp: VISITOR });
      http.get(PUBLIC_URL).subscribe();
      const req = mock.expectOne(PUBLIC_URL);
      expect(req.request.headers.has(SSR_SECRET_HEADER)).toBe(false);
      expect(req.request.headers.has(SSR_CLIENT_IP_HEADER)).toBe(false);
      req.flush({});
    });

    it.each([
      ['an authenticated /api call', `${API}/api/user/me`],
      ['a path that only starts with "public"', `${API}/publicity`],
      ['another host', 'https://ipapi.co/json/'],
      ['another host with a /public path', 'https://evil.example/public/hostels'],
    ])('leaves %s alone', (_label, url) => {
      setUp({ ssrSecret: SECRET, clientIp: VISITOR });
      http.get(url).subscribe();
      const req = mock.expectOne(url);
      expect(req.request.headers.has(SSR_SECRET_HEADER)).toBe(false);
      expect(req.request.headers.has(SSR_CLIENT_IP_HEADER)).toBe(false);
      req.flush({});
    });

    it('answers the page 503, no-store, when the API rate-limits a /public call', () => {
      setUp({ ssrSecret: SECRET, clientIp: VISITOR });
      let failed: { status?: number } | null = null;
      http.get(PUBLIC_URL).subscribe({ error: (e) => (failed = e) });
      mock.expectOne(PUBLIC_URL).flush({}, { status: 429, statusText: 'Too Many Requests' });

      // The page's own error handling still runs: the failure is passed on, not swallowed.
      expect(failed?.status).toBe(429);
      expect(responseInit?.status).toBe(503);
      const headers = new Headers(responseInit?.headers);
      expect(headers.get('Cache-Control')).toBe('no-store');
      expect(headers.get('Retry-After')).toBe(String(OUTAGE_RETRY_AFTER_SECONDS));
    });

    it('leaves the page status alone for any other failure', () => {
      setUp({ ssrSecret: SECRET, clientIp: VISITOR });
      http.get(PUBLIC_URL).subscribe({ error: () => undefined });
      mock.expectOne(PUBLIC_URL).flush({}, { status: 404, statusText: 'Not Found' });
      expect(responseInit?.status).toBeUndefined();
    });
  });

  describe('in the browser', () => {
    it('sends neither header on a /public call', () => {
      setUp(null, null);
      http.get(PUBLIC_URL).subscribe();
      const req = mock.expectOne(PUBLIC_URL);
      expect(req.request.headers.has(SSR_SECRET_HEADER)).toBe(false);
      expect(req.request.headers.has(SSR_CLIENT_IP_HEADER)).toBe(false);
      req.flush({});
    });

    it('passes a 429 through untouched', () => {
      setUp(null, null);
      let failed: { status?: number } | null = null;
      http.get(PUBLIC_URL).subscribe({ error: (e) => (failed = e) });
      mock.expectOne(PUBLIC_URL).flush({}, { status: 429, statusText: 'Too Many Requests' });
      expect(failed?.status).toBe(429);
    });
  });
});
