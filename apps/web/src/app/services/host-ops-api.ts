import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay, map } from 'rxjs/operators';
import {
  INVOICES,
  OCCUPANCY_DAYS,
  UTILITY_BATCH,
  UTILITY_META,
  UTILITY_TYPES,
} from './host-ops.fixtures';
import {
  Invoice,
  HostRoom as Room,
  Tenant,
  TenantBillSplit,
  TenantStatus,
  UtilityBill,
  UtilityType,
  UtilityTypeMeta,
} from '@hostelhive/data-access';
import { ApiClient } from '@core/api-resource';
import { PAGE_SIZE } from '@util/pagination';

interface ApiRoomType {
  id?: string;
  name?: string | null;
  price?: string | number | null;
  capacity?: number | null;
  description?: string | null;
}

interface ApiRoom {
  id?: number | string;
  room_number?: string | null;
  capacity?: number | null;
  current_occupancy?: number | null;
  occupied_count?: number | null;
  renters_count?: number | null;
  room_type?: ApiRoomType | null;
  room_type_id?: number | null;
  created_at?: string | null;
}

interface ApiAggs {
  total_rooms?: number;
  total_capacity?: number;
  occupied_capacity?: number;
  vacant_capacity?: number;
}

interface ApiPagination {
  total_count?: number;
  total_pages?: number;
}

interface ApiRoomsResponse {
  rooms?: ApiRoom[];
  data?: ApiRoom[];
  total_count?: number;
  aggs?: ApiAggs;
  pagination?: ApiPagination;
  possible_statuses?: { id: number; name: string; slug: string }[];
}

interface ApiRenter {
  id?: number | string;
  full_name?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  phone_number?: string | null;
  emergency_contact?: string | null;
  cnic_number?: string | null;
  cnic?: string | null;
  address?: string | null;
  room_id?: number | string | null;
  room?: { id?: number | string; room_number?: string | null } | null;
  room_number?: string | null;
  move_in_date?: string | null;
  joining_date?: string | null;
  check_in_date?: string | null;
  move_out_date?: string | null;
  leave_date?: string | null;
  check_out_date?: string | null;
  rent?: number | null;
  rent_amount?: number | null;
  advance_deposit?: number | null;
  deposit?: number | null;
  mess_charges?: number | null;
  transportation_charges?: number | null;
  billing_date?: number | null;
  billing_due_date?: number | null;
  outstanding_amount?: number | null;
  outstanding_balance?: number | null;
  outstanding?: number | null;
  // status is a string on some endpoints, an object on others
  status?: string | { id?: string; name?: string; slug?: string } | null;
  avatar_id?: string | null;
  avatar?: { id?: string | null; url?: string | null; status?: string | null } | null;
  cnic_front_id?: string | null;
  cnic_back_id?: string | null;
  cnic_front?: { id?: string | null; url?: string | null; variants?: Record<string, string> | null } | null;
  cnic_back?: { id?: string | null; url?: string | null; variants?: Record<string, string> | null } | null;
}

interface ApiRentersResponse {
  renters?: ApiRenter[];
  data?: ApiRenter[];
  total_count?: number;
  pagination?: ApiPagination;
  possible_statuses?: { id: number; name: string; slug: string; count?: number }[];
  aggs?: { name: string; slug: string; count: number }[];
}

interface ApiCreateRenterResponse {
  renter?: ApiRenter;
}

interface ApiRoomDetailResponse {
  room?: { renters?: ApiRenter[]; room_renters?: ApiRenter[] };
  renters?: ApiRenter[];
  room_renters?: ApiRenter[];
}

export interface RoomRenter {
  id: string;
  name: string;
  phone: string;
  email: string;
  moveIn: string;
  rent: number;
  status: string;
}

export interface RoomAggs {
  totalRooms: number;
  totalCapacity: number;
  occupiedCapacity: number;
  vacantCapacity: number;
}

export interface RoomStatusOption {
  id: number;
  name: string;
  slug: string;
}

