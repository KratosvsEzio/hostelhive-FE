import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, ParamMap, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { BehaviorSubject } from 'rxjs';
import { LocaleTree, at, loadLocale } from '@core/i18n/locale-files-testing';
import { LocaleStore } from '@core/i18n/locale-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { Seo } from '@core/seo';
import { assetUrlsIn, pageAddressesIn } from '@core/seo-testing';
import { SearchMap } from '@features/public/search/search-map/search-map';
import { PlaceLanding } from './place-landing';

@Component({ selector: 'hh-search-map', template: '' })
class StubSearchMap {
  readonly seed = input<unknown>(null);
  readonly genderRoutes = input<unknown>(null);
}

const SITE = 'https://hostelhive.com';
const BREADCRUMB = 'script[data-seo="place-breadcrumb"]';
const FAQ = 'script[data-seo="place-faq"]';
const SEO_TAGS =
  'link[rel="canonical"], link[rel="alternate"][hreflang], meta[name="robots"], meta[property^="og:"], meta[name^="twitter:"], script[data-seo]';

const LOCALES: Record<string, LocaleTree> = {
  en: loadLocale('en.json'),
  ur: loadLocale('ur.json'),
  ar: loadLocale('ar.json'),
};

/** A shipped string with its `{{param}}` placeholders filled, the way Transloco fills them. */
function text(code: string, key: string, params: Record<string, string> = {}): string {
  return Object.entries(params).reduce(
    (s, [name, value]) => s.replace(new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'g'), value),
    at(LOCALES[code], key) as string,
  );
}

const ready = signal(true);
const active = signal('en');
let params$: BehaviorSubject<ParamMap>;

/** `beforeCreate` runs against the real Seo before the page exists, to seed other pages' blocks. */
function mount(
  params: Record<string, string>,
  beforeCreate?: (seo: Seo) => void,
  lang = 'en',
) {
  params$ = new BehaviorSubject(convertToParamMap(params));
  active.set(lang);
  TestBed.configureTestingModule({
    imports: [PlaceLanding],
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      { provide: ActivatedRoute, useValue: { paramMap: params$.asObservable() } },
      // The real Seo only reads the active language from the store.
      { provide: LocaleStore, useValue: { ready, active } },
    ],
  }).overrideComponent(PlaceLanding, {
    remove: { imports: [SearchMap] },
    add: { imports: [StubSearchMap] },
  });
  const i18n = TestBed.inject(TranslocoService);
  for (const [code, tree] of Object.entries(LOCALES)) i18n.setTranslation(tree, code);
  i18n.setActiveLang(lang);
  beforeCreate?.(TestBed.inject(Seo));
  const fixture = TestBed.createComponent(PlaceLanding);
  fixture.detectChanges();
  return fixture;
}

function head(selector: string): NodeListOf<Element> {
  return document.head.querySelectorAll(selector);
}

function attr(selector: string, name: string): string | null {
  return document.head.querySelector(selector)?.getAttribute(name) ?? null;
}

function block(selector: string): unknown {
  return JSON.parse(document.head.querySelector(selector)?.textContent ?? 'null');
}

type ListItem = { position: number; name: string; item: string };

/** The breadcrumb as `[position, name, item]` rows. */
function trail(): [number, string, string][] {
  const crumb = block(BREADCRUMB) as { itemListElement: ListItem[] };
  return crumb.itemListElement.map(({ position, name, item }) => [position, name, item]);
}

const canonical = () => attr('link[rel="canonical"]', 'href');
const ogUrl = () => attr('meta[property="og:url"]', 'content');

/** Mirrors LocaleStore.switchTo: the strings are not ready until the new language has loaded. */
function switchTo(code: string): void {
  ready.set(false);
  active.set(code);
  TestBed.inject(TranslocoService).setActiveLang(code);
  TestBed.tick();
}

beforeEach(() => {
  ready.set(true);
  active.set('en');
});

afterEach(() => {
  document.head.querySelectorAll(SEO_TAGS).forEach((el) => el.remove());
});

describe('PlaceLanding structured data', () => {
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

  it('writes no place blocks and stays out of the index for an unknown segment', () => {
    mount({ place: 'lahore', gender: 'nonsense' }, undefined, 'ur');

    expect(head(BREADCRUMB)).toHaveLength(0);
    expect(head(FAQ)).toHaveLength(0);
    expect(attr('meta[name="robots"]', 'content')).toBe('noindex, nofollow');
    expect(canonical()).toBeNull();
  });

  it.each([
    ['a city page', { place: 'lahore' }, { place: 'nowhere' }],
    ['a gender page', { place: 'lahore', gender: 'girls' }, { place: 'nowhere' }],
    ['a gender page', { place: 'lahore', gender: 'girls' }, { place: 'lahore', gender: 'nonsense' }],
  ])('drops both blocks when %s is followed by a page that does not exist', (_label, from, to) => {
    mount(from);
    expect(head(BREADCRUMB)).toHaveLength(1);

    params$.next(convertToParamMap(to));
    TestBed.tick();

    expect(head(BREADCRUMB)).toHaveLength(0);
    expect(head(FAQ)).toHaveLength(0);
  });
});

