import { OccupancyPoint, RevenuePoint, TenantMovement } from '@hostelhive/data-access';

/**
 * Pure SVG geometry helpers for the host overview's charts and its three detail
 * pages. No chart library is installed (by design) — these compute dasharrays /
 * bar heights / path `d` strings from the API's own series so the template can
 * render plain inline SVG sized with the brand tokens. All functions are
 * deterministic and side-effect free.
 *
 * Lived under `host/analytics/` until that page was deleted: it drew the same
 * charts from arrays its API layer hardcoded empty, and the overview had already
 * taken over the job with real data and date ranges. These outlived it because
 * only the wiring was duplicated, never the geometry.
 */

/* ── Donut (occupancy KPI) ─────────────────────────────────────────────── */

/* ── Revenue (stacked bars) ────────────────────────────────────────────── */

export interface RevenueBar {
  month: string;
  /** Rent segment height as a % of the chart area. */
  rentPct: number;
  /** Utility segment height as a % of the chart area. */
  utilityPct: number;
  /** Raw PKR values for the tooltip. */
  rent: number;
  utility: number;
  total: number;
  tenants?: number;
}

/**
 * Scale a rent+utility series to stacked-bar heights. The tallest *total*
 * column fills `maxFill`% of the track; rent sits at the bottom, utility on top.
 */
export function revenueBars(
  series: RevenuePoint[],
  maxFill = 92,
): RevenueBar[] {
  const peak = Math.max(1, ...series.map((p) => p.rent + p.utility));
  return series.map((p) => ({
    month: p.month,
    rentPct: (p.rent / peak) * maxFill,
    utilityPct: (p.utility / peak) * maxFill,
    rent: p.rent,
    utility: p.utility,
    total: p.rent + p.utility,
    tenants: p.tenants,
  }));
}

/* ── Tenant movement (grouped bars) ───────────────────────────────────── */

export interface TenantMovementBar {
  month: string;
  /** Move-in bar height as a % of chart area. */
  moveInPct: number;
  /** Move-out bar height as a % of chart area. */
  moveOutPct: number;
  movedIn: number;
  movedOut: number;
}

/** Scale a tenant-movement series to grouped-bar heights. The tallest single value fills `maxFill`%. */
export function tenantMovementBars(
  series: TenantMovement[],
  maxFill = 85,
): TenantMovementBar[] {
  const peak = Math.max(1, ...series.flatMap((p) => [p.movedIn, p.movedOut]));
  return series.map((p) => ({
    month: p.month,
    moveInPct: (p.movedIn / peak) * maxFill,
    moveOutPct: (p.movedOut / peak) * maxFill,
    movedIn: p.movedIn,
    movedOut: p.movedOut,
  }));
}

/* ── Occupancy (line + area) ───────────────────────────────────────────── */

export interface LineChart {
  /** viewBox width/height the paths are computed against. */
  width: number;
  height: number;
  /** `points` attribute for a `<polyline>` (the stroke). */
  points: string;
  /** `d` for a closed `<path>` (the filled area under the line). */
  area: string;
  /** Plotted vertices, for dot markers / tooltips. */
  dots: { x: number; y: number; month: string; value: number }[];
  /** Horizontal gridline y-positions. */
  gridY: number[];
  /** Display values for each gridline (e.g. 50, 60, 70, 80, 90). */
  gridLabels: number[];
  /** Horizontal pixel step between adjacent dots (SVG units). */
  step: number;
}

/**
 * Map an occupancy series to a line chart in a fixed viewBox. The Y axis is
 * auto-scaled to the data range so the trend is clearly visible. `pad` insets
 * the plot so the stroke and dots aren't clipped by the viewBox edge.
 */
