/**
 * Room-type domain rules shared by every hostel-creation surface.
 *
 * The map keys are the backend `RoomType.name` display strings. On the backend
 * `name` is free text, so this fixed-capacity mapping is a pure frontend
 * convention — it would break if these labels were ever localised or renamed.
 */

export const ROOM_TYPES = [
  'Single room',
  'Double sharing',
  'Triple sharing',
  'Quad sharing',
  'Dormitory',
] as const;

/**
 * Seeker-facing labels. The canonical value (what we send/store/group by) stays
 * `'Single room'`; only the text shown to a human changes. Keep the value out of
 * this map — changing a value here would fragment the capacity/grouping keys the
 * whole app depends on (see the file docstring). Names not in the map render as-is.
 */
const DISPLAY_LABELS: Record<string, string> = {
  'Single room': 'Single occupancy',
};

/** The human-readable label for a room-type value; the value itself if unmapped. */
export function displayLabelFor(name: string): string {
  return DISPLAY_LABELS[name] ?? name;
}

/** Capacity a Dormitory starts at — the floor of the "5+" search bucket, still editable. */
export const DORMITORY_DEFAULT_CAPACITY = 5;

/** Smallest capacity the backend accepts (`greater_than: 0`). */
export const MIN_ROOM_CAPACITY = 1;

/**
 * There is deliberately no maximum.
 *
 * A Dormitory holds however many beds the host says it does — a backpacker dorm is
 * routinely 12–20 and there is no sensible ceiling to invent. The fixed types
 * (Single/Double/Triple/Quad) still take their size from the name, so this only ever
 * applies to Dormitory.
 */


const FIXED_CAPACITY: Record<string, number> = {
  'Single room': 1,
  'Double sharing': 2,
  'Triple sharing': 3,
  'Quad sharing': 4,
};

/**
 * Beds implied by the type name, or `null` when the name says nothing (Dormitory,
 * unknown or empty), leaving the host to choose.
 */
export function fixedCapacityFor(type: string): number | null {
  return FIXED_CAPACITY[type] ?? null;
}

/** The capacity a freshly selected type should default to. */
export function defaultCapacityFor(type: string): number {
  return fixedCapacityFor(type) ?? DORMITORY_DEFAULT_CAPACITY;
}

/** Coerces any number into a whole number of beds, at least one. No upper bound. */
export function clampCapacity(n: number): number {
  const floored = Math.floor(n);
  if (!Number.isFinite(floored)) return MIN_ROOM_CAPACITY;
  return Math.max(MIN_ROOM_CAPACITY, floored);
}

/**
 * Photos allowed on one room type.
 *
 * Enforced by hiding the picker at the cap rather than rejecting a fourth file: a control
 * that is not there cannot be misused, and an error that only appears after somebody has
 * chosen a photo has already wasted their time. The hostel-level gallery is separate and
 * larger — see `MAX_PHOTOS`.
 */
export const MAX_ROOM_IMAGES = 3;

/** An uploaded room photo: the attachment id the payload carries, and the URL to show. */
export interface RoomImage {
  /** From `ImageUploadService.upload()` — goes into `attachment_ids`. */
  id: string;
  url: string;
}
