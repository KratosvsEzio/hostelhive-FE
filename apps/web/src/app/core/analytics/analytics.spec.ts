import { isMarketplacePath } from './analytics.service';
import {
  analyticsConsent,
  clearAnalyticsConsent,
  restoreAnalyticsConsent,
  setAnalyticsConsent,
} from './analytics-consent';

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
      '/admin/contracts',
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
});

describe('analytics consent', () => {
  afterEach(() => clearAnalyticsConsent());

  it('starts unset, so the banner asks rather than assuming', () => {
    clearAnalyticsConsent();
    restoreAnalyticsConsent();
    expect(analyticsConsent()).toBe('unset');
  });

  it('persists a grant across a reload', () => {
    setAnalyticsConsent('granted');
    analyticsConsent.set('unset'); // simulate a fresh boot
    restoreAnalyticsConsent();
    expect(analyticsConsent()).toBe('granted');
  });

  // A decline has to persist too — otherwise the banner reappears every visit and the
  // "No thanks" is a dismissal rather than an answer.
  it('persists a decline across a reload', () => {
    setAnalyticsConsent('denied');
    analyticsConsent.set('unset');
    restoreAnalyticsConsent();
    expect(analyticsConsent()).toBe('denied');
  });

  it('treats a corrupted stored value as unanswered', () => {
    localStorage.setItem('hh.consent.analytics', 'maybe');
    restoreAnalyticsConsent();
    expect(analyticsConsent()).toBe('unset');
  });
});
