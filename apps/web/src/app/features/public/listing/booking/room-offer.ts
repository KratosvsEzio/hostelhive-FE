/**
 * What a seeker can actually buy on a hostel page, and the arithmetic over it.
 *
 * The two room types are sold in different units and that difference runs through everything
 * here: a private room is bought whole, a shared room is bought a bed at a time. Keeping the
 * unit attached to the type — rather than leaving each call site to remember — is what stops
 * a stepper reading "2" and meaning rooms in one row and beds in the next.
 *
 * Deliberately free of Angular so the money and the reconciliation rules can be tested as
 * plain functions. **Stub pending Q-API**: the shapes mirror the contract in the Rooms &
 * Booking PRD, which the backend has not yet built.
 */

/** The axis a seeker shops on. Replaces the five capacity tiers. */
import { PricingPeriod } from '@util/pricing-period';

export type RoomKind = 'private' | 'shared';

/** How many photos a room may show. A product rule, so the UI enforces it rather than hopes. */
export const MAX_ROOM_PHOTOS = 3;

/** What one unit of a room is. Private rooms sell rooms; shared rooms sell beds. */
export type RoomUnit = 'room' | 'bed';

/** Rooms are bought whole; beds are bought individually. */
export function unitFor(kind: RoomKind): RoomUnit {
  return kind === 'private' ? 'room' : 'bed';
}

export interface RoomOffer {
  id: string;
  title: string;
  /** Host-written. Clamped in the UI, expandable in place. */
  description?: string;
  kind: RoomKind;
  /**
   * People the room sleeps — the "Sleeps N" chip, and the ceiling on guests.
   *
   * On a shared room this is also the bed inventory. On a private room it sells nothing: the
   * unit is the room, and booking one takes all its beds with it whoever turns up.
   */
  capacity: number;
  /** The undiscounted rate. Struck through whenever a discount exists. */
  actualPrice: number;
  /** When set, this is what is charged. Always below {@link actualPrice}. */
  discountedPrice?: number;
  /** Up to 3. */
  images: string[];
  /** Host toggle. A room that is not bookable never reaches the picker at all. */
  bookable: boolean;
  /**
   * Units free across the whole requested range — rooms for private, beds for shared.
   *
   * Computed by the backend as seen by *this* seeker, so it already includes anything their
   * own hold is holding. Without that a seeker's own selection would eat their own stepper.
   */
  available: number;
}

/** The price actually charged: the discount when there is one, otherwise the list price. */
export function effectivePrice(offer: RoomOffer): number {
  return offer.discountedPrice ?? offer.actualPrice;
}

/**
 * `25` for a room marked down 25%, or `null` when there is no discount.
 *
 * Derived rather than stored — a stored percentage is a third number that can disagree with
 * the two it describes. Rounded, because "−24.9%" reads as a bug rather than as precision.
 */
export function discountPercent(offer: RoomOffer): number | null {
  const { actualPrice, discountedPrice } = offer;
  if (discountedPrice == null || actualPrice <= 0) return null;
  if (discountedPrice >= actualPrice) return null;
  return Math.round((1 - discountedPrice / actualPrice) * 100);
}

/**
 * One room in a basket, with the prices captured at the moment it was added.
 *
 * The prices are copied rather than referenced on purpose. A discount stands until the host
 * removes it, which means hosts *will* remove them while bookings are live — and a line that
 * reads today's price would silently reprice a stay somebody already paid for, and refund a
 * later cancellation against a number the guest never agreed to.
 */
export interface BasketLine {
  roomId: string;
  title: string;
  kind: RoomKind;
  /** Rooms on a private line, beds on a shared one. */
  quantity: number;
  /** Per unit, per period. What gets charged. */
  unitPrice: number;
  /** Per unit, per period. Kept for the struck-through figure and the receipt. */
  actualPrice: number;
  /** Only meaningful on a private line — a shared line seats exactly its bed count. */
  capacity: number;
}

/** Turns an offer into a basket line, snapshotting both prices. */
export function lineFor(offer: RoomOffer, quantity: number): BasketLine {
  return {
    roomId: offer.id,
    title: offer.title,
    kind: offer.kind,
    quantity,
    unitPrice: effectivePrice(offer),
    actualPrice: offer.actualPrice,
    capacity: offer.capacity,
  };
}

