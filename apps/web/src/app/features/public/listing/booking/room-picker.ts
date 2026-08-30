import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Button } from '@hostelhive/ui';
import { PricingPeriod, periodLabel } from '@util/pricing-period';
import { BookingBasket } from './booking-basket';
import {
  MAX_ROOM_PHOTOS,
  RoomKind,
  RoomOffer,
  discountPercent,
  effectivePrice,
  unitFor,
} from './room-offer';
import { TranslocoPipe } from '@jsverse/transloco';
import { CurrencySymbolPipe } from '@app/shared/currency/currency-symbol.pipe';

/**
 * A kind and its rooms. Not rendered as a block any more — {@link RoomPicker.rows}
 * flattens these into one list — but the grouping still decides order and best price.
 */
interface RoomGroup {
  kind: RoomKind;
  offers: RoomOffer[];
  /** The cheapest row in this group, which earns the badge. */
  bestId: string | null;
}

/**
 * "Choose your room" — the bookable rooms on a hostel page, private ones first.
 *
 * Both billing frequencies. A monthly hostel used to get a separate, plainer "Rooms &
 * pricing" list — the same room types off the same payload, rendered without photos,
 * descriptions or discounts, purely because it had no checkout behind it. What a tenancy
 * lacks is the *booking* controls, not the room cards, so this section serves both and
 * drops the controls where they mean nothing. See {@link RoomPicker.nightly}.
 *
 * One list, not two labelled blocks. The kind moved from a heading above a group to a badge
 * on each card, which lets the rooms read as a single set to scan while still saying what
 * each one is. Order carries what the headings used to: private rooms lead, shared follow.
 *
 * The row is the unit of choice: it carries its own price, its own quantity and its own unit —
 * rooms on a private row, beds on a shared one. That distinction is the whole reason this
 * component exists, so it is spelled out beside every stepper rather than left to the seeker
 * to infer from anything above.
 */
@Component({
  selector: 'hh-room-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, DecimalPipe, TranslocoPipe, CurrencySymbolPipe],
  templateUrl: './room-picker.html',
  // The listing column spaces its cards with `space-y-4`, which works by putting a
  // margin-top on each sibling. A custom element defaults to `display: inline`, and
  // vertical margins do not apply to an inline box — so the margin was there all along
  // (computed 16px) and bought nothing, leaving this card flush against the description
  // above it. Everything inside was already a block; only the host was not.
  host: { class: 'block' },
})
export class RoomPicker {
  readonly offers = input.required<readonly RoomOffer[]>();
  /** Monthly or nightly — a hostel-level property, so one value for every row. */
  readonly period = input<PricingPeriod>('nightly');
  readonly currency = input<string | null | undefined>('PKR');

  protected readonly basket = inject(BookingBasket);

  /**
   * The room whose description is open in the modal, or null.
   *
   * One row at a time, and the offer itself rather than its id, so the modal has the title
   * to head itself with and cannot render against a row that has since left the list.
   */
  protected readonly openDescription = signal<RoomOffer | null>(null);

  /**
   * Which photo each room is showing.
   *
   * Keyed by room rather than held as one index: the rows carousel independently, and a
   * shared index would page every room in the list at once. Rooms absent from the map are
   * on their first photo, so nothing has to be seeded when the offers arrive.
   */
  private readonly photo = signal<ReadonlyMap<string, number>>(new Map());

  /**
   * Every room the hostel has. Nothing is filtered out of this list.
   *
   * `is_bookable` used to decide whether a row existed at all, which conflated two
   * questions: what rooms the hostel has, and which of them can be reserved online right
   * now. A seeker reads the first to decide whether the place suits them — a hostel whose
   * host had not switched booking on simply appeared to have no rooms. It is a monthly
   * hostel's permanent state, since it has no online booking to switch on.
   *
   * So the flag now decides what a card *carries* rather than whether it appears — see
   * {@link RoomPicker.canAdd}.
   */
  private readonly groups = computed<RoomGroup[]>(() => {
    const all = this.offers();
    return [this.group('private', all), this.group('shared', all)];
  });

  /**
   * Every bookable room in one list, private ones first.
   *
   * The two kinds were separate blocks under their own headings. The headings are gone and
   * each card carries its kind as a badge instead, but the order is not incidental —
   * private rooms lead, so the grouping survives as sequence even without a label over it.
   *
   * Still derived from {@link groups} rather than by sorting the flat list, because
   * "cheapest of its kind" is a per-group judgement: the cheapest bed always undercuts the
   * cheapest private room, so one hostel-wide best price would only ever mark a dorm.
   */
  protected readonly rows = computed(() =>
    this.groups().flatMap((g) =>
      g.offers.map((offer) => ({ offer, kind: g.kind, best: g.bestId === offer.id })),
    ),
  );


