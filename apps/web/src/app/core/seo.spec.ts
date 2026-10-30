import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DestroyRef,
  EnvironmentInjector,
  PLATFORM_ID,
  createEnvironmentInjector,
  effect,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LocaleStore } from './i18n/locale-store';
import { localeAlternates, withLocale } from './i18n/locales';
import { provideI18nTesting } from './i18n/provide-i18n-testing';
import { SITE_ORIGIN, Seo } from './seo';

const CANONICAL = 'link[rel="canonical"]';
const OG_URL = 'meta[property="og:url"]';
const HREFLANG = 'link[rel="alternate"][data-seo="hreflang"]';
const ROBOTS = 'meta[name="robots"]';
const PRELOAD = 'link[data-seo="preload-image"]';
const OG_LOCALE = 'meta[property="og:locale"]';
const OG_LOCALE_ALTERNATE = 'meta[property="og:locale:alternate"]';

/** `apps/web/src/index.html`: two levels up from here, core then app. */
const INDEX_HTML = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'index.html');

const active = signal('en');
const ready = signal(true);

/** What a previous page leaves behind in a client navigation: its canonical and its `og:url`. */
function seedStaticHead(): void {
  document.head.insertAdjacentHTML(
    'beforeend',
    `<link rel="canonical" href="${SITE_ORIGIN}/" />` +
      `<meta property="og:url" content="${SITE_ORIGIN}/" />`,
  );
}

function all(selector: string): Element[] {
  return Array.from(document.head.querySelectorAll(selector));
}

function attr(selector: string, name: string): string | null {
  return document.head.querySelector(selector)?.getAttribute(name) ?? null;
}

function jsonLd(id: string): Element[] {
  return all(`script[data-seo="${id}"]`);
}

/** A destroyable scope whose `DestroyRef` stands in for a page component's. */
function scope(): { ref: DestroyRef; destroy: () => void } {
  const injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
  return { ref: injector.get(DestroyRef), destroy: () => injector.destroy() };
}

