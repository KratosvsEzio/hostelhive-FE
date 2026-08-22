import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser, DecimalPipe } from '@angular/common';
import { SITE_ORIGIN, Seo } from '@core/seo';
import { Router, RouterLink } from '@angular/router';
import { searchRouteFor } from '@util/location-slug';
import { LocaleLink } from '@core/i18n/locale-link';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith } from 'rxjs';
import { HOST_ROLES, SessionStore } from '@core/auth';
import { Listing } from '@hostelhive/data-access';
import { Skeleton, Container } from '@hostelhive/ui';
import { ListingsApi } from '@services';
import { PlaceResult, PlaceSearchField } from '@hostelhive/maps';
import { PakistanMap } from './pakistan-map/pakistan-map';
import { ListingCard } from '../search/listing-card/listing-card';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Container, TranslocoPipe, RouterLink, LocaleLink, Skeleton, PlaceSearchField, PakistanMap, ListingCard],
  templateUrl: './home.html',
})
export class Home {
  private readonly router = inject(Router);
  private readonly session = inject(SessionStore);
  private readonly listingsApi = inject(ListingsApi);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly seo = inject(Seo);

  constructor() {
    // This route is prerendered, so these land in the static HTML.
    this.seo.apply({
      title: 'HostelHive — Find verified hostels, PGs & co-living in Pakistan',
      description:
        'Search verified hostels, PGs and co-living across Pakistan. Filter by city, budget, gender and room sharing — no brokers, no surprises.',
      path: '/',
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

  // Existing hosts (host/manager/warden) go straight to their dashboard; everyone
  // else starts the become-a-host onboarding wizard.
  private readonly isHost = computed(() => this.session.hasRole(...HOST_ROLES));
  protected readonly hostLink = computed(() =>
    this.isHost() ? '/host' : '/host/listings/new',
  );
  protected readonly hostCta = computed(() =>
    this.isHost() ? 'Go to your dashboard' : 'Start hosting',
  );

  protected readonly place = signal('');
  private readonly lat = signal<number | null>(null);
  private readonly lng = signal<number | null>(null);

  protected onText(text: string): void {
    this.place.set(text);
    this.lat.set(null);
    this.lng.set(null);
  }

  protected onSelected(r: PlaceResult): void {
    this.place.set(r.label);
    this.lat.set(r.lat);
    this.lng.set(r.lng);
    this.search();
  }

  protected search(): void {
    const hasGeo = this.lat() !== null && this.lng() !== null;
    this.router.navigate(searchRouteFor(this.place()), {
      queryParams: {
        place: this.place() || null,
        city: hasGeo ? null : this.place() || null,
        lat: hasGeo ? this.lat() : null,
        lng: hasGeo ? this.lng() : null,
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
      stays: '1,240',
      img: '/cities/karachi.jpg',
      lat: 24.8607,
      lng: 67.0011,
    },
    {
      name: 'Lahore',
      slug: 'lahore',
      stays: '980',
      img: '/cities/lahore.jpg',
      lat: 31.5204,
      lng: 74.3587,
    },
    {
      name: 'Islamabad',
      slug: 'islamabad',
      stays: '610',
      img: '/cities/islamabad.jpg',
      lat: 33.6844,
      lng: 73.0479,
    },
    {
      name: 'Rawalpindi',
      slug: 'rawalpindi',
      stays: '430',
      img: '/cities/rawalpindi.jpg',
      lat: 33.5651,
      lng: 73.0169,
    },
    {
      name: 'Faisalabad',
      slug: 'faisalabad',
      stays: '320',
      img: '/cities/faisalabad.jpg',
      lat: 31.4504,
      lng: 73.135,
    },
    {
      name: 'Peshawar',
      slug: 'peshawar',
      stays: '210',
      img: '/cities/peshawar.jpg',
      lat: 34.0151,
      lng: 71.5249,
    },
    {
      name: 'Multan',
      slug: 'multan',
      stays: '180',
      img: '/cities/multan.jpg',
      lat: 30.1575,
      lng: 71.5249,
    },
    {
      name: 'Quetta',
      slug: 'quetta',
      stays: '95',
      img: '/cities/quetta.jpg',
      lat: 30.1798,
      lng: 66.975,
    },
    {
      name: 'Hyderabad',
      slug: 'hyderabad',
      stays: '140',
      img: '/cities/hyderabad.jpg',
      lat: 25.396,
      lng: 68.3578,
    },
    {
      name: 'Sialkot',
      slug: 'sialkot',
      stays: '110',
      img: '/cities/sialkot.jpg',
      lat: 32.4945,
      lng: 74.5229,
    },
  ];

  /** Doubled list so the running honeycomb carousel loops seamlessly at translateX(-50%). */
  protected readonly marqueeCities = [...this.cities, ...this.cities];

  protected readonly features = [
    {
      icon: 'ti-rosette-discount-check',
      title: 'Every listing verified',
      desc: 'Each hostel is checked and approved before it goes live — what you see is real.',
    },
    {
      icon: 'ti-filter',
      title: 'Filter that fits you',
      desc: 'Narrow by budget, gender, room sharing and amenities to find your exact match.',
    },
    {
      icon: 'ti-phone-check',
      title: 'Direct verified contacts',
      desc: 'Unlock real phone numbers and reach hosts directly — no middlemen, no markup.',
    },
    {
      icon: 'ti-shield-check',
      title: 'Safe & transparent',
      desc: 'Clear pricing, honest photos and reviews from people who actually stayed.',
    },
  ];

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

  protected readonly hostPerks = [
    { i: 'ti-users', t: 'Thousands of verified seekers' },
    { i: 'ti-device-mobile', t: 'Rooms, tenants & billing in one app' },
    { i: 'ti-chart-line', t: 'Insights that fill beds faster' },
  ];
}
