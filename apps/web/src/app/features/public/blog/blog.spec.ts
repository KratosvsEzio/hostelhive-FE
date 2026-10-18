import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { TitleStrategy, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { LocaleTree, at, loadLocale } from '@core/i18n/locale-files-testing';
import { LocaleStore } from '@core/i18n/locale-store';
import { hasLocalePrefix, localeAlternates } from '@core/i18n/locales';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { RouteHeadStrategy } from '@core/route-head';
import { Seo } from '@core/seo';
import { assetUrlsIn, pageAddressesIn } from '@core/seo-testing';
import { Blog } from './blog';
import { BLOG_POSTS } from './blog-posts';

/** Every tag Seo writes into the head. */
const SEO_TAGS =
  'link[rel="canonical"], link[rel="alternate"][hreflang], meta[name="robots"], meta[property^="og:"], meta[name^="twitter:"], [data-seo]';

const BLOG = 'script[data-seo="blog"]';
const ORGANIZATION = 'script[data-seo="organization"]';
const HREFLANG = 'link[rel="alternate"][data-seo="hreflang"]';

const active = signal('en');

function attr(selector: string, name: string): string | null {
  return document.head.querySelector(selector)?.getAttribute(name) ?? null;
}

function count(selector: string): number {
  return document.head.querySelectorAll(selector).length;
}

interface BlogBlock {
  url: string;
  blogPost: { url: string; image?: string[] }[];
}

function blogBlock(): BlogBlock {
  return JSON.parse(document.head.querySelector(BLOG)?.textContent ?? '{}') as BlogBlock;
}

/** Each post's address as the article page itself names it: always the English one. */
const ARTICLE_CANONICALS = BLOG_POSTS.map((p) => `https://hostelhive.com/en/blog/${p.slug}`);

describe('Blog structured data', () => {
  beforeEach(() => {
    active.set('en');
    TestBed.configureTestingModule({
      imports: [Blog],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        // The real Seo only reads the active language from the store.
        {
          provide: LocaleStore,
          useValue: { ready: signal(true), active },
        },
      ],
    });
  });

  afterEach(() => {
    document.head.querySelectorAll(SEO_TAGS).forEach((el) => el.remove());
  });

  it('writes one blog block, removes it on destroy and leaves other pages blocks alone', () => {
    TestBed.inject(Seo).setJsonLd('organization', { '@type': 'Organization' });

    const fixture = TestBed.createComponent(Blog);
    fixture.detectChanges();

    expect(count(BLOG)).toBe(1);
    expect(count(ORGANIZATION)).toBe(1);

    fixture.destroy();

    expect(count(BLOG)).toBe(0);
    expect(count(ORGANIZATION)).toBe(1);
  });

  it('rebuilds canonical, og:url, hreflang and og:locale when the language switches on a live page, and restores them', () => {
    const fixture = TestBed.createComponent(Blog);
    fixture.detectChanges();
    expect(attr('link[rel="canonical"]', 'href')).toBe('https://hostelhive.com/en/blog');

    active.set('ur');
    fixture.detectChanges();
    TestBed.tick();

    expect(count('link[rel="canonical"]')).toBe(1);
    expect(attr('link[rel="canonical"]', 'href')).toBe('https://hostelhive.com/ur/blog');
    expect(count('meta[property="og:url"]')).toBe(1);
    expect(attr('meta[property="og:url"]', 'content')).toBe('https://hostelhive.com/ur/blog');
    expect(attr('meta[property="og:locale"]', 'content')).toBe('ur_PK');
    expect(count(HREFLANG)).toBe(localeAlternates('/blog').length);
    expect(attr(`${HREFLANG}[hreflang="x-default"]`, 'href')).toBe(
      'https://hostelhive.com/en/blog',
    );
    expect(count(BLOG)).toBe(1);

    active.set('en');
    fixture.detectChanges();
    TestBed.tick();

    expect(count('link[rel="canonical"]')).toBe(1);
    expect(attr('link[rel="canonical"]', 'href')).toBe('https://hostelhive.com/en/blog');
    expect(attr('meta[property="og:url"]', 'content')).toBe('https://hostelhive.com/en/blog');
    expect(attr('meta[property="og:locale"]', 'content')).toBe('en_PK');
    expect(count(BLOG)).toBe(1);
  });

  it('ends a navigation to /en/blog with its own translated title and description, not a route title', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          // A stray route title on a page that owns its head must still lose to the page's.
          { path: 'en/blog', title: 'Blog — HostelHive', component: Blog, data: { head: 'page' } },
        ]),
        { provide: TitleStrategy, useClass: RouteHeadStrategy },
        provideI18nTesting(),
        { provide: LocaleStore, useValue: { ready: signal(true), active } },
      ],
    });

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/en/blog');
    harness.detectChanges();
    TestBed.tick();

    // The test loader echoes keys, so these prove both strings go through translation.
    expect(document.title).toBe('seo.blogTitle');
    expect(attr('meta[name="description"]', 'content')).toBe('seo.blogDescription');
    expect(attr('meta[property="og:title"]', 'content')).toBe('seo.blogTitle');
    expect(attr('meta[name="twitter:title"]', 'content')).toBe('seo.blogTitle');
  });

  it('canonicalises to the blog index while it lives', () => {
    const fixture = TestBed.createComponent(Blog);
    fixture.detectChanges();

    const canonical = document.head.querySelectorAll('link[rel="canonical"]');
    expect(canonical).toHaveLength(1);
    expect(canonical[0].getAttribute('href')).toBe('https://hostelhive.com/en/blog');
  });

  it.each([
    ['en', 'https://hostelhive.com/en/blog'],
    ['ur', 'https://hostelhive.com/ur/blog'],
  ])(
    'names its own canonical as the blog url on /%s/, and each article canonical as the post url',
    (code, index) => {
      active.set(code);
      const fixture = TestBed.createComponent(Blog);
      fixture.detectChanges();

      expect(blogBlock().url).toBe(index);
      expect(blogBlock().url).toBe(attr('link[rel="canonical"]', 'href'));
      expect(blogBlock().blogPost.map((p) => p.url)).toEqual(ARTICLE_CANONICALS);
    },
  );

  it('rewrites its blog url on a language switch, and keeps the post urls English', () => {
    const fixture = TestBed.createComponent(Blog);
    fixture.detectChanges();

    for (const code of ['ur', 'en']) {
      active.set(code);
      fixture.detectChanges();
      TestBed.tick();

      expect(count(BLOG), code).toBe(1);
      expect(blogBlock().url, code).toBe(`https://hostelhive.com/${code}/blog`);
      expect(blogBlock().blogPost.map((p) => p.url), code).toEqual(ARTICLE_CANONICALS);
    }
  });

  it('names no page address without a language, and keeps the post images at the site root', () => {
    active.set('ur');
    const fixture = TestBed.createComponent(Blog);
    fixture.detectChanges();

    const pages = pageAddressesIn(blogBlock());
    expect(pages).toHaveLength(BLOG_POSTS.length + 1);
    for (const url of pages) expect(hasLocalePrefix(new URL(url).pathname), url).toBe(true);

    const assets = assetUrlsIn(blogBlock());
    expect(assets.length).toBeGreaterThan(0);
    for (const url of assets) expect(hasLocalePrefix(new URL(url).pathname), url).toBe(false);
  });
});

