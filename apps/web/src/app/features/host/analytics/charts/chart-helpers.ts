import { OccupancyPoint, RevenuePoint, TenantMovement } from '@hostelhive/data-access';

/**
 * Pure SVG geometry helpers for the analytics charts. No chart library is
 * installed (by design) — these compute dasharrays / bar heights / path `d`
 * strings from fixture data so the template can render plain inline SVG sized
 * with the brand tokens. All functions are deterministic and side-effect free.
 */

/* ── Donut (occupancy KPI) ─────────────────────────────────────────────── */

/** Circle uses `pathLength="100"`, so the arc dash is just the percentage. */
export function donutDash(pct: number): string {
  const v = clamp(pct, 0, 100);
  return `${v} ${100 - v}`;
}

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

/* ── utils ─────────────────────────────────────────────────────────────── */

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
