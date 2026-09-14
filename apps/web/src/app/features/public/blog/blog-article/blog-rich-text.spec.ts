import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LocaleStore } from '@core/i18n/locale-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { BlogText } from '../blog-post.model';
import { BlogRichText } from './blog-rich-text';

/**
 * These assertions are about the rendered element, not the data behind it.
 *
 * The data was already covered — `blog-posts.spec.ts` checks that every link span points at a
 * path inside this app. That test passed while every in-prose link on `/ur` rendered
 * `href="/search"`, because `LocaleLink` is `selector: 'a[routerLink]'` and therefore only
 * applies inside components that import it, and this component did not. The click still
 * worked (the router redirects a bare path to its prefixed twin), so nothing looked broken —
 * but a crawler, a middle-click and copy-link-address all took the English URL off an Urdu
 * page, which is the exact failure `LocaleLink` exists to prevent.
 *
 * A span is only correct once it has been rendered in a locale, so that is what is tested.
 */
@Component({
  imports: [BlogRichText],
  template: `<p><app-blog-prose [value]="value()" /></p>`,
})
class Host {
  readonly value = signal<BlogText>('');
}

function render(value: BlogText, locale = 'en') {
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [provideRouter([]), provideI18nTesting()],
  });
  // `apply` rather than writing the signal: it is the store's own entry point and it sets
  // direction alongside the code, which is the state a link is actually rendered in.
  TestBed.inject(LocaleStore).apply(locale);

  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.value.set(value);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('prose spans', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders a plain sentence as text and nothing else', () => {
    const el = render('Ask three students what they pay.');
    expect(el.textContent?.trim()).toBe('Ask three students what they pay.');
    expect(el.querySelectorAll('a, strong')).toHaveLength(0);
  });

  it('marks a defining term without breaking the sentence around it', () => {
    const el = render([{ b: 'Occupancy.' }, ' A bed in a 6-seater.']);
    expect(el.querySelector('strong')?.textContent).toBe('Occupancy.');
    expect(el.textContent).toBe('Occupancy. A bed in a 6-seater.');
  });

  it('keeps an in-prose link inside the active language', () => {
    const el = render(['See ', { to: '/search', text: 'the listings' }, ' first.'], 'ur');
    const link = el.querySelector('a');
    expect(link?.textContent).toBe('the listings');
    expect(link?.getAttribute('href')).toBe('/ur/search');
  });

  it('carries the prefix in English too, because the URL is the truth', () => {
    const el = render([{ to: '/search', text: 'Browse' }], 'en');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/en/search');
  });

  it('does not let a span put markup on the page', () => {
    // The union is closed, so the only way markup could appear is if a value were ever
    // rendered as HTML rather than as text. It is not, and this says so out loud.
    const el = render(['<img src=x onerror=alert(1)>']);
    expect(el.querySelectorAll('img')).toHaveLength(0);
    expect(el.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