export interface RoomTypeOption {
  id: string;
  name: string;
  capacity: number;
  price: number;
}

function toRoom(r: ApiRoom): Room {
  return {
    id: String(r.id ?? ''),
    number: r.room_number ?? '—',
    floor: '—',
    type: r.room_type?.name ?? '—',
    capacity: r.capacity ?? 0,
    occupied: r.current_occupancy ?? r.occupied_count ?? r.renters_count ?? 0,
    rentPerBed: Number(r.room_type?.price ?? 0),
    attachedBath: false,
    createdAt: r.created_at ?? '',
  };
}

function toDate(raw: string | null | undefined): string {
  if (!raw) return '';
  // Trim ISO timestamps to date-only ("2026-06-22T00:00:00+05:00" → "2026-06-22")
  return raw.slice(0, 10);
}

function toTenant(r: ApiRenter): Tenant {
  const rawName = r.full_name ?? r.name ?? '';
  const initials =
    rawName
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';
  // status can be a plain string or an object { slug }
  const rawSlug = typeof r.status === 'object' && r.status !== null
    ? r.status.slug
    : r.status;
  const status: TenantStatus =
    rawSlug === 'active' || rawSlug === 'checked-out' ? rawSlug : 'active';
  return {
    id: String(r.id ?? ''),
    name: rawName || '—',
    email: r.email ?? undefined,
    phone: r.phone ?? r.phone_number ?? '—',
    emergencyContact: r.emergency_contact ?? undefined,
    cnic: r.cnic_number ?? r.cnic ?? undefined,
    address: r.address ?? undefined,
    initials,
    roomId: String(r.room_id ?? r.room?.id ?? ''),
    roomNumber: r.room_number ?? r.room?.room_number ?? '—',
    joined: toDate(r.move_in_date ?? r.joining_date ?? r.check_in_date),
    checkedOut: toDate(r.move_out_date ?? r.check_out_date) || undefined,
    leaveDate: toDate(r.leave_date) || undefined,
    rent: Number(r.rent_amount ?? r.rent ?? 0),
    deposit: Number(r.advance_deposit ?? r.deposit ?? 0),
    messCharges: r.mess_charges != null ? Number(r.mess_charges) : undefined,
    transportationCharges:
      r.transportation_charges != null ? Number(r.transportation_charges) : undefined,
    billingDate: r.billing_date ?? undefined,
    billingDueDate: r.billing_due_date ?? undefined,
    outstanding: Number(r.outstanding_amount ?? r.outstanding_balance ?? r.outstanding ?? 0),
    status,
    avatarUrl: r.avatar?.url ?? undefined,
    avatarId: r.avatar_id ?? r.avatar?.id?.toString() ?? undefined,
    cnicFrontUrl: r.cnic_front?.url ?? undefined,
    cnicFrontId: r.cnic_front_id ?? r.cnic_front?.id?.toString() ?? undefined,
    cnicBackUrl: r.cnic_back?.url ?? undefined,
    cnicBackId: r.cnic_back_id ?? r.cnic_back?.id?.toString() ?? undefined,
  };
}

interface ApiRenterBillItem {
  id?: number | string;
  renter_id?: number | string;
  renter?: { id?: number | string; full_name?: string | null; name?: string | null } | null;
  full_name?: string | null;
  amount?: number | string | null;
  bill_days?: number | null;
  received_amount?: number | string | null;
  received?: number | string | null;
}

interface ApiUtilityBillItem {
  id?: number | string;
  utility_type?: string | null;
  total_amount?: number | string | null;
  received_amount?: number | string | null;
  room_id?: number | string | null;
  room?: { id?: number | string; room_number?: string | null } | null;
  room_number?: string | null;
  previous_units?: number | null;
  current_units?: number | null;
  consumed_units?: number | null;
  cost_per_unit?: number | null;
  created_at?: string | null;
  issued_date?: string | null;
  due_date?: string | null;
  status?: { id?: number; name?: string; slug?: string } | null;
  renter_bills?: ApiRenterBillItem[];
}

