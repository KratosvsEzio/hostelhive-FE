import { AnalyticsData, PropertyOption } from '@hostelhive/data-access';

/**
 * Fixture data for the host analytics dashboard. **Stub pending Q-API (§0).**
 * `all` mirrors design-mockups/16-analytics.html verbatim (78% occupancy,
 * Rs 248k collected, the 12-month revenue series, the three ledger rows); the
 * two individual properties partition those totals so switching the selector
 * visibly re-queries.
 */

export const PROPERTY_OPTIONS: PropertyOption[] = [
  { id: 'all', name: 'All properties' },
  { id: 'gulberg-residency', name: 'Gulberg Residency' },
  { id: 'dha-boys-lodge', name: 'DHA Boys Lodge' },
];

const MONTHS = [
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
];

/** Build a revenue series from rent + utility + tenant tuples aligned to MONTHS. */
function revenue(
  series: ReadonlyArray<readonly [rent: number, utility: number, tenants: number]>,
) {
  return series.map(([rent, utility, tenants], i) => ({
    month: MONTHS[i],
    rent,
    utility,
    tenants,
  }));
}

/** Build an occupancy series aligned to MONTHS. */
function occupancy(pcts: readonly number[]) {
  return pcts.map((occupancyPct, i) => ({ month: MONTHS[i], occupancyPct }));
}

/** Build a tenant movement series aligned to MONTHS. */
function movement(series: ReadonlyArray<readonly [movedIn: number, movedOut: number]>) {
  return series.map(([movedIn, movedOut], i) => ({ month: MONTHS[i], movedIn, movedOut }));
}

const ALL: AnalyticsData = {
  kpis: [
    {
      key: 'occupancy',
      label: 'Occupancy',
      value: '78%',
      tone: 'brand',
      donut: 78,
      deltaPct: 4,
    },
    { key: 'vacant', label: 'Vacant beds', value: '11', tone: 'neutral' },
    {
      key: 'collected',
      label: 'Collected · June',
      value: 'Rs 248k',
      rawValue: 248000,
      prefix: 'Rs ',
      tone: 'ok',
      deltaPct: 6,
    },
    {
      key: 'pending-total',
      label: 'Pending total',
      value: 'Rs 41.5k',
      rawValue: 41500,
      prefix: 'Rs ',
      tone: 'warn',
      deltaPct: -3,
    },
    {
      key: 'pending-rent',
      label: 'Pending rent',
      value: 'Rs 21.5k',
      rawValue: 21500,
      prefix: 'Rs ',
      tone: 'danger',
    },
    {
      key: 'pending-utility',
      label: 'Pending utility',
      value: 'Rs 20k',
      rawValue: 20000,
      prefix: 'Rs ',
      tone: 'warn',
    },
  ],
  revenue: revenue([
    [184000, 56000, 13],
    [200000, 48000, 14],
    [216000, 64000, 15],
    [240000, 72000, 16],
    [232000, 60000, 15],
    [256000, 80000, 17],
    [272000, 88000, 18],
    [264000, 76000, 17],
    [288000, 96000, 19],
    [280000, 84000, 18],
    [312000, 104000, 20],
    [296000, 92000, 19],
  ]),
  occupancy: occupancy([62, 64, 67, 70, 68, 72, 75, 73, 80, 77, 82, 78]),
  tenantMovement: movement([
    [4, 2], [3, 2], [3, 2], [3, 2], [2, 3], [4, 2],
    [3, 2], [2, 3], [4, 2], [2, 3], [4, 2], [2, 3],
  ]),
  ledger: [
    {
      id: 'l1',
      tenant: 'Bilal Khan',
      initials: 'BK',
      room: '202',
      lastInvoice: '01 Jun 2026',
      outstanding: 9500,
    },
    {
      id: 'l2',
      tenant: 'Saad Ali',
      initials: 'SA',
      room: '101',
      lastInvoice: '01 Jun 2026',
      outstanding: 8000,
    },
    {
      id: 'l3',
      tenant: 'Ahmed Raza',
      initials: 'AR',
      room: '102',
      lastInvoice: '01 Jun 2026',
      outstanding: 0,
    },
  ],
};

