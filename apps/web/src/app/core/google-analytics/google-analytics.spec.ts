import { isMarketplacePath } from './google-analytics.service';
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