  /**
   * Whether this listing is sold by the night.
   *
   * Carries the kind badge, which is a hostel-level judgement rather than a per-room one:
   * a monthly hostel lets by the room and returns one kind in practice, so the badge would
   * repeat itself down the whole list instead of telling the two apart.
   */
  protected readonly nightly = computed(() => this.period() === 'nightly');

  /**
   * Whether this particular room can go in a basket.
   *
   * Per room, not per hostel, because the two reasons it can fail are different in kind:
   * the hostel may have no checkout at all (a monthly tenancy), or the host may have left
   * this one room closed to online booking while its neighbours are open. Both end in the
   * same place — the card shows the room and its price and simply offers no control.
   *
   * The scarcity chip follows it rather than {@link nightly}: "2 left" is a reason to
   * hurry, and there is nothing to hurry toward on a room that cannot be reserved.
   */
  protected canAdd(offer: RoomOffer): boolean {
    return this.nightly() && offer.bookable;
  }

  /** "Private" / "Shared" — what the group headings used to say, per card. */
  protected kindLabel(kind: RoomKind): string {
    return kind === 'private' ? 'Private' : 'Shared';
  }

  private group(kind: RoomKind, all: readonly RoomOffer[]): RoomGroup {
    const offers = all.filter((o) => o.kind === kind);
    // Scoped to the group, not the hostel: the cheapest bed is always cheaper than the
    // cheapest private room, so one hostel-wide badge would only ever mark a dorm.
    const best = offers.reduce<RoomOffer | null>(
      (cheapest, o) =>
        !cheapest || effectivePrice(o) < effectivePrice(cheapest) ? o : cheapest,
      null,
    );
    return {
      kind,
      offers,
      bestId: offers.length > 1 ? (best?.id ?? null) : null,
    };
  }

  protected periodLabel(): string {
    return periodLabel(this.period());
  }

  protected price(offer: RoomOffer): number {
    return effectivePrice(offer);
  }

  protected discount(offer: RoomOffer): number | null {
    return discountPercent(offer);
  }

  /** "per room" / "per bed" — the footnote that makes a dorm price legible. */
  protected unitNote(kind: RoomKind): string {
    return kind === 'private' ? 'Prices are per room' : 'Prices are per bed';
  }

  /** "2 Rooms" / "3 Beds", pluralised. Shown under the stepper so a bare number is never alone. */
  protected unitLabel(offer: RoomOffer, n: number): string {
    const unit = unitFor(offer.kind);
    return `${n} ${unit}${n === 1 ? '' : 's'}`;
  }

  protected qty(offer: RoomOffer): number {
    return this.basket.quantityOf(offer.id);
  }

  protected add(offer: RoomOffer): void {
    this.basket.setQuantity(offer, 1);
  }

  protected step(offer: RoomOffer, by: number): void {
    this.basket.setQuantity(offer, this.qty(offer) + by);
  }

  /** The stepper's ceiling is availability, so an unhonourable basket cannot be built. */
  protected atMax(offer: RoomOffer): boolean {
    return this.qty(offer) >= offer.available;
  }

  /**
   * The room's photos, capped at the three the contract allows.
   *
   * Capped here rather than trusted: the field is host-supplied and the cap is a product
   * rule, so a payload carrying eight would otherwise render eight dots under a card sized
   * for three.
   */
  protected photosOf(offer: RoomOffer): readonly string[] {
    return offer.images.slice(0, MAX_ROOM_PHOTOS);
  }

  protected photoIndex(offer: RoomOffer): number {
    return this.photo().get(offer.id) ?? 0;
  }

  protected stepPhoto(offer: RoomOffer, by: number, event: Event): void {
    // The arrows sit inside a row that is not a link today but sits on a page full of them,
    // and paging a photo must never be what navigates.
    event.preventDefault();
    event.stopPropagation();
    const last = this.photosOf(offer).length - 1;
    const next = Math.max(0, Math.min(last, this.photoIndex(offer) + by));
    this.photo.update((m) => new Map(m).set(offer.id, next));
  }

  /**
   * Whether the two-line clamp is likely to be hiding something.
   *
   * The clamp is CSS, so what actually got cut is only knowable from the rendered box —
   * and measuring it per row means an observer per card for a control this small. This
   * approximates from length instead, the same way review comments do.
   *
   * Deliberately low. The column is narrower on a phone than on the desktop card this was
   * sized against, so any single threshold is wrong at the margins; erring low shows the
   * control on a description that did not need it, erring high buries text a seeker cannot
   * then reach. A redundant button is the cheaper mistake.
   */
  protected hasMoreToRead(offer: RoomOffer): boolean {
    return (offer.description?.length ?? 0) > 80;
  }
}
