import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SSR_REQUEST_TIMEOUT_MS, ssrTimeoutInterceptor } from './ssr-timeout-interceptor';

/**
 * Stopping a dead backend from hanging server-side rendering.
 *
 * An unreachable host drops packets rather than refusing, so the request sits open until the
 * OS gives up minutes later. Angular counts it as work in progress and the render never
 * stabilises — every public page burns its nine-second budget and serialises half-drawn.
 *
 * The browser is deliberately left alone: it has a spinner and a user who can wait, and
 * cutting a slow request short there would invent an error nobody asked for.
 */
describe('ssrTimeoutInterceptor', () => {
  let http: HttpClient;
  let mock: HttpTestingController;

  function setUp(platform: 'server' | 'browser'): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([ssrTimeoutInterceptor])),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: platform },
      ],
    });
    http = TestBed.inject(HttpClient);
    mock = TestBed.inject(HttpTestingController);
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('gives up on a request the server is still waiting for', async () => {
    setUp('server');
    let failed: unknown = null;
    http.get('/api/hostels').subscribe({ error: (e) => (failed = e) });

    mock.expectOne('/api/hostels'); // opened, and never answered
    await vi.advanceTimersByTimeAsync(SSR_REQUEST_TIMEOUT_MS + 1);

    expect(failed).toBeTruthy();
  });

  // Well inside Angular's nine-second stabilisation budget, with time left to render the
  // page around the hole. A cap that fires after the deadline caps nothing.
  it('gives up early enough to still render something', () => {
    expect(SSR_REQUEST_TIMEOUT_MS).toBeLessThan(9_000);
  });

  it('lets a server request that answers in time through untouched', async () => {
    setUp('server');
    let body: unknown = null;
    http.get('/api/hostels').subscribe({ next: (b) => (body = b) });

    await vi.advanceTimersByTimeAsync(SSR_REQUEST_TIMEOUT_MS - 500);
    mock.expectOne('/api/hostels').flush({ ok: true });

    expect(body).toEqual({ ok: true });
  });

  /**
   * The browser keeps its patience.
   *
   * A slow request there is a spinner, not a failure — and cancelling one would also throw
   * away a response the user is still waiting for, which is the objection `AuthService`
   * records against `timeout()` in the first place.
   */
  it('never cuts a browser request short', async () => {
    setUp('browser');
    let failed: unknown = null;
    let body: unknown = null;
    http.get('/api/hostels').subscribe({
      next: (b) => (body = b),
      error: (e) => (failed = e),
    });

    const req = mock.expectOne('/api/hostels');
    await vi.advanceTimersByTimeAsync(SSR_REQUEST_TIMEOUT_MS * 4);
    expect(failed).toBeNull();

    // Still live after four times the server's limit, and still delivers.
    req.flush({ ok: true });
    expect(body).toEqual({ ok: true });
  });
});