describe('PlaceLanding breadcrumb addresses and names', () => {
  it('names the English city page by its own prefixed address, with the names it always had', () => {
    mount({ place: 'lahore' });

    expect(trail()).toEqual([
      [1, 'Home', `${SITE}/en`],
      [2, 'Hostels in Lahore', `${SITE}/en/hostels/lahore`],
    ]);
    expect(canonical()).toBe(`${SITE}/en/hostels/lahore`);
    expect(ogUrl()).toBe(canonical());
  });

  it('names the Urdu city page in Urdu, under /ur, ending on its canonical', () => {
    mount({ place: 'lahore' }, undefined, 'ur');

    expect(trail()).toEqual([
      [1, text('ur', 'publicLanding.home'), `${SITE}/ur`],
      [
        2,
        text('ur', 'publicLanding.hostelsIn', { place: 'Lahore' }),
        `${SITE}/ur/hostels/lahore`,
      ],
    ]);
    expect(trail().at(-1)?.[2]).toBe(canonical());
    expect(ogUrl()).toBe(canonical());
  });

  it('ends an Urdu gender page on its canonical, with the city page as the step before', () => {
    mount({ place: 'lahore', gender: 'girls' }, undefined, 'ur');

    const rows = trail();
    expect(rows).toHaveLength(3);
    expect(rows[1][2]).toBe(`${SITE}/ur/hostels/lahore`);
    expect(rows[2]).toEqual([
      3,
      text('ur', 'seo.segmentGirls'),
      `${SITE}/ur/hostels/lahore/girls`,
    ]);
    expect(rows[2][2]).toBe(canonical());
  });

  it('keeps the English gender page names and puts every step under /en', () => {
    mount({ place: 'lahore', gender: 'girls' });

    expect(trail()).toEqual([
      [1, 'Home', `${SITE}/en`],
      [2, 'Hostels in Lahore', `${SITE}/en/hostels/lahore`],
      [3, 'Girls hostels', `${SITE}/en/hostels/lahore/girls`],
    ]);
    expect(canonical()).toBe(`${SITE}/en/hostels/lahore/girls`);
  });

  it('ends an Urdu campus page on its canonical, keeping three steps', () => {
    mount({ place: 'lahore', gender: 'punjab-university' }, undefined, 'ur');

    const rows = trail();
    expect(rows).toHaveLength(3);
    expect(rows[1][2]).toBe(`${SITE}/ur/hostels/lahore`);
    expect(rows[2]).toEqual([
      3,
      text('ur', 'seo.headingNearCampus', { campus: 'Punjab University' }),
      `${SITE}/ur/hostels/lahore/punjab-university`,
    ]);
    expect(rows[2][2]).toBe(canonical());
  });

  it.each(['en', 'ur', 'ar'])('starts the %s trail at the home page of that language', (code) => {
    mount({ place: 'lahore' }, undefined, code);

    const [first] = trail();
    expect(first[2]).toBe(TestBed.inject(Seo).pageUrl('/'));
    expect(first[2]).toBe(`${SITE}/${code}`);
  });

  it.each(['ur', 'ar'])('names every step in %s, never in English', (code) => {
    mount({ place: 'lahore', gender: 'girls' }, undefined, code);

    const expected = [
      ['publicLanding.home', {}],
      ['publicLanding.hostelsIn', { place: 'Lahore' }],
      ['seo.segmentGirls', {}],
    ] as const;
    const names = trail().map(([, name]) => name);

    expect(names).toEqual(expected.map(([key, params]) => text(code, key, params)));
    expected.forEach(([key, params], i) => {
      expect(names[i]).not.toBe(text('en', key, params));
    });
  });

  it('follows a language switch, holding the old trail until the new strings are ready', () => {
    mount({ place: 'lahore', gender: 'girls' });
    const english = trail();

    switchTo('ur');

    expect(trail()).toEqual(english);
    expect(head(BREADCRUMB)).toHaveLength(1);

    ready.set(true);
    TestBed.tick();

    expect(trail()).toEqual([
      [1, text('ur', 'publicLanding.home'), `${SITE}/ur`],
      [
        2,
        text('ur', 'publicLanding.hostelsIn', { place: 'Lahore' }),
        `${SITE}/ur/hostels/lahore`,
      ],
      [3, text('ur', 'seo.segmentGirls'), `${SITE}/ur/hostels/lahore/girls`],
    ]);
    expect(trail().at(-1)?.[2]).toBe(canonical());
    expect(head(BREADCRUMB)).toHaveLength(1);

    switchTo('en');
    ready.set(true);
    TestBed.tick();

    expect(trail()).toEqual(english);
    expect(head(BREADCRUMB)).toHaveLength(1);
  });

  it('follows a switch to a language whose strings are already loaded, with ready() never changing', () => {
    mount({ place: 'lahore', gender: 'girls' });
    // A switch back to a loaded language leaves ready() true, so only the language itself can re-run the head.
    active.set('ur');
    TestBed.inject(TranslocoService).setActiveLang('ur');
    TestBed.tick();

    expect(trail().map(([, , item]) => item)).toEqual([
      `${SITE}/ur`,
      `${SITE}/ur/hostels/lahore`,
      `${SITE}/ur/hostels/lahore/girls`,
    ]);
    expect(trail()[0][1]).toBe(text('ur', 'publicLanding.home'));
    expect(head(BREADCRUMB)).toHaveLength(1);
  });

  it.each([
    ['city', { place: 'lahore' }],
    ['gender', { place: 'lahore', gender: 'girls' }],
    ['campus', { place: 'lahore', gender: 'punjab-university' }],
  ])('names no page address on the %s page other than its prefixed trail', (_label, params) => {
    mount(params, undefined, 'ur');

    const blocks = [block(BREADCRUMB), block(FAQ)];
    const pages = pageAddressesIn(blocks);

    expect([...pages].sort()).toEqual(trail().map(([, , item]) => item).sort());
    for (const url of pages) expect(url).toMatch(/^https:\/\/hostelhive\.com\/ur(\/|$)/);
    expect(assetUrlsIn(blocks)).toEqual([]);
  });
});
