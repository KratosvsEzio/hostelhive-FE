import { RESPONSE_INIT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OUTAGE_RETRY_AFTER_SECONDS, SsrResponse, isApiOutage } from './ssr-response';

describe('isApiOutage', () => {
  it.each([0, 500, 502, 503, 504])('is an outage for status %i', (status) => {
    expect(isApiOutage({ status })).toBe(true);
  });

  it('is an outage for a failure with no status (the server timeout)', () => {
    expect(isApiOutage({})).toBe(true);
    expect(isApiOutage(new Error('timeout'))).toBe(true);
  });

  it.each([400, 401, 403, 404, 422, 429])('is not an outage for status %i', (status) => {
    expect(isApiOutage({ status })).toBe(false);
  });
});

describe('SsrResponse', () => {
  it('turns the render into a 503 with Retry-After and no-store, keeping existing headers', () => {
    const init: ResponseInit = { status: 200, headers: new Headers({ 'Content-Language': 'en' }) };
    TestBed.configureTestingModule({ providers: [{ provide: RESPONSE_INIT, useValue: init }] });

    TestBed.inject(SsrResponse).serviceUnavailable();

    expect(init.status).toBe(503);
    const headers = new Headers(init.headers);
    expect(headers.get('Retry-After')).toBe(String(OUTAGE_RETRY_AFTER_SECONDS));
    expect(headers.get('Cache-Control')).toBe('no-store');
    expect(headers.get('Content-Language')).toBe('en');
  });

  it('accepts headers given as a plain record', () => {
    const init: ResponseInit = { headers: { 'Content-Type': 'text/html' } };
    TestBed.configureTestingModule({ providers: [{ provide: RESPONSE_INIT, useValue: init }] });

    TestBed.inject(SsrResponse).serviceUnavailable();

    expect(new Headers(init.headers).get('Content-Type')).toBe('text/html');
    expect(new Headers(init.headers).get('Retry-After')).toBe(String(OUTAGE_RETRY_AFTER_SECONDS));
  });

  it('does nothing in the browser, where there is no response to set', () => {
    TestBed.configureTestingModule({});
    expect(() => TestBed.inject(SsrResponse).serviceUnavailable()).not.toThrow();
  });
});
