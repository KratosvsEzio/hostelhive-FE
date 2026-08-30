import { DropdownOption } from '@hostelhive/ui';

/** The one accommodation type that is sold by the night rather than let by the month. */
export const BACKPACKER = 'backpacker';

/** Backend slug for the monthly cycle. The product says "nightly" for the other one. */
export const MONTHLY = 'month';

/**
 * Backpacker hostels are sold by the night, and monthly hostels are not backpacker hostels.
 *
 * The rule is one constraint over two controls, so it lives here rather than inside either
 * of them: the hostel form asks it twice, once per dropdown, and a copy in each is a copy
 * that can drift. Everything downstream leans on the same pair — online booking is nightly
 * only, and the room calendar hides itself for a monthly hostel — so a hostel saved as both
 * is a hostel whose console contradicts itself.
 *
 * Enforced in one direction only. Accommodation is the fact about the property, so it stays
 * freely choosable and the billing cycle follows it: pick Backpacker and "Per month" greys
 * out. Gating both ways round would let a monthly hostel be unable to say what it is.
 *
 * That leaves one reachable conflict — a hostel already on monthly, switched to Backpacker,
 * whose cycle is now disabled but still selected. {@link conflicts} is what blocks the save
 * until the host moves it to nightly.
 */
export function conflicts(genderType: string, billingFrequency: string): boolean {
  return genderType === BACKPACKER && billingFrequency === MONTHLY;
}

/**
 * Greys out "Per month" once the hostel is for backpackers.
 *
 * Disabled rather than removed. An option that silently disappears reads as a bug and leaves
 * the host guessing; a greyed row that says why is a rule they can see.
 */
export function gateBillingOptions(
  options: readonly DropdownOption[],
  genderType: string,
): DropdownOption[] {
  if (genderType !== BACKPACKER) return [...options];
  return options.map((o) =>
    o.value === MONTHLY
      ? { ...o, disabled: true, disabledTooltip: 'Backpackers are nightly' }
      : { ...o },
  );
}

/** Shown against the billing cycle, and what blocks the save. */
export const BILLING_CONFLICT_ERROR =
  'Backpacker hostels are sold by the night. Set the billing frequency to Per night.';
