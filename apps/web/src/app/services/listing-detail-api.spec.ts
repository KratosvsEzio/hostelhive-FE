import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { HostelDetail } from '@hostelhive/data-access';
import { HostelsApi } from './hostels-api';
import { ListingDetailApi } from './listing-detail-api';

type RoomTypeSeed = {
  id: number;
  name: string;
  capacity: number;
  price: number;
  discounted_price?: number | null;
  is_discountable?: boolean;
  occupancy_type?: string;
};

function listing(roomTypes: RoomTypeSeed[], extra: Record<string, unknown> = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: HostelsApi,
        useValue: {
          getById: () =>
            of({
              id: 'MjvuEl',
              name: 'Backpacker',
              room_types: roomTypes,
              ...extra,
            } as unknown as HostelDetail),
        },
      },
    ],
  });
  let out: { priceFrom?: number } | undefined;
  TestBed.inject(ListingDetailApi).getBySlug('MjvuEl').subscribe((d) => (out = d));
  return out!;
}

const DORM = { id: 1, name: 'Dormitory', capacity: 12, price: 2000, occupancy_type: 'shared' };
const KING = { id: 2, name: 'King size room', capacity: 4, price: 12000, occupancy_type: 'private' };

/**
 * The "From" price a seeker sees before choosing a room.
 *
 * It read the list price, so a hostel whose rooms were all marked down advertised a figure
 * nobody would be charged — and one *higher* than the price on the room card directly beneath
 * it. Two numbers about the same room, on the same screen, disagreeing.
 *
 * It is also the number a seeker filters and compares listings on, so quoting the undiscounted
 * price makes a discounted hostel look more expensive than it is against its neighbours.
 */
describe('ListingDetailApi — From price', () => {
  it('takes the cheapest room when nothing is discounted', () => {
    expect(listing([DORM, KING]).priceFrom).toBe(2000);
  });

  // The screenshot case: dorm 2,000 marked down to 1,200, advertised as "from 2,000".
  it('prefers a discounted price over the list price', () => {
    const d = listing([
      { ...DORM, discounted_price: 1200, is_discountable: true },
      { ...KING, discounted_price: 10000, is_discountable: true },
    ]);

    expect(d.priceFrom).toBe(1200);
  });

  /**
   * Cheapest *payable*, not cheapest list price. A discount can reorder which room is the
   * bargain, and taking the minimum before applying discounts would miss that.
   */
  it('lets a discount on the dearer room win when it undercuts the rest', () => {
    const d = listing([
      DORM,
      { ...KING, discounted_price: 900, is_discountable: true },
    ]);

    expect(d.priceFrom).toBe(900);
  });

  // The host has entered a figure but left the discount switched off.
  it('ignores a discounted price that is not enabled', () => {
    const d = listing([{ ...DORM, discounted_price: 1200, is_discountable: false }]);

    expect(d.priceFrom).toBe(2000);
  });

  /**
   * A "discount" at or above the list price is not one. Honouring it would *raise* the From
   * price — the one direction this figure must never move on its own.
   */
  it('ignores a discount that is not cheaper', () => {
    const d = listing([{ ...DORM, discounted_price: 2500, is_discountable: true }]);

    expect(d.priceFrom).toBe(2000);
  });

  /**
   * `min_price` is the server's undiscounted minimum. Preferring it was what let the list
   * price win; it is now only the answer when there are no room types to read.
   */
  it('does not let the server minimum override a real discount', () => {
    const d = listing(
      [{ ...DORM, discounted_price: 1200, is_discountable: true }],
      { min_price: 2000 },
    );

    expect(d.priceFrom).toBe(1200);
  });

  it('falls back to the server minimum with no room types at all', () => {
    expect(listing([], { min_price: 3500 }).priceFrom).toBe(3500);
  });

  it('reports zero when there is nothing to price', () => {
    expect(listing([]).priceFrom).toBe(0);
  });
});
