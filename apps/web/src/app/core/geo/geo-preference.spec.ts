import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { LocaleStore } from '@core/i18n/locale-store';
import {
  CURRENCY_STORAGE_KEY,
  CurrencyPreference,
} from '@core/preferences/currency-preference';
import { LOCALE_STORAGE_KEY } from '@core/i18n/locale-store';
import { GEO_COUNTRY_STORAGE_KEY, GEO_SOURCES, GeoPreference } from './geo-preference';

/**
 * Stands in for the router, which the service waits on before switching language.
 *
 * `navigated` starts true because almost every test is about what gets applied, not about
 * when — the one that cares flips it and drives `events` by hand.
 */
class RouterStub {
  navigated = true;
  readonly events = new Subject<unknown>();
}

/** Stands in for the real store, which drags in Transloco, the DOM and the Router. */
class LocaleStoreStub {
  readonly active = signal('en');
  stored: string | null = null;
  switchedTo: string | null = null;

  storedPreference(): string | null {
    return this.stored;
  }
  switchTo(code: string): void {
    this.switchedTo = code;
    this.active.set(code);
  }
}

let fetchCalls: number;
let locale: LocaleStoreStub;
let router: RouterStub;

/** Sources are read as text, so an object body is serialised the way the real host would. */
function stubFetch(body: unknown, ok = true): void {
  globalThis.fetch = (() => {
    fetchCalls++;
    return Promise.resolve({
      ok,
      text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    } as Response);
  }) as typeof fetch;
}

function failFetch(): void {
  globalThis.fetch = (() => {
    fetchCalls++;
    return Promise.reject(new Error('offline'));
  }) as typeof fetch;
}

/**
 * Answers per URL, so a test can block one host and leave another working — the shape of the
 * real failure this chain exists for, where a blocklist drops the geolocation hosts and lets
 * everything else through.
 */
function stubFetchByUrl(answers: Record<string, unknown>): void {
  globalThis.fetch = ((input: RequestInfo | URL) => {
    fetchCalls++;
    const url = String(input);
    const key = Object.keys(answers).find((k) => url.includes(k));
    if (key === undefined) return Promise.reject(new Error('blocked'));
    const body = answers[key];
    return Promise.resolve({
      ok: true,
      text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    } as Response);
  }) as typeof fetch;
}


/**
 * Serves each source the body shape it actually parses, so a test can just name a country.
 *
 * The sources do not share a format — one is Cloudflare's plain `key=value` trace, the other
 * is JSON — so a single stubbed body can only ever satisfy one of them.
 */
function stubCountry(code: string): void {
  stubFetchByUrl({
    'cloudflare.com': `loc=${code}
`,
    'api.country.is': { country: code },
  });
}

function setUp(): { geo: GeoPreference; currency: CurrencyPreference } {
  TestBed.resetTestingModule();
  locale = new LocaleStoreStub();
  router = new RouterStub();
  TestBed.configureTestingModule({
    providers: [
      { provide: LocaleStore, useValue: locale },
      { provide: Router, useValue: router },
      CurrencyPreference,
    ],
  });
  return {
    geo: TestBed.inject(GeoPreference),
    currency: TestBed.inject(CurrencyPreference),
  };
}

