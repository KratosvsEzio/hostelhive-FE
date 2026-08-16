import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay, map } from 'rxjs/operators';
import {
  OCCUPANCY_DAYS,
  UTILITY_BATCH,
  UTILITY_META,
  UTILITY_TYPES,
} from './host-ops.fixtures';
import {
  Invoice,
  InvoiceKind,
  InvoiceLine,
  InvoiceStatus,
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
  floor?: string | number | null;
  status?: { slug?: string | null } | null;
  disposition?: { slug?: string | null } | null;
  renters?: { id?: string | number; name?: string | null }[] | null;
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
  breakfast_enabled?: boolean | null;
  lunch_enabled?: boolean | null;
  dinner_enabled?: boolean | null;
  transportation_charges?: number | null;
  billing_date?: number | null;
  billing_due_date?: number | null;
  outstanding_amount?: number | null;
  outstanding_balance?: number | null;
  outstanding?: number | null;
  // status is a string on some endpoints, an object on others
  status?: string | { id?: string; name?: string; slug?: string } | null;
  user_acceptance?: boolean | null;
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
  possible_statuses?: { id: number; name: string; slug: string; count?: number; dispositions?: { id: number; name: string; slug: string }[] }[];
  aggs?: { name: string; slug: string; count: number }[];
}

interface ApiCreateRenterResponse {
  renter?: ApiRenter;
}

interface ApiRoomDetailResponse {
  room?: ApiRoom & { renters?: ApiRenter[]; room_renters?: ApiRenter[] };
  renters?: ApiRenter[];
  room_renters?: ApiRenter[];
}

export interface RoomShowData {
  room: Room;
  renters: RoomRenter[];
}

