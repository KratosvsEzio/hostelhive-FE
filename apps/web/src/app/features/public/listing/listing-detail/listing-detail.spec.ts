import { RESPONSE_INIT, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject, of, throwError } from 'rxjs';
import { SessionStore } from '@core/auth';
import { LocaleStore } from '@core/i18n/locale-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { GoogleAnalyticsService } from '@core/google-analytics/google-analytics.service';
import { MobileApp } from '@core/mobile-app';
import { RouteHeadStrategy } from '@core/route-head';
import { Seo } from '@core/seo';
import { pageAddressesIn } from '@core/seo-testing';
import { HostelsApi, ListingDetailApi } from '@services';
import { ListingDetail as ListingDetailModel } from '@services/listing-detail.fixture';
import { StudentApi } from '@services/student-api';
import { FavoritesStore } from '@util/favorites-store';
import { By } from '@angular/platform-browser';
import { BookingApi } from '../booking/booking-api';
import { RoomPicker } from '../booking/room-picker';
import { LISTING_ROUTES } from '../listing.routes';
import { ListingDetail } from './listing-detail';

const SEO_TAGS =
  'link[rel="canonical"], link[data-seo], script[data-seo], meta[property^="og:"], meta[name^="twitter:"], meta[name="robots"], meta[name="description"]';

// The test loader echoes keys, so each head reads as the key that produced it.
const LOADING_TITLE = 'seo.listingLoadingTitle';
const NOT_FOUND_TITLE = 'seo.listingNotFoundTitle';
const LISTING_TITLE = 'seo.listingTitle';

const LISTING_URL = '/en/hostel/al-madina';

const LISTING = {
  id: 'h1',
  slug: 'al-madina',
  name: 'Al Madina Hostel',
  city: 'Lahore',
  area: 'Gulberg',
  accommodationType: 'boys',
  priceFrom: 12000,
  verified: true,
  description: 'Quiet rooms near the university.',
  images: [],
  amenities: [],
  offerNames: [],
  roomOffers: [],
} as unknown as ListingDetailModel;

function attr(selector: string, name: string): string | null {
  return document.head.querySelector(selector)?.getAttribute(name) ?? null;
}

function count(selector: string): number {
  return document.head.querySelectorAll(selector).length;
}

