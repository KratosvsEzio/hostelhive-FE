import { DefaultUrlSerializer, Navigation, NavigationExtras, UrlTree } from '@angular/router';
import { isMarketplacePath, isSamePageRefinement } from './google-analytics.service';
import {
  googleAnalyticsConsent,
  clearGoogleAnalyticsConsent,
  restoreGoogleAnalyticsConsent,
  setGoogleAnalyticsConsent,
} from './google-analytics-consent';

describe('isMarketplacePath', () => {
  it('counts the public seeker pages', () => {
    for (const url of [
      '/',
      '/search',
      '/search?place=Karachi',
      '/hostel/ever-care-hostel',
      '/faqs',
      '/blog',
      '/about',
      '/contact',
      '/privacy-policy',
    ]) {
      expect(isMarketplacePath(url)).toBe(true);
    }
  });

  it('excludes the consoles and the authenticated areas', () => {
    for (const url of [
      '/host',
      '/host/nHelLt/team',
      '/admin/payments',
      '/moderator/hostels',
      '/auth',
      '/account/settings',
      '/notifications',
      '/reset_password',
      '/forbidden',
    ]) {
      expect(isMarketplacePath(url)).toBe(false);
    }
  });

  // `/host` and `/hostel/:slug` share a prefix; a plain startsWith('/host') would silently
  // drop every listing page — the single most important page on the marketplace.
  it('does not mistake a listing page for the host console', () => {
    expect(isMarketplacePath('/hostel/abc')).toBe(true);
    expect(isMarketplacePath('/hostels')).toBe(true);
    expect(isMarketplacePath('/host')).toBe(false);
    expect(isMarketplacePath('/host/')).toBe(false);
  });

  it('ignores the query string when deciding', () => {
    expect(isMarketplacePath('/host/x?from=/search')).toBe(false);
    expect(isMarketplacePath('/search?returnUrl=/host')).toBe(true);
  });

  // Every real URL carries a language prefix, while the list compares route-table paths;
  // judged with the prefix on, every console and tokened link counted as marketplace.
  it('judges a language-prefixed URL by its path', () => {
    for (const url of [
      '/en/host',
      '/en/host/1/rooms',
      '/ur/admin',
      '/de/moderator/hostels',
      '/en/account/settings',
      '/en/reset_password?token=x',
      '/en/confirm_invitation?t=1',
    ]) {
      expect(isMarketplacePath(url)).toBe(false);
    }
    for (const url of [
      '/en',
      '/ur',
      '/en/hostel/abc',
      '/ur/search',
      '/en/search?place=Karachi',
      '/fr/blog',
    ]) {
      expect(isMarketplacePath(url)).toBe(true);
    }
  });

  it('keeps the exact /host rule behind a prefix', () => {
    expect(isMarketplacePath('/en/host/')).toBe(false);
    expect(isMarketplacePath('/en/hostel/abc')).toBe(true);
    expect(isMarketplacePath('/en/hostels')).toBe(true);
  });
});