describe('Blog structured data before the strings load', () => {
  const ready = signal(false);

  beforeEach(() => {
    active.set('en');
    ready.set(false);
    TestBed.configureTestingModule({
      imports: [Blog],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        { provide: LocaleStore, useValue: { ready, active } },
      ],
    });
  });

  afterEach(() => {
    document.head.querySelectorAll(SEO_TAGS).forEach((el) => el.remove());
  });

  it('writes no blog block until the language is ready, then exactly one', () => {
    const fixture = TestBed.createComponent(Blog);
    fixture.detectChanges();
    TestBed.tick();
    expect(count(BLOG)).toBe(0);

    ready.set(true);
    fixture.detectChanges();
    TestBed.tick();

    expect(count(BLOG)).toBe(1);
  });
});

describe('Blog head copy in the active language', () => {
  const ready = signal(true);
  const en = loadLocale('en.json');
  const ur = loadLocale('ur.json');
  const text = (tree: LocaleTree, key: string) => at(tree, key) as string;

  beforeEach(() => {
    active.set('en');
    ready.set(true);
    TestBed.configureTestingModule({
      imports: [Blog],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        { provide: LocaleStore, useValue: { ready, active } },
      ],
    });
    const i18n = TestBed.inject(TranslocoService);
    i18n.setTranslation(en, 'en');
    i18n.setTranslation(ur, 'ur');
  });

  afterEach(() => {
    document.head.querySelectorAll(SEO_TAGS).forEach((el) => el.remove());
    document.title = '';
  });

  it('switches the title and description from English to Urdu on a live page, and back', () => {
    const fixture = TestBed.createComponent(Blog);
    fixture.detectChanges();
    TestBed.tick();

    expect(document.title).toBe(text(en, 'seo.blogTitle'));
    expect(attr('meta[name="description"]', 'content')).toBe(text(en, 'seo.blogDescription'));

    // Mirrors LocaleStore.switchTo: strings are not ready until the new language has loaded.
    ready.set(false);
    active.set('ur');
    TestBed.inject(TranslocoService).setActiveLang('ur');
    TestBed.tick();

    expect(document.title).toBe(text(en, 'seo.blogTitle'));

    ready.set(true);
    TestBed.tick();

    expect(text(ur, 'seo.blogTitle')).not.toBe(text(en, 'seo.blogTitle'));
    expect(document.title).toBe(text(ur, 'seo.blogTitle'));
    expect(attr('meta[property="og:title"]', 'content')).toBe(text(ur, 'seo.blogTitle'));
    expect(attr('meta[name="description"]', 'content')).toBe(text(ur, 'seo.blogDescription'));
    expect(attr('meta[property="og:description"]', 'content')).toBe(
      text(ur, 'seo.blogDescription'),
    );

    ready.set(false);
    active.set('en');
    TestBed.inject(TranslocoService).setActiveLang('en');
    ready.set(true);
    TestBed.tick();

    expect(document.title).toBe(text(en, 'seo.blogTitle'));
    expect(attr('meta[name="description"]', 'content')).toBe(text(en, 'seo.blogDescription'));
  });
});
