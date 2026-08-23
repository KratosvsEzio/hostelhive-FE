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

interface RoomGroup {
  kind: RoomKind;
  heading: string;
  /** Shown in place of the rows when the hostel has none of this kind. */
  emptyText: string;
  offers: RoomOffer[];
  /** The cheapest row in this group, which earns the badge. */
  bestId: string | null;
}

/**
 * "Choose your room" — the bookable rooms on a hostel page, grouped by type.
 *
 * Two groups, always both rendered. A hostel with no private rooms says so rather than
 * silently showing only dorms, because a seeker cannot tell the difference between "there are
 * none" and "they failed to load" from an absence.
 *
 * The row is the unit of choice: it carries its own price, its own quantity and its own unit —
 * rooms on a private row, beds on a shared one. That distinction is the whole reason this
 * component exists, so it is spelled out beside every stepper rather than left to the seeker
 * to infer from the group heading.
 */
@Component({
  selector: 'hh-room-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, DecimalPipe, TranslocoPipe],
  templateUrl: './room-picker.html',
})
export class RoomPicker {
  readonly offers = input.required<readonly RoomOffer[]>();
  /** Monthly or nightly — a hostel-level property, so one value for every row. */
  readonly period = input<PricingPeriod>('nightly');
  readonly currency = input<string | null | undefined>('PKR');

  protected readonly basket = inject(BookingBasket);

  /** Rows whose description is expanded. Collapsed is the default; two lines is the clamp. */
  private readonly expanded = signal<ReadonlySet<string>>(new Set());

  /**
   * Which photo each room is showing.
   *
   * Keyed by room rather than held as one index: the rows carousel independently, and a
   * shared index would page every room in the list at once. Rooms absent from the map are
   * on their first photo, so nothing has to be seeded when the offers arrive.
   */
  private readonly photo = signal<ReadonlyMap<string, number>>(new Map());

  /**
   * A room the host has not opened to online booking never appears.
   *
   * Deliberately not rendered-but-disabled: a row a seeker cannot act on is noise in a list
   * they are scanning to choose from. Distinct from a room that is *full for these dates*,
   * which does stay visible with its reason — that one they can fix by moving their dates.
   */
  private readonly bookable = computed(() => this.offers().filter((o) => o.bookable));

  protected readonly groups = computed<RoomGroup[]>(() => {
    const all = this.bookable();
    return [
      this.group('private', 'Private rooms', 'No private rooms available', all),
      this.group('shared', 'Shared rooms', 'No shared rooms available', all),
    ];
  });

  private group(
    kind: RoomKind,
    heading: string,
    emptyText: string,
    all: readonly RoomOffer[],
  ): RoomGroup {
    const offers = all.filter((o) => o.kind === kind);
    // Scoped to the group, not the hostel: the cheapest bed is always cheaper than the
    // cheapest private room, so one hostel-wide badge would only ever mark a dorm.
    const best = offers.reduce<RoomOffer | null>(
      (cheapest, o) =>
        !cheapest || effectivePrice(o) < effectivePrice(cheapest) ? o : cheapest,
      null,
    );
    return { kind, heading, emptyText, offers, bestId: offers.length > 1 ? (best?.id ?? null) : null };
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

  protected isExpanded(id: string): boolean {
    return this.expanded().has(id);
  }

  protected toggleDescription(id: string): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }
}
