import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LanguageSwitcher } from '@core/i18n/language-switcher';
import { LocaleStore } from '@core/i18n/locale-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { CurrencyPreference } from '@core/preferences/currency-preference';
import { CurrencySelect } from '@app/shared/currency/currency-select';
import { SiteFooter } from './site-footer';

/** A translation key as `provideI18nTesting()` renders it (`group.key`, `common.2026…`), never prose. */
const KEY = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9_]+)+$/;

function render(): HTMLElement {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      { provide: LocaleStore, useValue: { active: signal('ur') } },
      {
        provide: CurrencyPreference,
        useValue: { code: signal('PKR'), set: () => undefined },
      },
    ],
  });
  // The two pickers are covered by their own specs and play no part in the labels.
  TestBed.overrideComponent(SiteFooter, {
    remove: { imports: [LanguageSwitcher, CurrencySelect] },
    add: { schemas: [NO_ERRORS_SCHEMA] },
  });
  const fixture = TestBed.createComponent(SiteFooter);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('SiteFooter', () => {
  it('labels the image credits link with the page title, in the visitor language', () => {
    const link = render().querySelector('a[href="/ur/credits"]');

    expect(link?.textContent?.trim()).toBe('routeTitle.imageCredits');
  });

  it('gives every link a translated name, from its text or, for an icon link, its aria-label', () => {
    const names = Array.from(render().querySelectorAll('a')).map(
      (a) => a.textContent?.trim() || a.getAttribute('aria-label') || '',
    );

    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => !KEY.test(name))).toEqual([]);
  });
});