describe('GeoPreference', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    localStorage.clear();
    fetchCalls = 0;
    stubCountry('DE');
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('sets both from the detected country when neither is chosen', async () => {
    const { geo, currency } = setUp();
    await geo.apply();

    expect(locale.switchedTo).toBe('de');
    expect(currency.code()).toBe('EUR');
  });

  // The whole point of country-wins: whatever is stored is re-derived, not preserved.
  it('overrides a stored currency', async () => {
    localStorage.setItem(CURRENCY_STORAGE_KEY, 'JPY');
    const { geo, currency } = setUp();
    await geo.apply();

    expect(currency.code()).toBe('EUR');
    expect(locale.switchedTo).toBe('de');
  });

  it('overrides a stored language', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'ur');
    const { geo, currency } = setUp();
    locale.stored = 'ur';
    await geo.apply();

    expect(locale.switchedTo).toBe('de');
    expect(currency.code()).toBe('EUR');
  });

  it('still resolves the country even when both are already set', async () => {
    localStorage.setItem(CURRENCY_STORAGE_KEY, 'JPY');
    const { geo } = setUp();
    locale.stored = 'ur';
    await geo.apply();

    expect(fetchCalls).toBe(GEO_SOURCES.length); // one round, all sources at once
  });

  it('reuses the remembered country instead of asking again', async () => {
    localStorage.setItem(GEO_COUNTRY_STORAGE_KEY, 'FR');
    const { geo, currency } = setUp();
    await geo.apply();

    expect(fetchCalls).toBe(0);
    expect(locale.switchedTo).toBe('fr');
    expect(currency.code()).toBe('EUR');
  });

  it('remembers the country it looked up', async () => {
    const { geo } = setUp();
    await geo.apply();

    expect(localStorage.getItem(GEO_COUNTRY_STORAGE_KEY)).toBe('DE');
  });

  // A failed guess must be indistinguishable from never having guessed.
  it('changes nothing and throws nothing when the lookup fails', async () => {
    failFetch();
    const { geo, currency } = setUp();
    await geo.apply();

    expect(locale.switchedTo).toBeNull();
    expect(currency.code()).toBe('PKR'); // the app default, untouched
    expect(localStorage.getItem(GEO_COUNTRY_STORAGE_KEY)).toBeNull();
  });

  it('ignores a response that reports failure', async () => {
    stubFetch({ success: false, message: 'rate limited' });
    const { geo, currency } = setUp();
    await geo.apply();

    expect(locale.switchedTo).toBeNull();
    expect(currency.code()).toBe('PKR');
  });

  it('ignores a response shaped differently than expected', async () => {
    stubFetch({ country: 'Germany' }); // no country_code
    const { geo } = setUp();
    await geo.apply();

    expect(locale.switchedTo).toBeNull();
  });

  it('ignores a non-ok response', async () => {
    stubFetch({ success: true, country_code: 'DE' }, false);
    const { geo } = setUp();
    await geo.apply();

    expect(locale.switchedTo).toBeNull();
  });

  // The accepted cost of country-wins: a shared /ur/… link is re-navigated as it opens.
  it('moves a visitor who is already off the default language', async () => {
    const { geo, currency } = setUp();
    locale.active.set('ur');
    await geo.apply();

    expect(locale.switchedTo).toBe('de');
    expect(currency.code()).toBe('EUR');
  });

  // The mirror of the above, and the reason there is no "only switch away from English"
  // guard: without this, the first non-English country a browser ever saw would stick.
  it('moves a visitor back to English when the country reads English', async () => {
    stubCountry('AU');
    const { geo } = setUp();
    locale.active.set('de');
    await geo.apply();

    expect(locale.switchedTo).toBe('en');
  });

  it('does not navigate when already on the country’s language', async () => {
    stubCountry('AU');
    const { geo, currency } = setUp();
    await geo.apply();

    expect(locale.switchedTo).toBeNull();
    expect(currency.code()).toBe('AUD');
  });

  it('falls back to the dollar for a country whose currency is not offered', async () => {
    stubCountry('CU');
    const { geo, currency } = setUp();
    await geo.apply();

    expect(currency.code()).toBe('USD');
    expect(locale.switchedTo).toBe('es'); // Cuba still has a language the app ships
  });
});

/**
 * Source fallback.
 *
 * Dedicated IP-geolocation hosts sit on tracker blocklists, so ad blockers and privacy VPNs
 * drop them — and a VPN is exactly when this lookup matters most. Measured on a browser
 * behind one: api.country.is was blocked outright while Cloudflare
 * answered normally, which is why one blocked host must not disable the feature.
 */