const GULBERG: AnalyticsData = {
  kpis: [
    {
      key: 'occupancy',
      label: 'Occupancy',
      value: '83%',
      tone: 'brand',
      donut: 83,
      deltaPct: 5,
    },
    { key: 'vacant', label: 'Vacant beds', value: '5', tone: 'neutral' },
    {
      key: 'collected',
      label: 'Collected · June',
      value: 'Rs 152k',
      rawValue: 152000,
      prefix: 'Rs ',
      tone: 'ok',
      deltaPct: 8,
    },
    {
      key: 'pending-total',
      label: 'Pending total',
      value: 'Rs 17.5k',
      rawValue: 17500,
      prefix: 'Rs ',
      tone: 'warn',
      deltaPct: -6,
    },
    {
      key: 'pending-rent',
      label: 'Pending rent',
      value: 'Rs 9.5k',
      rawValue: 9500,
      prefix: 'Rs ',
      tone: 'danger',
    },
    {
      key: 'pending-utility',
      label: 'Pending utility',
      value: 'Rs 8k',
      rawValue: 8000,
      prefix: 'Rs ',
      tone: 'warn',
    },
  ],
  revenue: revenue([
    [110000, 32000, 8],
    [120000, 28000, 9],
    [128000, 38000, 9],
    [142000, 42000, 10],
    [138000, 35000, 9],
    [150000, 46000, 10],
    [160000, 50000, 11],
    [156000, 44000, 10],
    [170000, 56000, 12],
    [166000, 48000, 11],
    [184000, 60000, 13],
    [176000, 52000, 12],
  ]),
  occupancy: occupancy([68, 70, 72, 75, 73, 77, 80, 78, 85, 82, 87, 83]),
  tenantMovement: movement([
    [2, 1], [2, 1], [2, 1], [2, 1], [1, 2], [2, 1],
    [2, 1], [1, 2], [2, 1], [1, 2], [3, 1], [1, 2],
  ]),
  ledger: [
    {
      id: 'g1',
      tenant: 'Bilal Khan',
      initials: 'BK',
      room: '202',
      lastInvoice: '01 Jun 2026',
      outstanding: 9500,
    },
    {
      id: 'g2',
      tenant: 'Hamza Tariq',
      initials: 'HT',
      room: '204',
      lastInvoice: '01 Jun 2026',
      outstanding: 0,
    },
  ],
};

const DHA: AnalyticsData = {
  kpis: [
    {
      key: 'occupancy',
      label: 'Occupancy',
      value: '72%',
      tone: 'brand',
      donut: 72,
      deltaPct: 2,
    },
    { key: 'vacant', label: 'Vacant beds', value: '6', tone: 'neutral' },
    {
      key: 'collected',
      label: 'Collected · June',
      value: 'Rs 96k',
      rawValue: 96000,
      prefix: 'Rs ',
      tone: 'ok',
      deltaPct: 3,
    },
    {
      key: 'pending-total',
      label: 'Pending total',
      value: 'Rs 24k',
      rawValue: 24000,
      prefix: 'Rs ',
      tone: 'warn',
      deltaPct: 1,
    },
    {
      key: 'pending-rent',
      label: 'Pending rent',
      value: 'Rs 12k',
      rawValue: 12000,
      prefix: 'Rs ',
      tone: 'danger',
    },
    {
      key: 'pending-utility',
      label: 'Pending utility',
      value: 'Rs 12k',
      rawValue: 12000,
      prefix: 'Rs ',
      tone: 'warn',
    },
  ],
  revenue: revenue([
    [74000, 24000, 5],
    [80000, 20000, 6],
    [88000, 26000, 6],
    [98000, 30000, 7],
    [94000, 25000, 6],
    [106000, 34000, 7],
    [112000, 38000, 8],
    [108000, 32000, 7],
    [118000, 40000, 8],
    [114000, 36000, 7],
    [128000, 44000, 9],
    [120000, 40000, 8],
  ]),
  occupancy: occupancy([55, 57, 61, 64, 62, 66, 69, 67, 74, 71, 76, 72]),
  tenantMovement: movement([
    [2, 1], [1, 1], [2, 1], [1, 1], [1, 2], [2, 1],
    [1, 1], [1, 2], [2, 1], [1, 2], [2, 1], [1, 2],
  ]),
  ledger: [
    {
      id: 'd1',
      tenant: 'Saad Ali',
      initials: 'SA',
      room: '101',
      lastInvoice: '01 Jun 2026',
      outstanding: 8000,
    },
    {
      id: 'd2',
      tenant: 'Ahmed Raza',
      initials: 'AR',
      room: '102',
      lastInvoice: '01 Jun 2026',
      outstanding: 0,
    },
    {
      id: 'd3',
      tenant: 'Usman Iqbal',
      initials: 'UI',
      room: '105',
      lastInvoice: '01 Jun 2026',
      outstanding: 0,
    },
  ],
};

/** Property scope id → dataset. */
export const ANALYTICS_FIXTURE: Record<string, AnalyticsData> = {
  all: ALL,
  'gulberg-residency': GULBERG,
  'dha-boys-lodge': DHA,
};
