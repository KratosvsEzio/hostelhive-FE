import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { Router, Routes, TitleStrategy, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { LocaleStore } from './i18n/locale-store';
import { localeAlternates } from './i18n/locales';
import { provideI18nTesting } from './i18n/provide-i18n-testing';
import { RouteHeadStrategy, routeHeadFor } from './route-head';
import { SITE_ORIGIN, Seo } from './seo';

const CANONICAL = 'link[rel="canonical"]';
const OG_URL = 'meta[property="og:url"]';
const OG_LOCALE = 'meta[property="og:locale"]';
const HREFLANG = 'link[rel="alternate"][data-seo="hreflang"]';
const ROBOTS = 'meta[name="robots"]';
const DESCRIPTION = 'meta[name="description"]';
const JSON_LD = 'script[data-seo]';
const PRELOAD = 'link[data-seo="preload-image"]';

const INDEXABLE = 'index, follow, max-image-preview:large';
const NOINDEX = 'noindex, nofollow';

const SEO_TAGS =
  'link[rel="canonical"], link[data-seo], script[data-seo], meta[property^="og:"], meta[name^="twitter:"], meta[name="robots"], meta[name="description"]';

@Component({ selector: 'hh-plain-stub', template: '' })
class PlainStub {}

/**
 * A page that owns its head: applies from an effect and claims its blocks, as every page that
 * writes them does (`Seo.clearOnDestroy`).
 */
@Component({ selector: 'hh-page-stub', template: '' })
class PageStub {
  constructor() {
    const seo = inject(Seo);
    const locale = inject(LocaleStore);
    seo.clearOnDestroy(inject(DestroyRef), ['listing', 'faq'], { preloadImage: true });
    effect(() => {
      if (!locale.ready()) return;
      seo.apply({ title: 'Page own title', description: 'Page own description', path: '/page' });
      seo.setJsonLd('listing', { n: 1 });
      seo.setJsonLd('faq', { n: 2 });
      seo.preloadImage('https://example.test/hero.webp');
    });
  }
}

// Route titles are label keys, as in the app; the strategy composes them into the template.
const ROUTES: Routes = [
  {
    path: ':locale',
    children: [
      {
        path: 'about',
        title: 'labels.about',
        component: PlainStub,
        data: { head: 'index', descriptionKey: 'pages.about' },
      },
      { path: 'plain', title: 'labels.plain', component: PlainStub, data: { head: 'index' } },
      { path: 'private', title: 'labels.private', component: PlainStub },
      { path: 'untitled', component: PlainStub },
      { path: 'blank', title: '', component: PlainStub },
      {
        path: 'admin',
        children: [
          { path: '', title: 'labels.adminHome', component: PlainStub },
          { path: 'payments', title: 'labels.payments', component: PlainStub },
        ],
      },
      { path: 'administrators', title: 'labels.administrators', component: PlainStub },
      // The app declares no title on a 'page' route; this one does, to prove it is ignored.
      { path: 'page', title: 'labels.pageRoute', component: PageStub, data: { head: 'page' } },
      {
        path: 'lazy',
        data: { head: 'index', descriptionKey: 'pages.about' },
        loadChildren: () => [
          { path: '', component: PlainStub },
          { path: 'deep', component: PlainStub, data: { head: 'page' } },
        ],
      },
      {
        path: 'mix',
        data: { head: 'index', descriptionKey: 'pages.about' },
        children: [{ path: 'child', component: PlainStub, data: { head: 'page' } }],
      },
      {
        path: 'guarded',
        canActivate: [() => inject(Router).parseUrl('/en/about')],
        component: PlainStub,
      },
    ],
  },
];

function all(selector: string): Element[] {
  return Array.from(document.head.querySelectorAll(selector));
}

function attr(selector: string, name: string): string | null {
  return document.head.querySelector(selector)?.getAttribute(name) ?? null;
}

describe('RouteHeadStrategy', () => {
  let harness: RouterTestingHarness;
  let router: Router;
  const active = signal('en');
  const ready = signal(true);

  /** Navigates, then lets the strategy's effect run. */
  async function go(url: string): Promise<void> {
    await harness.navigateByUrl(url);
    TestBed.tick();
  }

  beforeEach(async () => {
    active.set('en');
    ready.set(true);
    TestBed.configureTestingModule({
      providers: [
        provideRouter(ROUTES),
        { provide: TitleStrategy, useClass: RouteHeadStrategy },
        provideI18nTesting(),
        { provide: LocaleStore, useValue: { active, ready } },
      ],
    });
    TestBed.inject(TranslocoService).setTranslation(
      {
        seo: {
          defaultTitle: 'Default site title',
          defaultDescription: 'Default site description',
          pageTitle: '{{page}} — Test',
          adminPageTitle: '{{page}} — Test Admin',
        },
        pages: { about: 'About description' },
        labels: {
          about: 'About Us',
          plain: 'Plain',
          private: 'Private',
          payments: 'Payments',
          adminHome: 'Overview',
          administrators: 'Administrators',
          pageRoute: 'Page route title',
        },
      },
      'en',
    );
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    document.head.querySelectorAll(SEO_TAGS).forEach((el) => el.remove());
    document.title = '';
  });

  describe('routeHeadFor', () => {
    it('reads the flag and description key of an index route', async () => {
      await go('/en/about');

      expect(routeHeadFor(router.routerState.snapshot)).toEqual({
        head: 'index',
        descriptionKey: 'pages.about',
      });
    });

    it('gives {} for a route that declares nothing', async () => {
      await go('/en/private');

      expect(routeHeadFor(router.routerState.snapshot)).toEqual({});
    });

    it('lets a flag on a parent cover its lazy child', async () => {
      await go('/en/lazy');

      expect(routeHeadFor(router.routerState.snapshot)).toEqual({
        head: 'index',
        descriptionKey: 'pages.about',
      });
    });

    it.each(['/en/lazy/deep', '/en/mix/child'])(
      'lets the deepest route win the flag at %s while the parent key is kept',
      async (url) => {
        await go(url);

        expect(routeHeadFor(router.routerState.snapshot)).toEqual({
          head: 'page',
          descriptionKey: 'pages.about',
        });
      },
    );
  });

  describe('a static index route', () => {
    it('gets robots index, one canonical and og:url, the full hreflang set, og:locale, its description and its route label in the title template', async () => {
      await go('/en/about');

      expect(attr(ROBOTS, 'content')).toBe(INDEXABLE);
      expect(all(CANONICAL)).toHaveLength(1);
      expect(attr(CANONICAL, 'href')).toBe(`${SITE_ORIGIN}/en/about`);
      expect(all(OG_URL)).toHaveLength(1);
      expect(attr(OG_URL, 'content')).toBe(`${SITE_ORIGIN}/en/about`);
      expect(all(HREFLANG)).toHaveLength(19);
      expect(all(HREFLANG)).toHaveLength(localeAlternates('/about').length);
      expect(all(OG_LOCALE)).toHaveLength(1);
      expect(attr(OG_LOCALE, 'content')).toBe('en_PK');
      expect(attr(DESCRIPTION, 'content')).toBe('About description');
      expect(document.title).toBe('About Us — Test');
    });

    it('writes the same composed title to the tab, og:title and twitter:title', async () => {
      await go('/en/about');

      expect(document.title).toBe('About Us — Test');
      expect(attr('meta[property="og:title"]', 'content')).toBe('About Us — Test');
      expect(attr('meta[name="twitter:title"]', 'content')).toBe('About Us — Test');
    });

    it('falls back to the translated default description when it names no key', async () => {
      await go('/en/plain');

      expect(attr(DESCRIPTION, 'content')).toBe('Default site description');
      expect(attr(CANONICAL, 'href')).toBe(`${SITE_ORIGIN}/en/plain`);
    });

    it('keeps the canonical free of the query and writes one of each tag on a query-only navigation, re-applying the head', async () => {
      await go('/en/about');
      document.head.querySelector(DESCRIPTION)?.setAttribute('content', 'stale');

      await go('/en/about?x=1&y=2');

      expect(attr(CANONICAL, 'href')).toBe(`${SITE_ORIGIN}/en/about`);
      expect(attr(OG_URL, 'content')).toBe(`${SITE_ORIGIN}/en/about`);
      expect(attr(DESCRIPTION, 'content')).toBe('About description');
      expect(all(CANONICAL)).toHaveLength(1);
      expect(all(OG_URL)).toHaveLength(1);
      expect(all(OG_LOCALE)).toHaveLength(1);
      expect(all(ROBOTS)).toHaveLength(1);
      expect(all(HREFLANG)).toHaveLength(19);
    });

    it.each(['/en/about;x=1', '/en/about;x=1;y=2?q=1'])(
      'canonicalises %s to the page itself, without its matrix parameters',
      async (url) => {
        await go(url);

        expect(attr(ROBOTS, 'content')).toBe(INDEXABLE);
        expect(all(CANONICAL)).toHaveLength(1);
        expect(attr(CANONICAL, 'href')).toBe(`${SITE_ORIGIN}/en/about`);
        expect(all(OG_URL)).toHaveLength(1);
        expect(attr(OG_URL, 'content')).toBe(`${SITE_ORIGIN}/en/about`);
        expect(all(HREFLANG)).toHaveLength(19);
      },
    );

    it('turns a noindex head into an indexable one with one canonical', async () => {
      await go('/en/private');
      expect(attr(ROBOTS, 'content')).toBe(NOINDEX);

      await go('/en/about');

      expect(attr(ROBOTS, 'content')).toBe(INDEXABLE);
      expect(all(CANONICAL)).toHaveLength(1);
      expect(attr(CANONICAL, 'href')).toBe(`${SITE_ORIGIN}/en/about`);
    });

    it('applies the target head after a guard redirects from a route with no flag', async () => {
      await go('/en/private');

      await go('/en/guarded');

      expect(router.url).toBe('/en/about');
      expect(attr(ROBOTS, 'content')).toBe(INDEXABLE);
      expect(attr(CANONICAL, 'href')).toBe(`${SITE_ORIGIN}/en/about`);
      expect(attr(DESCRIPTION, 'content')).toBe('About description');
    });
  });

  describe('a route that declares nothing', () => {
    it('is noindex with no canonical, og:url or hreflang, even after an indexable page', async () => {
      TestBed.inject(Seo).apply({ title: 'Stale', path: '/stale' });
      expect(all(CANONICAL)).toHaveLength(1);

      await go('/en/private');

      expect(attr(ROBOTS, 'content')).toBe(NOINDEX);
      expect(all(CANONICAL)).toHaveLength(0);
      expect(all(OG_URL)).toHaveLength(0);
      expect(all(HREFLANG)).toHaveLength(0);
      expect(document.title).toBe('Private — Test');
      expect(attr('meta[property="og:title"]', 'content')).toBe('Private — Test');
      expect(attr('meta[name="twitter:title"]', 'content')).toBe('Private — Test');
    });

    it.each(['/en/untitled', '/en/blank'])(
      'uses the translated site title at %s, never an empty one or a key',
      async (url) => {
        await go(url);

        expect(document.title).toBe('Default site title');
        expect(attr('meta[property="og:title"]', 'content')).toBe('Default site title');
      },
    );

    it('puts an admin console route label in the admin title template', async () => {
      await go('/en/admin/payments');

      expect(document.title).toBe('Payments — Test Admin');
      expect(attr('meta[property="og:title"]', 'content')).toBe('Payments — Test Admin');
      expect(attr(ROBOTS, 'content')).toBe(NOINDEX);
    });

    it('uses the admin template on the bare admin path too', async () => {
      await go('/en/admin');

      expect(document.title).toBe('Overview — Test Admin');
    });

    it('uses the standard template on a path that only starts with admin', async () => {
      await go('/en/administrators');

      expect(document.title).toBe('Administrators — Test');
    });

    it('drops the admin template when navigating from the admin console to a public route', async () => {
      await go('/en/admin/payments');

      await go('/en/plain');

      expect(document.title).toBe('Plain — Test');
    });
  });

  describe('a page-owned route', () => {
    it('never has its title written by the strategy, even when the route declares one', async () => {
      await go('/en/page');
      expect(document.title).toBe('Page own title');
      expect(attr(CANONICAL, 'href')).toBe(`${SITE_ORIGIN}/en/page`);

      // A query-only navigation does not re-run the page's effect, so whatever the strategy
      // wrote here would stay in the tab.
      await go('/en/page?x=1');

      expect(document.title).toBe('Page own title');

      document.title = 'x';
      const strategy = TestBed.inject(TitleStrategy) as RouteHeadStrategy;
      strategy.updateTitle(router.routerState.snapshot);

      expect(document.title).toBe('x');

      TestBed.tick();

      expect(document.title).toBe('x');
      expect(attr(CANONICAL, 'href')).toBe(`${SITE_ORIGIN}/en/page`);
      expect(attr(DESCRIPTION, 'content')).toBe('Page own description');
      expect(attr(ROBOTS, 'content')).toBe(INDEXABLE);
      expect(all(JSON_LD)).toHaveLength(2);
      expect(all(PRELOAD)).toHaveLength(1);
    });

    it('drops server-rendered blocks no live page claimed, and keeps its own (Trello #138)', async () => {
      // What a server-rendered article leaves when the visitor clicks away before the app
      // boots: its component never existed in the browser, so nothing claimed these.
      document.head.insertAdjacentHTML(
        'beforeend',
        '<script type="application/ld+json" data-seo="article">{}</script>' +
          '<script type="application/ld+json" data-seo="breadcrumb">{}</script>' +
          '<link rel="preload" as="image" data-seo="preload-image" href="https://example.test/article.webp" />',
      );

      await go('/en/page');

      expect(all(JSON_LD).map((el) => el.getAttribute('data-seo')).sort()).toEqual([
        'faq',
        'listing',
      ]);
      expect(all(PRELOAD).map((el) => el.getAttribute('href'))).toEqual([
        'https://example.test/hero.webp',
      ]);
    });

    it('keeps a claimed block that the page has not written yet', async () => {
      // The server's copy of the page's own block, before the browser effect rewrites it.
      document.head.insertAdjacentHTML(
        'beforeend',
        '<script type="application/ld+json" data-seo="listing">{"server":true}</script>',
      );
      ready.set(false);

      await go('/en/page');

      expect(all(JSON_LD).map((el) => el.textContent)).toEqual(['{"server":true}']);
    });

    it.each(['/en/about', '/en/private'])(
      'has its canonical, description, hreflang, structured data and preload replaced or removed by %s',
      async (url) => {
        await go('/en/page');
        expect(all(JSON_LD)).toHaveLength(2);
        expect(all(PRELOAD)).toHaveLength(1);
        expect(all(HREFLANG)).toHaveLength(19);

        await go(url);

        expect(all(JSON_LD)).toHaveLength(0);
        expect(all(PRELOAD)).toHaveLength(0);
        expect(attr(DESCRIPTION, 'content')).not.toBe('Page own description');
        if (url === '/en/about') {
          expect(attr(CANONICAL, 'href')).toBe(`${SITE_ORIGIN}/en/about`);
          expect(attr(DESCRIPTION, 'content')).toBe('About description');
          expect(all(HREFLANG)).toHaveLength(19);
          expect(
            document.head.querySelector(`${HREFLANG}[hreflang="x-default"]`)?.getAttribute('href'),
          ).toBe(`${SITE_ORIGIN}/en/about`);
        } else {
          expect(all(CANONICAL)).toHaveLength(0);
          expect(all(OG_URL)).toHaveLength(0);
          expect(all(HREFLANG)).toHaveLength(0);
        }
      },
    );
  });

  describe('the document title', () => {
    it('is not set by updateTitle itself, but with the rest of the head once the effect runs', async () => {
      await go('/en/about');
      document.title = 'zzz';

      (TestBed.inject(TitleStrategy) as RouteHeadStrategy).updateTitle(router.routerState.snapshot);

      expect(document.title).toBe('zzz');

      TestBed.tick();

      expect(document.title).toBe('About Us — Test');
    });
  });

  describe('a language switch on a default route', () => {
    it('applies nothing while the new strings are not ready, then the new language once they are', async () => {
      await go('/en/about');
      expect(attr(CANONICAL, 'href')).toBe(`${SITE_ORIGIN}/en/about`);

      // Mirrors LocaleStore.switchTo: the language flips first, then the router navigates.
      active.set('ur');
      ready.set(false);
      TestBed.inject(TranslocoService).setActiveLang('ur');
      await go('/ur/about');

      expect(attr(CANONICAL, 'href')).toBe(`${SITE_ORIGIN}/en/about`);
      expect(attr(DESCRIPTION, 'content')).toBe('About description');
      expect(attr(OG_LOCALE, 'content')).toBe('en_PK');
      expect(document.title).toBe('About Us — Test');
      expect(attr('meta[property="og:title"]', 'content')).toBe('About Us — Test');

      TestBed.inject(TranslocoService).setTranslation(
        {
          seo: {
            defaultTitle: 'Urdu title',
            defaultDescription: 'Urdu default',
            pageTitle: '{{page}} — Urdu test',
          },
          pages: { about: 'Urdu about description' },
          labels: { about: 'Urdu about' },
        },
        'ur',
      );
      ready.set(true);
      TestBed.tick();

      expect(document.title).toBe('Urdu about — Urdu test');
      expect(attr('meta[property="og:title"]', 'content')).toBe('Urdu about — Urdu test');
      expect(attr('meta[name="twitter:title"]', 'content')).toBe('Urdu about — Urdu test');
      expect(all(CANONICAL)).toHaveLength(1);
      expect(attr(CANONICAL, 'href')).toBe(`${SITE_ORIGIN}/ur/about`);
      expect(attr(OG_URL, 'content')).toBe(`${SITE_ORIGIN}/ur/about`);
      expect(attr(OG_LOCALE, 'content')).toBe('ur_PK');
      expect(attr(DESCRIPTION, 'content')).toBe('Urdu about description');
      expect(all(OG_LOCALE)).toHaveLength(1);
    });
  });
});
