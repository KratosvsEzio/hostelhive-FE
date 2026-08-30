import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { HostListing, HostListingsData } from '@hostelhive/data-access';
import { HostPropertyStore } from './host-property-store';
import { HostShellApi } from './host-shell-api';

function listing(over: Partial<HostListing> = {}): HostListing {
  return {
    id: 'nHelLt',
    name: 'Ever Care Hostel',
    area: 'Lahore City',
    city: 'Tibba Bur Singh',
    accommodationType: 'backpacker',
    billingFrequency: 'month',
    currency: 'PKR',
    propertyType: 'house',
    roomTypes: [],
    offers: [],
    review: { score: null, count: 0 },
    status: 'published',
    image: '',
    ...over,
  } as HostListing;
}

class ShellApiStub {
  data: HostListingsData = { listings: [listing()], draft: null, stats: {} as never };
  listings(): Observable<HostListingsData> {
    return of(this.data);
  }
}

function setUp(api = new ShellApiStub()): { store: HostPropertyStore; api: ShellApiStub } {
  localStorage.clear();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: HostShellApi, useValue: api }] });
  return { store: TestBed.inject(HostPropertyStore), api };
}

/**
 * The hostel record the whole host console reads from.
 *
 * The store used to keep six fields per hostel and discard the rest, so every screen that
 * wanted the currency, the room types or the billing cycle fetched a hostel the app had
 * already loaded. These pin the two properties that makes safe: the full record survives the
 * load, and it does not survive a sign-out.
 */
describe('HostPropertyStore.activeHostel', () => {
  afterEach(() => localStorage.clear());

  it('keeps the whole record, not just the picker fields', () => {
    const { store } = setUp();
    store.load();

    expect(store.activeHostel()?.billingFrequency).toBe('month');
    expect(store.activeHostel()?.currency).toBe('PKR');
    expect(store.activeHostel()?.propertyType).toBe('house');
  });

  it('follows the selection', () => {
    const api = new ShellApiStub();
    api.data = {
      ...api.data,
      listings: [
        listing(),
        listing({ id: 'DZNqAc', currency: 'USD', billingFrequency: 'night' }),
      ],
    };
    const { store } = setUp(api);
    store.load();

    store.selected.set('DZNqAc');
    expect(store.activeHostel()?.currency).toBe('USD');
    expect(store.activeHostel()?.billingFrequency).toBe('night');
  });

  // Same guarantee the class already makes about `properties`: a signed-out store must not
  // still be holding the previous host's hostel.
  it('drops the record on sign-out', () => {
    const { store } = setUp();
    store.load();
    expect(store.activeHostel()).toBeDefined();

    store.clear();
    expect(store.activeHostel()).toBeUndefined();
    expect(store.hostels()).toEqual([]);
  });

  it('is undefined before anything has loaded', () => {
    const { store } = setUp();
    expect(store.activeHostel()).toBeUndefined();
  });
});

/**
 * Which half of the console a hostel gets.
 *
 * A month-billed hostel lets beds to tenants; a nightly one sells stays. Bookings, the room
 * calendar and the availability check all belong to the second, and three screens were each
 * working that out from `activeHostel()` themselves before this existed.
 */
describe('HostPropertyStore.isMonthlyBilled', () => {
  afterEach(() => localStorage.clear());

  function withListings(...listings: HostListing[]): HostPropertyStore {
    const api = new ShellApiStub();
    api.data = { listings, draft: null, stats: {} as never };
    const { store } = setUp(api);
    store.load();
    return store;
  }

  it('answers for the active hostel by default', () => {
    expect(withListings(listing({ billingFrequency: 'month' })).isMonthlyBilled()).toBe(true);
    expect(withListings(listing({ billingFrequency: 'night' })).isMonthlyBilled()).toBe(false);
  });

  // What a route guard needs: it runs before the shell syncs the URL's hostel into the
  // selection, so the active one is still the previous page's.
  it('answers for a named hostel, whatever is selected', () => {
    const store = withListings(
      listing({ id: 'a', billingFrequency: 'night' }),
      listing({ id: 'b', billingFrequency: 'month' }),
    );
    store.setProperty('a');

    expect(store.isMonthlyBilled('b')).toBe(true);
    expect(store.isMonthlyBilled('a')).toBe(false);
    expect(store.isMonthlyBilled()).toBe(false);
  });

  // `billingFrequency` is empty when the payload did not say. Nightly is the answer that
  // shows a page that may not apply rather than hiding one that does.
  it('treats an unstated or unknown cycle as nightly', () => {
    expect(withListings(listing({ billingFrequency: '' })).isMonthlyBilled()).toBe(false);
    expect(withListings(listing({ billingFrequency: 'monthly' })).isMonthlyBilled()).toBe(false);
    expect(withListings(listing({ billingFrequency: 'fortnight' })).isMonthlyBilled()).toBe(false);
  });

  it('answers false for a hostel it has never heard of', () => {
    expect(withListings(listing({ id: 'a', billingFrequency: 'month' })).isMonthlyBilled('zz')).toBe(false);
  });
});
