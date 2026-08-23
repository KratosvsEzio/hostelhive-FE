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

/** What the host picks between. */
export const OCCUPANCY_OPTIONS: DropdownOption[] = [
  { value: 'private', label: 'Private room' },
  { value: 'shared', label: 'Shared room' },
];

/** Seeker-facing label for one room. */
export function occupancyLabel(type: string): string {
  return type === 'private' ? 'Private room' : 'Shared room';
}

/**
 * What one unit of this room is — the word that has to sit beside every quantity.
 *
 * A bare "2" is genuinely ambiguous across two rows of the same table, and the mistake it
 * invites (booking three rooms when you wanted three beds) is expensive to unwind.
 */
export function unitNoun(type: string, count = 1): string {
  const noun = type === 'private' ? 'room' : 'bed';
  return count === 1 ? noun : `${noun}s`;
}

/** "Prices are per room" / "Prices are per bed" — the footnote that makes a dorm price legible. */
export function priceUnitNote(type: string): string {
  return `Prices are per ${type === 'private' ? 'room' : 'bed'}`;
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
