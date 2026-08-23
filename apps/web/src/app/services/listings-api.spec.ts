import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { ApiClient } from '@core/api-resource';
import {
  CURRENCY_STORAGE_KEY,
  CurrencyPreference,
} from '@core/preferences/currency-preference';
import { ApiHostel, ListingsApi, toListing } from './listings-api';

/** Captures what the service asked for, so the assertions can be about the query string. */
class ApiClientStub {
  lastPath = '';
  lastParams: Record<string, unknown> = {};

  get<T>(path: string, params?: Record<string, unknown>): Observable<T> {
    this.lastPath = path;
    this.lastParams = params ?? {};
    return of([] as unknown as T);
  }
}

/**
 * The budget filter's query key.
 *
 * Worth pinning because it is a string built at runtime: a typo in the field path, or the
 * currency segment quietly going missing, produces a request the backend answers with an
 * empty result set rather than an error. That reads as "no hostels match your budget",
 * which is indistinguishable from the filter working.
 */
describe('ListingsApi budget filter', () => {
  let api: ApiClientStub;

  function setUp(currency?: string): ListingsApi {
    localStorage.clear();
    if (currency) localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
    TestBed.resetTestingModule();
    api = new ApiClientStub();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiClient, useValue: api }, CurrencyPreference],
    });
    return TestBed.inject(ListingsApi);
  }

  it('ranges over the per-currency price hash, in the default currency', () => {
    setUp().list({ minPrice: 5000, maxPrice: 20000 }).subscribe();

    expect(api.lastPath).toBe('/public/hostels');
    expect(
      api.lastParams['f[shared_occupancy_price_from.currency_price_hash.PKR][gte]'],
    ).toBe(5000);
    expect(
      api.lastParams['f[shared_occupancy_price_from.currency_price_hash.PKR][lte]'],
    ).toBe(20000);
  });

  it('names the currency the seeker chose', () => {
    setUp('USD').list({ minPrice: 40 }).subscribe();

    expect(
      api.lastParams['f[shared_occupancy_price_from.currency_price_hash.USD][gte]'],
    ).toBe(40);
  });

  // The old key was a single unit-less number that compared rupees against dollars.
  it('no longer sends the retired starting_price range', () => {
    setUp().list({ minPrice: 5000, maxPrice: 20000 }).subscribe();

    expect(api.lastParams['f[starting_price][gte]']).toBeUndefined();
    expect(api.lastParams['f[starting_price][lte]']).toBeUndefined();
  });

  it('sends neither bound when the seeker set no budget', () => {
    setUp().list({}).subscribe();

    const budgetKeys = Object.keys(api.lastParams).filter((k) =>
      k.includes('currency_price_hash'),
    );
    expect(budgetKeys).toEqual([]);
  });

  it('sends only the bound that was set', () => {
    setUp().list({ maxPrice: 12000 }).subscribe();

    const budgetKeys = Object.keys(api.lastParams).filter((k) =>
      k.includes('currency_price_hash'),
    );
    expect(budgetKeys).toEqual([
      'f[shared_occupancy_price_from.currency_price_hash.PKR][lte]',
    ]);
  });
});

/**
 * The room-type filter's query key.
 *
 * Occupancy lives on the room_types association, not on the hostel, so the key has to name
 * that path. The flat `f[room_type]` it was sent as named a field the search document does
 * not have, and a term on a missing field matches nothing — the request still returns 200,
 * just with zero hostels, which is indistinguishable from an honest "nothing matched".
 */
