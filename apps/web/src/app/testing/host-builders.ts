import { ObservedValueOf } from 'rxjs';
import { ApiError, HostListing, HostRoom, Invoice } from '@hostelhive/data-access';
import { ApiRenterBillTop, HostOpsApi, RoomRenter, RoomShowData } from '@services/host-ops-api';
import {
  ApiHostBooking,
  BookingCalendar,
  BookingOccupancy,
  HostBooking,
  HostBookingPage,
} from '@features/host/bookings/host-bookings-api';

/** The hostel every host-page builder and harness defaults to. */
export const HOSTEL_ID = 'h1';

export type BillingMode = 'night' | 'month' | '';

/* ── renter bills, as the wire sends them ───────────────────────────────────── */

/**
 * A booking bill as the **list** sends it (a search document): the guest phone is `booking.phone`.
 *
 * Mess and transport are present at zero, as the backend writes every booking bill.
 */
export function apiBookingBillDoc(over: Partial<ApiRenterBillTop> = {}): ApiRenterBillTop {
  return {
    id: 'rb-1',
    bill_type: 'booking',
    billable_type: 'Booking',
    billable_id: 'bk-1',
    renter: null,
    room_id: null,
    room: null,
    amount: 24000,
    status: { id: 1, name: 'Due', slug: 'due' },
    issue_date: '2026-10-10T10:00:00+05:00',
    due_date: '2026-10-13T00:00:00+05:00',
    paid_at: null,
    booking: { id: 'bk-1', booking_ref: 'BK-0001', guest_name: 'Ali Raza', phone: '923001234567' },
    break_down: { room_charges: 24000, mess_charges: 0, transportation_charges: 0 },
    notes: null,
    ...over,
  };
}

/**
 * The same booking bill as a **serializer** reply sends it (show, mark_as_paid, generate_invoice):
 * the guest phone is `booking.guest_phone`, and zero amounts arrive as decimal strings.
 */
export function apiBookingBillReply(over: Partial<ApiRenterBillTop> = {}): ApiRenterBillTop {
  return apiBookingBillDoc({
    booking: { id: 'bk-1', booking_ref: 'BK-0001', guest_name: 'Ali Raza', guest_phone: '923001234567' },
    break_down: { room_charges: 24000, mess_charges: '0.0', transportation_charges: '0.0' } as unknown as Record<
      string,
      number
    >,
    ...over,
  });
}

/** A monthly rent bill for a renter, as the list sends it. */
export function apiRentalBillDoc(over: Partial<ApiRenterBillTop> = {}): ApiRenterBillTop {
  return {
    id: 'rb-2',
    bill_type: 'rental',
    billable_type: 'Renter',
    billable_id: 't-1',
    renter_id: 't-1',
    renter: { id: 't-1', full_name: 'Saad Ali', room: { id: 'r-101', room_number: '101', floor: 'Ground' } },
    room_id: 'r-101',
    amount: 15000,
    status: { id: 1, name: 'Due', slug: 'due' },
    issue_date: '2026-10-01T09:00:00+05:00',
    due_date: '2026-10-10T00:00:00+05:00',
    paid_at: null,
    break_down: { rent: 14000, mess_charges: 0, transportation_charges: 1000 },
    notes: null,
    ...over,
  };
}

/** A utility bill for a renter, as the list sends it. */
export function apiUtilityBillDoc(over: Partial<ApiRenterBillTop> = {}): ApiRenterBillTop {
  return apiRentalBillDoc({
    id: 'rb-3',
    bill_type: 'utility',
    amount: 3600,
    break_down: undefined,
    line_items: [{ label: 'Electricity', amount: 3600 }],
    ...over,
  });
}

/* ── mapped invoices ────────────────────────────────────────────────────────── */

/** A rent `Invoice` literal, the shape `toInvoice` produces for a renter bill. */
export function invoice(over: Partial<Invoice> = {}): Invoice {
  return {
    id: 'rb-2',
    renterId: 't-1',
    roomId: 'r-101',
    tenantName: 'Saad Ali',
    roomNumber: '101',
    floor: 'Ground',
    kind: 'rental',
    amount: 15000,
    status: 'due',
    issued: '2026-10-01',
    due: '2026-10-10',
    lines: [{ label: 'Rent', amount: 15000 }],
    payNote: 'Pay on or before the due date.',
    ...over,
  };
}

/** A booking `Invoice` literal: no renter, the guest as `tenantName`, and a `booking` block. */
export function bookingInvoice(over: Partial<Invoice> = {}): Invoice {
  return invoice({
    id: 'rb-1',
    renterId: '',
    roomId: '',
    tenantName: 'Ali Raza',
    booking: { id: 'bk-1', ref: 'BK-0001', guestName: 'Ali Raza', phone: '923001234567' },
    roomNumber: '—',
    floor: '—',
    kind: 'booking',
    amount: 24000,
    issued: '2026-10-10',
    due: '2026-10-13',
    lines: [{ label: 'Room Charges', amount: 24000 }],
    ...over,
  });
}

/* ── bookings ───────────────────────────────────────────────────────────────── */

/** One room a booking holds beds in. */
export function occupancy(over: Partial<BookingOccupancy> = {}): BookingOccupancy {
  return { id: 'oc-1', roomId: 'r-101', roomNumber: '101', guests: 2, active: true, ...over };
}

/**
 * A mapped `HostBooking` in the stage named by `slug` (disposition and status both).
 *
 * Owes its whole total by default; pass `paid`/`balanceDue` for a settled one.
 */