export interface RoomRenter {
  id: string;
  name: string;
  initials: string;
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
    floor: r.floor != null ? String(r.floor) : '—',
    type: r.room_type?.name ?? '—',
    capacity: r.capacity ?? 0,
    occupied: r.current_occupancy ?? r.occupied_count ?? r.renters_count ?? 0,
    rentPerBed: Number(r.room_type?.price ?? 0),
    attachedBath: false,
    createdAt: r.created_at ?? '',
    occupants: (r.renters ?? []).map((x) => x.name ?? '').filter(Boolean),
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
  // status can be a plain string or an object { slug, name }
  const statusObj = typeof r.status === 'object' && r.status !== null ? r.status : null;
  const rawSlug = statusObj ? statusObj.slug : r.status;
  const knownStatuses: TenantStatus[] = ['active', 'inactive', 'on-notice', 'checked-out'];
  const status: TenantStatus = knownStatuses.includes(rawSlug as TenantStatus) ? (rawSlug as TenantStatus) : 'active';
  const statusLabel: string = statusObj?.name ?? (status === 'active' ? 'Active' : status === 'on-notice' ? 'On Notice' : status === 'checked-out' ? 'Checked Out' : 'Inactive');
  return {
    id: String(r.id ?? ''),
    name: rawName || '—',
    email: r.email ?? undefined,
    phone: r.phone ?? r.phone_number ?? '—',
    emergencyContact: r.emergency_contact ?? undefined,
    cnic: r.cnic_number ?? r.cnic ?? undefined,
    address: r.address ?? undefined,
    initials,
    roomId: String(r.room?.id ?? r.room_id ?? ''),
    roomNumber: r.room_number ?? r.room?.room_number ?? '—',
    joined: toDate(r.move_in_date ?? r.joining_date ?? r.check_in_date),
    checkedOut: toDate(r.move_out_date ?? r.check_out_date) || undefined,
    leaveDate: toDate(r.leave_date) || undefined,
    rent: Number(r.rent_amount ?? r.rent ?? 0),
    deposit: Number(r.advance_deposit ?? r.deposit ?? 0),
    messCharges: r.mess_charges != null ? Number(r.mess_charges) : undefined,
    messBreakfast: r.breakfast_enabled ?? true,
    messLunch: r.lunch_enabled ?? true,
    messDinner: r.dinner_enabled ?? true,
    transportationCharges:
      r.transportation_charges != null ? Number(r.transportation_charges) : undefined,
    billingDate: r.billing_date ?? undefined,
    billingDueDate: r.billing_due_date ?? undefined,
    outstanding: Number(r.outstanding_amount ?? r.outstanding_balance ?? r.outstanding ?? 0),
    status,
    statusLabel,
    userAcceptance: r.user_acceptance ?? true,
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

interface ApiRenterBillTop {
  id?: number | string;
  renter_id?: number | string;
  renter?: {
    id?: number | string;
    full_name?: string | null;
    name?: string | null;
    room?: { id?: number | string; room_number?: string | null; floor?: string | null } | null;
  } | null;
  full_name?: string | null;
  room_id?: number | string | null;
  room?: { id?: number | string; room_number?: string | null; floor?: string | null } | null;
  room_number?: string | null;
  amount?: number | string | null;
  received_amount?: number | string | null;
  issue_date?: string | null;
  issued_date?: string | null;
  due_date?: string | null;
  paid_at?: string | null;
  status?: { id?: number; name?: string; slug?: string } | null;
  bill_type?: string | null;
  notes?: string | null;
  pay_note?: string | null;
  line_items?: { label?: string; amount?: number | string | null }[] | null;
  break_down?: Record<string, number> | null;
}

interface ApiRenterBillsAggs {
  utility?: { total?: number; paid?: number; balance?: number };
  rent?: { total?: number; paid?: number; balance?: number };
  this_month?: { to_collect?: number; paid?: number };
  statuses?: { name: string; slug: string; count: number; total_amount?: number; color?: unknown }[];
}

interface ApiRenterBillsResponse {
  renter_bills?: ApiRenterBillTop[];
  data?: ApiRenterBillTop[];
  possible_statuses?: { id: number; name: string; slug: string }[];
  aggs?: ApiRenterBillsAggs;
  pagination?: ApiPagination;
  success?: boolean;
}

function formatBreakdownKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function toInvoice(rb: ApiRenterBillTop): Invoice {
  const id = String(rb.id ?? '');
  const renterName = rb.renter?.full_name ?? rb.renter?.name ?? rb.full_name ?? '—';
  const room = rb.renter?.room ?? rb.room ?? null;
  const roomNumber = room?.room_number ?? rb.room_number ?? '—';
  const floor = room?.floor ?? '—';
  const amount = Number(rb.amount ?? 0);
  const rawStatus = rb.status?.slug ?? 'due';
  const status: InvoiceStatus =
    rawStatus === 'paid' ? 'paid' : rawStatus === 'over-due' ? 'over-due' : 'due';
  const kind: InvoiceKind = rb.bill_type === 'utility' ? 'utility' : 'rental';
  const lines: InvoiceLine[] = rb.line_items?.length
    ? rb.line_items.map((l) => ({ label: l.label ?? '—', amount: Number(l.amount ?? 0) }))
    : rb.break_down
      ? Object.entries(rb.break_down).map(([key, amt]) => ({ label: formatBreakdownKey(key), amount: amt }))
      : [{ label: kind === 'rental' ? 'Monthly rent' : 'Utility charge', amount }];
  return {
    id,
    renterId: String(rb.renter_id ?? rb.renter?.id ?? ''),
    roomId: String(rb.room_id ?? rb.renter?.room?.id ?? rb.room?.id ?? ''),
    tenantName: renterName,
    roomNumber,
    floor,
    kind,
    amount,
    status,
    issued: toDate(rb.issue_date ?? rb.issued_date),
    due: toDate(rb.due_date),
    paidAt: rb.paid_at ? toDate(rb.paid_at) : undefined,
    lines,
    // Structured, for the edit form to seed from — `lines` has already been formatted
    // into labels by this point and cannot be reversed reliably.
    breakdown: rb.break_down ?? undefined,
    payNote: rb.notes ?? rb.pay_note ?? 'Pay on or before the due date.',
  };
}

/**
 * The `renter_bill` body. Create (POST) and update (PUT) take an identical payload —
 * only the verb and whether the URL carries a bill id differ — so both share this.
 */
export interface InvoiceBody {
  renter_id: string | number;
  room_id?: string | number;
  amount: number;
  issued_date: string;
  due_date: string;
  break_down: {
    rent?: number;
    mess_charges?: number;
    transportation_charges?: number;
  };
  notes?: string;
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
    room: { room_number: string; room_type_id: string; capacity: number; floor?: string | null },
  ): Observable<unknown> {
    return this.api.post(`/api/host/hostels/${hostelId}/rooms`, { room });
  }

  updateRoom(
    hostelId: string,
    roomId: string,
    room: { room_type_id?: string; capacity?: number; renter_ids?: number[]; floor?: string | null },
  ): Observable<unknown> {
    return this.api.put(`/api/host/hostels/${hostelId}/rooms/${roomId}`, { room });
  }

  deleteRoom(hostelId: string, roomId: string): Observable<unknown> {
    return this.api.delete(`/api/host/hostels/${hostelId}/rooms/${roomId}`);
  }

  roomDetail(hostelId: string, roomId: string): Observable<RoomRenter[]> {
    return this.roomShow(hostelId, roomId).pipe(map((d) => d.renters));
  }

  roomShow(hostelId: string, roomId: string): Observable<RoomShowData> {
    return this.api
      .get<ApiRoomDetailResponse>(`/api/host/hostels/${hostelId}/rooms/${roomId}`)
      .pipe(
        map((res) => {
          const renters = (res.room?.renters ?? res.room?.room_renters ?? res.renters ?? res.room_renters ?? []).map((r) => {
            const rawName = r.full_name ?? r.name ?? '';
            const initials = rawName.trim().split(/\s+/).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
            return {
              id: String(r.id ?? ''),
              name: rawName || '—',
              initials,
              phone: r.phone ?? r.phone_number ?? '—',
              email: r.email ?? '',
              moveIn: toDate(r.joining_date ?? r.move_in_date ?? r.check_in_date),
              rent: Number(r.rent_amount ?? r.rent ?? 0),
              status: typeof r.status === 'string' ? r.status : (r.status?.slug ?? 'active'),
            };
          });
          const room = res.room ? toRoom(res.room) : ({
            id: roomId, number: '—', floor: '—', type: '—',
            capacity: 0, occupied: renters.length, rentPerBed: 0,
            attachedBath: false, createdAt: '',
          } as Room);
          room.occupied = renters.filter((r) => r.status === 'active').length;
          return { room, renters };
        }),
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
      .get<{ hostel?: { room_types?: ApiRoomType[] }; room_types?: ApiRoomType[] }>(
        `/api/host/hostels/${hostelId}`,
      )
      .pipe(
        map((res) => {
          const list: ApiRoomType[] =
            res.hostel?.room_types ??
            res.room_types ??
            [];
          return list.map((rt) => ({
            id: String(rt.id ?? ''),
            name: rt.name ?? '—',
            capacity: Number(rt.capacity ?? 0),
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
  ): Observable<{ renters: Tenant[]; total: number; statuses: { name: string; slug: string; count: number; dispositionId: number }[] }> {
    return this.api
      .get<ApiRentersResponse>(`/api/host/hostels/${hostelId}/renters`, { page, limit, ...filters })
      .pipe(
        map((res) => {
          const aggsBySlug = Object.fromEntries((res.aggs ?? []).map((a) => [a.slug, a.count]));
          return {
            renters: (res.renters ?? res.data ?? []).map(toTenant),
            total: res.pagination?.total_count ?? res.total_count ?? 0,
            statuses: res.possible_statuses?.map((s) => ({
              name: s.name, slug: s.slug,
              count: aggsBySlug[s.slug] ?? s.count ?? 0,
              dispositionId: s.dispositions?.[0]?.id ?? 0,
            })) ?? res.aggs?.map((s) => ({ name: s.name, slug: s.slug, count: s.count, dispositionId: 0 }))
              ?? [],
          };
        }),
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
      breakfast_enabled?: boolean;
      lunch_enabled?: boolean;
      dinner_enabled?: boolean;
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
      breakfast_enabled?: boolean;
      lunch_enabled?: boolean;
      dinner_enabled?: boolean;
      transportation_charges?: number | null;
      advance_deposit?: number;
      joining_date?: string;
      leave_date?: string | null;
      rent?: string;
      address?: string;
      billing_due_date?: number;
      billing_date?: number;
      cnic_number?: string;
      avatar_id?: string;
      cnic_front_id?: string;
      cnic_back_id?: string;
      disposition_id?: number;
    },
  ): Observable<Tenant> {
    return this.api
      .put<ApiCreateRenterResponse>(
        `/api/host/hostels/${hostelId}/renters/${renterId}`,
        { renter: body },
      )
      .pipe(map((res) => toTenant(res.renter ?? {})));
  }

  patchRenter(
    hostelId: string,
    renterId: string,
    body: { disposition_id?: number },
  ): Observable<Tenant> {
    return this.api
      .patch<ApiCreateRenterResponse>(
        `/api/host/hostels/${hostelId}/renters/${renterId}`,
        { renter: body },
      )
      .pipe(map((res) => toTenant(res.renter ?? {})));
  }

  inviteTenant(hostelId: string, renterId: string): Observable<unknown> {
    return this.api.post(`/api/host/hostels/${hostelId}/renters/${renterId}/invite_tenant`, {});
  }

  invoices(hostelId: string, page = 1, limit = PAGE_SIZE, filters: Record<string, string> = {}): Observable<{
    bills: Invoice[];
    total: number;
    totalPages: number;
    statuses: { name: string; slug: string; count: number; totalAmount: number }[];
    aggs: { utilityTotal: number; utilityPaid: number; utilityBalance: number; rentTotal: number; rentPaid: number; rentBalance: number };
  }> {
    const params: Record<string, string | number | boolean> = { page, limit, ...filters };
    return this.api
      .get<ApiRenterBillsResponse>(`/api/host/hostels/${hostelId}/renter_bills`, params)
      .pipe(
        map((res) => ({
          bills: (res.renter_bills ?? res.data ?? []).map(toInvoice),
          total: res.pagination?.total_count ?? 0,
          totalPages: res.pagination?.total_pages ?? 1,
          statuses: res.aggs?.statuses?.map((s) => ({ name: s.name, slug: s.slug, count: s.count, totalAmount: s.total_amount ?? 0 }))
            ?? res.possible_statuses?.map((s) => ({ name: s.name, slug: s.slug, count: 0, totalAmount: 0 }))
            ?? [],
          aggs: {
            utilityTotal: res.aggs?.utility?.total ?? 0,
            utilityPaid: res.aggs?.utility?.paid ?? 0,
            utilityBalance: res.aggs?.utility?.balance ?? 0,
            rentTotal: res.aggs?.rent?.total ?? 0,
            rentPaid: res.aggs?.rent?.paid ?? 0,
            rentBalance: res.aggs?.rent?.balance ?? 0,
          },
        })),
      );
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

  /**
   * POST /api/host/hostels/:id/renter_bills — issue a rent bill for a tenant.
   * `break_down` itemises the total into rent / mess / transport; `amount` is their sum.
   * The same body serves {@link updateInvoice}.
   */
  createInvoice(
    hostelId: string,
    body: InvoiceBody,
  ): Observable<unknown> {
    return this.api.post(`/api/host/hostels/${hostelId}/renter_bills`, { renter_bill: body });
  }

  /**
   * PUT /api/host/hostels/:id/renter_bills/:billId — amend an existing bill.
   * Takes the same `renter_bill` body as {@link createInvoice}, so the drawer builds one
   * payload for both and only the verb and URL differ.
   */
  updateInvoice(
    hostelId: string,
    billId: string,
    body: InvoiceBody,
  ): Observable<unknown> {
    return this.api.put(`/api/host/hostels/${hostelId}/renter_bills/${billId}`, {
      renter_bill: body,
    });
  }

  deleteInvoice(hostelId: string, billId: string): Observable<unknown> {
    return this.api.delete(`/api/host/hostels/${hostelId}/renter_bills/${billId}`);
  }

  /**
   * PUT /api/host/hostels/:id/renter_bills/:billId/mark_as_paid — settle a renter bill.
   * (The route nests under the plural `hostels` collection on the current backend, same as
   * every other renter_bills call here — despite older Swagger showing a singular `hostel`.)
   */
  markInvoicePaid(hostelId: string, billId: string): Observable<unknown> {
    return this.api.put(`/api/host/hostels/${hostelId}/renter_bills/${billId}/mark_as_paid`, {});
  }

  deleteRenter(hostelId: string, renterId: string): Observable<unknown> {
    return this.api.delete(`/api/host/hostels/${hostelId}/renters/${renterId}`);
  }

  deleteUtilityBill(hostelId: string, billId: string): Observable<unknown> {
    return this.api.delete(`/api/host/hostels/${hostelId}/utility_bills/${billId}`);
  }

  getUtilityBill(hostelId: string, billId: string): Observable<UtilityBill> {
    return this.api
      .get<Record<string, unknown>>(
        `/api/host/hostels/${hostelId}/utility_bills/${billId}`,
      )
      .pipe(
        map((res) => {
          // API may wrap in utility_bill or renter_bill
          const item = (res['utility_bill'] ?? res['renter_bill'] ?? res) as ApiUtilityBillItem;
          return toUtilityBill(item);
        }),
      );
  }

  updateUtilityBill(hostelId: string, billId: string, renterBills: { id: string; amount: number }[]): Observable<unknown> {
    return this.api.put(`/api/host/hostel/${hostelId}/utility_bills/${billId}`, {
      utility_bill: {
        renter_bills_attributes: renterBills.map((r) => ({ id: Number(r.id), amount: r.amount })),
      },
    });
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
      room_id?: string;
      issued_date: string;
      due_date: string;
      notes?: string;
      consumed_units?: number;
      previous_units?: number;
      current_units?: number;
      cost_per_unit?: number;
      renter_bills_attributes: {
        renter_id: string | number;
        room_id?: string;
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
