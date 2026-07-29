import { DropdownOption } from '@hostelhive/ui';
import { ordinal } from '@util/ordinal';

/** Earliest day of month a billing cycle may fall on. */
export const BILLING_DAY_MIN = 1;

/** Latest day of month a billing cycle may fall on. */
export const BILLING_DAY_MAX = 31;

/** Dropdown options for every selectable billing day, built once at module scope. */
export const BILLING_DAY_OPTIONS: DropdownOption[] = Array.from(
  { length: BILLING_DAY_MAX - BILLING_DAY_MIN + 1 },
  (_, i) => {
    const day = BILLING_DAY_MIN + i;
    return { value: String(day), label: `${ordinal(day)} of month` };
  },
);

/**
 * Coerces a stored billing day into a form value the day dropdown can represent.
 *
 * Out-of-range and non-integer days are rejected rather than clamped, so a bad
 * stored value surfaces as an empty required field instead of a silently
 * different billing term.
 *
 * @param day - The persisted day of month, if any.
 * @returns The matching option value, or `''` when the day is not selectable.
 */
export function normalizeBillingDay(day: number | null | undefined): string {
  if (day == null || !Number.isInteger(day)) return '';
  if (day < BILLING_DAY_MIN || day > BILLING_DAY_MAX) return '';
  return String(day);
}
