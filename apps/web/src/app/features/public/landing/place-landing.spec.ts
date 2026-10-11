import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { LocaleStore } from '@core/i18n/locale-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { Seo } from '@core/seo';
import { SearchMap } from '@features/public/search/search-map/search-map';
import { PlaceLanding } from './place-landing';

@Component({ selector: 'hh-search-map', template: '' })
class StubSearchMap {
  readonly seed = input<unknown>(null);
  readonly genderRoutes = input<unknown>(null);
}

const BREADCRUMB = 'script[data-seo="place-breadcrumb"]';
const FAQ = 'script[data-seo="place-faq"]';

/** `beforeCreate` runs against the real Seo before the page exists, to seed other pages' blocks. */
function mount(params: Record<string, string>, beforeCreate?: (seo: Seo) => void) {
  TestBed.configureTestingModule({
    imports: [PlaceLanding],
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap(params)) } },
      // The real Seo only reads the active language from the store.
      { provide: LocaleStore, useValue: { ready: signal(true), active: signal('en') } },
    ],
  }).overrideComponent(PlaceLanding, {
    remove: { imports: [SearchMap] },
    add: { imports: [StubSearchMap] },
  });
  beforeCreate?.(TestBed.inject(Seo));
  const fixture = TestBed.createComponent(PlaceLanding);
  fixture.detectChanges();
  return fixture;
}

function head(selector: string): NodeListOf<Element> {
  return document.head.querySelectorAll(selector);
}

describe('PlaceLanding structured data', () => {
  afterEach(() => {
    document.head.querySelectorAll('script[data-seo]').forEach((el) => el.remove());
  });

  it('writes one breadcrumb and one FAQ block for a known place, and removes both on destroy', () => {
    const fixture = mount({ place: 'lahore' });

    expect(head(BREADCRUMB)).toHaveLength(1);
    expect(head(FAQ)).toHaveLength(1);

    fixture.destroy();

    expect(head(BREADCRUMB)).toHaveLength(0);
    expect(head(FAQ)).toHaveLength(0);
  });

  it('leaves structured data written by other pages in place when it is destroyed', () => {
    const fixture = mount({ place: 'lahore' }, (seo) => {
      seo.setJsonLd('organization', { '@type': 'Organization' });
      seo.setJsonLd('website', { '@type': 'WebSite' });
    });
    expect(head(BREADCRUMB)).toHaveLength(1);

    fixture.destroy();

    expect(head('script[data-seo="organization"]')).toHaveLength(1);
    expect(head('script[data-seo="website"]')).toHaveLength(1);
    expect(head(BREADCRUMB)).toHaveLength(0);
  });

  it('writes no place blocks for an unknown place', () => {
    const fixture = mount({ place: 'nowhere' });

    expect(head(BREADCRUMB)).toHaveLength(0);
    expect(head(FAQ)).toHaveLength(0);

    fixture.destroy();

    expect(head(BREADCRUMB)).toHaveLength(0);
    expect(head(FAQ)).toHaveLength(0);
  });
});
