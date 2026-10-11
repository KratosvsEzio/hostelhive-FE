import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
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

/** The route's params are a subject, so a test can move the same component to another slug. */
function mount(slug: string) {
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
        useValue: { ready: signal(true), active: signal('en') },
      },
    ],
  });
  const fixture = TestBed.createComponent(BlogArticle);
  fixture.detectChanges();
  return { fixture, params };
}

describe('BlogArticle head', () => {
  afterEach(() => {
    document.head.querySelectorAll(SEO_TAGS).forEach((el) => el.remove());
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
