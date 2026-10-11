import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LocaleStore } from '@core/i18n/locale-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { Seo } from '@core/seo';
import { Blog } from './blog';

/** Every tag Seo writes into the head. */
const SEO_TAGS =
  'link[rel="canonical"], link[rel="alternate"][hreflang], meta[name="robots"], meta[property^="og:"], meta[name^="twitter:"], [data-seo]';

const BLOG = 'script[data-seo="blog"]';
const ORGANIZATION = 'script[data-seo="organization"]';

function count(selector: string): number {
  return document.head.querySelectorAll(selector).length;
}

describe('Blog structured data', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Blog],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        // The real Seo only reads the active language from the store.
        {
          provide: LocaleStore,
          useValue: { ready: signal(true), active: signal('en') },
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

  it('canonicalises to the blog index while it lives', () => {
    const fixture = TestBed.createComponent(Blog);
    fixture.detectChanges();

    const canonical = document.head.querySelectorAll('link[rel="canonical"]');
    expect(canonical).toHaveLength(1);
    expect(canonical[0].getAttribute('href')).toBe('https://hostelhive.com/en/blog');
  });
});
