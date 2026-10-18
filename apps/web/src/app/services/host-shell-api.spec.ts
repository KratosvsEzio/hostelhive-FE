import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HostListingsData } from '@hostelhive/data-access';
import { API_CONFIG } from '@core/api-config';
import { SUPPRESS_ERROR_TOAST } from '@core/tokens';
import { HostShellApi } from './host-shell-api';

const BASE = 'https://api.test';
const LIST = `${BASE}/api/host/hostels`;

function hostel(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'nHelLt',
    name: 'Ever Care Hostel',
    country: 'Pakistan',
    ...extra,
  };
}

/**
 * The hostel's country code is what billing prices by, so the host list carries it through for
 * pages that need a currency without fetching the hostel's billing.
 */
describe('HostShellApi listings', () => {
  let api: HostShellApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
      ],
    });
    api = TestBed.inject(HostShellApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function load(
    hostels: Record<string, unknown>[],
  ): HostListingsData | undefined {
    let out: HostListingsData | undefined;
    api.listings().subscribe((d) => (out = d));
    http.expectOne(LIST).flush({ success: true, hostels });
    return out;
  }

  it('maps country_code onto countryCode, next to the country name', () => {
    const listing = load([hostel({ country_code: 'PK' })])?.listings[0];

    expect(listing?.countryCode).toBe('PK');
    expect(listing?.country).toBe('Pakistan');
  });

  // A hostel with no country set must read as unknown, never as an empty code a caller sends on.
  it('leaves countryCode unset when the payload has none', () => {
    const [missing, nulled, empty] =
      load([
        hostel({}),
        hostel({ id: 'b', country_code: null }),
        hostel({ id: 'c', country_code: '' }),
      ])?.listings ?? [];

    expect(missing?.countryCode).toBeUndefined();
    expect(nulled?.countryCode).toBeUndefined();
    expect(empty?.countryCode).toBeUndefined();
  });
});

/**
 * The hostel's time zone, read off the hostel record because the list is index-backed and does
 * not carry it. Every failure reads as "no zone": the caller falls back to the device's clock.
 */
describe('HostShellApi.hostelTimeZone', () => {
  const ONE = `${BASE}/api/host/hostels/h1`;
  let api: HostShellApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
      ],
    });
    api = TestBed.inject(HostShellApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Subscribes, lets `answer` respond to the one request, and returns what was emitted. */
  function ask(answer: (req: TestRequest) => void): {
    emitted: (string | null)[];
    completed: boolean;
  } {
    const result = { emitted: [] as (string | null)[], completed: false };
    api.hostelTimeZone('h1').subscribe({
      next: (v) => result.emitted.push(v),
      complete: () => (result.completed = true),
    });
    answer(http.expectOne(ONE));
    return result;
  }

  it('asks the hostel record once and returns its zone, trimmed', () => {
    const out = ask((req) => {
      expect(req.request.method).toBe('GET');
      req.flush({ success: true, hostel: { id: 'h1', timezone: '  Asia/Karachi ' } });
    });

    expect(out.emitted).toEqual(['Asia/Karachi']);
  });

  it.each([
    ['an empty zone', { hostel: { timezone: '' } }],
    ['a blank zone', { hostel: { timezone: '   ' } }],
    ['a null zone', { hostel: { timezone: null } }],
    ['no zone field', { hostel: { id: 'h1' } }],
    ['no hostel', { success: true }],
  ])('answers null for %s', (_label, body) => {
    const out = ask((req) => req.flush(body));

    expect(out.emitted).toEqual([null]);
  });

  it.each([404, 500])('answers null and completes when the request fails with %s', (status) => {
    const out = ask((req) => req.flush({ message: 'nope' }, { status, statusText: 'Error' }));

    expect(out.emitted).toEqual([null]);
    expect(out.completed).toBe(true);
  });

  // A missing zone costs a highlight, not a page, so it must not raise the global toast.
  it('asks the error toast to stay quiet', () => {
    ask((req) => {
      expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
      req.flush({ hostel: { timezone: 'Asia/Karachi' } });
    });
  });
});
