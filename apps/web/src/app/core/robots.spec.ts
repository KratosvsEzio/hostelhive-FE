import { CLIENT_ONLY } from '../app.routes.server';
import { LOCALE_CODES } from './i18n/locales';
import { DISALLOWED_PATHS, renderRobotsTxt } from './robots';
import { robotsAllows } from './robots-testing';

describe('renderRobotsTxt', () => {
  const origin = 'https://hostelhive.com';
  const robots = renderRobotsTxt(origin);
  const allows = (url: string) => robotsAllows(robots, url);

  it('blocks the language-prefixed URLs that are actually served', () => {
    for (const url of [
      '/en/account',
      '/de/auth',
      '/en/host/abc/overview',
    ]) {
      expect(allows(url), url).toBe(false);
    }
  });

  it('allows the public listing, landing and search pages', () => {
    for (const url of [
      '/en/hostel/some-hostel-slug',
      '/en/hostels/lahore',
      '/ur/hostels/lahore/girls',
      '/en/search',
      '/en/search?city=lahore',
      '/en',
    ]) {
      expect(allows(url), url).toBe(true);
    }
  });

  // robots.txt matches on prefix, so the console root is anchored: an unanchored rule
  // would also swallow /en/hostel/:id and /en/hostels/:place.
  it('blocks the console root without blocking the paths it is a prefix of', () => {
    expect(allows('/en/host')).toBe(false);
    expect(allows('/en/host/')).toBe(false);
    expect(allows('/en/host?tab=x')).toBe(false);
    expect(allows('/en/hostel')).toBe(true);
    expect(allows('/en/hostels')).toBe(true);
  });

  it('blocks every blocked path in every language, and in its bare form', () => {
    for (const prefix of ['', ...LOCALE_CODES.map((c) => `/${c}`)]) {
      for (const path of DISALLOWED_PATHS) {
        const url = `${prefix}/${path}${path === 'host' ? '/x' : ''}`;
        expect(allows(url), url).toBe(false);
      }
    }
  });

  it('blocks the links whose query token is the credential', () => {
    for (const url of [
      '/ur/confirm_invitation?token=x',
      '/fr/reset_password?token=x',
      '/confirm_invitation?token=x',
    ]) {
      expect(allows(url), url).toBe(false);
    }
  });

  // The reason every language is named instead of one leading wildcard: robots.txt's `*`
  // crosses slashes, so a wildcard rule would also catch these.
  it('allows public paths whose later segments start with a blocked word', () => {
    for (const url of [
      '/en/blog/authentic-hostel-life',
      '/en/hostel/admin-block-hostel',
      '/en/hostels/lahore/account',
      '/de/blog/host-families',
    ]) {
      expect(allows(url), url).toBe(true);
    }
  });

  it('disallows every area the server renders client-only', () => {
    for (const path of CLIENT_ONLY) {
      expect(DISALLOWED_PATHS as readonly string[]).toContain(path);
    }
  });

  it('opens with the catch-all group and points at the sitemap', () => {
    const lines = robots.split('\n');
    expect(lines).toContain('User-agent: *');
    expect(lines).toContain('Allow: /');
    expect(lines).toContain(`Sitemap: ${origin}/sitemap.xml`);
  });
});