/** `unit price × quantity × nights`, at the discounted rate. */
export function lineTotal(line: BasketLine, nights: number): number {
  return line.unitPrice * line.quantity * nights;
}

/** The same line before any discount — the struck-through figure beside the total. */
export function lineTotalUndiscounted(line: BasketLine, nights: number): number {
  return line.actualPrice * line.quantity * nights;
}

/** Beds selected across the basket. Each seats exactly one guest. */
export function bedsBooked(lines: readonly BasketLine[]): number {
  return lines
    .filter((l) => l.kind === 'shared')
    .reduce((n, l) => n + l.quantity, 0);
}

/** Heads the private rooms can take: capacity × rooms, summed. */
export function privateCapacityBooked(lines: readonly BasketLine[]): number {
  return lines
    .filter((l) => l.kind === 'private')
    .reduce((n, l) => n + l.capacity * l.quantity, 0);
}

/**
 * Whether a selection can seat the party, and by how much it misses.
 *
 * Three dorm beds is unambiguously three people, but one private room of capacity four might
 * be one guest or four — so the rooms picked do not by themselves say how many are staying.
 * The rule that falls out: every bed seats one guest, every private room seats up to its
 * capacity, so a workable selection satisfies
 * `beds ≤ guests ≤ beds + private capacity`.
 *
 * `shortfall` drives the running tally in the rail — "3 of 4 guests placed" — which is the
 * point of returning a number rather than a boolean. Telling somebody their selection is
 * wrong on submit leaves them to work out which of two numbers to change.
 */
export interface GuestFit {
  beds: number;
  privateCapacity: number;
  seated: number;
  /** Guests with nowhere to sleep. Zero when the selection works. */
  shortfall: number;
  /** True when more beds are booked than there are guests to fill them. */
  overBedded: boolean;
  ok: boolean;
}

export function guestFit(lines: readonly BasketLine[], guests: number): GuestFit {
  const beds = bedsBooked(lines);
  const privateCapacity = privateCapacityBooked(lines);
  const seated = Math.min(guests, beds + privateCapacity);
  // Beds are bought one guest at a time, so buying more than the party size is a mistake
  // rather than generosity — and it is one a seeker makes by stepping past their headcount.
  const overBedded = beds > guests;
  return {
    beds,
    privateCapacity,
    seated,
    shortfall: Math.max(0, guests - (beds + privateCapacity)),
    overBedded,
    ok: !overBedded && guests <= beds + privateCapacity && lines.length > 0,
  };
}

/** Nights between two dates. Check-out is exclusive, so 23→26 Aug is three nights. */
export function nightsBetween(checkIn: Date, checkOut: Date): number {
  const ms = checkOut.getTime() - checkIn.getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/**
 * Whether a hostel can be booked online at all.
 *
 * Only nightly hostels. A monthly hostel is a tenancy — somebody moving in for a semester
 * signs an agreement, pays a deposit that is not 10% of a year, and meets the host first;
 * none of that is a checkout flow, and pretending otherwise would put a "Book now" button on
 * a decision nobody makes from a phone in four minutes.
 *
 * This is also what keeps the deposit sane. Ten percent of three nights is small; ten percent
 * of a twelve-month let is PKR 30,000 asked of a student before they have seen the room. That
 * problem does not need solving because that booking does not exist.
 *
 * Monthly hostels keep the enquiry path they have today.
 */
export function canBookOnline(period: PricingPeriod): boolean {
  return period === 'nightly';
}

/**
 * Share of the booking taken online at booking time.
 *
 * Configuration rather than a constant: it is the number most likely to be tuned, and it also
 * sets the base for every cancellation charge, so it needs one home rather than a literal
 * scattered through the pricing, the rail and the refund maths.
 */
export const DEPOSIT_RATE = 0.1;

/** What the guest pays now. The rest falls due at the property. */
export function depositFor(total: number, rate: number = DEPOSIT_RATE): number {
  return Math.round(total * rate * 100) / 100;
}
