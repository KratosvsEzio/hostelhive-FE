import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject } from 'rxjs';
import { at, loadLocale } from '@core/i18n/locale-files-testing';
import { LocaleStore } from '@core/i18n/locale-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { hasLocalePrefix, localeAlternates } from '@core/i18n/locales';
import { Seo } from '@core/seo';
import { assetUrlsIn, pageAddressesIn } from '@core/seo-testing';
import { Blog } from '../blog';
import { postBySlug, relatedPosts } from '../blog-posts';
import { BlogArticle } from './blog-article';

const SITE = 'https://hostelhive.com';
const LAHORE = 'student-hostels-in-lahore-a-practical-guide';
const AGENT = 'what-a-hostel-agent-actually-costs-you';
const INDEX = 'index, follow, max-image-preview:large';
const HREFLANG = 'link[rel="alternate"][hreflang]';

/** Every tag Seo writes into the head. */
const SEO_TAGS =
  'link[rel="canonical"], link[rel="alternate"][hreflang], meta[name="robots"], meta[property^="og:"], meta[name^="twitter:"], [data-seo]';

const ARTICLE = 'script[data-seo="article"]';
const BREADCRUMB = 'script[data-seo="breadcrumb"]';
const ORGANIZATION = 'script[data-seo="organization"]';

function count(selector: string): number {
  return document.head.querySelectorAll(selector).length;
}

function block(selector: string): Record<string, unknown> {
  return JSON.parse(document.head.querySelector(selector)?.textContent ?? '{}');
}

function meta(selector: string): string | null {
  return document.head.querySelector(selector)?.getAttribute('content') ?? null;
}

function canonical(): string | null {
  return document.head.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;
}

function metas(selector: string): (string | null)[] {
  return Array.from(document.head.querySelectorAll(selector)).map((m) => m.getAttribute('content'));
}

/** Moves a live page to another language, as `LocaleStore.switchTo` does once the strings are in. */
function switchTo(code: string, active: WritableSignal<string>, fixture: { detectChanges(): void }) {
  active.set(code);
  TestBed.inject(TranslocoService).setActiveLang(code);
  fixture.detectChanges();
  TestBed.tick();
}

/** A router-driven article and blog index, under the Urdu prefix. */
async function harnessAt(url: string, active = signal('ur')) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'ur/blog/:slug', component: BlogArticle },
        { path: 'ur/blog', component: Blog },
      ]),
      provideI18nTesting(),
      { provide: LocaleStore, useValue: { ready: signal(true), active } },
    ],
  });
  loadLang('ur', 'en');
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  harness.detectChanges();
  TestBed.tick();
  return harness;
}

/** Real strings for each language, set on the test's Transloco; the first one is made active. */
function loadLang(...codes: string[]): void {
  const i18n = TestBed.inject(TranslocoService);
  for (const code of codes) i18n.setTranslation(loadLocale(`${code}.json`), code);
  i18n.setActiveLang(codes[0]);
}

interface MountOptions {
  ready?: WritableSignal<boolean>;
  active?: WritableSignal<string>;
  /** Languages whose strings exist before the component is created; the first is active. */
  langs?: string[];
}

/** The route's params are a subject, so a test can move the same component to another slug. */
function mount(
  slug: string,
  { ready = signal(true), active = signal('en'), langs = [] }: MountOptions = {},
) {
  const params = new BehaviorSubject(convertToParamMap({ slug }));
  TestBed.configureTestingModule({
    imports: [BlogArticle],
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      {
        provide: ActivatedRoute,
        useValue: { paramMap: params, snapshot: { paramMap: params.value } },
      },
      // The real Seo only reads the active language from the store.
      {
        provide: LocaleStore,
        useValue: { ready, active },
      },
    ],
  });
  if (langs.length) loadLang(...langs);
  const fixture = TestBed.createComponent(BlogArticle);
  fixture.detectChanges();
  return { fixture, params };
}

