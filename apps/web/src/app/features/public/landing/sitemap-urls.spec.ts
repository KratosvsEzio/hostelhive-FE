import { PLACES } from './places';
import { renderSitemap, sitemapPaths } from './sitemap-urls';
import {
  INDEXED_LOCALE_CODES,
  hasLocalePrefix,
  localeAlternates,
  splitLocale,
} from '@core/i18n/locales';
import { SINGLE_LANGUAGE_PAGES } from '@core/i18n/content-locale';
import { renderRobotsTxt } from '@core/robots';
import { robotsAllows } from '@core/robots-testing';
import { BLOG_CONTENT_LOCALE } from '@features/public/blog/blog-post.model';
import { BLOG_POSTS } from '@features/public/blog/blog-posts';

/** The article paths, from the archive, so a new post is covered with no second list. */
const ARTICLES = BLOG_POSTS.map((p) => `/blog/${p.slug}`);

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

  it('lists pricing in both English and Urdu, and the English-only credits in English alone', () => {
    for (const p of ['/en/pricing', '/ur/pricing', '/en/credits']) {
      expect(paths).toContain(p);
    }
    expect(paths).not.toContain('/ur/credits');
  });

  it('lists each single-language page exactly once, at its content language address', () => {
    for (const [base, code] of Object.entries(SINGLE_LANGUAGE_PAGES)) {
      const entries = paths.filter((p) => splitLocale(p).path === base);
      expect(entries, base).toEqual([`/${code}${base}`]);
    }
  });

  it('lists every article exactly once, at its English address', () => {
    expect(ARTICLES.length).toBeGreaterThan(0);
    for (const base of ARTICLES) {
      const entries = paths.filter((p) => splitLocale(p).path === base);
      expect(entries, base).toEqual([`/en${base}`]);
    }
  });

  it('lists the articles in a language the sitemap indexes', () => {
    expect(INDEXED_LOCALE_CODES).toContain(BLOG_CONTENT_LOCALE);
  });

  it('lists every other page once in each indexed language, the blog index included', () => {
    const counts = new Map<string, number>();
    for (const p of paths) {
      const base = splitLocale(p).path;
      counts.set(base, (counts.get(base) ?? 0) + 1);
    }
    for (const [base, count] of counts) {
      if (SINGLE_LANGUAGE_PAGES[base] || ARTICLES.includes(base)) continue;
      expect(count, base).toBe(INDEXED_LOCALE_CODES.length);
    }
    expect(counts.get('/blog')).toBe(INDEXED_LOCALE_CODES.length);
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

  // A sitemap that contradicts robots.txt is a sitemap the crawler resolves against you.
  // Checked against the generated file itself, so the two cannot disagree by drifting.
  it('excludes everything robots.txt blocks', () => {
    const robots = renderRobotsTxt('https://hostelhive.com');
    expect(paths.filter((p) => !robotsAllows(robots, p))).toEqual([]);
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

  it('gives a single-language page an entry with its location and no alternates', () => {
    const xml = renderSitemap('https://x.test', ['/en/privacy-policy', '/en/credits']);

    expect(xml).toContain(
      [
        '  <url>',
        '    <loc>https://x.test/en/privacy-policy</loc>',
        '  </url>',
        '  <url>',
        '    <loc>https://x.test/en/credits</loc>',
        '  </url>',
      ].join('\n'),
    );
    expect(xml).not.toContain('<xhtml:link');
  });

  it('repeats the full hreflang set, itself included, inside the entry of a translated page', () => {
    const xml = renderSitemap('https://x.test', ['/ur/about']);
    const links = localeAlternates('/about').map(
      (a) =>
        `    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="https://x.test${a.path}"/>`,
    );

    expect(links).toHaveLength(19);
    expect(xml).toContain(
      ['  <url>', '    <loc>https://x.test/ur/about</loc>', ...links, '  </url>'].join('\n'),
    );
    expect(xml).toContain('hreflang="ur" href="https://x.test/ur/about"');
    expect(xml).toContain('hreflang="x-default" href="https://x.test/en/about"');
  });

  describe('over the whole sitemap', () => {
    const origin = 'https://x.test';
    const blocks = renderSitemap(origin, sitemapPaths()).match(/ {2}<url>[\s\S]*?<\/url>/g) ?? [];
    const blockOf = (path: string) =>
      blocks.find((b) => b.includes(`<loc>${origin}${path}</loc>`));

    it('gives each article an entry with its English location and no alternates', () => {
      for (const base of ARTICLES) {
        expect(blockOf(`/en${base}`), base).toBe(
          ['  <url>', `    <loc>${origin}/en${base}</loc>`, '  </url>'].join('\n'),
        );
      }
    });

    // Built from the rule every other page followed before articles were listed once.
    it('leaves the entry of every other page exactly as it was', () => {
      const others = sitemapPaths().filter((p) => !ARTICLES.includes(splitLocale(p).path));
      expect(others).toContain('/ur/blog');
      for (const path of others) {
        const base = splitLocale(path).path;
        const links = SINGLE_LANGUAGE_PAGES[base]
          ? []
          : localeAlternates(base).map(
              (a) =>
                `    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${origin}${a.path}"/>`,
            );
        expect(blockOf(path), path).toBe(
          ['  <url>', `    <loc>${origin}${path}</loc>`, ...links, '  </url>'].join('\n'),
        );
      }
      expect((blockOf('/ur/blog')?.match(/<xhtml:link/g) ?? []).length).toBe(19);
    });
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
