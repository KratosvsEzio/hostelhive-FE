import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HostListingsData } from '@hostelhive/data-access';
import { API_CONFIG } from '@core/api-config';
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
