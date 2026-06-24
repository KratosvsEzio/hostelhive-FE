/**
 * Host analytics domain models. **Stub pending Q-API (§0)** — these mirror the
 * shape we expect the analytics endpoint to return so the component, chart
 * helpers and fixtures all agree on one contract. When the typed SDK lands the
 * `AnalyticsApi` body swaps to HTTP; these interfaces stay put.
 */

/** A selectable property scope in the header dropdown. `all` aggregates every property. */
export interface PropertyOption {
  id: string; // 'all' | property id
  name: string;
}

/** A single headline metric rendered as a KPI card. */
export interface Kpi {
  key: string;
  label: string;
  /** Pre-formatted display value, e.g. `78%` or `Rs 248k`. Used when rawValue is absent. */
  value: string;
  /** Raw numeric amount — when present the template formats it with the compactNum pipe. */
  rawValue?: number;
  /** Prefix rendered before the compactNum output, e.g. `'Rs '`. */
  prefix?: string;
  /** Drives the value colour + (donut) accent. */
  tone: 'brand' | 'ok' | 'warn' | 'danger' | 'neutral';
  /** When set, the card renders an SVG donut at this fraction (0–100). */
  donut?: number;
  /** Optional month-over-month delta in %, positive = up. */
  deltaPct?: number;
}

/** One bar in the monthly revenue chart — rent + utility stack. */
export interface RevenuePoint {
  month: string; // 'Jul'
  rent: number; // PKR
  utility: number; // PKR
  tenants?: number; // occupied beds / active tenants that month
}

/** One point on the occupancy timeline. */
export interface OccupancyPoint {
  month: string; // 'Jul'
  occupancyPct: number; // 0–100
}

/** A row in the tenant ledger table. */
export interface LedgerRow {
  id: string;
  tenant: string;
  initials: string;
  room: string;
  lastInvoice: string; // '01 Jun 2026'
  outstanding: number; // PKR — 0 means settled
}

/** One data point for the tenant movement chart — move-ins and move-outs per month. */
export interface TenantMovement {
  month: string; // 'Jul'
  movedIn: number;
  movedOut: number;
}

/** Full payload for one property scope. */
export interface AnalyticsData {
  kpis: Kpi[];
  revenue: RevenuePoint[];
  occupancy: OccupancyPoint[];
  ledger: LedgerRow[];
  tenantMovement?: TenantMovement[];
}
