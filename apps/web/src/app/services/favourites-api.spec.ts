import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiError, Listing } from '@hostelhive/data-access';
import { API_CONFIG } from '@core/api-config';
import { errorInterceptor } from '@core/interceptors/error-interceptor';
import { CurrencyPreference } from '@core/preferences/currency-preference';
import { API_ERROR_NOTIFIER, SUPPRESS_ERROR_TOAST } from '@core/tokens';
import { FavouritesApi } from './favourites-api';

const BASE = 'https://api.test';
const LIST = `${BASE}/api/favourites`;
const MARK = `${BASE}/api/favourites/mark_as_favourite`;
const UNMARK = `${BASE}/api/favourites/mark_as_unfavourite`;

/** A favourited hostel priced in PKR, with a USD figure in its hash. */
const HOSTEL = {
  id: 42,
  name: 'Ever Care Hostel',
  currency: 'PKR',
  shared_occupancy_price_from: {
    price: 15000,
    currency_price_hash: { PKR: 15000, USD: 54 },
  },
};

/**
 * The favourites endpoints.
 *
 * Writes must surface their failures: the store flips a heart before the server answers and
 * can only roll it back if the error reaches it, so a write that swallowed its error would
 * leave a heart saying something the server never agreed to.
 */
describe('FavouritesApi', () => {
  let api: FavouritesApi;
  let httpMock: HttpTestingController;
  const notify = vi.fn();

  beforeEach(() => {
    notify.mockReset();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { baseUrl: BASE } },
        { provide: API_ERROR_NOTIFIER, useValue: notify },
      ],
    });
    api = TestBed.inject(FavouritesApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  describe('listFavourites', () => {
    it('reads GET /api/favourites and maps each hostel to a listing', () => {
      let out: Listing[] | undefined;
      api.listFavourites().subscribe((l) => (out = l));

      const req = httpMock.expectOne(LIST);
      expect(req.request.method).toBe('GET');
      req.flush({ success: true, hostels: [HOSTEL] });

      expect(out).toHaveLength(1);
      expect(out?.[0]?.id).toBe('42');
      expect(out?.[0]?.name).toBe('Ever Care Hostel');
      expect(out?.[0]?.currency).toBe('PKR');
      expect(out?.[0]?.priceFrom).toBe(15000);
    });

    it('prices each listing in the visitor\'s current currency', () => {
      TestBed.inject(CurrencyPreference).set('USD');
      let out: Listing[] | undefined;
      api.listFavourites().subscribe((l) => (out = l));

      httpMock.expectOne(LIST).flush({ success: true, hostels: [HOSTEL] });

      expect(out?.[0]?.currency).toBe('USD');
      expect(out?.[0]?.priceFrom).toBe(54);
    });

    it('answers an empty list when the response carries no hostels', () => {
      let out: Listing[] | undefined;
      api.listFavourites().subscribe((l) => (out = l));

      httpMock.expectOne(LIST).flush({ success: true });

      expect(out).toEqual([]);
    });

    it('opts out of the global error toast when asked to be quiet', () => {
      api.listFavourites({ quiet: true }).subscribe();

      const req = httpMock.expectOne(LIST);
      expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
      req.flush({ success: true, hostels: [] });
    });

    it('keeps the global error toast by default', () => {
      api.listFavourites().subscribe();

      const req = httpMock.expectOne(LIST);
      expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(false);
      req.flush({ success: true, hostels: [] });
    });
  });

  describe('markFavourite', () => {
    it('posts the hostel id to mark_as_favourite', () => {
      api.markFavourite('h1').subscribe();

      const req = httpMock.expectOne(MARK);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ hostel_id: 'h1' });
      req.flush({ success: true });
    });

    it('hands a server failure to the subscriber instead of emitting', () => {
      const next = vi.fn();
      let caught: ApiError | undefined;
      api.markFavourite('h1').subscribe({ next, error: (e: ApiError) => (caught = e) });

      httpMock.expectOne(MARK).flush(null, { status: 500, statusText: 'Server Error' });

      expect(next).not.toHaveBeenCalled();
      expect(caught?.status).toBe(500);
    });
  });

  describe('unmarkFavourite', () => {
    it('sends the hostel id in a DELETE to mark_as_unfavourite', () => {
      api.unmarkFavourite('h1').subscribe();

      const req = httpMock.expectOne(UNMARK);
      expect(req.request.method).toBe('DELETE');
      expect(req.request.body).toEqual({ hostel_id: 'h1' });
      req.flush({ success: true });
    });

    it('hands a server failure to the subscriber instead of emitting', () => {
      const next = vi.fn();
      let caught: ApiError | undefined;
      api.unmarkFavourite('h1').subscribe({ next, error: (e: ApiError) => (caught = e) });

      httpMock.expectOne(UNMARK).flush(null, { status: 500, statusText: 'Server Error' });

      expect(next).not.toHaveBeenCalled();
      expect(caught?.status).toBe(500);
    });
  });
});
