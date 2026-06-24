/**
 * Day-weighted utility split with manual overrides.
 *
 * THE RULE (design-mockups/14): a room's whole utility bill is divided across its
 * tenants pro-rata BY DAYS LIVED in the room that period — and the allocation must
 * always reconcile to the full bill (no leftover, no over-spend silently hidden).
 *
 * HOW IT RECONCILES:
 *   1. Locked rows  — any tenant the host manually overrode keeps that exact value.
 *   2. Residual     — `total − Σ(locked)` is what remains for the unlocked rows.
 *   3. Pro-rata     — unlocked rows split the residual by their day-weight:
 *                       shareᵢ = residual × (daysᵢ / Σ unlocked days)
 *   4. Rounding fix — rows are rounded to whole rupees; the leftover rupees from
 *                     rounding (residual − Σ rounded) are handed to the
 *                     largest-share unlocked rows, one rupee each. So with NO
 *                     overrides the displayed shares sum EXACTLY to `total`.
 *
 * EDGE CASES:
 *   - Overrides exceed total → residual < 0 → unlocked rows clamp to 0 and the
 *     caller's `allocated` exceeds `total`; the UI flags the over-allocation
 *     rather than silently dropping rupees.
 *   - All rows locked → shares are exactly the overrides (may not reconcile; UI
 *     shows the unallocated/over delta so the host can fix it).
 *   - Zero total days (no occupancy data) → falls back to an equal split so a
 *     bill is never stuck unallocated.
 */

export interface SplitInput {
  tenantId: string;
  name: string;
  initials: string;
  days: number;
}

export interface SplitRow extends SplitInput {
  /** Computed (or overridden) share in whole PKR. */
  share: number;
  /** True when this row's share came from a manual override. */
  overridden: boolean;
}

export function splitByDays(
  tenants: SplitInput[],
  total: number,
  overrides: Record<string, number> = {},
): SplitRow[] {
  if (tenants.length === 0) return [];

  const locked = tenants.filter((t) => t.tenantId in overrides);
  const unlocked = tenants.filter((t) => !(t.tenantId in overrides));

  const lockedSum = locked.reduce(
    (n, t) => n + (overrides[t.tenantId] || 0),
    0,
  );
  const residual = total - lockedSum;

  // Weight unlocked rows by days; fall back to equal weight if no day data.
  const unlockedDays = unlocked.reduce((n, t) => n + t.days, 0);
  const useEqual = unlockedDays <= 0;
  const weightOf = (t: SplitInput) => (useEqual ? 1 : t.days);
  const weightSum = useEqual ? unlocked.length : unlockedDays;

  // Raw (un-rounded) shares for unlocked rows, clamped to ≥ 0.
  const raw = new Map<string, number>();
  for (const t of unlocked) {
    const exact =
      weightSum > 0 ? Math.max(0, residual) * (weightOf(t) / weightSum) : 0;
    raw.set(t.tenantId, exact);
  }

  // Round down, then distribute the remaining rupees to the largest fractions
  // so Σ(unlocked rounded) === max(0, residual) exactly (largest-remainder method).
  const floored = new Map<string, number>();
  let flooredSum = 0;
  for (const t of unlocked) {
    const f = Math.floor(raw.get(t.tenantId) ?? 0);
    floored.set(t.tenantId, f);
    flooredSum += f;
  }
  let remainder = Math.round(Math.max(0, residual) - flooredSum);
  const byFraction = [...unlocked].sort(
    (a, b) =>
      ((raw.get(b.tenantId) ?? 0) % 1) - ((raw.get(a.tenantId) ?? 0) % 1) ||
      b.days - a.days,
  );
  for (let i = 0; i < byFraction.length && remainder > 0; i++) {
    const id = byFraction[i].tenantId;
    floored.set(id, (floored.get(id) ?? 0) + 1);
    remainder--;
  }

  return tenants.map((t) => {
    const overridden = t.tenantId in overrides;
    return {
      ...t,
      overridden,
      share: overridden
        ? Math.max(0, Math.round(overrides[t.tenantId] || 0))
        : (floored.get(t.tenantId) ?? 0),
    };
  });
}