describe('GeoPreference source fallback', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    localStorage.clear();
    fetchCalls = 0;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('falls through to a later source when the first is blocked', async () => {
    stubFetchByUrl({ 'api.country.is': { country: 'DE' } });
    const { geo, currency } = setUp();
    await geo.apply();

    expect(currency.code()).toBe('EUR');
    expect(locale.switchedTo).toBe('de');
  });

  it('reads Cloudflare’s plain-text trace when both JSON hosts are blocked', async () => {
    stubFetchByUrl({
      // Real shape of the endpoint: plain `key=value` lines, `loc` among them.
      'cloudflare.com': [
        'fl=123abc',
        'h=www.cloudflare.com',
        'ip=158.173.154.2',
        'loc=DE',
        'tls=TLSv1.3',
      ].join('\n'),
    });
    const { geo, currency } = setUp();
    await geo.apply();

    expect(currency.code()).toBe('EUR');
    expect(localStorage.getItem(GEO_COUNTRY_STORAGE_KEY)).toBe('DE');
  });

  // Concurrent, not sequential: asking in order made the lookup as slow as its slowest
  // unusable source, which behind a VPN meant 2.5s of nothing before the source that worked
  // was even tried.
  it('asks every source at once rather than one after another', async () => {
    stubCountry('DE');
    const { geo } = setUp();
    await geo.apply();

    expect(fetchCalls).toBe(GEO_SOURCES.length);
  });

  it('tries every source before giving up', async () => {
    failFetch();
    const { geo, currency } = setUp();
    await geo.apply();

    expect(fetchCalls).toBe(GEO_SOURCES.length);
    expect(currency.code()).toBe('PKR'); // untouched default
    expect(locale.switchedTo).toBeNull();
  });

  it('skips a source that answers with something unusable and takes the next', async () => {
    stubFetchByUrl({
      'api.country.is': { country: 'not-a-code' },
      'cloudflare.com': 'loc=DE\n',
    });
    const { geo, currency } = setUp();
    await geo.apply();

    expect(fetchCalls).toBe(GEO_SOURCES.length);
    expect(currency.code()).toBe('EUR');
  });
});

/**
 * refresh() — the path wired to every GET /api/users/current.
 *
 * It differs from apply() in exactly one way: it never reads the stored country. That is the
 * whole point — a visitor who moved is followed on the next authenticated call rather than
 * being pinned to whatever the first lookup ever returned.
 */
describe('GeoPreference refresh', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    localStorage.clear();
    fetchCalls = 0;
    stubCountry('NL');
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('asks again even when a country is already stored', async () => {
    localStorage.setItem(GEO_COUNTRY_STORAGE_KEY, 'DE');
    const { geo } = setUp();
    await geo.refresh();

    expect(fetchCalls).toBe(GEO_SOURCES.length); // the cache is skipped, not the sources
    expect(localStorage.getItem(GEO_COUNTRY_STORAGE_KEY)).toBe('NL');
  });

  // The reported case: country moved to NL while the stored language still said German.
  it('moves language and currency to the newly detected country', async () => {
    localStorage.setItem(GEO_COUNTRY_STORAGE_KEY, 'DE');
    localStorage.setItem(LOCALE_STORAGE_KEY, 'de');
    const { geo, currency } = setUp();
    locale.active.set('de');
    await geo.refresh();

    expect(locale.switchedTo).toBe('nl');
    expect(currency.code()).toBe('EUR');
  });

  it('leaves the stored country alone when every source fails', async () => {
    localStorage.setItem(GEO_COUNTRY_STORAGE_KEY, 'DE');
    failFetch();
    const { geo } = setUp();
    await geo.refresh();

    expect(localStorage.getItem(GEO_COUNTRY_STORAGE_KEY)).toBe('DE');
    expect(locale.switchedTo).toBeNull();
  });
});

/**
 * Language is applied only once the router has committed a URL.
 *
 * switchTo rebuilds the path from router.url, which is still "/" until the first navigation
 * lands — so switching any earlier turns a deep link into the bare locale root: /de/search
 * arrives and /nl is what the visitor gets.
 */
describe('GeoPreference navigation deferral', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    localStorage.clear();
    fetchCalls = 0;
    stubCountry('DE');
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('holds the language switch until the first navigation lands', async () => {
    // Country pre-stored so apply() reaches the applying half without awaiting a lookup —
    // otherwise the ticks below race the fetch chain rather than the navigation wait.
    localStorage.setItem(GEO_COUNTRY_STORAGE_KEY, 'DE');
    const { geo, currency } = setUp();
    router.navigated = false;

    const done = geo.apply();
    await Promise.resolve();
    await Promise.resolve();

    // Currency needs no URL, so it must not be held up by a navigation that may never come.
    expect(currency.code()).toBe('EUR');
    expect(locale.switchedTo).toBeNull();

    router.events.next(new NavigationEnd(1, '/de/search', '/de/search'));
    await done;

    expect(locale.switchedTo).toBe('de');
  });
});