describe('Seo', () => {
  let seo: Seo;

  beforeEach(() => {
    active.set('en');
    ready.set(true);
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        { provide: LocaleStore, useValue: { ready, active } },
      ],
    });
    seo = TestBed.inject(Seo);
    seedStaticHead();
  });

  afterEach(() => {
    document.head
      .querySelectorAll(
        'link[rel="canonical"], link[data-seo], script[data-seo], meta[property^="og:"], meta[name="robots"]',
      )
      .forEach((el) => el.remove());
  });

  describe('canonical and og:url', () => {
    it('removes the static canonical and og:url from a noindex page that has no path', () => {
      seo.apply({ title: 'Search', noindex: true });

      expect(all(CANONICAL)).toHaveLength(0);
      expect(all(OG_URL)).toHaveLength(0);
      expect(all(HREFLANG)).toHaveLength(0);
      expect(attr(ROBOTS, 'content')).toBe('noindex, nofollow');
    });

    it('gives a noindex page with a path no canonical and no hreflang, but an og:url from the path', () => {
      seo.apply({ title: 'Post', noindex: true, path: '/blog/x' });

      expect(all(CANONICAL)).toHaveLength(0);
      expect(all(HREFLANG)).toHaveLength(0);
      expect(all(OG_URL)).toHaveLength(1);
      expect(attr(OG_URL, 'content')).toBe(`${SITE_ORIGIN}/en/blog/x`);
    });

    it('keeps one canonical, a matching og:url and the full hreflang set on an indexable page', () => {
      seo.apply({ title: 'Blog', path: '/blog' });

      expect(all(CANONICAL)).toHaveLength(1);
      expect(attr(CANONICAL, 'href')).toBe(`${SITE_ORIGIN}/en/blog`);
      expect(attr(OG_URL, 'content')).toBe(`${SITE_ORIGIN}/en/blog`);
      expect(attr(ROBOTS, 'content')).toBe('index, follow, max-image-preview:large');

      const expected = localeAlternates('/blog').map(({ hreflang, path }) => [
        hreflang,
        `${SITE_ORIGIN}${path}`,
      ]);
      const actual = all(HREFLANG).map((el) => [
        el.getAttribute('hreflang'),
        el.getAttribute('href'),
      ]);
      expect(actual).toEqual(expected);
      expect(actual.some(([lang]) => lang === 'x-default')).toBe(true);
    });

    it.each([
      ['no path', {}],
      ['an empty path', { path: '' }],
    ])('gives an indexable page with %s no canonical, no og:url and no hreflang', (_name, extra) => {
      seo.apply({ title: 'Page', ...extra });

      expect(all(CANONICAL)).toHaveLength(0);
      expect(all(OG_URL)).toHaveLength(0);
      expect(all(HREFLANG)).toHaveLength(0);
    });

    it('canonicalises to the active language and points x-default at English', () => {
      active.set('ur');

      seo.apply({ title: 'Blog', path: '/blog' });

      expect(attr(CANONICAL, 'href')).toBe(`${SITE_ORIGIN}/ur/blog`);
      expect(attr(OG_URL, 'content')).toBe(`${SITE_ORIGIN}/ur/blog`);
      const xDefault = document.head.querySelector(`${HREFLANG}[hreflang="x-default"]`);
      expect(xDefault?.getAttribute('href')).toBe(`${SITE_ORIGIN}${withLocale('en', '/blog')}`);
    });

    it('recreates exactly one canonical and og:url when a noindex page is followed by an indexable one', () => {
      seo.apply({ title: 'Search', noindex: true });
      expect(all(CANONICAL)).toHaveLength(0);

      seo.apply({ title: 'Blog', path: '/blog' });

      expect(all(CANONICAL)).toHaveLength(1);
      expect(attr(CANONICAL, 'href')).toBe(`${SITE_ORIGIN}/en/blog`);
      expect(all(OG_URL)).toHaveLength(1);
      expect(attr(OG_URL, 'content')).toBe(`${SITE_ORIGIN}/en/blog`);
    });

    it('rewrites in place from index to index, then removes everything for a noindex page', () => {
      seo.apply({ title: 'A', path: '/blog' });
      seo.apply({ title: 'B', path: '/pricing' });

      expect(all(CANONICAL)).toHaveLength(1);
      expect(attr(CANONICAL, 'href')).toBe(`${SITE_ORIGIN}/en/pricing`);
      expect(all(OG_URL)).toHaveLength(1);
      expect(all(HREFLANG)).toHaveLength(localeAlternates('/pricing').length);

      seo.apply({ title: 'C', noindex: true });

      expect(all(CANONICAL)).toHaveLength(0);
      expect(all(OG_URL)).toHaveLength(0);
      expect(all(HREFLANG)).toHaveLength(0);
    });
  });

  describe('og:locale', () => {
    it('writes exactly one og:locale, en_PK for English', () => {
      seo.apply({ title: 'Blog', path: '/blog' });

      expect(all(OG_LOCALE)).toHaveLength(1);
      expect(attr(OG_LOCALE, 'content')).toBe('en_PK');
    });

    it('follows the active language and rewrites the same tag in place', () => {
      active.set('ur');
      seo.apply({ title: 'Blog', path: '/blog' });
      expect(all(OG_LOCALE)).toHaveLength(1);
      expect(attr(OG_LOCALE, 'content')).toBe('ur_PK');

      active.set('ar');
      seo.apply({ title: 'Blog', path: '/blog' });
      expect(all(OG_LOCALE)).toHaveLength(1);
      expect(attr(OG_LOCALE, 'content')).toBe('ar_AR');
    });

    it('writes og:locale on a noindex page with no path, and never an alternate', () => {
      active.set('ur');

      seo.apply({ title: 'Search', noindex: true });

      expect(all(OG_LOCALE)).toHaveLength(1);
      expect(attr(OG_LOCALE, 'content')).toBe('ur_PK');
      expect(all(OG_LOCALE_ALTERNATE)).toHaveLength(0);
    });
  });

  describe('a page whose content exists in one language', () => {
    const LEGAL = { title: 'Urdu tab title', description: 'Urdu description', path: '/privacy-policy' };

    it('canonicalises every prefix to the content language, with no hreflang, and stays indexable', () => {
      active.set('ur');

      seo.apply({ ...LEGAL, contentLocale: 'en' });

      expect(all(CANONICAL)).toHaveLength(1);
      expect(attr(CANONICAL, 'href')).toBe(`${SITE_ORIGIN}/en/privacy-policy`);
      expect(all(OG_URL)).toHaveLength(1);
      expect(attr(OG_URL, 'content')).toBe(`${SITE_ORIGIN}/en/privacy-policy`);
      expect(all(HREFLANG)).toHaveLength(0);
      expect(attr(ROBOTS, 'content')).toBe('index, follow, max-image-preview:large');
    });

    it('takes og:locale from the content language, matching og:url', () => {
      active.set('ur');

      seo.apply({ ...LEGAL, contentLocale: 'en' });

      expect(all(OG_LOCALE)).toHaveLength(1);
      expect(attr(OG_LOCALE, 'content')).toBe('en_PK');
      expect(all(OG_LOCALE_ALTERNATE)).toHaveLength(0);
    });

    it('keeps the title and description it was given, in the reader language', () => {
      active.set('ur');

      seo.apply({ ...LEGAL, contentLocale: 'en' });

      expect(document.title).toBe('Urdu tab title');
      expect(attr('meta[property="og:title"]', 'content')).toBe('Urdu tab title');
      expect(attr('meta[name="twitter:title"]', 'content')).toBe('Urdu tab title');
      expect(attr('meta[name="description"]', 'content')).toBe('Urdu description');
    });

    it('declares no hreflang at the address of the content language either', () => {
      seo.apply({ ...LEGAL, contentLocale: 'en' });

      expect(attr(CANONICAL, 'href')).toBe(`${SITE_ORIGIN}/en/privacy-policy`);
      expect(all(HREFLANG)).toHaveLength(0);
    });

    it('lets noindex win: no canonical and no hreflang, with og:url in the content language', () => {
      active.set('ur');

      seo.apply({ ...LEGAL, noindex: true, contentLocale: 'en' });

      expect(all(CANONICAL)).toHaveLength(0);
      expect(all(HREFLANG)).toHaveLength(0);
      expect(attr(ROBOTS, 'content')).toBe('noindex, nofollow');
      expect(attr(OG_URL, 'content')).toBe(`${SITE_ORIGIN}/en/privacy-policy`);
    });

    it.each(['xx', ''])(
      'ignores the unknown content language %j and treats the page as translated',
      (code) => {
        active.set('ur');

        expect(() => seo.apply({ ...LEGAL, contentLocale: code })).not.toThrow();

        expect(attr(CANONICAL, 'href')).toBe(`${SITE_ORIGIN}/ur/privacy-policy`);
        expect(all(HREFLANG)).toHaveLength(localeAlternates('/privacy-policy').length);
        expect(attr(OG_LOCALE, 'content')).toBe('ur_PK');
      },
    );

    it('writes no address without a path, but still og:locale from the content language', () => {
      active.set('ur');

      expect(() => seo.apply({ title: 'T', contentLocale: 'en' })).not.toThrow();

      expect(all(CANONICAL)).toHaveLength(0);
      expect(all(OG_URL)).toHaveLength(0);
      expect(all(HREFLANG)).toHaveLength(0);
      expect(attr(OG_LOCALE, 'content')).toBe('en_PK');
    });

    it('removes the hreflang set a previous page left and rewrites its canonical in place', () => {
      active.set('ur');
      seo.apply({ title: 'About', path: '/about' });
      expect(all(HREFLANG)).toHaveLength(localeAlternates('/about').length);

      seo.apply({ ...LEGAL, contentLocale: 'en' });

      expect(all(HREFLANG)).toHaveLength(0);
      expect(all(CANONICAL)).toHaveLength(1);
      expect(attr(CANONICAL, 'href')).toBe(`${SITE_ORIGIN}/en/privacy-policy`);
    });

    it('gives the next translated page its own address and full hreflang set back', () => {
      active.set('ur');
      seo.apply({ ...LEGAL, contentLocale: 'en' });

      seo.apply({ title: 'About', path: '/about' });

      expect(attr(CANONICAL, 'href')).toBe(`${SITE_ORIGIN}/ur/about`);
      expect(all(HREFLANG)).toHaveLength(localeAlternates('/about').length);
      expect(attr(OG_LOCALE, 'content')).toBe('ur_PK');
    });

    it('settles on a non-provisional apply, so analytics records the page once', () => {
      seo.apply({ ...LEGAL, contentLocale: 'en' });

      expect(seo.settled()).toBe(true);
    });
  });

  describe('pageUrl', () => {
    beforeEach(() => active.set('ur'));

    it('addresses a translated page in the active language', () => {
      expect(seo.pageUrl('/about')).toBe(`${SITE_ORIGIN}/ur/about`);
    });

    it('addresses a single-language page in its content language, whatever the active one', () => {
      expect(seo.pageUrl('/blog/x', 'en')).toBe(`${SITE_ORIGIN}/en/blog/x`);
    });

    it.each(['xx', '', undefined])(
      'ignores the unknown content language %j and addresses the page in the active one',
      (code) => {
        expect(() => seo.pageUrl('/about', code)).not.toThrow();
        expect(seo.pageUrl('/about', code)).toBe(`${SITE_ORIGIN}/ur/about`);
      },
    );

    it('addresses the home page without a trailing slash, as its canonical does', () => {
      seo.apply({ title: 'Home', path: '/' });

      expect(seo.pageUrl('/')).toBe(`${SITE_ORIGIN}/ur`);
      expect(attr(CANONICAL, 'href')).toBe(seo.pageUrl('/'));
    });

    it.each([
      ['no content language', undefined],
      ['a content language', 'en'],
      ['an unknown content language', 'xx'],
    ])('names the same address as the canonical and og:url apply writes, with %s', (_name, code) => {
      seo.apply({ title: 'Page', path: '/privacy-policy', contentLocale: code });

      const url = seo.pageUrl('/privacy-policy', code);
      expect(all(CANONICAL)).toHaveLength(1);
      expect(attr(CANONICAL, 'href')).toBe(url);
      expect(attr(OG_URL, 'content')).toBe(url);
    });

    it('follows a language switch inside an effect, unless a content language fixes it', () => {
      const translated: string[] = [];
      const english: string[] = [];
      TestBed.runInInjectionContext(() => {
        effect(() => translated.push(seo.pageUrl('/about')));
        effect(() => english.push(seo.pageUrl('/blog/x', 'en')));
      });
      TestBed.tick();

      active.set('ar');
      TestBed.tick();

      expect(translated.at(-1)).toBe(`${SITE_ORIGIN}/ar/about`);
      expect(english).toEqual([`${SITE_ORIGIN}/en/blog/x`]);
    });
  });

  describe('settled', () => {
    it('is true before any apply, once strings are ready', () => {
      expect(seo.settled()).toBe(true);
    });

    it('stays true after an apply that is not provisional', () => {
      seo.apply({ title: 'Final', path: '/blog' });

      expect(seo.settled()).toBe(true);
    });

    it('writes the whole head for a provisional apply but is not settled until the next apply', () => {
      seo.apply({
        title: 'Loading',
        description: 'Wait for it',
        noindex: true,
        provisional: true,
      });

      expect(seo.settled()).toBe(false);
      expect(document.title).toBe('Loading');
      expect(attr('meta[name="description"]', 'content')).toBe('Wait for it');
      expect(attr(ROBOTS, 'content')).toBe('noindex, nofollow');
      expect(attr('meta[property="og:title"]', 'content')).toBe('Loading');
      expect(attr('meta[name="twitter:title"]', 'content')).toBe('Loading');
      expect(attr(OG_LOCALE, 'content')).toBe('en_PK');

      seo.apply({ title: 'Loaded', path: '/hostel/x' });

      expect(seo.settled()).toBe(true);
      expect(document.title).toBe('Loaded');
    });

    it('is not settled while strings are loading, and settles when they are ready without a new apply', () => {
      ready.set(false);
      seo.apply({ title: 'Final' });

      expect(seo.settled()).toBe(false);

      ready.set(true);

      expect(seo.settled()).toBe(true);
    });

    it('stays unsettled after strings are ready while the head is still provisional', () => {
      ready.set(false);
      seo.apply({ title: 'Loading', provisional: true });
      ready.set(true);

      expect(seo.settled()).toBe(false);
    });
  });

  describe('clearAllJsonLd', () => {
    it('removes every JSON-LD block whatever its id and leaves hreflang and the preload alone', () => {
      seo.apply({ title: 'Blog', path: '/blog' });
      seo.setJsonLd('a', { n: 1 });
      seo.setJsonLd('listing', { n: 2 });
      seo.preloadImage('https://example.test/hero.webp');

      seo.clearAllJsonLd();

      expect(all('script[type="application/ld+json"]')).toHaveLength(0);
      expect(all(HREFLANG)).toHaveLength(localeAlternates('/blog').length);
      expect(all(PRELOAD)).toHaveLength(1);
    });
  });

  describe('index.html', () => {
    const html = readFileSync(INDEX_HTML, 'utf8');

    it('ships no canonical, og:url or og:locale, which would be wrong on every page but one', () => {
      expect(html).not.toMatch(/<link[^>]+rel="canonical"/);
      expect(html).not.toContain('property="og:url"');
      expect(html).not.toContain('property="og:locale"');
    });

    it('still ships the description, robots index and og:image fallbacks', () => {
      expect(html).toContain('name="description"');
      expect(html).toContain('content="index, follow, max-image-preview:large"');
      expect(html).toContain('property="og:image"');
    });

    it('preconnects to the API with credentials and to the image bucket anonymously', () => {
      // authInterceptor sends every API call withCredentials; images load anonymously. A
      // preconnect in the wrong mode warms a socket the request never reuses.
      expect(html).toMatch(
        /<link\s+rel="preconnect"\s+href="https:\/\/api\.hostelhive\.com"\s+crossorigin="use-credentials"/,
      );
      expect(html).toMatch(
        /<link\s+rel="preconnect"\s+href="https:\/\/hostel-hive-images\.s3\.ap-south-1\.amazonaws\.com"\s+crossorigin\s*\/>/,
      );
    });
  });

  describe('other head tags', () => {
    it('still writes the title, description, social tags and default image', () => {
      seo.apply({ title: 'Hello', description: ' About it ', socialTitle: 'Social hello' });

      expect(document.title).toBe('Hello');
      expect(attr('meta[name="description"]', 'content')).toBe('About it');
      expect(attr('meta[property="og:title"]', 'content')).toBe('Social hello');
      expect(attr('meta[property="og:description"]', 'content')).toBe('About it');
      expect(attr('meta[property="og:type"]', 'content')).toBe('website');
      expect(attr('meta[property="og:image"]', 'content')).toBe(
        `${SITE_ORIGIN}/hostelhive-logo.png`,
      );
      expect(attr('meta[name="twitter:image"]', 'content')).toBe(
        `${SITE_ORIGIN}/hostelhive-logo.png`,
      );
      expect(attr('meta[name="twitter:title"]', 'content')).toBe('Social hello');
    });
  });

  describe('clearOnDestroy', () => {
    it('removes the named blocks on destroy and leaves other ids alone', () => {
      const { ref, destroy } = scope();
      seo.setJsonLd('a', { n: 1 });
      seo.setJsonLd('b', { n: 2 });
      seo.setJsonLd('c', { n: 3 });
      seo.clearOnDestroy(ref, ['a', 'b']);

      expect(jsonLd('a')).toHaveLength(1);
      expect(jsonLd('b')).toHaveLength(1);

      destroy();

      expect(jsonLd('a')).toHaveLength(0);
      expect(jsonLd('b')).toHaveLength(0);
      expect(jsonLd('c')).toHaveLength(1);
    });

    it('removes the preload image on destroy only when asked to', () => {
      const keep = scope();
      seo.preloadImage('https://example.test/hero.webp');
      seo.clearOnDestroy(keep.ref, ['a']);
      keep.destroy();
      expect(all(PRELOAD)).toHaveLength(1);

      const drop = scope();
      seo.clearOnDestroy(drop.ref, ['a'], { preloadImage: true });
      drop.destroy();
      expect(all(PRELOAD)).toHaveLength(0);
    });

    it('keeps registrations on separate destroy refs independent', () => {
      const one = scope();
      const two = scope();
      seo.setJsonLd('one', {});
      seo.setJsonLd('two', {});
      seo.clearOnDestroy(one.ref, ['one']);
      seo.clearOnDestroy(two.ref, ['two']);

      one.destroy();

      expect(jsonLd('one')).toHaveLength(0);
      expect(jsonLd('two')).toHaveLength(1);

      two.destroy();

      expect(jsonLd('two')).toHaveLength(0);
    });
  });

  describe('clearUnclaimed', () => {
    it('removes blocks and the preload that no live page claimed, and keeps claimed ones', () => {
      const page = scope();
      seo.clearOnDestroy(page.ref, ['organization', 'website']);
      seo.setJsonLd('organization', {});
      seo.setJsonLd('website', {});
      seo.setJsonLd('article', {});
      seo.preloadImage('https://example.test/hero.webp');

      seo.clearUnclaimed();

      expect(jsonLd('organization')).toHaveLength(1);
      expect(jsonLd('website')).toHaveLength(1);
      expect(jsonLd('article')).toHaveLength(0);
      expect(all(PRELOAD)).toHaveLength(0);
      page.destroy();
    });

    it('keeps the preload while a live page claims it', () => {
      const page = scope();
      seo.clearOnDestroy(page.ref, ['listing'], { preloadImage: true });
      seo.preloadImage('https://example.test/hero.webp');

      seo.clearUnclaimed();

      expect(all(PRELOAD)).toHaveLength(1);
      page.destroy();
    });

    it('releases a claim on destroy, but keeps an id another live page still claims', () => {
      const one = scope();
      const two = scope();
      seo.clearOnDestroy(one.ref, ['shared', 'mine'], { preloadImage: true });
      seo.clearOnDestroy(two.ref, ['shared'], { preloadImage: true });

      one.destroy();
      seo.setJsonLd('shared', {});
      seo.setJsonLd('mine', {});
      seo.preloadImage('https://example.test/hero.webp');
      seo.clearUnclaimed();

      expect(jsonLd('shared')).toHaveLength(1);
      expect(jsonLd('mine')).toHaveLength(0);
      expect(all(PRELOAD)).toHaveLength(1);

      two.destroy();
      seo.setJsonLd('shared', {});
      seo.preloadImage('https://example.test/hero.webp');
      seo.clearUnclaimed();

      expect(jsonLd('shared')).toHaveLength(0);
      expect(all(PRELOAD)).toHaveLength(0);
    });
  });
});

describe('Seo.clearUnclaimed on the server', () => {
  it('removes nothing, so the rendered HTML keeps every block', () => {
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        { provide: LocaleStore, useValue: { ready, active } },
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
    const seo = TestBed.inject(Seo);
    seo.setJsonLd('article', {});
    seo.preloadImage('https://example.test/hero.webp');

    seo.clearUnclaimed();

    expect(jsonLd('article')).toHaveLength(1);
    expect(all(PRELOAD)).toHaveLength(1);
    document.head.querySelectorAll('script[data-seo], link[data-seo]').forEach((el) => el.remove());
  });
});
