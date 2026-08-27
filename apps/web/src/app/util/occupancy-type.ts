import { DropdownOption } from '@hostelhive/ui';

/**
 * How a room is sold — the axis that replaced the five capacity tiers.
 *
 * A **private** room is bought whole: one booking takes it, and its capacity is a ceiling on
 * guests rather than a count of things to sell. A **shared** room is bought a bed at a time,
 * so its capacity *is* its inventory.
 *
 * That difference is why the same `price` column means per-room on one row and per-bed on the
 * next, and why a quantity of 2 means two rooms in one place and two beds in another. Keeping
 * the vocabulary in one file is what stops the two drifting apart across the host form, the
 * seeker picker and the API boundary.
 */
export const OCCUPANCY_TYPES = ['private', 'shared'] as const;

export type OccupancyType = (typeof OCCUPANCY_TYPES)[number];

export const DEFAULT_OCCUPANCY_TYPE: OccupancyType = 'shared';

export function isOccupancyType(value: unknown): value is OccupancyType {
  return typeof value === 'string' && (OCCUPANCY_TYPES as readonly string[]).includes(value);
}

/**
 * Every spelling of "sold whole" this app has to understand.
 *
 * `GET /api/hostels/new` publishes the slug `private_room`; the seeker filters and the older
 * host code say `private`. They mean the same thing, and the difference is invisible until it
 * is not: a `=== 'private'` that meets `private_room` answers *shared*, which prices a whole
 * room per bed, draws it as a row of pips, and offers it a bed at a time. No live hostel has a
 * private room yet, so nothing has hit that — but the check has to survive both spellings
 * rather than depend on which one arrives.
 */
const PRIVATE_SLUGS: readonly string[] = ['private', 'private_room'];

/** Whether this room is sold whole, whichever spelling the value came in. */
export function isPrivateOccupancy(type: string | null | undefined): boolean {
  return !!type && PRIVATE_SLUGS.includes(type);
}

/** What the host picks between when the API has not said — see {@link occupancyOptionsFrom}. */
export const OCCUPANCY_OPTIONS: DropdownOption[] = [
  { value: 'private', label: 'Private room' },
  { value: 'shared', label: 'Shared room' },
];

/** Our wording for the slugs we know, so the API's `name` never has to be shown raw. */
const OCCUPANCY_LABELS: Record<string, string> = {
  shared: 'Shared room',
  private: 'Private room',
  private_room: 'Private room',
};

/**
 * The "Sold as" choices, built from what `GET /api/hostels/new` says exists.
 *
 * **The values come from the API; the words do not.** Its `name` for `private_room` is
 * `"Private_room"` — a slug run through `humanize`, not copy — and "Shared" alone drops the
 * noun that makes the pair read as a pair. So a slug we recognise keeps our wording, and only
 * one we have never seen falls back to a tidied version of the server's name. A third
 * occupancy type added server-side therefore appears here on its own, readable, without a
 * release; it just gets house copy once somebody writes it.
 *
 * An empty list means the options call failed. {@link OCCUPANCY_OPTIONS} stands in rather than
 * rendering an empty dropdown the host cannot get past.
 */
export function occupancyOptionsFrom(
  options: readonly { slug: string; name: string }[] | null | undefined,
): DropdownOption[] {
  if (!options?.length) return OCCUPANCY_OPTIONS;
  return options.map((o) => ({
    value: o.slug,
    label: OCCUPANCY_LABELS[o.slug] ?? humanise(o.name),
  }));
}

/**
 * What a brand-new room type starts on, given what the backend offers.
 *
 * {@link DEFAULT_OCCUPANCY_TYPE} first, because that choice has a price attached and a reason
 * behind it: a shared room mispriced as private overcharges one guest, where the reverse
 * undersells a whole room. But only if the backend still offers that slug — a default the
 * dropdown does not list renders as a blank field the host has to notice and fix, so the
 * first offered option is the better wrong answer than none at all.
 */
export function defaultOccupancyFrom(options: readonly DropdownOption[]): string {
  const safe = options.find((o) => o.value === DEFAULT_OCCUPANCY_TYPE);
  return String(safe?.value ?? options[0]?.value ?? DEFAULT_OCCUPANCY_TYPE);
}

/** `Private_room` -> `Private room`. Underscores are a slug leaking, not a word. */
function humanise(name: string): string {
  const words = name.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Seeker-facing label for one room. */
export function occupancyLabel(type: string): string {
  return isPrivateOccupancy(type) ? 'Private room' : 'Shared room';
}

/**
 * What one unit of this room is — the word that has to sit beside every quantity.
 *
 * A bare "2" is genuinely ambiguous across two rows of the same table, and the mistake it
 * invites (booking three rooms when you wanted three beds) is expensive to unwind.
 */
export function unitNoun(type: string, count = 1): string {
  const noun = isPrivateOccupancy(type) ? 'room' : 'bed';
  return count === 1 ? noun : `${noun}s`;
}

/** "Prices are per room" / "Prices are per bed" — the footnote that makes a dorm price legible. */
export function priceUnitNote(type: string): string {
  return `Prices are per ${isPrivateOccupancy(type) ? 'room' : 'bed'}`;
}

/**
 * Whether a discount is usable as entered.
 *
 * Strictly below, not "at most": an equal pair renders a −0% badge beside a struck-through
 * price identical to the one next to it, which reads as a bug rather than as a deal. Zero and
 * negatives are rejected too — a free room is nearly always a mistyped price.
 */
export function isValidDiscount(price: number, discounted: number | null | undefined): boolean {
  if (discounted == null) return true;
  return discounted > 0 && discounted < price;
}

/** The message shown under the field, naming the number the host has to beat. */
export function discountError(
  price: number,
  discounted: number | null | undefined,
  currency = 'PKR',
): string {
  if (isValidDiscount(price, discounted)) return '';
  if (discounted != null && discounted <= 0) return 'Discounted price must be more than 0';
  return `Discounted price must be less than ${currency} ${price.toLocaleString()}`;
}
