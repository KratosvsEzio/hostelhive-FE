import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  PLATFORM_ID,
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
import { PakistanMap } from './pakistan-map/pakistan-map';
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
    PakistanMap,
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
})
export class Home {
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
      description:
        'Verified hostel, PG and co-living marketplace for students and professionals in Pakistan.',
      areaServed: { '@type': 'Country', name: 'Pakistan' },
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

  protected readonly cities = [
    {
      name: 'Karachi',
      slug: 'karachi',
      img: '/cities/karachi.jpg',
      lat: 24.8607,
      lng: 67.0011,
    },
    {
      name: 'Lahore',
      slug: 'lahore',
      img: '/cities/lahore.jpg',
      lat: 31.5204,
      lng: 74.3587,
    },
    {
      name: 'Islamabad',
      slug: 'islamabad',
      img: '/cities/islamabad.jpg',
      lat: 33.6844,
      lng: 73.0479,
    },
    {
      name: 'Rawalpindi',
      slug: 'rawalpindi',
      img: '/cities/rawalpindi.jpg',
      lat: 33.5651,
      lng: 73.0169,
    },
    {
      name: 'Faisalabad',
      slug: 'faisalabad',
      img: '/cities/faisalabad.jpg',
      lat: 31.4504,
      lng: 73.135,
    },
    {
      name: 'Peshawar',
      slug: 'peshawar',
      img: '/cities/peshawar.jpg',
      lat: 34.0151,
      lng: 71.5249,
    },
    {
      name: 'Multan',
      slug: 'multan',
      img: '/cities/multan.jpg',
      lat: 30.1575,
      lng: 71.5249,
    },
    {
      name: 'Quetta',
      slug: 'quetta',
      img: '/cities/quetta.jpg',
      lat: 30.1798,
      lng: 66.975,
    },
    {
      name: 'Hyderabad',
      slug: 'hyderabad',
      img: '/cities/hyderabad.jpg',
      lat: 25.396,
      lng: 68.3578,
    },
    {
      name: 'Sialkot',
      slug: 'sialkot',
      img: '/cities/sialkot.jpg',
      lat: 32.4945,
      lng: 74.5229,
    },
  ];

  /** Provinces listed beside the map; picking one drills the map into it. */
  protected readonly provinces = [
    { name: 'Punjab', cities: 'Lahore · Rawalpindi · Faisalabad · Multan · Sialkot' },
    { name: 'Sindh', cities: 'Karachi · Hyderabad' },
    { name: 'Islamabad Capital Territory', cities: 'Islamabad' },
    { name: 'Khyber Pakhtunkhwa', cities: 'Peshawar' },
    { name: 'Balochistan', cities: 'Quetta' },
  ];

  /** The map arrives with `@defer`, so it is absent until the section scrolls into view. */
  private readonly map = viewChild(PakistanMap);
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
