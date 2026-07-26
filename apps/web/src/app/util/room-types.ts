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

export type RoomTypeName = (typeof ROOM_TYPES)[number];

/** Capacity a Dormitory starts at — the floor of the "5+" search bucket, still editable. */
export const DORMITORY_DEFAULT_CAPACITY = 5;

/** Smallest capacity the backend accepts (`greater_than: 0`). */
export const MIN_ROOM_CAPACITY = 1;

/** Largest capacity the backend accepts (`less_than: 10`). */
export const MAX_ROOM_CAPACITY = 9;

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

/** Coerces any number into the backend-valid integer range 1–9. */
export function clampCapacity(n: number): number {
  const floored = Math.floor(n);
  if (!Number.isFinite(floored)) return MIN_ROOM_CAPACITY;
  return Math.min(MAX_ROOM_CAPACITY, Math.max(MIN_ROOM_CAPACITY, floored));
}
