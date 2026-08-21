import {
  Invoice,
  HostRoom as Room,
  Tenant,
  UtilityBill,
  UtilityType,
  UtilityTypeMeta,
} from '@hostelhive/data-access';

/** Stub rooms (Q-API pending). Matches design-mockups/12-rooms.html. */
export const ROOMS: Room[] = [
  {
    id: 'r101',
    number: '101',
    floor: 'Ground',
    type: '2-sharing',
    capacity: 2,
    occupied: 2,
    rentPerBed: 14000,
    attachedBath: true,
    createdAt: '',
  },
  {
    id: 'r102',
    number: '102',
    floor: 'Ground',
    type: '3-sharing',
    capacity: 3,
    occupied: 2,
    rentPerBed: 12000,
    attachedBath: false,
    createdAt: '',
  },
  {
    id: 'r201',
    number: '201',
    floor: '1st',
    type: '1-sharing',
    capacity: 1,
    occupied: 0,
    rentPerBed: 22000,
    attachedBath: true,
    createdAt: '',
  },
  {
    id: 'r202',
    number: '202',
    floor: '1st',
    type: '4-sharing',
    capacity: 4,
    occupied: 3,
    rentPerBed: 9500,
    attachedBath: false,
    createdAt: '',
  },
  {
    id: 'r203',
    number: '203',
    floor: '1st',
    type: '2-sharing',
    capacity: 2,
    occupied: 2,
    rentPerBed: 14000,
    attachedBath: true,
    createdAt: '',
  },
  {
    id: 'r301',
    number: '301',
    floor: '2nd',
    type: '3-sharing',
    capacity: 3,
    occupied: 3,
    rentPerBed: 12000,
    attachedBath: false,
    createdAt: '',
  },
];

/**
 * Occupancy-days per tenant for the current period, keyed by tenant id.
 * Day-weighted utility split divides the room bill across these. For Room 101
 * (June 2026): AR 30 + BK 28 + SA 30 = 88 occupancy-days — mirrors mockup 14.
 */
export const OCCUPANCY_DAYS: Record<string, number> = {
  t5: 30, // Ahmed Raza — full month
  t6: 28, // Bilal Khan — joined 3rd
  t3: 30, // Saad Ali — full month
};

/** Utility types + split method + metering — matched to /utility_bills/new API slugs. */
export const UTILITY_TYPES: UtilityTypeMeta[] = [
  {
    type: 'electricity',
    label: 'Electricity',
    icon: 'ti-bolt',
    metered: true,
    unit: 'kWh',
    split: 'prorata',
  },
  {
    type: 'gas',
    label: 'Gas',
    icon: 'ti-flame',
    metered: true,
    unit: 'units',
    split: 'prorata',
  },
  {
    type: 'water',
    label: 'Water',
    icon: 'ti-droplet',
    metered: true,
    unit: 'units',
    split: 'prorata',
  },
  {
    type: 'other',
    label: 'Other',
    icon: 'ti-receipt',
    metered: false,
    unit: '',
    split: 'prorata',
  },
];

export const UTILITY_META: Record<UtilityType, UtilityTypeMeta> =
  Object.fromEntries(UTILITY_TYPES.map((u) => [u.type, u])) as Record<
    UtilityType,
    UtilityTypeMeta
  >;

/** Stub batch line items (Q-API pending). Matches the bottom table of mockup 14. */
export const UTILITY_BATCH: UtilityBill[] = [
  {
    id: 'u1',
    roomId: 'r101',
    roomNumber: '101',
    tenantName: 'Ahmed Raza',
    type: 'electricity',
    startReading: 4210,
    endReading: 4307,
    units: 97,
    rate: 90,
    total: 8730,
    received: 8730,
    split: 'prorata',
  },
  {
    id: 'u2',
    roomId: 'r101',
    roomNumber: '101',
    tenantName: 'Bilal Khan',
    type: 'electricity',
    startReading: 1425,
    endReading: 1465,
    units: 40,
    rate: 90,
    total: 3600,
    received: 0,
    split: 'prorata',
  },
  {
    id: 'u3',
    roomId: 'r102',
    roomNumber: '102',
    tenantName: 'Saad Ali',
    type: 'electricity',
    startReading: 3037,
    endReading: 3210,
    units: 173,
    rate: 90,
    total: 15570,
    received: 5000,
    split: 'prorata',
  },
  {
    id: 'u4',
    roomId: 'r102',
    roomNumber: '102',
    tenantName: 'Usman Tariq',
    type: 'electricity',
    startReading: 1888,
    endReading: 2021,
    units: 133,
    rate: 90,
    total: 11970,
    received: 0,
    split: 'prorata',
  },
  {
    id: 'u5',
    roomId: 'r201',
    roomNumber: '201',
    tenantName: 'Kamran Shah',
    type: 'electricity',
    startReading: 2393,
    endReading: 2483,
    units: 90,
    rate: 90,
    total: 8100,
    received: 8100,
    split: 'prorata',
  },
  {
    id: 'u6',
    roomId: 'r202',
    roomNumber: '202',
    tenantName: 'Farhan Ahmed',
    type: 'other',
    startReading: null,
    endReading: null,
    units: null,
    rate: 0,
    total: 2000,
    received: 2000,
    split: 'equal',
  },
];