describe('ListingsApi room type filter', () => {
  let api: ApiClientStub;

  function setUp(): ListingsApi {
    localStorage.clear();
    TestBed.resetTestingModule();
    api = new ApiClientStub();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiClient, useValue: api }, CurrencyPreference],
    });
    return TestBed.inject(ListingsApi);
  }

  it('filters on the room_types association path', () => {
    setUp().list({ roomType: 'shared' }).subscribe();

    expect(api.lastParams['f[room_types.occupancy_type]']).toBe('shared');
  });

  it('passes private through unchanged', () => {
    setUp().list({ roomType: 'private' }).subscribe();

    expect(api.lastParams['f[room_types.occupancy_type]']).toBe('private');
  });

  it('no longer sends the flat room_type key', () => {
    setUp().list({ roomType: 'shared' }).subscribe();

    expect(api.lastParams['f[room_type]']).toBeUndefined();
  });

  it('omits the filter entirely when no room type is chosen', () => {
    setUp().list({}).subscribe();

    const keys = Object.keys(api.lastParams).filter((k) => k.includes('occupancy_type'));
    expect(keys).toEqual([]);
  });
});

/**
 * The budget band ranges over the price for the occupancy being shopped for.
 *
 * A hostel carries both a private and a shared "from" price, and they are far apart — a dorm
 * bed at 12,000 beside a private room at 45,000. Ranging a private-room search over the
 * shared figure returns hostels whose dorms fall in the band while their private rooms cost
 * several times the seeker's ceiling: results that look right, are wrong, and give the seeker
 * no way to tell. The request succeeds either way, so only this pins which field is named.
 */
describe('ListingsApi budget field follows the room type', () => {
  let api: ApiClientStub;

  function setUp(currency?: string): ListingsApi {
    localStorage.clear();
    if (currency) localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
    TestBed.resetTestingModule();
    api = new ApiClientStub();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiClient, useValue: api }, CurrencyPreference],
    });
    return TestBed.inject(ListingsApi);
  }

  function budgetKeys(): string[] {
    return Object.keys(api.lastParams).filter((k) => k.includes('currency_price_hash'));
  }

  it('ranges over the private price when Private room is selected', () => {
    setUp('EUR').list({ roomType: 'private', minPrice: 200, maxPrice: 900 }).subscribe();

    expect(
      api.lastParams['f[private_occupancy_price_from.currency_price_hash.EUR][gte]'],
    ).toBe(200);
    expect(
      api.lastParams['f[private_occupancy_price_from.currency_price_hash.EUR][lte]'],
    ).toBe(900);
  });

  it('never names both prices at once', () => {
    setUp().list({ roomType: 'private', minPrice: 200 }).subscribe();

    expect(budgetKeys()).toEqual([
      'f[private_occupancy_price_from.currency_price_hash.PKR][gte]',
    ]);
  });

  it('ranges over the shared price when Shared room is selected', () => {
    setUp().list({ roomType: 'shared', minPrice: 5000 }).subscribe();

    expect(budgetKeys()).toEqual([
      'f[shared_occupancy_price_from.currency_price_hash.PKR][gte]',
    ]);
  });

  // Shared is what the filter itself falls back to, so the query agrees with the control.
  it('falls back to the shared price when no room type is given', () => {
    setUp().list({ minPrice: 5000 }).subscribe();

    expect(budgetKeys()).toEqual([
      'f[shared_occupancy_price_from.currency_price_hash.PKR][gte]',
    ]);
  });

  // A hand-typed ?roomType=deluxe must not produce `f[deluxe_occupancy_price_from…]`, which
  // names no field and would quietly match nothing.
  it('falls back to the shared price for an unrecognised room type', () => {
    setUp().list({ roomType: 'deluxe', minPrice: 5000 }).subscribe();

    expect(budgetKeys()).toEqual([
      'f[shared_occupancy_price_from.currency_price_hash.PKR][gte]',
    ]);
  });
});

/**
 * Reading the per-occupancy price block.
 *
 * The index replaced the flat `starting_price` with an object per occupancy type, each
 * carrying the figure converted into ~160 currencies. Three things here are easy to get
 * wrong and silent when you do:
 *
 *  - `discounted_price` is **0 when there is no discount**, not free. Every hostel in the
 *    live payload is 0, so treating it as a price puts "Rs 0" on every card.
 *  - `private_occupancy_price_from` is `null` on every current record, so a private-room
 *    search has to fall back rather than render a blank price.
 *  - the room-type prices are in the hostel's own currency and need the same conversion,
 *    or one Listing carries two currencies while claiming one.
 */
