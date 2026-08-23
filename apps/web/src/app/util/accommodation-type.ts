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

/**
 * The same four types as translation keys.
 *
 * Kept beside {@link ACCOMMODATION_LABELS} rather than inline at the call sites so the two
 * cannot drift: a type added above without a key here fails the build, which is the whole
 * reason that table is a Record and not a ternary chain.
 *
 * The key names are the app's existing `common.*` ones, which is why `coliving` maps to
 * `coLiving` — the type follows the backend spelling, the key follows the file.
 */
export const ACCOMMODATION_LABEL_KEYS: Record<AccommodationType, string> = {
  boys: 'common.boys',
  girls: 'common.girls',
  coliving: 'common.coLiving',
  backpacker: 'common.backpacker',
};

/** The label for an accommodation type; falls back to the raw value if unrecognised. */
export function accommodationLabel(type: string): string {
  return ACCOMMODATION_LABELS[type as AccommodationType] ?? type;
}
