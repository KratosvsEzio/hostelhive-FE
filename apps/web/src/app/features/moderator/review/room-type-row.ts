import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Dropdown, DropdownOption, Toggle } from '@hostelhive/ui';
import { MAX_ROOM_IMAGES, MIN_ROOM_CAPACITY, RoomImage } from '@util/room-types';
import { DEFAULT_CURRENCY_CODE } from '@util/currencies';
import {
  DEFAULT_OCCUPANCY_TYPE,
  OCCUPANCY_OPTIONS,
  isPrivateOccupancy,
  discountError,
  unitNoun,
} from '@util/occupancy-type';
import { MoneyInput } from '@app/shared/money-input/money-input';
import { PhotoPicker } from '@app/shared/photo-picker/photo-picker';
import { CurrencySymbolPipe } from '@app/shared/currency/currency-symbol.pipe';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * One room type, as the host fills it in.
 *
 * A hostel has five or six of these and the form is unusable if each one is a wall of
 * fields — so a row that is already filled in **collapses to a summary line** and opens only
 * when it needs editing. What stays visible collapsed is what a host scans for: the name,
 * how it is sold, the size, and the price.
 *
 * The five named tiers are gone. `name` is free text — a host writes what the room is
 * actually called — and **occupancy type** carries the axis a seeker shops on. The unit
 * follows from that type and is said wherever a number appears, because the same figure
 * means very different money on a private row than a shared one.
 */
@Component({
  selector: 'hh-room-type-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dropdown, Toggle, MoneyInput, PhotoPicker, DecimalPipe, CurrencySymbolPipe, TranslocoPipe],
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
   * off, flip it back on next season, and the figure is still there.
   */
  readonly discountEnabled = input(false);
  readonly description = input('');
  readonly images = input<readonly RoomImage[]>([]);
  readonly uploadingImage = input(false);
  /**
   * How many more photos this row can take — uploads already on their way included.
   *
   * The parent owns the number because only the parent knows about a file that has left the
   * picker and not yet come back with an id; `images()` counts what has landed. Left unset it
   * falls back to the visibly free slots, which is right for a parent that uploads nothing.
   */
  readonly freeSlots = input<number | null>(null);
  readonly imageError = input('');
  readonly bookable = input(false);
  readonly currency = input(DEFAULT_CURRENCY_CODE);
  /** Hide what the moderator review screen has no business editing. */
  readonly showBookingFields = input(true);
  /** Rows in the add-a-room panel are always open — there is nothing to summarise yet. */
  readonly alwaysOpen = input(false);

  readonly nameChange = output<string>();
  readonly capacityChange = output<number>();
  readonly priceChange = output<number>();
  readonly occupancyTypeChange = output<string>();
  readonly discountedPriceChange = output<number | null>();
  readonly discountEnabledChange = output<boolean>();
  readonly descriptionChange = output<string>();
  readonly imagePicked = output<File>();
  readonly imageRemoved = output<string>();
  readonly bookableChange = output<boolean>();
  readonly removed = output<void>();

  /**
   * What "Sold as" offers. Defaulted rather than required: the moderator's review screen
   * renders this row without the host form's options call behind it, and a row that cannot
   * show its own occupancy is worse than one showing the pair the app has always known.
   */
  readonly occupancyOptions = input<DropdownOption[]>(OCCUPANCY_OPTIONS);
  protected readonly maxImages = MAX_ROOM_IMAGES;

  /** Opened by the host. A row that has no name yet has nothing to collapse into. */
  private readonly opened = signal(false);

  protected readonly expanded = computed(
    () => this.alwaysOpen() || this.opened() || !this.name().trim(),
  );

  protected toggleExpanded(): void {
    this.opened.update((v) => !v);
  }

  protected minCapacity(): number {
    return MIN_ROOM_CAPACITY;
  }

  protected readonly isPrivate = computed(() => isPrivateOccupancy(this.occupancyType()));


  protected readonly priceLabel = computed(() =>
    this.isPrivate() ? 'Price per room' : 'Price per bed',
  );

  /** "1 bed" / "6 beds" / "4 rooms" — for the collapsed summary. */
  protected readonly unitSummary = computed(() =>
    this.isPrivate()
      ? `sleeps ${this.capacity()}`
      : `${this.capacity()} ${unitNoun('shared', this.capacity())}`,
  );

  protected readonly unit = computed(() => unitNoun(this.occupancyType(), 1));

  /**
   * Only complains about a discount somebody is actually using.
   *
   * An empty field is the normal state for most rooms, not an incomplete form — and a
   * disabled one is not in play at all. Shouting at a host about a price they never entered,
   * on every row, is how a form teaches people to ignore its errors.
   */
  protected readonly discountProblem = computed(() => {
    const value = this.discountedPrice();
    if (!this.discountEnabled() || value == null || value === 0) return '';
    return discountError(this.price(), value, this.currency());
  });

  /** The badge a seeker will see, so the host is not guessing at it. */
  protected readonly discountPercent = computed(() => {
    if (!this.discountEnabled()) return null;
    const price = this.price();
    const discounted = this.discountedPrice();
    if (discounted == null || price <= 0 || discounted >= price) return null;
    return Math.round((1 - discounted / price) * 100);
  });

  /** What a seeker would actually be charged — the discount when live, else the list price. */
  protected readonly effectivePrice = computed(() => {
    const discounted = this.discountedPrice();
    return this.discountEnabled() && discounted != null && discounted > 0
      ? discounted
      : this.price();
  });

  /** What the picker may take in one go, so three empty slots can be filled in one trip. */
  protected readonly openSlots = computed(
    () => this.freeSlots() ?? Math.max(0, MAX_ROOM_IMAGES - this.images().length),
  );

  /**
   * What the picker turned away, kept here because the picker may not survive saying it.
   *
   * Filling the last slot takes the tile out of the grid, and that is exactly the pick most
   * likely to have dropped a file — so the message would vanish in the one case it is needed.
   * This line sits below the grid and stays.
   */
  protected readonly pickerError = signal('');

  /** The upload failure from the parent, or what the picker refused — whichever is live. */
  protected readonly imageProblem = computed(() => this.imageError() || this.pickerError());

  protected onImagePicked(file: File): void {
    this.pickerError.set('');
    this.imagePicked.emit(file);
  }

  /** Freeing a slot makes "no room left" untrue, so the message goes with the photo. */
  protected onImageRemoved(id: string): void {
    this.pickerError.set('');
    this.imageRemoved.emit(id);
  }

  /**
   * Always three slots: the photos so far, then the picker, then whatever is still free.
   *
   * Rendering only what exists left one small tile against empty space and said nothing about
   * how many more were allowed. Three slots show the cap rather than stating it, and every
   * tile is the same size at every viewport — which a wrapping row of fixed-width boxes
   * cannot promise.
   */
  protected readonly slots = computed(() => {
    const images = this.images();
    return Array.from({ length: MAX_ROOM_IMAGES }, (_, i) => ({
      image: images[i] ?? null,
      picker: i === images.length,
    }));
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

  /** An empty field means "no discount", not zero. */
  protected onDiscount(value: number): void {
    this.discountedPriceChange.emit(value > 0 ? value : null);
  }
}