interface ApiUtilityBillsAggs {
  bill_to_pay?: number;
  received?: number;
  balance?: number;
  this_month?: { bill_to_pay?: number; received?: number; balance?: number };
  statuses?: { name: string; slug: string; count: number }[];
}

interface ApiUtilityBillsResponse {
  utility_bills?: ApiUtilityBillItem[];
  data?: ApiUtilityBillItem[];
  aggs?: ApiUtilityBillsAggs;
  pagination?: ApiPagination;
  possible_statuses?: { id: number; name: string; slug: string }[];
}

function toUtilityBill(b: ApiUtilityBillItem): UtilityBill {
  const type = (b.utility_type ?? 'other') as UtilityType;
  const splits: TenantBillSplit[] = (b.renter_bills ?? []).map((r) => ({
    id: String(r.id ?? ''),
    tenantId: String(r.renter_id ?? r.renter?.id ?? ''),
    name: r.renter?.full_name ?? r.renter?.name ?? r.full_name ?? '—',
    amount: Number(r.amount ?? 0),
    days: r.bill_days ?? 0,
    received: Number(r.received_amount ?? r.received ?? 0),
  }));
  return {
    id: String(b.id ?? `u-${Date.now()}`),
    roomId: String(b.room_id ?? b.room?.id ?? ''),
    roomNumber: b.room?.room_number ?? b.room_number ?? '—',
    tenantName: splits.map((s) => s.name).filter(Boolean).join(', ') || '—',
    type,
    startReading: b.previous_units ?? null,
    endReading: b.current_units ?? null,
    units: b.consumed_units ?? null,
    rate: Number(b.cost_per_unit ?? 0),
    total: Number(b.total_amount ?? 0),
    received: Number(b.received_amount ?? splits.reduce((n, s) => n + s.received, 0)),
    split: 'prorata',
    splits,
    createdAt: b.created_at ?? undefined,
    issuedDate: b.issued_date ?? undefined,
    dueDate: b.due_date ?? undefined,
    status: b.status?.slug ? { name: b.status.name ?? '', slug: b.status.slug } : undefined,
  };
}

@Injectable({ providedIn: 'root' })
export class HostOpsApi {
  private readonly api = inject(ApiClient);

  rooms(
    hostelId: string,
    page = 1,
    limit = PAGE_SIZE,
    filters: Record<string, string> = {},
  ): Observable<{ rooms: Room[]; total: number; aggs: RoomAggs; statuses: RoomStatusOption[] }> {
    return this.api
      .get<ApiRoomsResponse>(`/api/host/hostels/${hostelId}/rooms`, { page, limit, ...filters })
      .pipe(map((res) => ({
        rooms: (res.rooms ?? res.data ?? []).map(toRoom),
        total: res.pagination?.total_count ?? res.total_count ?? 0,
        aggs: {
          totalRooms: res.aggs?.total_rooms ?? 0,
          totalCapacity: res.aggs?.total_capacity ?? 0,
          occupiedCapacity: res.aggs?.occupied_capacity ?? 0,
          vacantCapacity: res.aggs?.vacant_capacity ?? 0,
        },
        statuses: (res.possible_statuses ?? []).map(s => ({ id: s.id, name: s.name, slug: s.slug })),
      })));
  }

  createRoom(
    hostelId: string,
    room: { room_number: string; room_type_id: string; capacity: number },
  ): Observable<unknown> {
    return this.api.post(`/api/host/hostels/${hostelId}/rooms`, { room });
  }

  updateRoom(
    hostelId: string,
    roomId: string,
    room: { room_type_id?: string; capacity?: number; renter_ids?: number[] },
  ): Observable<unknown> {
    return this.api.put(`/api/host/hostels/${hostelId}/rooms/${roomId}`, { room });
  }

  deleteRoom(hostelId: string, roomId: string): Observable<unknown> {
    return this.api.delete(`/api/host/hostels/${hostelId}/rooms/${roomId}`);
  }