export function hostBooking(slug = 'confirmed', over: Partial<HostBooking> = {}): HostBooking {
  return {
    id: 'bk-1',
    ref: 'BK-0001',
    guest: { name: 'Ali Raza', phone: '923001234567', email: '' },
    checkIn: '2026-10-10',
    checkOut: '2026-10-13',
    nights: 3,
    guests: 2,
    roomType: { name: 'Dormitory', occupancyType: 'shared', capacity: 6, price: 4000 },
    total: 24000,
    paid: 0,
    balanceDue: 24000,
    room: null,
    renter: null,
    status: { name: slug, slug },
    disposition: { name: slug, slug },
    notes: '',
    lines: [{ roomTypeId: 'rt-1', name: 'Dormitory', shared: true, units: 2, guests: 2, subtotal: 24000 }],
    currency: 'PKR',
    cancellationReason: '',
    occupancies: [],
    source: '',
    createdAt: '2026-09-27',
    confirmationPdfUrl: '',
    ...over,
  };
}

/** A booking as the wire sends it, for `HostBookingsApi.get` / `list` replies. */
export function apiHostBooking(over: Partial<ApiHostBooking> = {}): ApiHostBooking {
  return {
    id: 'bk-1',
    booking_ref: 'BK-0001',
    guest_name: 'Ali Raza',
    guest_phone: '923001234567',
    guest_email: null,
    checkin_date: '2026-10-10T14:00:00+05:00',
    checkout_date: '2026-10-13T11:00:00+05:00',
    nights: 3,
    guests: 2,
    total_price: '24000.0',
    paid_amount: '0.0',
    currency: 'PKR',
    line_items: [{ room_type_id: 'rt-1', room_type: { id: 'rt-1', name: 'Dormitory' }, guests: 2, occupancy_type: 'shared' }],
    occupancies: [{ id: 'oc-1', room_id: 'r-101', room_number: '101', guests: 2, status: 'active' }],
    status: { name: 'Unpaid', slug: 'unpaid' },
    disposition: { name: 'Checked In', slug: 'checked-in' },
    ...over,
  };
}

/** One page of `HostBookingsApi.list`. */
export function bookingPage(items: HostBooking[] = [], over: Partial<HostBookingPage> = {}): HostBookingPage {
  return { items, page: 1, total: items.length, totalPages: 1, ...over };
}

export const EMPTY_CALENDAR: BookingCalendar = { days: [], totals: {}, revenue: {} };

/* ── HostOpsApi replies ─────────────────────────────────────────────────────── */

export type InvoicesReply = ObservedValueOf<ReturnType<HostOpsApi['invoices']>>;
export type RoomsReply = ObservedValueOf<ReturnType<HostOpsApi['rooms']>>;

/** One page of `HostOpsApi.invoices`, with zeroed aggregates unless given. */
export function invoicesReply(bills: Invoice[] = [], over: Partial<InvoicesReply> = {}): InvoicesReply {
  return {
    bills,
    total: bills.length,
    totalPages: 1,
    statuses: [],
    aggs: { utilityTotal: 0, utilityPaid: 0, utilityBalance: 0, rentTotal: 0, rentPaid: 0, rentBalance: 0 },
    ...over,
  };
}

export function room(over: Partial<HostRoom> = {}): HostRoom {
  return {
    id: 'r-101',
    number: '101',
    floor: 'Ground',
    type: 'Dormitory',
    capacity: 4,
    occupied: 1,
    rentPerBed: 4000,
    attachedBath: false,
    createdAt: '2026-01-01',
    ...over,
  };
}

/** One page of `HostOpsApi.rooms`. */
export function roomsReply(rooms: HostRoom[] = [], over: Partial<RoomsReply> = {}): RoomsReply {
  return {
    rooms,
    total: rooms.length,
    aggs: { totalRooms: rooms.length, totalCapacity: 0, occupiedCapacity: 0, vacantCapacity: 0 },
    statuses: [],
    ...over,
  };
}

export function roomRenter(over: Partial<RoomRenter> = {}): RoomRenter {
  return {
    id: 't-1',
    name: 'Saad Ali',
    initials: 'SA',
    phone: '',
    email: '',
    moveIn: '2026-01-01',
    rent: 14000,
    status: 'active',
    ...over,
  };
}

/** `HostOpsApi.roomShow` reply. */
export function roomShow(over: Partial<RoomShowData> = {}): RoomShowData {
  return { room: room(), renters: [], ...over };
}

/* ── hostels and errors ─────────────────────────────────────────────────────── */

/** A host's hostel as the shell's listings endpoint maps it. */
export function hostListing(billing: BillingMode = 'night', over: Partial<HostListing> = {}): HostListing {
  return {
    id: HOSTEL_ID,
    name: 'Ever Care Hostel',
    area: 'Lahore City',
    city: 'Lahore',
    accommodationType: 'backpacker',
    billingFrequency: billing,
    currency: 'PKR',
    propertyType: 'house',
    roomTypes: [],
    offers: [],
    review: { score: null, count: 0 },
    status: 'published',
    image: '',
    ...over,
  } as HostListing;
}

/** The normalised error the interceptor hands a caller; throw it with `throwError(() => …)`. */
export function apiError(status: number, serverMessages: readonly string[] = [], method = 'POST'): ApiError {
  return {
    status,
    code: status === 0 ? 'network_error' : 'unknown_error',
    message: `${method} /api/test → ${status}`,
    serverMessages,
    method,
  };
}
