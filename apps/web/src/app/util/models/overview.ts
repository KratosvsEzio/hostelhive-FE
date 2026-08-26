/**
 * Domain models for the host overview — its KPI cards, its three charts, and the
 * revenue / occupancy / movement detail pages behind them.
 *
 * Named for analytics until the host analytics page was deleted. That page and the
 * overview drew the same charts from the same endpoints; the overview had the real
 * wiring and the date ranges, so it was the one that stayed, and these came with it.
 * The stub note that used to head this file is gone with it too — {@link OverviewApi}
 * has spoken HTTP for a while.
 */

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
  rawMonth?: string; // 'YYYY-MM' — present when data comes from the live API
  movedIn: number;
  movedOut: number;
}

/**
 * What `overview_cards` answers for one property: the KPI row, and nothing else.
 *
 * It carried four more fields — `revenue`, `occupancy`, `ledger`, `tenantMovement` — which
 * the API layer filled with empty arrays it never replaced. Only the deleted analytics page
 * read them, and reading a permanent `[]` is how its three charts came out blank. The
 * overview never used them: each series has an endpoint of its own ({@link OverviewApi}'s
 * `monthlyRevenue`, `occupancySummaries`, `tenantMovement`), fetched separately so a slow or
 * failed chart cannot hold up the numbers at the top of the page.
 *
 * One field is not much of an interface, and it is still worth naming: it is the contract
 * between that endpoint and the KPI row, and the next card added to it belongs here.
 */
export interface OverviewData {
  kpis: Kpi[];
}