  roomDetail(hostelId: string, roomId: string): Observable<RoomRenter[]> {
    return this.api
      .get<ApiRoomDetailResponse>(`/api/host/hostels/${hostelId}/rooms/${roomId}`)
      .pipe(
        map((res) =>
          (res.room?.renters ?? res.room?.room_renters ?? res.renters ?? res.room_renters ?? []).map((r) => ({
            id: String(r.id ?? ''),
            name: r.full_name ?? r.name ?? '—',
            phone: r.phone ?? r.phone_number ?? '—',
            email: r.email ?? '',
            moveIn: toDate(r.joining_date ?? r.move_in_date ?? r.check_in_date),
            rent: Number(r.rent_amount ?? r.rent ?? 0),
            status: typeof r.status === 'string' ? r.status : (r.status?.slug ?? 'active'),
          })),
        ),
      );
  }

  bulkCreateRooms(
    hostelId: string,
    rooms: { room_number: string; room_type_id: string; capacity: number }[],
  ): Observable<unknown> {
    return this.api.put(`/api/hostels/${hostelId}`, {
      hostel: { rooms_attributes: rooms },
    });
  }

  roomFormOptions(hostelId: string): Observable<RoomTypeOption[]> {
    return this.api
      .get<unknown>(`/api/host/hostels/${hostelId}/rooms/new`)
      .pipe(
        map((res) => {
          const list: ApiRoomType[] = Array.isArray(res)
            ? res
            : Array.isArray((res as Record<string, unknown>)?.['room_types'])
              ? ((res as Record<string, unknown>)['room_types'] as ApiRoomType[])
              : Array.isArray((res as Record<string, unknown>)?.['sharing_types'])
                ? ((res as Record<string, unknown>)['sharing_types'] as ApiRoomType[])
                : [];
          return list.map((rt) => ({
            id: rt.id ?? '',
            name: rt.name ?? '—',
            capacity: rt.capacity ?? 0,
            price: Number(rt.price ?? 0),
          }));
        }),
      );
  }

  renters(
    hostelId: string,
    page = 1,
    limit = PAGE_SIZE,
    filters: Record<string, string> = {},
  ): Observable<{ renters: Tenant[]; total: number; statuses: { name: string; slug: string; count: number }[] }> {
    return this.api
      .get<ApiRentersResponse>(`/api/host/hostels/${hostelId}/renters`, { page, limit, ...filters })
      .pipe(
        map((res) => ({
          renters: (res.renters ?? res.data ?? []).map(toTenant),
          total: res.pagination?.total_count ?? res.total_count ?? 0,
          statuses: (res.aggs ?? []).map(({ name, slug, count }) => ({ name, slug, count })),
        })),
      );
  }

  getRenter(hostelId: string, renterId: string): Observable<Tenant> {
    return this.api
      .get<ApiCreateRenterResponse>(`/api/host/hostels/${hostelId}/renters/${renterId}`)
      .pipe(map((res) => toTenant(res.renter ?? {})));
  }

  createRenter(
    hostelId: string,
    body: {
      full_name: string;
      email: string;
      phone: string;
      emergency_contact: string;
      room_id?: string | number | null;
      mess_charges?: number | null;
      transportation_charges?: number | null;
      advance_deposit: number;
      joining_date: string;
      leave_date?: string;
      rent: string;
      address: string;
      billing_due_date: number;
      billing_date: number;
      cnic_number?: string;
      avatar_id?: string;
      cnic_front_id?: string;
      cnic_back_id?: string;
    },
  ): Observable<Tenant> {
    return this.api
      .post<ApiCreateRenterResponse>(`/api/host/hostels/${hostelId}/renters`, { renter: body })
      .pipe(map((res) => toTenant(res.renter ?? {})));
  }

