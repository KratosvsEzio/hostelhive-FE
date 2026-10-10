import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { MockInstance } from 'vitest';
import { Router, provideRouter } from '@angular/router';
import { Listing } from '@hostelhive/data-access';
import { API_CONFIG } from '@core/api-config';
import { SessionStore, SessionUser } from '@core/auth';
import { LocaleStore } from '@core/i18n/locale-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { errorInterceptor } from '@core/interceptors/error-interceptor';
import { API_ERROR_NOTIFIER } from '@core/tokens';
import { FavoritesStore } from '@util/favorites-store';
import { ListingCard } from './listing-card';

const BASE = 'https://api.test';
const SEARCH_URL = '/search/lahore?gender=girls';

const SEEKER: SessionUser = {
  id: 'u1',
  name: 'Ayesha',
  email: 'ayesha@example.test',
  role: 'seeker',
  allRoles: ['seeker'],
  permissions: [],
};

function listing(id: string, name: string): Listing {
  return {
    id,
    slug: `${id}-hostel`,
    name,
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
  } as Listing;
}

describe('ListingCard heart', () => {
  let fixture: ComponentFixture<ListingCard>;
  let httpMock: HttpTestingController;
  let session: SessionStore;
  let router: Router;
  let navigate: MockInstance<Router['navigate']>;

  beforeEach(() => {
    localStorage.clear();
    // jsdom has no matchMedia, which the card reads in its constructor to pick the link target.
    (window as unknown as Record<string, unknown>)['matchMedia'] = () => ({
      matches: true,
    });
    TestBed.configureTestingModule({
      imports: [ListingCard],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
        { provide: API_ERROR_NOTIFIER, useValue: vi.fn() },
        {
          provide: LocaleStore,
          useValue: { ready: signal(false), active: signal('en') },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionStore);
    router = TestBed.inject(Router);
    navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(router, 'url', 'get').mockReturnValue(SEARCH_URL);
  });

  afterEach(() => {
    httpMock.verify();
    session.clear();
    localStorage.clear();
    delete (window as unknown as Record<string, unknown>)['matchMedia'];
    vi.restoreAllMocks();
  });

  async function render(l: Listing): Promise<HTMLElement> {
    fixture = TestBed.createComponent(ListingCard);
    fixture.componentRef.setInput('listing', l);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function heart(el: HTMLElement): HTMLButtonElement {
    const button = el.querySelector<HTMLButtonElement>(
      'button[aria-label="Save to favourites"], button[aria-label="Remove from saved"]',
    );
    if (!button) throw new Error('heart button not rendered');
    return button;
  }

  function heartFilled(el: HTMLElement): boolean {
    return !!heart(el).querySelector('i.ti-heart-filled');
  }

  it('sends a guest to the Log in tab with a way back, without saving anything', async () => {
    const el = await render(listing('h1', 'Rose Hostel'));
    const toggle = vi.spyOn(TestBed.inject(FavoritesStore), 'toggle');
    const bubbled = vi.fn();
    el.addEventListener('click', bubbled);

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    heart(el).dispatchEvent(click);
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/auth'], {
      queryParams: { mode: 'login', returnUrl: SEARCH_URL },
    });
    expect(toggle).not.toHaveBeenCalled();
    expect(click.defaultPrevented).toBe(true);
    expect(bubbled).not.toHaveBeenCalled();
    expect(heartFilled(el)).toBe(false);
  });

  it('fills the heart at once for a signed-in user and empties it again when the save fails', async () => {
    session.setSession(SEEKER, 'token-1');
    const el = await render(listing('h1', 'Rose Hostel'));
    httpMock.expectOne(`${BASE}/api/favourites`).flush({ hostels: [] });
    fixture.detectChanges();
    expect(heartFilled(el)).toBe(false);

    heart(el).click();
    fixture.detectChanges();

    const save = httpMock.expectOne(`${BASE}/api/favourites/mark_as_favourite`);
    expect(save.request.method).toBe('POST');
    expect(save.request.body).toEqual({ hostel_id: 'h1' });
    expect(heartFilled(el)).toBe(true);
    expect(navigate).not.toHaveBeenCalled();

    save.flush(
      { success: false, errors: ['Something went wrong'] },
      { status: 500, statusText: 'Internal Server Error' },
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(heartFilled(el)).toBe(false);

    // A failed write quietly reloads the list so the server settles the heart.
    const reload = httpMock.expectOne(`${BASE}/api/favourites`);
    expect(reload.request.method).toBe('GET');
    reload.flush({ hostels: [] });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(heartFilled(el)).toBe(false);
  });
});
