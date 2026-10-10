import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SITE_ORIGIN, Seo } from '@core/seo';
import { DEFAULT_SOCIAL_IMAGE } from '@core/social-image';
import { RouterLink } from '@angular/router';
import { LocaleLink } from '@core/i18n/locale-link';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith } from 'rxjs';
import { Listing } from '@hostelhive/data-access';
import { Skeleton, Container } from '@hostelhive/ui';
import { ListingsApi } from '@services';
import { CountryMap } from './country-map/country-map';
import { HomeCountry } from './home-country';
import { sameRegionName } from './country-locations';
import { ListingCard } from '../search/listing-card/listing-card';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { LocaleStore } from '@core/i18n/locale-store';
import { Mascot } from '@app/shared/mascot/mascot';
import { SearchBar } from '@layout/components/search-bar/search-bar';
import { HeroClouds } from './hero-clouds/hero-clouds';
import { HomeWhy } from './home-why/home-why';
import { HomeCities } from './home-cities/home-cities';
import { HomeHosts } from './home-hosts/home-hosts';
import { useSmoothScroll } from './smooth-scroll';

/** How many of a region's cities are named under it in the list beside the map. */
const REGION_CITY_COUNT = 5;

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Unencapsulated so the frosted look reaches the listing cards and the map inside this page;
  // every class in home.scss is `hl-` prefixed, so nothing leaks past it.
  encapsulation: ViewEncapsulation.None,
  imports: [
    Container,
    TranslocoPipe,
    RouterLink,
    LocaleLink,
    Skeleton,
    CountryMap,
    ListingCard,
    Mascot,
    SearchBar,
    HeroClouds,
    HomeWhy,
    HomeCities,
    HomeHosts,
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  providers: [HomeCountry],
})
export class Home {
  protected readonly country = inject(HomeCountry);
  private readonly listingsApi = inject(ListingsApi);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly seo = inject(Seo);
  private readonly i18n = inject(TranslocoService);
  private readonly locale = inject(LocaleStore);

  constructor() {
    useSmoothScroll();

    // This route is prerendered, so these land in the static HTML.
    //
    // An effect rather than a plain call: the copy is translated now, and `translate`
    // answers from whatever Transloco has loaded at the moment it is asked. Reading
    // `ready()` both waits for the strings and re-runs this when the language changes.
    effect(() => {
      if (!this.locale.ready()) return;
      this.seo.apply({
        title: this.i18n.translate('seo.homeTitle'),
        description: this.i18n.translate('seo.defaultDescription'),
        path: '/',
        image: DEFAULT_SOCIAL_IMAGE,
      });
    });

    // Organization is what a search engine reads to build the brand panel and to
    // associate the name with this domain.
    this.seo.setJsonLd('organization', {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'HostelHive',
      url: SITE_ORIGIN,
      logo: `${SITE_ORIGIN}/hostelhive-logo.png`,
      // No `areaServed`: the home page serves whichever country the visitor is in, and one
      // fixed country here would tell search engines the brand is local to it.
      description:
        'Verified hostel, PG and co-living marketplace for students and professionals.',
    });

    // WebSite + SearchAction is the markup behind a sitelinks search box — it lets
    // results for the brand carry a search field that queries this site directly.
    this.seo.setJsonLd('website', {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'HostelHive',
      url: SITE_ORIGIN,
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${SITE_ORIGIN}/search?place={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    });
  }


  protected readonly stats = [
    // Keys, not copy: these are data rather than template text, so the extractor never
    // saw them and the template translates them at render.
    { n: '10,000+', l: 'home.statVerifiedBeds' },
    { n: '25', l: 'home.statCities' },
    { n: '4.8/5', l: 'home.statSeekerRating' },
  ];

  private readonly featuredState = toSignal(
    this.isBrowser
      ? this.listingsApi.featured().pipe(
          map((items) => ({ loading: false, items: items.slice(0, 4) })),
          startWith({ loading: true, items: [] as Listing[] }),
          catchError(() => of({ loading: false, items: [] as Listing[] })),
        )
      : of({ loading: true, items: [] as Listing[] }),
    { initialValue: { loading: true, items: [] as Listing[] } },
  );

  protected readonly featuredLoading = computed(() => this.featuredState().loading);
  protected readonly featured = computed(() => this.featuredState().items);

  /** The province list beside the map: a region's busiest cities, and whether the map is on it. */
  protected readonly regionRows = computed(() => {
    const onMap = this.mapProvince();
    return this.country.regions().map((r) => ({
      name: r.name,
      slug: r.slug,
      cities: r.cities
        .slice(0, REGION_CITY_COUNT)
        .map((c) => c.name)
        .join(' · '),
      active: sameRegionName(onMap, r.name),
    }));
  });

  /**
   * The country the map is drawn for, as a one-item list so the template can key on it.
   *
   * The map reads its country once, when Leaflet is built; a visitor whose country changes
   * mid-visit (the re-ask after sign-in) gets a fresh map rather than one half-switched.
   */
  protected readonly mapCountry = computed(() => {
    const code = this.country.code();
    return code ? [code] : [];
  });

  private readonly mapFailedFor = signal<string | null>(null);
  /** Set when the map could not be drawn — the section carries on without it. */
  protected readonly mapFailed = computed(() => {
    const failed = this.mapFailedFor();
    return failed !== null && failed === this.country.code();
  });

  protected onMapFailed(): void {
    this.mapFailedFor.set(this.country.code());
  }

  /** The map arrives with `@defer`, so it is absent until the section scrolls into view. */
  private readonly map = viewChild(CountryMap);
  protected readonly mapProvince = computed(() => this.map()?.province() ?? null);

  protected showProvince(name: string): void {
    void this.map()?.showProvince(name);
  }

  protected readonly steps = [
    {
      n: 1,
      icon: 'ti-search',
      title: 'Search & filter',
      desc: 'Pick your city, budget, gender and sharing to surface the right stays.',
    },
    {
      n: 2,
      icon: 'ti-rosette-discount-check',
      title: 'Unlock contacts',
      desc: 'Sign in once to reveal verified phone numbers for every listing.',
    },
    {
      n: 3,
      icon: 'ti-home-check',
      title: 'Move in',
      desc: 'Visit, confirm and secure your bed with total confidence.',
    },
  ];

  protected readonly testimonials = [
    {
      quote:
        'Found a verified girls hostel in Gulberg in a single evening. The photos actually matched — that never happens.',
      name: 'Ayesha K.',
      role: 'Student · Lahore',
      initials: 'AK',
    },
    {
      quote:
        'As a host, HostelHive filled my empty beds in two weeks. Managing tenants and billing from one place is a relief.',
      name: 'Bilal R.',
      role: 'Host · Karachi',
      initials: 'BR',
    },
    {
      quote:
        'No brokers, no fake numbers. I compared sharing options and prices and just called the place I liked.',
      name: 'Hamza S.',
      role: 'Professional · Islamabad',
      initials: 'HS',
    },
  ];
}
