import { TestBed } from '@angular/core/testing';
import { BookingBasket } from './booking-basket';
import { RoomOffer } from './room-offer';

const KING: RoomOffer = {
  id: 'KGJwMC',
  title: 'King size room',
  kind: 'private',
  capacity: 4,
  actualPrice: 12_000,
  images: [],
  bookable: true,
  available: 9,
};

const DORM: RoomOffer = {
  id: 'MqVuEl',
  title: 'Dormitory',
  kind: 'shared',
  capacity: 12,
  actualPrice: 2_000,
  images: [],
  bookable: true,
  available: 12,
};

function basket(): BookingBasket {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [BookingBasket] });
  return TestBed.inject(BookingBasket);
}

/**
 * How many people are on each line.
 *
 * The booking API asks per line rather than per trip, and the two readings of "two rooms that
 * sleep four" — a party of four, or a party of eight — are a booking for different numbers of
 * people. The basket used to assume the larger one for every private line, always.
 */
describe('BookingBasket — per-line guests', () => {
  it('starts a private line at its full capacity', () => {
    const b = basket();
    b.setQuantity(KING, 2);

    // Two rooms sleeping four: eight, until somebody says otherwise.
    expect(b.lines()[0]!.guests).toBe(8);
  });

  // A bed is sold to one person, so there is no second number to hold.
  it('keeps a shared line headcount equal to its beds', () => {
    const b = basket();
    b.setQuantity(DORM, 3);

    expect(b.lines()[0]!.guests).toBe(3);
  });

  it('lets a private line be brought down', () => {
    const b = basket();
    b.setQuantity(KING, 2);

    b.setGuests(KING.id, 4);

    expect(b.lines()[0]!.guests).toBe(4);
  });

  it('will not seat more than the line holds', () => {
    const b = basket();
    b.setQuantity(KING, 2);

    b.setGuests(KING.id, 99);

    expect(b.lines()[0]!.guests).toBe(8);
  });

  it('will not seat nobody', () => {
    const b = basket();
    b.setQuantity(KING, 1);

    b.setGuests(KING.id, 0);

    expect(b.lines()[0]!.guests).toBe(1);
  });

  /**
   * A shared line has nothing to set — its beds are its people. Calling this on one is a
   * no-op rather than a case every caller has to know to avoid.
   */
  it('does nothing to a shared line', () => {
    const b = basket();
    b.setQuantity(DORM, 3);

    b.setGuests(DORM.id, 1);

    expect(b.lines()[0]!.guests).toBe(3);
  });

  /**
   * An answer the guest gave survives them changing their mind about the room count. Resetting
   * to full capacity would undo it silently, which is worse than either number.
   */
  it('keeps a headcount the guest set when the room count changes', () => {
    const b = basket();
    b.setQuantity(KING, 2);
    b.setGuests(KING.id, 5);

    b.setQuantity(KING, 3);

    expect(b.lines()[0]!.guests).toBe(5);
  });

  it('brings a kept headcount down to what the new room count seats', () => {
    const b = basket();
    b.setQuantity(KING, 3);
    b.setGuests(KING.id, 10);

    b.setQuantity(KING, 1);

    expect(b.lines()[0]!.guests).toBe(4);
  });

  // Untouched means no answer to keep — it re-derives rather than freezing the old capacity.
  it('re-derives a line nobody has touched', () => {
    const b = basket();
    b.setQuantity(KING, 1);

    b.setQuantity(KING, 2);

    expect(b.lines()[0]!.guests).toBe(8);
  });

  /**
   * The trip total is the sum of the lines. Unchanged from what it used to compute until
   * somebody lowers a line — which is the whole point of the change being safe to make.
   */
  it('totals the trip from its lines', () => {
    const b = basket();
    b.setQuantity(KING, 2);
    b.setQuantity(DORM, 1);

    expect(b.guests()).toBe(9);

    b.setGuests(KING.id, 4);

    expect(b.guests()).toBe(5);
  });

  it('reports what a line can seat, for the stepper ceiling', () => {
    const b = basket();
    b.setQuantity(KING, 2);
    b.setQuantity(DORM, 3);

    expect(b.guestCapacityOf(KING.id)).toBe(8);
    expect(b.guestCapacityOf(DORM.id)).toBe(3);
    expect(b.guestCapacityOf('nothing')).toBe(0);
  });
});