describe('toListing price resolution', () => {
  const HASH = { PKR: 15000, USD: 55.61, EUR: 46.26 };

  function hostel(over: Record<string, unknown> = {}): ApiHostel {
    return {
      id: 'h1',
      name: 'Test',
      currency: 'PKR',
      shared_occupancy_price_from: {
        price: 15000,
        discounted_price: 0,
        currency_price_hash: HASH,
        currency_discounted_price_hash: { PKR: 0, USD: 0, EUR: 0 },
      },
      private_occupancy_price_from: null,
      ...over,
    } as ApiHostel;
  }

  it('quotes the price in the requested currency', () => {
    const l = toListing(hostel(), { currency: 'EUR' });

    expect(l.priceFrom).toBe(46);
    expect(l.currency).toBe('EUR');
  });

  // 0 across every currency is what "no discount" looks like on the wire.
  it('treats a zero discounted price as no discount at all', () => {
    const l = toListing(hostel(), { currency: 'PKR' });

    expect(l.discountedPriceFrom).toBeUndefined();
  });

  it('reads a real discount from the discounted hash', () => {
    const l = toListing(
      hostel({
        shared_occupancy_price_from: {
          price: 15000,
          discounted_price: 12000,
          currency_price_hash: { PKR: 15000 },
          currency_discounted_price_hash: { PKR: 12000 },
        },
      }),
      { currency: 'PKR' },
    );

    expect(l.priceFrom).toBe(15000);
    expect(l.discountedPriceFrom).toBe(12000);
  });

  // A "discount" at or above the list price is not one, and would render as a rise.
  it('ignores a discount that is not below the list price', () => {
    const l = toListing(
      hostel({
        shared_occupancy_price_from: {
          price: 15000,
          discounted_price: 15000,
          currency_price_hash: { PKR: 15000 },
          currency_discounted_price_hash: { PKR: 15000 },
        },
      }),
      { currency: 'PKR' },
    );

    expect(l.discountedPriceFrom).toBeUndefined();
  });

  it('falls back to the other occupancy when the requested one is null', () => {
    const l = toListing(hostel(), { currency: 'PKR', roomType: 'private' });

    expect(l.priceFrom).toBe(15000);
  });

  // The hash has no entry for a currency the index does not carry.
  it('keeps the hostel’s own currency when the hash cannot supply the chosen one', () => {
    const l = toListing(hostel(), { currency: 'XYZ' });

    expect(l.currency).toBe('PKR');
    expect(l.priceFrom).toBe(15000);
  });

  // Otherwise a Listing quotes EUR while its per-room figures are still rupees.
  it('converts the room-type prices at the same rate', () => {
    const l = toListing(
      hostel({
        room_types: [
          { id: 'r1', name: 'Double', capacity: 2, price: 15000 },
          { id: 'r2', name: 'Quad', capacity: 4, price: 30000 },
        ],
      }),
      { currency: 'EUR' },
    );

    // 15000 PKR → 46.26 EUR is a rate of ~0.003084.
    expect(l.currency).toBe('EUR');
    expect(l.priceByCapacity?.['2']).toBe(46);
    expect(l.priceByCapacity?.['4']).toBe(93);
  });

  it('leaves the room-type prices alone when nothing was converted', () => {
    const l = toListing(
      hostel({
        room_types: [{ id: 'r1', name: 'Double', capacity: 2, price: 15000 }],
      }),
      { currency: 'PKR' },
    );

    expect(l.priceByCapacity?.['2']).toBe(15000);
  });

  // Older endpoints may still send the flat field the search document dropped.
  it('falls back to starting_price when no occupancy block is present', () => {
    const l = toListing(
      {
        id: 'h2',
        currency: 'PKR',
        starting_price: 9000,
        shared_occupancy_price_from: null,
        private_occupancy_price_from: null,
      } as ApiHostel,
      { currency: 'EUR' },
    );

    expect(l.priceFrom).toBe(9000);
    expect(l.currency).toBe('PKR');
  });
});
