import { Type, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LocaleStore } from '@core/i18n/locale-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { PrivacyPolicy } from './privacy-policy';
import { ServicePolicy } from './service-policy';
import { TermsOfService } from './terms-of-service';

/**
 * The legal text is English on every prefix, inside a page whose header, footer and back link
 * follow the visitor. The `lang`/`dir` wrapper is what tells a screen reader, and the layout,
 * which of the two a given element belongs to.
 */
const PAGES: [string, Type<unknown>, string[]][] = [
  ['PrivacyPolicy', PrivacyPolicy, ['/ur']],
  [
    'TermsOfService',
    TermsOfService,
    ['/ur', '/ur/service-policy', '/ur/privacy-policy', '/ur/privacy-policy', '/ur/service-policy'],
  ],
  [
    'ServicePolicy',
    ServicePolicy,
    ['/ur', '/ur/terms-of-service', '/ur/privacy-policy', '/ur/terms-of-service', '/ur/faqs'],
  ],
];

function render(page: Type<unknown>): HTMLElement {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      { provide: LocaleStore, useValue: { active: signal('ur') } },
    ],
  });
  const fixture = TestBed.createComponent(page);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe.each(PAGES)('%s', (_name, page, links) => {
  it('wraps the heading, the effective date and every section in one English, left-to-right block', () => {
    const el = render(page);
    const wrappers = el.querySelectorAll('[lang]');

    expect(wrappers).toHaveLength(1);
    const content = wrappers[0];
    expect(content.getAttribute('lang')).toBe('en');
    expect(content.getAttribute('dir')).toBe('ltr');
    expect(el.querySelectorAll('h1')).toHaveLength(1);
    expect(content.contains(el.querySelector('h1'))).toBe(true);
    expect(content.textContent).toContain('Effective date');
    const sections = Array.from(el.querySelectorAll('h2'));
    expect(sections.length).toBeGreaterThan(0);
    expect(sections.every((h) => content.contains(h))).toBe(true);
  });

  it('keeps the translated back link outside the English block', () => {
    const el = render(page);
    const back = el.querySelector('a');
    const content = el.querySelector('[lang="en"]');

    expect(back?.textContent?.trim()).toBe('common.backToHome');
    expect(content?.contains(back)).toBe(false);
    expect(back?.querySelector('i')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps every internal link in the visitor language', () => {
    const el = render(page);
    const internal = Array.from(el.querySelectorAll('a[href^="/"]')).map((a) =>
      a.getAttribute('href'),
    );

    expect(internal).toEqual(links);
  });
});
