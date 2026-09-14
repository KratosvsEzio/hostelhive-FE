import { Injectable, computed, signal } from '@angular/core';
import {
  BasketLine,
  GuestFit,
  RoomOffer,
  clampLineGuests,
  guestFit,
  lineFor,
  lineGuestCapacity,
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
  /**
   * How many people the selection seats — derived, not asked for.
   *
   * The rail used to carry a Guests number input beside the dates, from back when a seeker
   * described their party and the hostel worked out the rooms. The room picker replaced
   * that: a seeker now chooses beds and whole rooms directly, so the headcount is a
   * restatement of what they already picked, and two ways to say one thing can disagree.
   * They did — the field defaulted to 1, so choosing a four-bed dorm read as three beds
   * too many and `fit.ok` refused the booking until the number was corrected by hand.
   *
   * Now the sum of what each line seats. Unchanged in effect until somebody touches a private
   * line's headcount, because a line starts at its full capacity — which is exactly what this
   * used to assume for every line, always. What it adds is the case the booking API asks
   * about: two rooms sleeping four, taken by a party of five.
   */
  readonly guests = computed(() => this._lines().reduce((n, l) => n + l.guests, 0));

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

  /** Drives the "3 of 4 guests placed" tally, and gates checkout. */
  readonly fit = computed<GuestFit>(() => guestFit(this._lines(), this.guests()));

  /**
   * Whether the basket can be booked.
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
      // A headcount the guest set survives a quantity change, clamped to what the new
      // quantity can seat — dropping back to full capacity would silently undo their answer.
      // A line that was never touched has no answer to keep, so it re-derives.
      const before = lines.find((l) => l.roomId === offer.id);
      const kept =
        before && before.guests < lineGuestCapacity(before.kind, before.capacity, before.quantity)
          ? before.guests
          : undefined;
      const next = lineFor(offer, capped, kept);
      // Preserve position so a row does not jump to the bottom of the rail when its
      // quantity changes.
      const at = lines.findIndex((l) => l.roomId === offer.id);
      if (at === -1) return [...lines, next];
      const copy = [...lines];
      copy[at] = next;
      return copy;
    });
  }

  /**
   * How many people are on one line — the private-room headcount.
   *
   * Only private lines have anything to set: a shared line is one bed per person, so its
   * headcount is its bed count and changing one means changing the other. Calling this on a
   * shared line clamps to the bed count and therefore does nothing, which is the right
   * no-op rather than a case the caller has to know about.
   */
  setGuests(roomId: string, guests: number): void {
    this._lines.update((lines) =>
      lines.map((l) =>
        l.roomId === roomId
          ? { ...l, guests: clampLineGuests(l.kind, l.capacity, l.quantity, guests) }
          : l,
      ),
    );
  }

  /** The most people a line can seat — the ceiling on its stepper. */
  guestCapacityOf(roomId: string): number {
    const line = this._lines().find((l) => l.roomId === roomId);
    return line ? lineGuestCapacity(line.kind, line.capacity, line.quantity) : 0;
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