export function occupancyLine(
  series: OccupancyPoint[],
  width = 600,
  height = 160,
  pad = 8,
): LineChart {
  // Auto-scale Y domain to data range with breathing room.
  const values = series.length ? series.map((p) => p.occupancyPct) : [0, 100];
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const yMin = Math.max(0, Math.floor((dataMin - 10) / 10) * 10);
  const yMax = Math.min(100, Math.ceil((dataMax + 5) / 10) * 10);
  const yRange = Math.max(1, yMax - yMin);

  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const n = series.length;
  const step = n > 1 ? innerW / (n - 1) : 0;

  const dots = series.map((p, i) => {
    const x = pad + step * i;
    const y = pad + innerH * (1 - clamp((p.occupancyPct - yMin) / yRange, 0, 1));
    return { x: round(x), y: round(y), month: p.month, value: p.occupancyPct };
  });

  const points = dots.map((d) => `${d.x},${d.y}`).join(' ');
  const baseline = round(pad + innerH);
  const first = dots[0] ?? { x: pad };
  const last = dots[dots.length - 1] ?? { x: pad + innerW };
  const area = `M ${first.x},${baseline} L ${points.replace(/ /g, ' L ')} L ${last.x},${baseline} Z`;

  // Generate 4-5 evenly-spaced grid labels within the domain.
  const gridStep = yRange <= 20 ? 5 : 10;
  const gridLabels: number[] = [];
  for (let v = yMin; v <= yMax; v += gridStep) gridLabels.push(v);
  if (gridLabels[gridLabels.length - 1] !== yMax) gridLabels.push(yMax);

  const gridY = gridLabels.map((g) =>
    round(pad + innerH * (1 - (g - yMin) / yRange)),
  );

  return { width, height, points, area, dots, gridY, gridLabels, step: round(step) };
}

/* ── Grocery spend (single-series bars) ────────────────────────────────── */

export interface SpendBar {
  label: string;
  /** Bar height as a % of the chart area. */
  pct: number;
  value: number;
}

/** Scale a spend series so the tallest bar fills `maxFill`% of the chart area. */
export function spendBars(
  series: { label: string; value: number }[],
  maxFill = 92,
): SpendBar[] {
  const peak = Math.max(1, ...series.map((p) => p.value));
  return series.map((p) => ({
    label: p.label,
    pct: (p.value / peak) * maxFill,
    value: p.value,
  }));
}

/* ── Y-axis ticks ──────────────────────────────────────────────────────── */

/**
 * Both overview charts share an interval count and a max fill, so their gridlines line up
 * across the two cards even though one counts rupees and the other counts people.
 */
export const AXIS_INTERVALS = 3;
export const AXIS_MAXFILL = 92;

export interface AxisTick {
  /** The number printed beside the gridline. */
  value: number;
  /** Where the gridline sits, as a percentage of the plot box's height. */
  bottomPct: number;
}

/**
 * Exactly `INTERVALS + 1` ticks up to a round ceiling at or above `peak`.
 *
 * `integer` keeps the step whole, for an axis counting people.
 *
 * Two things here are load-bearing, and both were learned from the same bug: an empty
 * revenue chart drew its top gridline *through the card's heading*, with a stray label
 * beside it, and repeated the label "1" twice underneath.
 *
 * The cause was a fractional step. At a peak of 1 the nice-rounding produced 0.5, so the
 * ticks were 0, 0.5, 1, 1.5 — printed as 0, 1, 1, 2 — and the position of each was computed
 * from that *printed* number against the true ceiling of 1.5. The top one came out at
 * 2 / 1.5 = 133% of a box that ends at 100%.
 *
 * So: the step is floored at 1 (a gridline at half a rupee is not a quantity anyone has,
 * and it is what made two ticks print the same), and each tick's position comes from its
 * index rather than its rounded value. The two agree exactly for a whole step; they diverge
 * for a fractional one, and the index is the one that cannot leave the box.
 */
export function fixedAxis(peak: number, integer: boolean): { ceiling: number; ticks: AxisTick[] } {
  let step = Math.max(1, peak) / AXIS_INTERVALS;
  if (integer) {
    step = Math.max(1, Math.ceil(step));
  } else {
    const mag = Math.pow(10, Math.floor(Math.log10(step)));
    const norm = step / mag;
    const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    step = Math.max(1, nice * mag);
  }
  return {
    ceiling: step * AXIS_INTERVALS,
    ticks: Array.from({ length: AXIS_INTERVALS + 1 }, (_, i) => ({
      value: Math.round(step * i),
      bottomPct: (i / AXIS_INTERVALS) * AXIS_MAXFILL,
    })),
  };
}

/* ── utils ─────────────────────────────────────────────────────────────── */

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