describe('isSamePageRefinement', () => {
  const serializer = new DefaultUrlSerializer();
  const serialize = (tree: UrlTree) => serializer.serialize(tree);

  type Trigger = Navigation['trigger'];

  interface Row {
    name: string;
    trigger: Trigger;
    replaceUrl: boolean;
    previous: string | null;
    url: string;
    expected: boolean;
  }

  // Only the fields the predicate reads are populated; the rest of a Navigation is the router's.
  function navigation(row: Row): Pick<Navigation, 'trigger' | 'extras' | 'previousNavigation'> {
    const extras: NavigationExtras = row.replaceUrl ? { replaceUrl: true } : {};
    const previousNavigation =
      row.previous === null
        ? null
        : ({ finalUrl: serializer.parse(row.previous) } as unknown as Navigation);
    return { trigger: row.trigger, extras, previousNavigation };
  }

  const rows: Row[] = [
    {
      name: 'counts the first load, which has no previous navigation',
      trigger: 'imperative',
      replaceUrl: true,
      previous: null,
      url: '/en/search',
      expected: false,
    },
    {
      name: 'skips a replace that adds the viewport to the search page',
      trigger: 'imperative',
      replaceUrl: true,
      previous: '/en/search',
      url: '/en/search?lat=24.8&lng=67.0',
      expected: true,
    },
    {
      name: 'skips a replace that pans the viewport',
      trigger: 'imperative',
      replaceUrl: true,
      previous: '/en/search?lat=1&lng=1',
      url: '/en/search?lat=2&lng=2',
      expected: true,
    },
    {
      name: 'skips a replace that clears a listing query',
      trigger: 'imperative',
      replaceUrl: true,
      previous: '/en/hostel/abc?review=5',
      url: '/en/hostel/abc',
      expected: true,
    },
    {
      name: 'counts a replace to a different path',
      trigger: 'imperative',
      replaceUrl: true,
      previous: '/en/hostel/abc',
      url: '/en/search',
      expected: false,
    },
    {
      name: 'counts a replace that only changes the language',
      trigger: 'imperative',
      replaceUrl: true,
      previous: '/en/search',
      url: '/ur/search',
      expected: false,
    },
    {
      name: 'counts a pushed query change on the same path',
      trigger: 'imperative',
      replaceUrl: false,
      previous: '/en/search',
      url: '/en/search?gender=girls',
      expected: false,
    },
    {
      name: 'counts Back between two entries of the same path',
      trigger: 'popstate',
      replaceUrl: true,
      previous: '/en/search?place=B',
      url: '/en/search?place=A',
      expected: false,
    },
    {
      name: 'counts Back across paths',
      trigger: 'popstate',
      replaceUrl: true,
      previous: '/en/search',
      url: '/en/hostel/abc',
      expected: false,
    },
    {
      name: 'counts a hashchange replace with a different query on the same path',
      trigger: 'hashchange',
      replaceUrl: true,
      previous: '/en/search?a=1',
      url: '/en/search?a=2',
      expected: false,
    },
    {
      name: 'skips a pushed move to a fragment of the same page',
      trigger: 'imperative',
      replaceUrl: false,
      previous: '/en/blog/x',
      url: '/en/blog/x#costs',
      expected: true,
    },
    {
      name: 'skips Back from a fragment to the bare page',
      trigger: 'popstate',
      replaceUrl: true,
      previous: '/en/blog/x#costs',
      url: '/en/blog/x',
      expected: true,
    },
    {
      name: 'skips a pushed move from one fragment to another',
      trigger: 'imperative',
      replaceUrl: false,
      previous: '/en/blog/x#a',
      url: '/en/blog/x#b',
      expected: true,
    },
    {
      name: 'counts a changed query even when the fragment is kept',
      trigger: 'imperative',
      replaceUrl: false,
      previous: '/en/search?q=1#a',
      url: '/en/search?q=2#a',
      expected: false,
    },
    {
      name: 'counts a navigation to the identical URL',
      trigger: 'imperative',
      replaceUrl: false,
      previous: '/en/search?q=1',
      url: '/en/search?q=1',
      expected: false,
    },
    {
      name: 'counts a guard redirect that has no previous navigation',
      trigger: 'imperative',
      replaceUrl: true,
      previous: null,
      url: '/en/search',
      expected: false,
    },
    {
      name: 'counts a guard redirect that lands on a different path',
      trigger: 'imperative',
      replaceUrl: true,
      previous: '/en/hostel/abc',
      url: '/en/search',
      expected: false,
    },
    {
      name: 'skips a guard redirect that lands on the same path',
      trigger: 'imperative',
      replaceUrl: true,
      previous: '/en/search?a=1',
      url: '/en/search?a=2',
      expected: true,
    },
  ];

  it.each(rows)('$name', (row) => {
    expect(isSamePageRefinement(navigation(row), row.url, serialize)).toBe(row.expected);
  });
});

describe('analytics consent', () => {
  afterEach(() => clearGoogleAnalyticsConsent());

  it('starts unset, so the banner asks rather than assuming', () => {
    clearGoogleAnalyticsConsent();
    restoreGoogleAnalyticsConsent();
    expect(googleAnalyticsConsent()).toBe('unset');
  });

  it('persists a grant across a reload', () => {
    setGoogleAnalyticsConsent('granted');
    googleAnalyticsConsent.set('unset'); // simulate a fresh boot
    restoreGoogleAnalyticsConsent();
    expect(googleAnalyticsConsent()).toBe('granted');
  });

  // A decline has to persist too — otherwise the banner reappears every visit and the
  // "No thanks" is a dismissal rather than an answer.
  it('persists a decline across a reload', () => {
    setGoogleAnalyticsConsent('denied');
    googleAnalyticsConsent.set('unset');
    restoreGoogleAnalyticsConsent();
    expect(googleAnalyticsConsent()).toBe('denied');
  });

  it('treats a corrupted stored value as unanswered', () => {
    localStorage.setItem('hh.consent.analytics', 'maybe');
    restoreGoogleAnalyticsConsent();
    expect(googleAnalyticsConsent()).toBe('unset');
  });
});