describe('BlogArticle head', () => {
  afterEach(() => {
    document.head.querySelectorAll(SEO_TAGS).forEach((el) => el.remove());
    document.head.querySelector('meta[name="description"]')?.remove();
    document.title = '';
  });

  describe('the not-found title', () => {
    const NOT_FOUND = 'no-such-post';

    it('is Urdu in the tab, og:title and twitter:title, and noindex, on an unknown slug', () => {
      mount(NOT_FOUND, { active: signal('ur'), langs: ['ur', 'en'] });
      TestBed.tick();

      const title = at(loadLocale('ur.json'), 'seo.postNotFoundTitle') as string;
      expect(title).toBe('پوسٹ نہیں ملی — HostelHive');
      expect(document.title).toBe(title);
      expect(meta('meta[property="og:title"]')).toBe(title);
      expect(meta('meta[name="twitter:title"]')).toBe(title);
      expect(meta('meta[name="robots"]')).toBe('noindex, nofollow');
    });

    it('stays exactly the English wording, with the English default description, in English', () => {
      const en = loadLocale('en.json');
      mount(NOT_FOUND, { langs: ['en'] });
      TestBed.tick();

      expect(document.title).toBe('Post not found — HostelHive');
      expect(meta('meta[property="og:title"]')).toBe('Post not found — HostelHive');
      expect(meta('meta[name="description"]')).toBe(at(en, 'seo.defaultDescription'));
    });

    it('translates when the language is switched on a live not-found page', () => {
      const ready = signal(true);
      const active = signal('en');
      const { fixture } = mount(NOT_FOUND, { ready, active, langs: ['en', 'ur'] });
      TestBed.tick();
      expect(document.title).toBe('Post not found — HostelHive');

      // Mirrors LocaleStore.switchTo: strings are not ready until the new language has loaded.
      ready.set(false);
      TestBed.tick();
      active.set('ur');
      TestBed.inject(TranslocoService).setActiveLang('ur');
      ready.set(true);
      fixture.detectChanges();
      TestBed.tick();

      expect(document.title).toBe('پوسٹ نہیں ملی — HostelHive');
      expect(meta('meta[property="og:title"]')).toBe('پوسٹ نہیں ملی — HostelHive');
    });

    it('follows every switch between two already-loaded languages while the strings stay ready', () => {
      const active = signal('en');
      const { fixture } = mount(NOT_FOUND, { active, langs: ['en', 'ur'] });
      TestBed.tick();
      expect(document.title).toBe('Post not found — HostelHive');

      active.set('ur');
      TestBed.inject(TranslocoService).setActiveLang('ur');
      fixture.detectChanges();
      TestBed.tick();
      expect(document.title).toBe('پوسٹ نہیں ملی — HostelHive');

      active.set('en');
      TestBed.inject(TranslocoService).setActiveLang('en');
      fixture.detectChanges();
      TestBed.tick();
      expect(document.title).toBe('Post not found — HostelHive');
    });

    it('writes nothing until the language is ready, then writes the head, on an unknown slug', () => {
      const ready = signal(false);
      document.title = 'sentinel';
      const { fixture } = mount(NOT_FOUND, { ready, active: signal('ur'), langs: ['ur'] });
      TestBed.tick();

      expect(document.title).toBe('sentinel');
      expect(count('meta[name="robots"]')).toBe(0);
      expect(count('meta[property="og:title"]')).toBe(0);

      ready.set(true);
      fixture.detectChanges();
      TestBed.tick();

      expect(document.title).toBe('پوسٹ نہیں ملی — HostelHive');
      expect(count('meta[name="robots"]')).toBe(1);
    });

    it('writes nothing until the language is ready, then writes the head, on a real post', () => {
      const ready = signal(false);
      document.title = 'sentinel';
      const { fixture } = mount(LAHORE, { ready, langs: ['en'] });
      TestBed.tick();

      expect(document.title).toBe('sentinel');
      expect(count('meta[property="og:title"]')).toBe(0);
      expect(count(ARTICLE)).toBe(0);

      ready.set(true);
      fixture.detectChanges();
      TestBed.tick();

      expect(document.title).toBe(`${postBySlug(LAHORE)?.title} | HostelHive`);
      expect(count(ARTICLE)).toBe(1);
    });

    it('falls back to the Urdu default description, never a raw key, once Urdu loads after mount', () => {
      const ready = signal(false);
      const active = signal('ur');
      const { fixture } = mount(NOT_FOUND, { ready, active });
      TestBed.tick();

      loadLang('ur');
      ready.set(true);
      fixture.detectChanges();
      TestBed.tick();

      const description = meta('meta[name="description"]');
      expect(description).toBe(at(loadLocale('ur.json'), 'seo.defaultDescription'));
      expect(description).not.toMatch(/^seo\./);
    });
  });

  describe('contents links', () => {
    it('keep the current query string when they jump to a section', async () => {
      TestBed.configureTestingModule({
        providers: [
          provideRouter([{ path: 'en/blog/:slug', component: BlogArticle }]),
          provideI18nTesting(),
          { provide: LocaleStore, useValue: { ready: signal(true), active: signal('en') } },
        ],
      });
      loadLang('en');
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(`/en/blog/${LAHORE}?utm_source=fb`, BlogArticle);
      harness.fixture.detectChanges();

      const links = Array.from(
        harness.routeNativeElement?.querySelectorAll<HTMLAnchorElement>(
          'ul[role="list"] a[href*="#"]',
        ) ?? [],
      );
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) {
        expect(link.getAttribute('href')).toMatch(
          new RegExp('^/en/blog/' + LAHORE + '[?]utm_source=fb#[a-z0-9-]+$'),
        );
      }
    });
  });

  describe('a real post, written in English', () => {
    const ENGLISH = `${SITE}/en/blog/${LAHORE}`;

    function mountIn(code: string) {
      const mounted = mount(LAHORE, { active: signal(code), langs: [code, 'en'] });
      mounted.fixture.detectChanges();
      TestBed.tick();
      return mounted;
    }

    it.each(['en', 'ur', 'ar', 'de'])(
      'on /%s/ names the English address as canonical and og:url, with no hreflang, and stays indexable',
      (code) => {
        mountIn(code);

        expect(count('link[rel="canonical"]')).toBe(1);
        expect(canonical()).toBe(ENGLISH);
        expect(metas('meta[property="og:url"]')).toEqual([ENGLISH]);
        expect(count(HREFLANG)).toBe(0);
        expect(metas('meta[property="og:locale"]')).toEqual(['en_PK']);
        expect(meta('meta[name="robots"]')).toBe(INDEX);
        expect(document.title).toBe(`${postBySlug(LAHORE)?.title} | HostelHive`);
      },
    );

    it.each(['en', 'ur', 'ar', 'de'])(
      'on /%s/ gives the article structured data the canonical as its url and main entity, in English',
      (code) => {
        mountIn(code);

        expect(block(ARTICLE)['url']).toBe(canonical());
        expect(block(ARTICLE)['mainEntityOfPage']).toBe(canonical());
        expect(block(ARTICLE)['inLanguage']).toBe('en');
      },
    );

    it.each(['ur', 'ar'])(
      'on /%s/ trails the breadcrumb from the English blog index to the canonical',
      (code) => {
        mountIn(code);

        expect(block(BREADCRUMB)['itemListElement']).toEqual([
          { '@type': 'ListItem', position: 1, name: 'Blog', item: `${SITE}/en/blog` },
          {
            '@type': 'ListItem',
            position: 2,
            name: postBySlug(LAHORE)?.title,
            item: canonical(),
          },
        ]);
      },
    );

    it('names no page address without a language, and keeps its images at the site root', () => {
      mountIn('ur');

      const data = [block(ARTICLE), block(BREADCRUMB)];
      const pages = pageAddressesIn(data);
      const canonical = `${SITE}/en/blog/${LAHORE}`;
      // url, mainEntityOfPage and breadcrumb item 2 are the canonical; item 1 is the index.
      expect([...pages].sort()).toEqual([canonical, canonical, canonical, `${SITE}/en/blog`].sort());
      for (const url of pages) expect(hasLocalePrefix(new URL(url).pathname), url).toBe(true);

      const assets = assetUrlsIn(data);
      expect(assets).toContain(`${SITE}/hostelhive-logo.png`);
      expect(assets.some((u) => u.startsWith(`${SITE}/blog/${LAHORE}/`))).toBe(true);
      for (const url of assets) expect(hasLocalePrefix(new URL(url).pathname), url).toBe(false);
    });

    it('marks the category eyebrow text as English, left to right, inside a block that follows the page', () => {
      const { fixture } = mountIn('ur');
      const label = 'City guides';
      expect(postBySlug(LAHORE)?.category).toBe('city-guides');

      const eyebrows = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('p'),
      ).filter((p) => p.textContent?.trim() === label);

      expect(eyebrows).toHaveLength(1);
      // Like the title: the block keeps the page's direction, so it lines up with the heading.
      expect(eyebrows[0].hasAttribute('dir')).toBe(false);
      const text = eyebrows[0].querySelector('span');
      expect(text?.textContent?.trim()).toBe(label);
      expect(text?.getAttribute('lang')).toBe('en');
      expect(text?.getAttribute('dir')).toBe('ltr');
    });

    it('keeps its English head and structured data through a switch to Urdu and back', () => {
      const active = signal('en');
      const { fixture } = mount(LAHORE, { active, langs: ['en', 'ur'] });
      TestBed.tick();
      const title = document.title;
      const articleUrl = block(ARTICLE)['url'];
      expect(articleUrl).toBe(ENGLISH);

      for (const code of ['ur', 'en']) {
        switchTo(code, active, fixture);

        expect(count('link[rel="canonical"]'), code).toBe(1);
        expect(canonical(), code).toBe(ENGLISH);
        expect(metas('meta[property="og:url"]'), code).toEqual([ENGLISH]);
        expect(count(HREFLANG), code).toBe(0);
        expect(metas('meta[property="og:locale"]'), code).toEqual(['en_PK']);
        expect(count(ARTICLE), code).toBe(1);
        expect(block(ARTICLE)['url'], code).toBe(articleUrl);
        expect(document.title, code).toBe(title);
      }
    });

    it('keeps its English head through a switch whose strings load after it', () => {
      const ready = signal(true);
      const active = signal('en');
      const { fixture } = mount(LAHORE, { ready, active, langs: ['en', 'ur'] });
      TestBed.tick();

      ready.set(false);
      TestBed.tick();
      active.set('ur');
      TestBed.inject(TranslocoService).setActiveLang('ur');
      TestBed.tick();
      expect(canonical()).toBe(ENGLISH);

      ready.set(true);
      fixture.detectChanges();
      TestBed.tick();

      expect(canonical()).toBe(ENGLISH);
      expect(count(HREFLANG)).toBe(0);
      expect(metas('meta[property="og:locale"]')).toEqual(['en_PK']);
      expect(block(ARTICLE)['url']).toBe(ENGLISH);
    });

    it('leaves the head settled after mounting and after a switch, so analytics records one view', () => {
      const active = signal('ur');
      const { fixture } = mount(LAHORE, { active, langs: ['ur', 'en'] });
      TestBed.tick();
      const seo = TestBed.inject(Seo);
      expect(seo.settled()).toBe(true);

      switchTo('en', active, fixture);

      expect(seo.settled()).toBe(true);
    });
  });

  describe('the not-found page, which is translated', () => {
    it('keeps the active language: noindex, no address, no hreflang, ur_PK and no structured data', () => {
      mount('no-such-post', { active: signal('ur'), langs: ['ur', 'en'] });
      TestBed.tick();

      expect(meta('meta[name="robots"]')).toBe('noindex, nofollow');
      expect(count('link[rel="canonical"]')).toBe(0);
      expect(count('meta[property="og:url"]')).toBe(0);
      expect(count(HREFLANG)).toBe(0);
      expect(metas('meta[property="og:locale"]')).toEqual(['ur_PK']);
      expect(count(ARTICLE)).toBe(0);
      expect(count(BREADCRUMB)).toBe(0);
    });

    it('takes og:locale back from English to the active language when a real post becomes unknown', async () => {
      const { fixture, params } = mount(LAHORE, { active: signal('ur'), langs: ['ur', 'en'] });
      TestBed.tick();
      expect(metas('meta[property="og:locale"]')).toEqual(['en_PK']);

      params.next(convertToParamMap({ slug: 'no-such-post' }));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(metas('meta[property="og:locale"]')).toEqual(['ur_PK']);
      expect(count(HREFLANG)).toBe(0);
      expect(count('link[rel="canonical"]')).toBe(0);
    });
  });

  describe('under a translated prefix', () => {
    it('keeps the visitor language on every link in the page', async () => {
      const harness = await harnessAt(`/ur/blog/${LAHORE}`);
      const post = postBySlug(LAHORE);
      if (!post) throw new Error('missing post');

      const hrefs = Array.from(
        harness.routeNativeElement?.querySelectorAll<HTMLAnchorElement>('a[href^="/"]') ?? [],
      ).map((a) => a.getAttribute('href') ?? '');

      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) expect(href.startsWith('/ur/'), href).toBe(true);
      expect(hrefs).toContain('/ur/blog');
      for (const r of relatedPosts(post)) expect(hrefs).toContain(`/ur/blog/${r.slug}`);
      expect(hrefs.some((h) => h.startsWith(`/ur/blog/${LAHORE}#`))).toBe(true);
    });

    it('gives the blog index its own address and full hreflang set back after an article', async () => {
      const harness = await harnessAt(`/ur/blog/${LAHORE}`);
      expect(count(HREFLANG)).toBe(0);
      expect(canonical()).toBe(`${SITE}/en/blog/${LAHORE}`);

      await harness.navigateByUrl('/ur/blog');
      harness.detectChanges();
      TestBed.tick();

      expect(count('link[rel="canonical"]')).toBe(1);
      expect(canonical()).toBe(`${SITE}/ur/blog`);
      expect(count(HREFLANG)).toBe(localeAlternates('/blog').length);
      expect(metas('meta[property="og:locale"]')).toEqual(['ur_PK']);
      expect(count(ARTICLE)).toBe(0);
      expect(count(BREADCRUMB)).toBe(0);
      expect(count('script[data-seo="blog"]')).toBe(1);
    });
  });

  it('writes one article and one breadcrumb block, removes both on destroy and leaves other pages blocks alone', () => {
    expect(postBySlug(LAHORE)).toBeTruthy();
    document.head.insertAdjacentHTML(
      'beforeend',
      '<script type="application/ld+json" data-seo="organization">{}</script>',
    );
    const { fixture } = mount(LAHORE);

    expect(count(ARTICLE)).toBe(1);
    expect(count(BREADCRUMB)).toBe(1);

    fixture.destroy();

    expect(count(ARTICLE)).toBe(0);
    expect(count(BREADCRUMB)).toBe(0);
    expect(count(ORGANIZATION)).toBe(1);
  });

  it('describes only the newest article, with its own canonical, after moving to another one', async () => {
    const { fixture, params } = mount(LAHORE);
    expect(block(ARTICLE)['url']).toBe(`https://hostelhive.com/en/blog/${LAHORE}`);

    params.next(convertToParamMap({ slug: AGENT }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(count(ARTICLE)).toBe(1);
    expect(count(BREADCRUMB)).toBe(1);
    expect(block(ARTICLE)['headline']).toBe(postBySlug(AGENT)?.title);
    expect(block(ARTICLE)['url']).toBe(`https://hostelhive.com/en/blog/${AGENT}`);

    const canonical = document.head.querySelectorAll('link[rel="canonical"]');
    expect(canonical).toHaveLength(1);
    expect(canonical[0].getAttribute('href')).toBe(`https://hostelhive.com/en/blog/${AGENT}`);
  });

  it('moves to another article under a translated prefix with the new English address everywhere', async () => {
    const { fixture, params } = mount(LAHORE, { active: signal('ur'), langs: ['ur', 'en'] });
    TestBed.tick();

    params.next(convertToParamMap({ slug: AGENT }));
    await fixture.whenStable();
    fixture.detectChanges();

    const english = `${SITE}/en/blog/${AGENT}`;
    expect(count('link[rel="canonical"]')).toBe(1);
    expect(canonical()).toBe(english);
    expect(count(HREFLANG)).toBe(0);
    expect(count(ARTICLE)).toBe(1);
    expect(count(BREADCRUMB)).toBe(1);
    expect(block(ARTICLE)['url']).toBe(english);
    const trail = block(BREADCRUMB)['itemListElement'] as { item: string }[];
    expect(trail[1].item).toBe(english);
  });

  it('clears canonical, og:url and structured data when a known slug becomes an unknown one', async () => {
    const { fixture, params } = mount(LAHORE);
    expect(count('link[rel="canonical"]')).toBe(1);
    expect(count('meta[property="og:url"]')).toBe(1);
    expect(count(ARTICLE)).toBe(1);

    params.next(convertToParamMap({ slug: 'no-such-post' }));
    await fixture.whenStable();
    fixture.detectChanges();

    const robots = document.head.querySelector('meta[name="robots"]');
    expect(robots?.getAttribute('content')).toBe('noindex, nofollow');
    expect(count('link[rel="canonical"]')).toBe(0);
    expect(count('meta[property="og:url"]')).toBe(0);
    expect(count(ARTICLE)).toBe(0);
    expect(count(BREADCRUMB)).toBe(0);
  });
});