describe('ListingDetail head', () => {
  /** One entry per `getBySlug` call, so a spec answers each request on its own. */
  let requests: Subject<ListingDetailModel | undefined>[];
  let getBySlug: ReturnType<typeof vi.fn>;
  let harness: RouterTestingHarness;
  let page: { reload(): void };
  const ready = signal(true);
  const active = signal('en');

  /** Lets the page's effect and the strategy's effect run. */
  function settle(): void {
    harness.detectChanges();
    TestBed.tick();
  }

  /** Answers the latest request: with the listing, or with `undefined` when given it (a 404). */
  function load(...answer: [] | [ListingDetailModel | undefined]): void {
    // A default parameter would turn an explicit `undefined` back into the listing.
    const listing = answer.length ? answer[0] : LISTING;
    const request = requests[requests.length - 1];
    request.next(listing);
    request.complete();
    settle();
  }

  /** A status, or none at all: the server render's timeout arrives with no status. */
  function fail(status?: number): void {
    requests[requests.length - 1].error(status === undefined ? {} : { status });
    settle();
  }

  /** The server render's response, as `@angular/ssr` hands it to the app. */
  let responseInit: ResponseInit;

  beforeEach(async () => {
    requests = [];
    ready.set(true);
    active.set('en');
    responseInit = { status: 200, headers: new Headers({ 'Content-Type': 'text/html' }) };
    getBySlug = vi.fn(() => {
      const request = new Subject<ListingDetailModel | undefined>();
      requests.push(request);
      return request.asObservable();
    });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'en/hostel', data: { head: 'page' }, children: LISTING_ROUTES }]),
        { provide: TitleStrategy, useClass: RouteHeadStrategy },
        provideI18nTesting(),
        { provide: LocaleStore, useValue: { ready, active } },
        { provide: ListingDetailApi, useValue: { getBySlug } },
        { provide: StudentApi, useValue: { getReviews: () => of([]) } },
        { provide: HostelsApi, useValue: {} },
        { provide: FavoritesStore, useValue: {} },
        { provide: BookingApi, useValue: { setCatalogue: vi.fn() } },
        { provide: MobileApp, useValue: { isMobile: signal(false) } },
        { provide: GoogleAnalyticsService, useValue: { track: vi.fn() } },
        { provide: RESPONSE_INIT, useFactory: () => responseInit },
      ],
    }).overrideComponent(ListingDetail, { set: { template: '', imports: [] } });
    harness = await RouterTestingHarness.create();
    page = (await harness.navigateByUrl(LISTING_URL, ListingDetail)) as unknown as {
      reload(): void;
    };
    settle();
  });

  afterEach(() => {
    document.head.querySelectorAll(SEO_TAGS).forEach((el) => el.remove());
    document.title = '';
  });

  describe('while the listing loads', () => {
    it('shows the neutral title, noindex, and is not settled, never the not-found title', () => {
      expect(getBySlug).toHaveBeenCalledTimes(1);
      expect(document.title).toBe(LOADING_TITLE);
      expect(document.title).not.toBe(NOT_FOUND_TITLE);
      expect(attr('meta[property="og:title"]', 'content')).toBe(LOADING_TITLE);
      expect(attr('meta[name="robots"]', 'content')).toBe('noindex, nofollow');
      expect(count('link[rel="canonical"]')).toBe(0);
      expect(TestBed.inject(Seo).settled()).toBe(false);
    });
  });

  describe('when the load fails', () => {
    it.each([500, 0])(
      'keeps the neutral title as the final head after a status %i, and goes back to loading on Try again',
      (status) => {
        fail(status);

        expect(document.title).toBe(LOADING_TITLE);
        expect(document.title).not.toBe(NOT_FOUND_TITLE);
        expect(attr('meta[name="robots"]', 'content')).toBe('noindex, nofollow');
        expect(TestBed.inject(Seo).settled()).toBe(true);

        page.reload();
        settle();

        expect(getBySlug).toHaveBeenCalledTimes(2);
        expect(document.title).toBe(LOADING_TITLE);
        expect(TestBed.inject(Seo).settled()).toBe(false);
      },
    );
  });

  describe('the server response (Trello #154)', () => {
    it.each([
      ['a 500', 500],
      ['a 503', 503],
      ['an unreachable API (status 0)', 0],
      ['a timeout (no status)', undefined],
    ])('is a 503 with Retry-After and no-store after %s', (_label, status) => {
      fail(status);

      expect(responseInit.status).toBe(503);
      const headers = new Headers(responseInit.headers);
      expect(headers.get('Retry-After')).toBe('120');
      expect(headers.get('Cache-Control')).toBe('no-store');
      expect(headers.get('Content-Type')).toBe('text/html');
    });

    it.each([403, 422])('stays a 200 after a %i, which a retry will not change', (status) => {
      fail(status);

      expect(responseInit.status).toBe(200);
      expect(new Headers(responseInit.headers).has('Retry-After')).toBe(false);
    });

    it('stays a 200 for a missing listing, which keeps its not-found page', () => {
      load(undefined);

      expect(responseInit.status).toBe(200);
      expect(document.title).toBe(NOT_FOUND_TITLE);
    });

    it('stays a 200 when the listing loads', () => {
      load();

      expect(responseInit.status).toBe(200);
    });
  });

  describe('when the listing does not exist', () => {
    it('shows the not-found head as final', () => {
      load(undefined);

      expect(document.title).toBe(NOT_FOUND_TITLE);
      expect(attr('meta[property="og:title"]', 'content')).toBe(NOT_FOUND_TITLE);
      expect(attr('meta[name="robots"]', 'content')).toBe('noindex, nofollow');
      expect(TestBed.inject(Seo).settled()).toBe(true);
    });
  });

  describe('when the listing arrives', () => {
    it("replaces the neutral head with the listing's own, indexable and settled", () => {
      expect(document.title).toBe(LOADING_TITLE);

      load();

      expect(document.title).toBe(LISTING_TITLE);
      expect(attr('meta[property="og:title"]', 'content')).not.toBe(LOADING_TITLE);
      expect(attr('meta[name="robots"]', 'content')).toBe(
        'index, follow, max-image-preview:large',
      );
      expect(attr('link[rel="canonical"]', 'href')).toBe(
        'https://hostelhive.com/en/hostel/al-madina',
      );
      expect(TestBed.inject(Seo).settled()).toBe(true);
    });
  });

  describe('after the listing is on screen', () => {
    it("keeps the listing's own title through query-only navigations", async () => {
      load();
      expect(document.title).toBe(LISTING_TITLE);

      await harness.navigateByUrl(`${LISTING_URL}?x=1`);
      settle();
      expect(document.title).toBe(LISTING_TITLE);

      await harness.navigateByUrl(`${LISTING_URL}?review=5`);
      settle();
      expect(document.title).toBe(LISTING_TITLE);

      await TestBed.inject(Router).navigate([], {
        queryParams: { review: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
      settle();

      expect(TestBed.inject(Router).url).toBe(LISTING_URL);
      expect(document.title).toBe(LISTING_TITLE);
      expect(attr('meta[property="og:title"]', 'content')).not.toBe(LOADING_TITLE);
      expect(getBySlug).toHaveBeenCalledTimes(1);
    });
  });

  describe('structured data', () => {
    const SITE = 'https://hostelhive.com';
    const BLOCK = 'script[data-seo="listing"]';
    const block = () =>
      JSON.parse(document.head.querySelector(BLOCK)?.textContent ?? 'null') as Record<
        string,
        unknown
      >;

    /** Mirrors LocaleStore.switchTo: the strings are not ready until the new language has loaded. */
    function switchTo(code: string): void {
      ready.set(false);
      active.set(code);
      settle();
      ready.set(true);
      settle();
    }

    it.each(['en', 'ur'])(
      'names the same prefixed address as the canonical and og:url when %s is active',
      (code) => {
        active.set(code);
        load();

        const url = `${SITE}/${code}/hostel/al-madina`;
        expect(block()['url']).toBe(url);
        expect(attr('link[rel="canonical"]', 'href')).toBe(url);
        expect(attr('meta[property="og:url"]', 'content')).toBe(url);
        expect(pageAddressesIn(block())).toEqual([url]);
      },
    );

    it('follows a language switch with one block, without fetching the listing again', () => {
      load();

      switchTo('ur');

      expect(block()['url']).toBe(`${SITE}/ur/hostel/al-madina`);
      expect(block()['url']).toBe(attr('link[rel="canonical"]', 'href'));
      expect(count(BLOCK)).toBe(1);

      switchTo('en');

      expect(block()['url']).toBe(`${SITE}/en/hostel/al-madina`);
      expect(block()['url']).toBe(attr('link[rel="canonical"]', 'href'));
      expect(count(BLOCK)).toBe(1);
      expect(getBySlug).toHaveBeenCalledTimes(1);
    });

    it('follows a switch to a loaded language with ready() never changing', () => {
      load();
      // ready() stays true, as it does when switching back to a language already loaded.
      active.set('ur');
      settle();

      expect(block()['url']).toBe(`${SITE}/ur/hostel/al-madina`);
      expect(block()['url']).toBe(attr('link[rel="canonical"]', 'href'));
      expect(count(BLOCK)).toBe(1);
    });

    it('writes no block while the listing loads', () => {
      expect(count(BLOCK)).toBe(0);
    });

    it.each([500, 0])(
      'writes no block after a status %i, nor on Try again until the listing arrives',
      (status) => {
        fail(status);
        expect(count(BLOCK)).toBe(0);

        page.reload();
        settle();
        expect(count(BLOCK)).toBe(0);

        load();
        expect(count(BLOCK)).toBe(1);
      },
    );

    it('writes no block for a listing that does not exist', () => {
      load(undefined);

      expect(count(BLOCK)).toBe(0);
    });

    it('drops the previous listing’s block when the next one does not exist', async () => {
      load();
      expect(count(BLOCK)).toBe(1);
      const before = harness.routeDebugElement?.componentInstance;

      await harness.navigateByUrl('/en/hostel/no-such-hostel');
      settle();

      // The page is reused across slugs; a fresh instance would not test the clearing at all.
      expect(harness.routeDebugElement?.componentInstance).toBe(before);
      expect(getBySlug).toHaveBeenCalledTimes(2);
      expect(count(BLOCK)).toBe(0);

      load(undefined);

      expect(count(BLOCK)).toBe(0);
    });

    it('describes a full listing exactly, naming its prefixed address', () => {
      load({
        ...LISTING,
        images: ['https://cdn.example.test/a.jpg', 'https://cdn.example.test/b.jpg'],
        amenities: ['wifi', 'ac'],
        offerNames: ['Mess'],
        lat: 31.5,
        lng: 74.3,
        rating: 4.6,
        reviews: 12,
        currency: 'PKR',
      } as unknown as ListingDetailModel);

      expect(block()).toEqual({
        '@context': 'https://schema.org',
        '@type': 'LodgingBusiness',
        name: 'Al Madina Hostel',
        url: `${SITE}/en/hostel/al-madina`,
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Lahore',
          addressRegion: 'Gulberg',
          addressCountry: 'PK',
        },
        description: attr('meta[name="description"]', 'content'),
        image: ['https://cdn.example.test/a.jpg', 'https://cdn.example.test/b.jpg'],
        priceRange: 'From PKR 12000',
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: 12000,
          priceCurrency: 'PKR',
          unitCode: 'MON',
          unitText: 'per bed per month',
        },
        geo: { '@type': 'GeoCoordinates', latitude: 31.5, longitude: 74.3 },
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: 4.6,
          reviewCount: 12,
          bestRating: 5,
          worstRating: 1,
        },
        amenityFeature: [
          { '@type': 'LocationFeatureSpecification', name: 'Wi-Fi', value: true },
          { '@type': 'LocationFeatureSpecification', name: 'Air conditioning', value: true },
          {
            '@type': 'LocationFeatureSpecification',
            name: 'Mess (meals included)',
            value: true,
          },
          { '@type': 'LocationFeatureSpecification', name: 'Gender', value: 'common.boys' },
        ],
      });
    });
  });

  describe('canBook', () => {
    const canBook = () => (page as unknown as { canBook(): boolean }).canBook();

    // The accommodation type contradicts the billing frequency on purpose, so the cycle can only come from the latter.
    it.each([
      { billingFrequency: 'night', accommodationType: 'boys', acceptsBookings: true, expected: true },
      { billingFrequency: 'night', accommodationType: 'boys', acceptsBookings: false, expected: false },
      { billingFrequency: 'night', accommodationType: 'boys', acceptsBookings: undefined, expected: false },
      { billingFrequency: 'month', accommodationType: 'backpacker', acceptsBookings: true, expected: false },
    ])(
      'is $expected for $billingFrequency billing when acceptsBookings is $acceptsBookings',
      ({ expected, ...overrides }) => {
        load({ ...LISTING, ...overrides } as unknown as ListingDetailModel);

        expect(canBook()).toBe(expected);
      },
    );

    it('is false before the listing has loaded', () => {
      expect(canBook()).toBe(false);
    });
  });
});

