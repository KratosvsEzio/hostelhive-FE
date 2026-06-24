// Host-ops domain models. **Stub pending Q-API** — mirrored from design-mockups
// 12-rooms, 13-tenants, 14-utilities, 15-invoices. Shapes stay stable when the
// real SDK lands; only the service bodies swap from `of(...)` to HTTP.

export type RoomStatus = 'available' | 'partial' | 'full';

export interface HostRoom {
  id: string;
  number: string;
  floor: string;
  type: string;
  capacity: number;
  occupied: number;
  rentPerBed: number;
  attachedBath: boolean;
  createdAt: string; // ISO datetime
}

export type TenantStatus = 'active' | 'checked-out';

export interface Tenant {
  id: string;
  name: string;
  email?: string;
  phone: string;
  emergencyContact?: string;
  cnic?: string; // cnic_number
  address?: string;
  initials: string;
  roomId: string;
  roomNumber: string;
  joined: string; // ISO date — move-in
  checkedOut?: string; // ISO date — move-out (when status checked-out)
  rent: number; // PKR / month
  deposit: number; // PKR — advance deposit
  messCharges?: number; // PKR / month
  transportationCharges?: number; // PKR / month
  billingDate?: number; // day of month invoice is issued
  billingDueDate?: number; // day of month invoice is due
  leaveDate?: string; // ISO date — planned departure
  outstanding: number; // PKR owed right now
  status: TenantStatus;
  avatarUrl?: string;
  avatarId?: string;
  cnicFrontUrl?: string;
  cnicFrontId?: string;
  cnicBackUrl?: string;
  cnicBackId?: string;
}

export type UtilityType =
  | 'electricity'
  | 'gas'
  | 'water'
  | 'other';

export type SplitMethod = 'prorata' | 'equal';

export interface UtilityTypeMeta {
  type: UtilityType;
  label: string;
  icon: string; // Tabler class
  metered: boolean; // metered → capture units; else fixed fee
  unit: string; // 'kWh', 'units', '' …
  split: SplitMethod;
}

export interface TenantBillSplit {
  id: string;
  tenantId: string;
  name: string;
  amount: number;
  days: number;
  received: number;
}

/** A utility line item added to the current billing batch. */
export interface UtilityBill {
  id: string;
  roomId: string;
  roomNumber: string;
  tenantName: string;
  type: UtilityType;
  startReading: number | null; // previous meter reading; null for fixed-fee
  endReading: number | null;   // current meter reading; null for fixed-fee
  units: number | null;        // = endReading - startReading; null for fixed-fee
  rate: number;                // PKR per unit
  total: number;               // PKR — units × rate (or fixed amount)
  received: number;            // PKR paid so far
  split: SplitMethod;
  splits?: TenantBillSplit[];
  createdAt?: string;
  issuedDate?: string;
  dueDate?: string;
  status?: { name: string; slug: string };
}

export type InvoiceStatus = 'paid' | 'unpaid' | 'overdue';
export type InvoiceKind = 'rent' | 'utility';

export interface InvoiceLine {
  label: string;
  amount: number; // PKR
}

export interface Invoice {
  id: string; // 'INV-2026-0142'
  tenantName: string;
  roomNumber: string;
  floor: string;
  kind: InvoiceKind;
  amount: number; // PKR — total due
  status: InvoiceStatus;
  issued: string; // ISO date
  due: string; // ISO date
  lines: InvoiceLine[];
  payNote: string;
}
