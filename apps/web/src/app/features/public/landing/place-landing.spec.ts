import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  ParamMap,
  Router,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { BehaviorSubject } from 'rxjs';
import { LocaleTree, at, loadLocale } from '@core/i18n/locale-files-testing';
import { LocaleStore } from '@core/i18n/locale-store';
import { localeAlternates } from '@core/i18n/locales';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { Seo } from '@core/seo';
import { assetUrlsIn, pageAddressesIn } from '@core/seo-testing';
import { placeSocialImage } from '@core/social-image';
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

const FAR = { ne_lat: '20', ne_lng: '100', sw_lat: '10', sw_lng: '90' };
const FRAMING = { ne_lat: '31.75', ne_lng: '74.70', sw_lat: '31.30', sw_lng: '74.00' };

/** The page's route, with `query` readable from every place a page could look for it. */
function routeStub(query: Record<string, string>) {
  const queryParamMap = convertToParamMap(query);
  return {
    paramMap: params$.asObservable(),
    queryParamMap: new BehaviorSubject(queryParamMap),
    queryParams: new BehaviorSubject(query),
    snapshot: { paramMap: params$.value, queryParamMap, queryParams: query },
  };
}

function configure(params: Record<string, string>, query: Record<string, string>, lang: string) {
  params$ = new BehaviorSubject(convertToParamMap(params));
  active.set(lang);
  TestBed.configureTestingModule({
    imports: [PlaceLanding],
    providers: [
      // Matches any address, so a test can put the router on the one it stands in for.
      provideRouter([{ path: '**', children: [] }]),
      provideI18nTesting(),
      { provide: ActivatedRoute, useValue: routeStub(query) },
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
}

/** `beforeCreate` runs against the real Seo before the page exists, to seed other pages' blocks. */
function mount(
  params: Record<string, string>,
  beforeCreate?: (seo: Seo) => void,
  lang = 'en',
) {
  configure(params, {}, lang);
  beforeCreate?.(TestBed.inject(Seo));
  const fixture = TestBed.createComponent(PlaceLanding);
  fixture.detectChanges();
  return fixture;
}

/**
 * Mounts the English page as a link carrying `query` opens it. The stubbed route and the real
 * router both hold the keys, so a page reading its address from either would see them. Async
 * because the router has to land on the address before the page exists.
 */
async function mountWithQuery(params: Record<string, string>, query: Record<string, string>) {
  configure(params, query, 'en');
  const segments = ['en', 'hostels', params['place'], params['gender']].filter(Boolean);
  await TestBed.inject(Router).navigateByUrl(
    `/${segments.join('/')}?${new URLSearchParams(query).toString()}`,
  );
  const fixture = TestBed.createComponent(PlaceLanding);
  fixture.detectChanges();
  return fixture;
}

function head(selector: string): NodeListOf<Element> {
  return document.head.querySelectorAll(selector);
}

const values = (selector: string, attribute: string): (string | null)[] =>
  Array.from(head(selector), (el) => el.getAttribute(attribute));

/** Everything the page writes into the head that a crawler or a share card reads. */
function headState() {
  return {
    title: document.title,
    description: values('meta[name="description"]', 'content'),
    robots: values('meta[name="robots"]', 'content'),
    canonical: values('link[rel="canonical"]', 'href'),
    ogUrl: values('meta[property="og:url"]', 'content'),
    ogTitle: values('meta[property="og:title"]', 'content'),
    ogImage: values('meta[property="og:image"]', 'content'),
    twitterImage: values('meta[name="twitter:image"]', 'content'),
    alternates: Array.from(
      head('link[rel="alternate"][data-seo="hreflang"]'),
      (el) => `${el.getAttribute('hreflang')} ${el.getAttribute('href')}`,
    ),
    breadcrumb: Array.from(head(BREADCRUMB), (el) => el.textContent),
    faq: Array.from(head(FAQ), (el) => el.textContent),
  };
}

/** Removes everything a page wrote to the head, the description and title included. */
function clearHead(): void {
  document.head
    .querySelectorAll(`${SEO_TAGS}, meta[name="description"]`)
    .forEach((el) => el.remove());
  document.title = '';
}

/** The head of the same page opened with no query, read from a mount that is then torn down. */
function cleanHeadOf(params: Record<string, string>) {
  const fixture = mount(params);
  const state = headState();
  fixture.destroy();
  TestBed.resetTestingModule();
  clearHead();
  return state;
}

/** What an indexable place page writes: its own address, and the same page in every language. */
function expectIndexablePage(path: string, place: string): void {
  const own = `${SITE}/en${path}`;
  const alternates = localeAlternates(path).map((a) => `${a.hreflang} ${SITE}${a.path}`);
  const state = headState();

  expect(state.robots).toEqual(['index, follow, max-image-preview:large']);
  expect(state.canonical).toEqual([own]);
  expect(state.ogUrl).toEqual([own]);
  expect(alternates.length).toBeGreaterThan(1);
  expect(state.alternates).toEqual(alternates);
  expect(state.ogImage).toEqual([placeSocialImage(place)]);
  expect(state.twitterImage).toEqual([placeSocialImage(place)]);
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

afterEach(clearHead);

describe('PlaceLanding head', () => {
  it('claims a link with no viewport as its own indexable page, in every language', () => {
    mount({ place: 'lahore' });

    expectIndexablePage('/hostels/lahore', 'lahore');
  });

  it.each([
    ['a city link carrying a far viewport', { place: 'lahore' }, '/hostels/lahore', FAR],
    ['a city link carrying a framing viewport', { place: 'lahore' }, '/hostels/lahore', FRAMING],
    [
      'a gender link carrying a far viewport',
      { place: 'lahore', gender: 'girls' },
      '/hostels/lahore/girls',
      FAR,
    ],
    [
      'a campus link carrying a far viewport',
      { place: 'lahore', gender: 'punjab-university' },
      '/hostels/lahore/punjab-university',
      FAR,
    ],
  ] as const)('keeps the clean page head for %s', async (_, params, path, query) => {
    const clean = cleanHeadOf(params);

    await mountWithQuery(params, query);

    // The keys really are on offer to the page, from the route and from the router.
    const route = TestBed.inject(ActivatedRoute);
    expect(route.snapshot.queryParamMap.get('ne_lat')).toBe(query.ne_lat);
    expect(TestBed.inject(Router).url).toContain(`ne_lat=${query.ne_lat}`);

    expect(headState()).toEqual(clean);
    expectIndexablePage(path, params.place);
  });

  it('keeps the breadcrumb and FAQ blocks for a place link carrying a viewport', async () => {
    await mountWithQuery({ place: 'lahore' }, FAR);

    expect(head(BREADCRUMB)).toHaveLength(1);
    expect(head(FAQ)).toHaveLength(1);
  });
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

/**
 * The trail on the page, as `[name, linked]` per step. A visitor and Google should read the same
 * trail, so on every page it names the same steps as the structured data (Trello #209).
 */
describe('PlaceLanding visible breadcrumb', () => {
  function visibleTrail(fixture: { nativeElement: HTMLElement }): [string, boolean][] {
    const nav = fixture.nativeElement.querySelector('nav[aria-label]');
    return Array.from(nav?.querySelectorAll(':scope > a, :scope > span') ?? [], (el) => [
      (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
      el.tagName === 'A',
    ]);
  }

  it.each(['en', 'ur', 'ar'])(
    'ends a %s campus page on "Hostels near <campus>", with the city linked',
    (code) => {
      const fixture = mount({ place: 'lahore', gender: 'punjab-university' }, undefined, code);
      fixture.detectChanges();

      expect(visibleTrail(fixture)).toEqual([
        [text(code, 'publicLanding.home'), true],
        [text(code, 'publicLanding.hostelsIn', { place: 'Lahore' }), true],
        [text(code, 'seo.headingNearCampus', { campus: 'Punjab University' }), false],
      ]);
    },
  );

  it.each([
    ['a city page', { place: 'lahore' }],
    ['a gender page', { place: 'lahore', gender: 'girls' }],
    ['a campus page', { place: 'lahore', gender: 'punjab-university' }],
  ])('names the same steps as the structured data on %s', (_name, params) => {
    const fixture = mount(params);
    fixture.detectChanges();

    expect(visibleTrail(fixture).map(([name]) => name)).toEqual(trail().map(([, name]) => name));
  });

  it('keeps the city page as the current, unlinked last step on a city page', () => {
    const fixture = mount({ place: 'lahore' });
    fixture.detectChanges();

    expect(visibleTrail(fixture)).toEqual([
      ['Home', true],
      ['Hostels in Lahore', false],
    ]);
  });
});
