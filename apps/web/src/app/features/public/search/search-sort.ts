import { AccommodationType } from '@hostelhive/data-access';

/** One way to order search results: the URL `sort` value and the translation key of its label. */
export interface SortOption {
  value: string;
  key: string;
}

/** Every sort, in display order. 'newest'/'oldest' → sort[created_at]; 'price-*' → sort[starting_price] (API layer). */
export const SORT_OPTIONS: readonly SortOption[] = [
  { value: 'recommended', key: 'search.recommended' },
  { value: 'newest', key: 'search.recentFirst' },
  { value: 'oldest', key: 'search.oldestFirst' },
  { value: 'price-desc', key: 'search.priceHighToLow' },
  { value: 'price-asc', key: 'search.priceLowToHigh' },
];

/** Whether a sort orders by price; the one test every surface uses for that question. */
export function isPriceSort(sort: string | null | undefined): boolean {
  return !!sort?.startsWith('price-');
}

/**
 * The sorts that mean something for an accommodation type: price sort is withdrawn while the
 * list mixes pricing cycles.
 *
 * `starting_price` is one unit-less number, so a nightly bed at PKR 1,200 sorts above a
 * monthly room at PKR 15,000 as though it were cheaper — page one fills with backpacker dorms
 * a student cannot rent by the month. The other sorts are unit-agnostic and always stay.
 *
 * Only backpacker hostels are nightly (see `periodForAccommodation`), so naming any one type
 * pins the list to a single cycle, and "All" is the only mix. Every surface that offers,
 * applies or carries a sort asks this module rather than repeating the rule.
 */
export function sortsFor(
  type: AccommodationType | 'all',
): readonly SortOption[] {
  return type === 'all'
    ? SORT_OPTIONS.filter((o) => !isPriceSort(o.value))
    : SORT_OPTIONS;
}
