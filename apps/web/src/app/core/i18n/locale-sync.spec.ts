import { PlatformLocation } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { LocaleStore } from './locale-store';
import { LocaleSync } from './locale-sync';

/** Only `pathname` is read, and only once, before the first navigation. */
function atUrl(pathname: string, redirectCount: number): LocaleSync {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), provideI18nTesting()],
  });
  // The real one, with a different address bar — a hand-written stand-in would also have
  // to satisfy PathLocationStrategy, which reads far more of it than this code does.
  vi.spyOn(TestBed.inject(PlatformLocation), 'pathname', 'get').mockReturnValue(pathname);
  // How the document was fetched, which is the only client-side evidence of the
  // server-side redirect that gives an unprefixed URL its language prefix. Defined
  // rather than spied on: jsdom's `performance` has no Navigation Timing at all, which
  // is also why the code under test checks for the method and not just the object.
  Object.defineProperty(performance, 'getEntriesByType', {
    configurable: true,
    writable: true,
    value: () => [{ redirectCount } as unknown as PerformanceEntry],
  });
  return TestBed.inject(LocaleSync);
}

function store(): LocaleStore {
  return TestBed.inject(LocaleStore);
}

/**
 * Whether the URL counts as having named a language is what decides if the country guess
 * is allowed to move the visitor. Getting it wrong in either direction is visible: too
 * strict and a shared link opens in the wrong language, too loose and a first-time visitor
 * is stranded in English.
 */
describe('LocaleSync — did the URL name a language?', () => {
  afterEach(() => {
    delete (performance as { getEntriesByType?: unknown }).getEntriesByType;
    vi.restoreAllMocks();
  });

  it('treats a URL as asked-for when Navigation Timing is unavailable', () => {
    const sync = atUrl('/en/hostels/lahore', 0);
    delete (performance as { getEntriesByType?: unknown }).getEntriesByType;
    sync.start();

    // Leaving the URL alone is the safe way to be wrong: it cannot override a language
    // somebody meant, and it runs from an app initializer where a throw is fatal.
    expect(store().urlNamedLanguage()).toBe(true);
  });

  it('a non-default prefix always counts, redirect or not', () => {
    atUrl('/de/hostels/lahore', 0).start();
    expect(store().urlNamedLanguage()).toBe(true);

    // Immune to the redirect count on purpose: a shared link is almost never in the
    // default language, and that case must not depend on how the document was fetched.
    atUrl('/ur/hostels/lahore', 1).start();
    expect(store().urlNamedLanguage()).toBe(true);
  });

  it('an asked-for default prefix counts', () => {
    atUrl('/en/hostels/lahore', 0).start();
    expect(store().urlNamedLanguage()).toBe(true);
  });

  it('a default prefix we redirected to does not count', () => {
    // What the visitor typed was `/hostels/lahore`; the server sent them here. They named
    // no language, so the country is still free to pick one.
    atUrl('/en/hostels/lahore', 1).start();
    expect(store().urlNamedLanguage()).toBe(false);
  });

  it('still applies the language the URL carries either way', () => {
    atUrl('/de/hostels/lahore', 0).start();
    expect(store().active()).toBe('de');

    atUrl('/en/hostels/lahore', 1).start();
    expect(store().active()).toBe('en');
  });
});