describe('ListingDetail booking wiring', () => {
  const FULL = {
    ...LISTING,
    billingFrequency: 'night',
    currency: 'PKR',
    address: '12 Canal Road',
    photoCount: 0,
    photos: [],
    amenityCount: 0,
    nearby: [],
    sharing: [],
    rooms: [],
  };

  let harness: RouterTestingHarness;
  let bookingFailure: unknown;

  beforeEach(() => {
    bookingFailure = new Error('booking reference missing from response');
  });

  afterEach(() => {
    TestBed.inject(SessionStore).clear();
  });

  async function open(acceptsBookings: boolean | undefined, overrides: object = {}): Promise<void> {
    const listing = { ...FULL, acceptsBookings, ...overrides } as unknown as ListingDetailModel;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'en/hostel', children: LISTING_ROUTES }]),
        provideI18nTesting(),
        { provide: LocaleStore, useValue: { ready: signal(true), active: signal('en') } },
        { provide: ListingDetailApi, useValue: { getBySlug: () => of(listing) } },
        { provide: StudentApi, useValue: { getReviews: () => of([]) } },
        { provide: HostelsApi, useValue: {} },
        { provide: FavoritesStore, useValue: { isFavorite: () => false } },
        {
          provide: BookingApi,
          useValue: { setCatalogue: vi.fn(), createBooking: () => throwError(() => bookingFailure) },
        },
        { provide: MobileApp, useValue: { isMobile: signal(false) } },
        { provide: GoogleAnalyticsService, useValue: { track: vi.fn() } },
      ],
    });
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(LISTING_URL, ListingDetail);
    harness.detectChanges();
    TestBed.tick();
    harness.detectChanges();
  }

  const el = () => harness.routeNativeElement as HTMLElement;
  const picker = () => el().querySelector('hh-room-picker');
  const rail = () => el().querySelector('hh-booking-rail');
  const pickerBookable = () =>
    harness.fixture.debugElement.query(By.directive(RoomPicker)).componentInstance.bookable();

  it('shows the booking rail and passes bookable=true to the room picker when the hostel accepts bookings', async () => {
    await open(true);

    expect(rail()).not.toBeNull();
    expect(picker()).not.toBeNull();
    expect(pickerBookable()).toBe(true);
  });

  it('hides the booking rail and passes bookable=false to the room picker when the hostel does not accept bookings', async () => {
    await open(false);

    expect(rail()).toBeNull();
    expect(picker()).not.toBeNull();
    expect(pickerBookable()).toBe(false);
  });

  it('hides the booking rail when the payload does not say whether bookings are accepted', async () => {
    await open(undefined);

    expect(rail()).toBeNull();
    expect(pickerBookable()).toBe(false);
  });

  it('keeps the per-night label for a nightly hostel that does not accept bookings', async () => {
    await open(false);

    expect(el().textContent).toContain('listing.perNight');
    expect(el().textContent).not.toContain('listing.month');
  });

  it('opens the booking summary only when the hostel accepts bookings', async () => {
    await open(true);
    const page = harness.routeDebugElement?.componentInstance as { summaryOpen: { set(v: boolean): void } };
    page.summaryOpen.set(true);
    harness.detectChanges();
    expect(el().querySelector('hh-booking-summary')).not.toBeNull();
  });

  it('never renders the booking summary when the hostel does not accept bookings, even if it was opened', async () => {
    await open(false);
    const page = harness.routeDebugElement?.componentInstance as { summaryOpen: { set(v: boolean): void } };
    page.summaryOpen.set(true);
    harness.detectChanges();
    expect(el().querySelector('hh-booking-summary')).toBeNull();
  });

  describe('when the booking fails', () => {
    const API_URL = 'http://localhost/api/bookings';
    const MAPPER_TEXT = 'booking reference missing from response';

    /** An error shaped the way the error interceptor rethrows it. */
    function apiError(status: number, serverMessages?: readonly string[]) {
      return {
        status,
        code: 'unknown_error',
        message: serverMessages?.join(' ') ?? `Http failure response for ${API_URL}: ${status} Forbidden`,
        serverMessages,
        method: 'POST',
      };
    }

    interface BookingPage {
      basket: { checkIn: { set(d: Date): void }; checkOut: { set(d: Date): void } };
      startBooking(): void;
      confirmBooking(guest: { name: string; phone: string; email: string }): void;
    }

    /** Signs in, opens the summary, confirms, and returns the summary's alert text. */
    async function confirmWith(failure: unknown): Promise<string> {
      bookingFailure = failure;
      await open(true);
      TestBed.inject(SessionStore).setSession(
        { id: '7', name: 'Ali', email: 'ali@example.com', role: 'seeker', allRoles: ['seeker'], permissions: [] },
        'tok',
      );
      const page = harness.routeDebugElement?.componentInstance as BookingPage;
      page.basket.checkIn.set(new Date(2030, 8, 20));
      page.basket.checkOut.set(new Date(2030, 8, 23));
      page.startBooking();
      page.confirmBooking({ name: 'Ali Raza', phone: '923001234567', email: 'ali@example.com' });
      harness.detectChanges();
      const alert = el().querySelector('hh-booking-summary [role="alert"]');
      expect(alert).not.toBeNull();
      return alert?.textContent ?? '';
    }

    function expectNoLeak(...leaks: string[]): void {
      const shown = document.body.textContent ?? '';
      expect(shown).not.toContain('Http failure');
      expect(shown).not.toContain('http://');
      for (const leak of leaks) expect(shown).not.toContain(leak);
    }

    it.each([
      { case: 'a URL-bearing 403', failure: apiError(403) },
      { case: 'a 500 with no envelope', failure: apiError(500) },
      { case: 'a plain error from a mapper', failure: new Error(MAPPER_TEXT) },
    ])('asks the guest to try again and leaks nothing on $case', async ({ failure }) => {
      const shown = await confirmWith(failure);
      expect(shown).toContain('publicBooking.couldnTBook');
      expect(shown).toContain('publicBooking.tryAgain');
      expectNoLeak(MAPPER_TEXT, API_URL);
    });

    it.each([
      { text: 'This hostel is not taking bookings right now', key: 'publicBooking.hostelNotTakingBookings' },
      { text: 'Checkin date cannot be in the past', key: 'publicBooking.checkInHasPassed' },
      { text: 'Mixed Dorm is not available for booking', key: 'publicBooking.roomNoLongerBookable' },
      { text: 'Checkout date must be after check-in date', key: 'publicBooking.checkOutAfterCheckIn' },
    ])('shows $key, not the server text, for "$text"', async ({ text, key }) => {
      const shown = await confirmWith(apiError(422, [text]));
      expect(shown).toContain(key);
      expectNoLeak(text);
    });

    it('says the hostel is not taking bookings on a 404', async () => {
      expect(await confirmWith(apiError(404))).toContain('publicBooking.hostelNotTakingBookings');
      expectNoLeak(API_URL);
    });

    it('asks the guest to log in again on a 401', async () => {
      expect(await confirmWith(apiError(401))).toContain('publicBooking.logInAgainToBook');
    });

    it('says the server cannot be reached on a network failure', async () => {
      expect(await confirmWith(apiError(0))).toContain('common.cannotReachTheServer');
    });
  });
});
