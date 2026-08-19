import { AccommodationType } from '@util/models/listing';

/**
 * Display labels for a hostel's accommodation type.
 *
 * These four are **accommodation types**, not genders — a hostel is exactly one of them, and
 * `backpacker` is plainly not a gender. The backend field is misnamed `gender_type`, and the
 * frontend type is still called `AccommodationType` to match it; treat both names as legacy and this
 * module as the correct vocabulary.
 *
 * The table exists because the same ternary was hand-written in six places
 * (`g === 'coliving' ? 'Co-living' : g === 'boys' ? 'Boys' : 'Girls'`), each ending in a bare
 * `else`. A ternary chain is not exhaustive, so adding a fourth type compiled cleanly
 * everywhere and would have silently rendered every backpacker hostel as "Girls" or "Boys".
 * A `Record<AccommodationType, string>` fails the build instead.
 */
export const ACCOMMODATION_LABELS: Record<AccommodationType, string> = {
  boys: 'Boys',
  girls: 'Girls',
  coliving: 'Co-living',
  backpacker: 'Backpacker',
};

/** The label for an accommodation type; falls back to the raw value if unrecognised. */
export function accommodationLabel(type: string): string {
  return ACCOMMODATION_LABELS[type as AccommodationType] ?? type;
}
