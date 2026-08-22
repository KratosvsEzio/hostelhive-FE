import { PLACES } from './places';
import { renderSitemap, sitemapPaths } from './sitemap-urls';
import { hasLocalePrefix } from '@core/i18n/locales';

describe('sitemapPaths', () => {
  const paths = sitemapPaths();

  it('includes the home page and the static public pages', () => {
    for (const p of [
      '/en',
      '/en/about',
      '/en/faqs',
      '/en/blog',
      '/en/contact',
      '/en/privacy-policy',
    ]) {
      expect(paths).toContain(p);
    }
  });

  // The bare form only redirects. A sitemap full of redirects spends crawl budget on 302s
  // and names the wrong address for every page in it.
  it('gives every entry a language, so none of them redirect', () => {
    for (const p of paths) {
      expect(hasLocalePrefix(p)).toBe(true);
    }
  });

  it('covers every curated place, and both gender segments of each', () => {
    for (const place of PLACES) {
      expect(paths).toContain(`/en/hostels/${place.slug}`);
      expect(paths).toContain(`/en/hostels/${place.slug}/girls`);
      expect(paths).toContain(`/en/hostels/${place.slug}/boys`);
    }
  });

  // Listing a URL that then tells crawlers not to index it is contradictory guidance:
  // search is either canonicalised onto its landing page or noindex when filtered.
  it('excludes search, which is canonicalised or noindexed', () => {
    expect(paths.filter((p) => p.startsWith('/en/search'))).toEqual([]);
  });

  // Everything here is Disallow-ed in robots.txt; a sitemap that contradicts robots.txt
  // is a sitemap the crawler resolves against you.
  it('excludes everything robots.txt blocks', () => {
    const blocked = ['/host/', '/admin', '/moderator', '/account', '/auth', '/notifications'];
    for (const prefix of blocked) {
      expect(paths.filter((p) => p.startsWith(prefix))).toEqual([]);
    }
    expect(paths).not.toContain('/host');
  });

  // robots.txt matches on prefix. A bare `Disallow: /host` would block every one of these,
  // which is why it is anchored — see the comment in robots.txt.
  it('lists the landing pages that a careless /host disallow would block', () => {
    expect(paths.some((p) => p.startsWith('/en/hostels/'))).toBe(true);
  });

  it('emits no duplicates', () => {
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('emits root-relative paths only, so the server owns the origin', () => {
    for (const p of paths) {
      expect(p.startsWith('/')).toBe(true);
      expect(p).not.toMatch(/^https?:/);
    }
  });
});

describe('renderSitemap', () => {
  it('produces a well-formed urlset with absolute locations', () => {
    const xml = renderSitemap('https://hostelhive.com', ['/', '/about']);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(xml).toContain('<loc>https://hostelhive.com/</loc>');
    expect(xml).toContain('<loc>https://hostelhive.com/about</loc>');
    expect(xml.trim().endsWith('</urlset>')).toBe(true);
  });

  it('emits one url element per path', () => {
    const xml = renderSitemap('https://x.test', sitemapPaths());
    expect((xml.match(/<url>/g) ?? []).length).toBe(sitemapPaths().length);
  });

  // A fabricated lastmod — the build time, say — claims every page changed on every
  // deploy, which search engines learn to discount. Better to send none.
  it('sends no lastmod, changefreq or priority', () => {
    const xml = renderSitemap('https://x.test', sitemapPaths());
    expect(xml).not.toContain('<lastmod>');
    expect(xml).not.toContain('<changefreq>');
    expect(xml).not.toContain('<priority>');
  });
});
