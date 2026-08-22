import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Dropdown, Toggle } from '@hostelhive/ui';
import { MAX_ROOM_IMAGES, MIN_ROOM_CAPACITY, RoomImage } from '@util/room-types';
import { DEFAULT_CURRENCY_CODE } from '@util/currencies';
import {
  DEFAULT_OCCUPANCY_TYPE,
  OCCUPANCY_OPTIONS,
  discountError,
  priceUnitNote,
  unitNoun,
} from '@util/occupancy-type';
import { MoneyInput } from '@app/shared/money-input/money-input';
import { PhotoPicker } from '@app/shared/photo-picker/photo-picker';

/**
 * One room type, as the host fills it in.
 *
 * The five named tiers are gone. `name` is free text now — a host writes what the room is
 * actually called ("Deluxe 6 Bed Private Ensuite") rather than picking from a list that
 * decided their capacity for them — and **occupancy type** carries the axis a seeker shops on.
 *
 * The unit follows from that type and is spelled out wherever a number appears: a price is
 * per room on a private row and per bed on a shared one, and the same figure means very
 * different money depending on which.
 *
 * Extra fields are optional inputs so the moderator review screen, which only edits the
 * original three, keeps working untouched.
 */
@Component({
  selector: 'hh-room-type-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dropdown, Toggle, MoneyInput, PhotoPicker],
  templateUrl: './room-type-row.html',
})
export class RoomTypeRow {
  readonly name = input('');
  readonly capacity = input(1);
  readonly price = input(0);
  readonly occupancyType = input(DEFAULT_OCCUPANCY_TYPE as string);
  readonly discountedPrice = input<number | null>(null);
  /**
   * Whether the stored discount is live.
   *
   * Separate from the price so a host can end a promotion without losing the number — flip it
   * off, flip it back on next season, and the figure is still there. That is the whole reason
   * this is a switch rather than simply clearing the field.
   */
  readonly discountEnabled = input(false);
  readonly description = input('');
  readonly images = input<readonly RoomImage[]>([]);
  /** True while the parent is uploading a picked file. */
  readonly uploadingImage = input(false);
  readonly imageError = input('');
  readonly bookable = input(false);
  /** ISO-4217 code shown as the price prefix. */
  readonly currency = input(DEFAULT_CURRENCY_CODE);
  /**
   * Hide the fields the moderator review screen has no business editing. Defaults to the full
   * set, so the host form gets everything without opting in.
   */
  readonly showBookingFields = input(true);

  readonly nameChange = output<string>();
  readonly capacityChange = output<number>();
  readonly priceChange = output<number>();
  readonly occupancyTypeChange = output<string>();
  readonly discountedPriceChange = output<number | null>();
  readonly discountEnabledChange = output<boolean>();
  readonly descriptionChange = output<string>();
  /** The parent uploads; this only picks, mirroring how the rest of the app splits it. */
  readonly imagePicked = output<File>();
  readonly imageRemoved = output<string>();
  readonly bookableChange = output<boolean>();

  protected readonly occupancyOptions = OCCUPANCY_OPTIONS;
  protected readonly maxImages = MAX_ROOM_IMAGES;

  /**
   * The picker disappears at the cap rather than rejecting a fourth file.
   *
   * A control that is not there cannot be misused, and an error shown after somebody has
   * already chosen a photo has wasted the part of the interaction that costs them effort.
   */
  protected readonly canAddImage = computed(() => this.images().length < MAX_ROOM_IMAGES);

  protected minCapacity(): number {
    return MIN_ROOM_CAPACITY;
  }

  /** "Beds in this room" vs "People this room sleeps" — the same number, different jobs. */
  protected readonly capacityLabel = computed(() =>
    this.occupancyType() === 'private' ? 'Sleeps' : 'Beds',
  );

  protected readonly capacityHint = computed(() =>
    this.occupancyType() === 'private'
      ? 'People this room sleeps. The whole room is booked at once.'
      : 'Beds in this room. Each is booked separately.',
  );

  protected readonly priceLabel = computed(() =>
    this.occupancyType() === 'private' ? 'Price per room' : 'Price per bed',
  );

  protected readonly unitNote = computed(() => priceUnitNote(this.occupancyType()));

  protected readonly unit = computed(() => unitNoun(this.occupancyType(), this.capacity()));

  /**
   * Inline, and it names the number to beat rather than restating the rule.
   *
   * Checked whenever a figure is present, not only while the discount is live: storing an
   * invalid pair behind a switch that is currently off is a landmine for whoever turns it on.
   */
  protected readonly discountProblem = computed(() =>
    discountError(this.price(), this.discountedPrice(), this.currency()),
  );

  /** The badge a seeker will see, derived here so the host sees exactly what they will. */
  protected readonly discountPercent = computed(() => {
    // Nothing to preview while the discount is switched off — a seeker would see the full
    // price, so a badge here would promise something the listing does not do.
    if (!this.discountEnabled()) return null;
    const price = this.price();
    const discounted = this.discountedPrice();
    if (discounted == null || price <= 0 || discounted >= price) return null;
    return Math.round((1 - discounted / price) * 100);
  });

  protected onName(value: string): void {
    this.nameChange.emit(value);
  }

  protected onCapacity(value: string): void {
    const n = Number(value);
    this.capacityChange.emit(Number.isFinite(n) && n > 0 ? Math.floor(n) : MIN_ROOM_CAPACITY);
  }

  protected onOccupancy(value: string | string[] | null): void {
    if (typeof value === 'string' && value) this.occupancyTypeChange.emit(value);
  }

  /** An empty discount field means "no discount", not zero. */
  protected onDiscount(value: number): void {
    this.discountedPriceChange.emit(value > 0 ? value : null);
  }
}