  updateRenter(
    hostelId: string,
    renterId: string,
    body: {
      full_name?: string;
      email?: string;
      phone?: string;
      emergency_contact?: string;
      room_id?: string | number | null;
      mess_charges?: number | null;
      transportation_charges?: number | null;
      advance_deposit?: number;
      joining_date?: string;
      leave_date?: string;
      rent?: string;
      address?: string;
      billing_due_date?: number;
      billing_date?: number;
      cnic_number?: string;
      avatar_id?: string;
      cnic_front_id?: string;
      cnic_back_id?: string;
    },
  ): Observable<Tenant> {
    return this.api
      .put<ApiCreateRenterResponse>(
        `/api/host/hostels/${hostelId}/renters/${renterId}`,
        { renter: body },
      )
      .pipe(map((res) => toTenant(res.renter ?? {})));
  }

  invoices(): Observable<Invoice[]> {
    return of(INVOICES.map((i) => ({ ...i }))).pipe(delay(150));
  }

  utilityBills(
    hostelId: string,
    page = 1,
    limit = PAGE_SIZE,
    filters: Record<string, string> = {},
  ): Observable<{
    bills: UtilityBill[];
    total: number;
    totalPages: number;
    statuses: { name: string; slug: string; count: number }[];
    aggs: { billToPay: number; received: number; balance: number };
  }> {
    return this.api
      .get<ApiUtilityBillsResponse>(`/api/host/hostels/${hostelId}/utility_bills`, { page, limit, ...filters })
      .pipe(map((res) => ({
        bills: (res.utility_bills ?? res.data ?? []).map(toUtilityBill),
        total: res.pagination?.total_count ?? 0,
        totalPages: res.pagination?.total_pages ?? 1,
        statuses: (res.aggs?.statuses ?? []).map((s) => ({ name: s.name, slug: s.slug, count: s.count })),
        aggs: {
          billToPay: res.aggs?.this_month?.bill_to_pay ?? 0,
          received: res.aggs?.this_month?.received ?? 0,
          balance: res.aggs?.balance ?? 0,
        },
      })));
  }

  deleteUtilityBill(hostelId: string, billId: string): Observable<unknown> {
    return this.api.delete(`/api/host/hostels/${hostelId}/utility_bills/${billId}`);
  }

  /** The current billing batch (utility line items). */
  utilityBatch(): Observable<UtilityBill[]> {
    return of(UTILITY_BATCH.map((b) => ({ ...b }))).pipe(delay(150));
  }

  // --- Sync config (not async fetches) -------------------------------------

  /** Utility types available for a hostel, merged with local meta (icon/metering/unit). */
  utilityBillFormOptions(hostelId: string): Observable<UtilityTypeMeta[]> {
    return this.api
      .get<{ utility_bill_types?: { id: number; slug: string; name: string }[] }>(
        `/api/host/hostels/${hostelId}/utility_bills/new`,
      )
      .pipe(
        map((res) =>
          (res.utility_bill_types ?? [])
            .map((t) => UTILITY_META[t.slug as UtilityType])
            .filter((m): m is UtilityTypeMeta => !!m),
        ),
      );
  }

  createUtilityBill(
    hostelId: string,
    body: {
      utility_type: string;
      total_amount: number;
      room_id: number;
      issued_date: string;
      due_date: string;
      notes?: string;
      consumed_units?: number;
      previous_units?: number;
      current_units?: number;
      cost_per_unit?: number;
      renter_bills_attributes: {
        renter_id: string | number;
        room_id: number;
        amount: number;
        bill_days: number;
        due_date: string;
        issued_date: string;
        break_down: Record<string, number>;
      }[];
    },
  ): Observable<unknown> {
    return this.api.post(`/api/host/hostels/${hostelId}/utility_bills`, { utility_bill: body });
  }

  /** Fallback sync list (used for the table's metaOf() and when hostelId is unknown). */
  utilityTypes(): UtilityTypeMeta[] {
    return UTILITY_TYPES;
  }

  utilityMeta(type: UtilityType): UtilityTypeMeta {
    return UTILITY_META[type] ?? UTILITY_META['other'];
  }

  /** Occupancy-days for a tenant in the current period (day-weighted split). */
  occupancyDays(tenantId: string): number {
    return OCCUPANCY_DAYS[tenantId] ?? 0;
  }

}
