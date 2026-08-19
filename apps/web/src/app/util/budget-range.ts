/**
 * The one definition of the budget/price slider's scale.
 *
 * Two controls edit the same underlying `minPrice`/`maxPrice`: the Budget popover in
 * the site search bar, and the Price range section in the search filter sheet. They
 * previously hardcoded different ceilings (50,000 and 60,000), so the sheet could
 * produce a value the search bar's slider had no room to represent.
 *
 * The top of the range means "no upper bound", not "exactly this much" — both
 * controls emit `maxPrice: null` when the high handle is at `BUDGET_MAX`, and both
 * pass `openEnded` to the slider so it renders as "Rs 50,000+".
 */
export const BUDGET_MIN = 0;
export const BUDGET_MAX = 50000;
/**
 * Rs 1. Was 1,000, which made the scale unusable for nightly pricing: the slider clamps
 * its two thumbs a full step apart, so the narrowest band a user could express was
 * Rs 1,000 wide and the smallest non-zero stop was 1,000 — while backpacker beds run
 * roughly Rs 400–3,000 and need to be told apart from each other.
 */
export const BUDGET_STEP = 1;
