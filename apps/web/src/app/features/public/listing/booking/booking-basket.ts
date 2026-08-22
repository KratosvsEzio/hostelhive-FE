import { Injectable, computed, signal } from '@angular/core';
import {
  BasketLine,
  DEPOSIT_RATE,
  GuestFit,
  RoomOffer,
  depositFor,
  guestFit,
  lineFor,
  lineTotal,
  lineTotalUndiscounted,
  nightsBetween,
} from './room-offer';

/**
 * The booking a seeker is assembling on a hostel page.
 *
 * Provided by the listing page rather than in root: a basket belongs to one hostel, and rooms
 * carried between hostels would be nonsense. Leaving the page disposes it, which is also what
 * should release the hold.
 *
 * Everything the rail renders is derived here rather than in the template — the totals, the
 * deposit and the guest tally are the parts most likely to be read twice and disagree, and a
 * single computed cannot disagree with itself.
 */
@Injectable()
export class BookingBasket {
  /** Selected rooms, in the order they were added. */
  private readonly _lines = signal<readonly BasketLine[]>([]);
  readonly lines = this._lines.asReadonly();

  readonly checkIn = signal<Date | null>(null);
  readonly checkOut = signal<Date | null>(null);
  readonly guests = signal(1);

  /** Zero until both dates are set, which is what keeps totals from rendering as NaN. */
  readonly nights = computed(() => {
    const from = this.checkIn();
    const to = this.checkOut();
    return from && to ? nightsBetween(from, to) : 0;
  });

  readonly isEmpty = computed(() => this._lines().length === 0);

  /** What the whole stay costs, at the discounted rate. */
  readonly total = computed(() => {
    const nights = this.nights();
    return this._lines().reduce((sum, l) => sum + lineTotal(l, nights), 0);
  });

  /** The same stay before discounts — the struck-through figure under the total. */
  readonly totalUndiscounted = computed(() => {
    const nights = this.nights();
    return this._lines().reduce((sum, l) => sum + lineTotalUndiscounted(l, nights), 0);
  });

  /** Paid online now; the balance falls due at the property. */
  readonly deposit = computed(() => depositFor(this.total(), DEPOSIT_RATE));

  readonly balanceAtProperty = computed(() => this.total() - this.deposit());

  /** Drives the "3 of 4 guests placed" tally, and gates checkout. */
  readonly fit = computed<GuestFit>(() => guestFit(this._lines(), this.guests()));

  /**
   * Whether the basket can be paid for.
   *
   * Dates and a workable seating arrangement, both. A basket that seats everybody but has no
   * dates has no nights to price, and would total zero.
   */
  readonly canBook = computed(() => this.nights() > 0 && this.fit().ok);

  /** Units of one room already in the basket — the stepper's current value. */
  quantityOf(roomId: string): number {
    return this._lines().find((l) => l.roomId === roomId)?.quantity ?? 0;
  }

  /**
   * Set the quantity for a room, adding, updating or removing as needed.
   *
   * One entry point rather than add/update/remove, because the stepper only ever expresses
   * "this many now" — and three methods would leave each caller deciding which case it is in.
   * Quantity is clamped to what is available, so a stepper cannot outrun the inventory even if
   * a stale render lets somebody press it.
   */
  setQuantity(offer: RoomOffer, quantity: number): void {
    const capped = Math.max(0, Math.min(quantity, offer.available));
    this._lines.update((lines) => {
      const rest = lines.filter((l) => l.roomId !== offer.id);
      if (capped === 0) return rest;
      const next = lineFor(offer, capped);
      // Preserve position so a row does not jump to the bottom of the rail when its
      // quantity changes.
      const at = lines.findIndex((l) => l.roomId === offer.id);
      if (at === -1) return [...lines, next];
      const copy = [...lines];
      copy[at] = next;
      return copy;
    });
  }

  /** The rail's delete control, and stepping down to zero. */
  remove(roomId: string): void {
    this._lines.update((lines) => lines.filter((l) => l.roomId !== roomId));
  }

  /** Leaving the hostel, or changing dates in a way that invalidates the selection. */
  clear(): void {
    this._lines.set([]);
  }
}
