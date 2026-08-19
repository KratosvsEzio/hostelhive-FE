import { currencySymbol } from './currencies';

/**
 * The unit a price is quoted in.
 *
 * Until now every price in the app was a bare `number` whose unit lived only in a template
 * suffix (`/mo`) or a trailing comment. Backpacker beds are quoted per night, so the number
 * and its unit have to travel together — otherwise a nightly rate renders as a monthly one
 * and nothing in the type system objects.
 *
 * Backend slugs are `month` and `day` (from `billing_frequency_type` on `GET /api/hostels/new`).
 * The frontend says `nightly` rather than `daily` because that is the word the product uses
 * and the word on screen; translate at the API boundary, not in the UI layer.
 */
export const PRICING_PERIODS = ['monthly', 'nightly'] as const;

export type PricingPeriod = (typeof PRICING_PERIODS)[number];

/** A price and the unit it is quoted in. Never pass the amount around on its own. */
export interface Price {
  amount: number;
  period: PricingPeriod;
}

/**
 * What everything was implicitly before this type existed. Used as the fallback wherever the
 * period is not yet carried through, so behaviour is unchanged until the backend supplies it.
 */
export const DEFAULT_PRICING_PERIOD: PricingPeriod = 'monthly';

/**
 * The billing period a hostel's accommodation type implies.
 *
 * Backpacker hostels bill per night; every other type bills per month. The two are not
 * independently selectable — a backpacker hostel is never monthly and a boys hostel is
 * never nightly — so this is derived rather than stored, and derived in exactly one place
 * so that a future rule change has a single site to edit.
 *
 * The backend also exposes `billing_frequency_type` (`month` / `day`). Prefer that value
 * if a payload ever carries it; this is the rule to fall back on.
 */
export function periodForAccommodation(gender: string): PricingPeriod {
  return gender === 'backpacker' ? 'nightly' : 'monthly';
}

/** Short suffix for tight layouts (cards, table cells): `/mo` · `/night`. */
export function periodSuffix(period: PricingPeriod): string {
  return period === 'nightly' ? '/night' : '/mo';
}

/** Long suffix for roomier surfaces: `/ month` · `/ night`. */
export function periodLabel(period: PricingPeriod): string {
  return period === 'nightly' ? '/ night' : '/ month';
}

/** `Rs 12,000` — the amount alone, grouped for the local convention. The currency symbol is
 *  derived from the listing's ISO code; a blank code falls back to the default currency. */
export function formatAmount(amount: number, currency?: string | null): string {
  return `${currencySymbol(currency)} ${Math.round(amount).toLocaleString('en-PK')}`;
}

/** `Rs 12,000 / month` — the full, unambiguous form. */
export function formatPrice({ amount, period }: Price): string {
  return `${formatAmount(amount)} ${periodLabel(period)}`;
}

/**
 * Map-pin form, where horizontal space is scarce: `Rs 2k`, `Rs 12k`.
 *
 * No period suffix — a pin is too small for one, and the amount alone is what the map is
 * for. The tap-through card and the listing card both carry the unit.
 *
 * Amounts below a thousand are shown exactly rather than compacted, because
 * `Math.round(400 / 1000) + 'k'` is **"Rs 0k"** — which would make every cheap nightly
 * bed read as free, and as identical to each other.
 */
export function formatPriceCompact({ amount }: Price, currency?: string | null): string {
  if (amount < 1000) return formatAmount(amount, currency);
  return `${currencySymbol(currency)} ${Math.round(amount / 1000)}k`;
}
