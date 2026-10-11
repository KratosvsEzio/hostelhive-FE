import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject } from 'rxjs';
import { at, loadLocale } from '@core/i18n/locale-files-testing';
import { LocaleStore } from '@core/i18n/locale-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { postBySlug } from '../blog-posts';
import { BlogArticle } from './blog-article';

const LAHORE = 'student-hostels-in-lahore-a-practical-guide';
const AGENT = 'what-a-hostel-agent-actually-costs-you';

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

  it('keeps a real post English-titled, canonical to its language and indexable when the language is Urdu', () => {
    const { fixture } = mount(LAHORE, { active: signal('ur'), langs: ['ur', 'en'] });
    fixture.detectChanges();
    TestBed.tick();

    expect(document.title).toBe(`${postBySlug(LAHORE)?.title} | HostelHive`);
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `https://hostelhive.com/ur/blog/${LAHORE}`,
    );
    expect(block(ARTICLE)['inLanguage']).toBe('en');
    expect(meta('meta[name="robots"]')).toBe('index, follow, max-image-preview:large');
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
    expect(block(ARTICLE)['url']).toBe(`https://hostelhive.com/blog/${LAHORE}`);

    params.next(convertToParamMap({ slug: AGENT }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(count(ARTICLE)).toBe(1);
    expect(count(BREADCRUMB)).toBe(1);
    expect(block(ARTICLE)['headline']).toBe(postBySlug(AGENT)?.title);
    expect(block(ARTICLE)['url']).toBe(`https://hostelhive.com/blog/${AGENT}`);

    const canonical = document.head.querySelectorAll('link[rel="canonical"]');
    expect(canonical).toHaveLength(1);
    expect(canonical[0].getAttribute('href')).toBe(`https://hostelhive.com/en/blog/${AGENT}`);
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
