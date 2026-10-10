import { NO_ERRORS_SCHEMA, PLATFORM_ID, WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { of } from 'rxjs';
import { Listing, Paginated } from '@hostelhive/data-access';
import { GeolocationService, SharedMap } from '@hostelhive/maps';
import { SessionStore } from '@core/auth';
import { CountryBounds } from '@core/geo/country-bounds';
import { GoogleAnalyticsService } from '@core/google-analytics/google-analytics.service';
import { LocaleStore } from '@core/i18n/locale-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { MobileApp } from '@core/mobile-app';
import { Seo } from '@core/seo';
import { CurrencyNamePipe } from '@app/shared/currency/currency-name.pipe';
import { ListingsApi, OffersApi } from '@services';
import { FavoritesStore } from '@util/favorites-store';
import { SearchMap } from './search-map';

const SEARCH_URL = '/search/lahore?gender=girls';

const ROSE = {
  id: 'h1',
  slug: 'rose-hostel',
  name: 'Rose Hostel',
  area: 'Gulberg',
  city: 'Lahore',
  accommodationType: 'girls',
  verified: true,
  sharing: [],
  amenities: [],
  priceFrom: 20000,
  currency: 'PKR',
  images: [],
  lat: 31.5,
  lng: 74.3,
} as unknown as Listing;

/** The component's members are `protected`; the spec reaches the docked card through this shape. */
interface SearchMapInternals {
  narrow: WritableSignal<boolean>;
  selected: WritableSignal<string | null>;
  listings(): Listing[];
}

describe('SearchMap docked card heart', () => {
  let fixture: ComponentFixture<SearchMap>;
  const favorites = {
    toggle: vi.fn(),
    isFavorite: () => false,
    items: signal<Listing[]>([]),
  };

  beforeEach(() => {
    favorites.toggle.mockReset();
    // jsdom has no matchMedia; a non-matching desktop query is a phone-width viewport.
    (window as unknown as Record<string, unknown>)['matchMedia'] = () => ({
      matches: false,
    });

    TestBed.configureTestingModule({
      imports: [SearchMap],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        // Server platform keeps Leaflet, the infinite-scroll observer and the store load out.
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: FavoritesStore, useValue: favorites },
        {
          provide: ListingsApi,
          useValue: {
            list: () =>
              of<Paginated<Listing>>({
                items: [ROSE],
                total: 1,
                page: 1,
                pageSize: 20,
                totalPages: 1,
              }),
          },
        },
        { provide: OffersApi, useValue: { categories: () => of([]) } },
        { provide: CountryBounds, useValue: { forVisitor: () => Promise.resolve(null) } },
        // Never settles, so the map is never built.
        {
          provide: SharedMap,
          useValue: {
            acquire: () => new Promise(() => undefined),
            release: () => undefined,
            listen: () => undefined,
          },
        },
        { provide: GeolocationService, useValue: { getCurrent: () => new Promise(() => undefined) } },
        { provide: MobileApp, useValue: { isMobile: signal(false) } },
        { provide: GoogleAnalyticsService, useValue: { track: () => undefined } },
        { provide: Seo, useValue: { apply: () => undefined, setJsonLd: () => undefined } },
        {
          provide: LocaleStore,
          useValue: { ready: signal(false), active: signal('en') },
        },
      ],
    });
    // Only the page's own markup is under test; filters, cards, place search and the
    // currency picker are inert elements.
    TestBed.overrideComponent(SearchMap, {
      set: { imports: [TranslocoPipe, CurrencyNamePipe], schemas: [NO_ERRORS_SCHEMA] },
    });
  });

  afterEach(() => {
    TestBed.inject(SessionStore).clear();
    delete (window as unknown as Record<string, unknown>)['matchMedia'];
    vi.restoreAllMocks();
  });

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('sends a guest to the Log in tab with a way back, without saving anything', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(router, 'url', 'get').mockReturnValue(SEARCH_URL);

    fixture = TestBed.createComponent(SearchMap);
    const map = fixture.componentInstance as unknown as SearchMapInternals;
    await settle();
    // The results pipeline is debounced, so wait for the search to land.
    await vi.waitFor(() => expect(map.listings().map((l) => l.id)).toEqual(['h1']), {
      timeout: 3000,
    });
    // A pin cannot be tapped without Leaflet, so the selection is made the way a tap makes it.
    map.narrow.set(true);
    map.selected.set('h1');
    await settle();

    const dock = (fixture.nativeElement as HTMLElement).querySelector('.hh-mapcard-dock');
    const heart = dock?.querySelector<HTMLButtonElement>(
      'button[aria-label="Save to favourites"]',
    );
    expect(heart).toBeTruthy();

    heart?.click();
    await settle();

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/auth'], {
      queryParams: { mode: 'login', returnUrl: SEARCH_URL },
    });
    expect(favorites.toggle).not.toHaveBeenCalled();
    expect(map.selected()).toBe('h1');
  });
});
