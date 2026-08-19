import type { Tenant } from '@hostelhive/data-access';
import type { HostOpsApi } from '@services/host-ops-api';
import { normalizeBillingDay } from '@util/billing-day';

/** Every field the tenant check-in / edit drawer binds to, all held as form-shaped strings. */
export interface CheckInForm {
  id?: string;
  fullName: string;
  email: string;
  phone: string;
  emergencyContact: string;
  cnicNumber: string;
  address: string;
  roomId: string;
  roomNumber: string;
  /** `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm` once a time is picked. */
  joiningDate: string;
  /** `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm` once a time is picked. */
  leaveDate: string;
  rent: string;
  advanceDeposit: string;
  messCharges: string;
  messBreakfast: boolean;
  messLunch: boolean;
  messDinner: boolean;
  transportationCharges: string;
  billingDate: string;
  billingDueDate: string;
  imageName: string;
  imagePreview: string;
  avatarUploadId: string;
  cnicFrontName: string;
  cnicFrontPreview: string;
  cnicFrontUploadId: string;
  cnicBackName: string;
  cnicBackPreview: string;
  cnicBackUploadId: string;
}

/** A room as the drawer's room selector needs it, before it becomes a `DropdownOption`. */
export interface RoomOption {
  id: string;
  number: string;
  label: string;
  isFull: boolean;
}

/** Request body accepted by the renter create endpoint. */
export type CreateRenterPayload = Parameters<HostOpsApi['createRenter']>[1];

/** Request body accepted by the renter update endpoint. */
export type UpdateRenterPayload = Parameters<HostOpsApi['updateRenter']>[2];

/** Fields that must carry a non-blank value before the drawer will submit. */
const REQUIRED_FIELDS = [
  'fullName',
  'email',
  'phone',
  // emergencyContact is deliberately absent: collected, but not required to register.
  'cnicNumber',
  'address',
  'joiningDate',
  'rent',
  'advanceDeposit',
  'billingDate',
  'billingDueDate',
] as const satisfies readonly (keyof CheckInForm)[];

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Local now as `YYYY-MM-DDTHH:mm`, minutes rounded to the picker’s step.
 *
 * Built from local getters rather than `toISOString()`, which is UTC — at UTC+5 that
 * returned yesterday’s date for the first five hours of every day, so a tenant checked
 * in before 05:00 defaulted to the wrong day.
 *
 * Rounded because the time picker offers minutes in `minuteStep` increments (00/15/30/45);
 * an unrounded 14:37 would preselect a minute the column does not contain.
 */
function nowLocal(stepMinutes = 15): string {
  const d = new Date();
  d.setSeconds(0, 0);
  // setMinutes handles the rollover when rounding up past 59 — and past 23:59 into
  // tomorrow — so the date parts are read back out after this, never before.
  d.setMinutes(Math.round(d.getMinutes() / stepMinutes) * stepMinutes);
  const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  return `${date}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Builds the form a fresh check-in starts from, defaulting the joining date to today
 * and the billing cycle to the 1st / 5th of the month.
 *
 * @param roomId - Room to pre-select, when the drawer was opened from a specific room.
 */
export function emptyCheckInForm(roomId?: string): CheckInForm {
  return {
    fullName: '',
    email: '',
    phone: '',
    emergencyContact: '',
    cnicNumber: '',
    address: '',
    roomId: roomId ?? '',
    roomNumber: '',
    joiningDate: nowLocal(),
    leaveDate: '',
    rent: '',
    advanceDeposit: '',
    messCharges: '',
    messBreakfast: false,
    messLunch: false,
    messDinner: false,
    transportationCharges: '',
    billingDate: '1',
    billingDueDate: '5',
    imageName: '',
    imagePreview: '',
    avatarUploadId: '',
    cnicFrontName: '',
    cnicFrontPreview: '',
    cnicFrontUploadId: '',
    cnicBackName: '',
    cnicBackPreview: '',
    cnicBackUploadId: '',
  };
}

/**
 * Builds the placeholder form shown while an existing tenant's details are still in flight.
 * Only `id` is observable at this point — the drawer body renders a spinner until the real
 * values land, at which point {@link checkInFormFromTenant} replaces this wholesale.
 */
export function pendingEditForm(tenantId: string): CheckInForm {
  return {
    ...emptyCheckInForm(),
    id: tenantId,
    joiningDate: '',
    billingDate: '',
    billingDueDate: '',
    messBreakfast: true,
    messLunch: true,
    messDinner: true,
  };
}

/** Projects a saved tenant back onto the form shape the drawer edits. */
export function checkInFormFromTenant(t: Tenant): CheckInForm {
  return {
    id: t.id,
    fullName: t.name,
    email: t.email ?? '',
    phone: t.phone,
    emergencyContact: t.emergencyContact ?? '',
    cnicNumber: t.cnic ?? '',
    address: t.address ?? '',
    roomId: t.roomId ?? '',
    roomNumber: t.roomNumber,
    joiningDate: t.joinedTime ? `${t.joined}T${t.joinedTime}` : t.joined,
    leaveDate: t.leaveDate ? (t.leaveTime ? `${t.leaveDate}T${t.leaveTime}` : t.leaveDate) : '',
    rent: String(t.rent),
    advanceDeposit: String(t.deposit),
    messCharges: t.messCharges != null ? String(t.messCharges) : '',
    messBreakfast: t.messBreakfast,
    messLunch: t.messLunch,
    messDinner: t.messDinner,
    transportationCharges:
      t.transportationCharges != null ? String(t.transportationCharges) : '',
    billingDate: normalizeBillingDay(t.billingDate),
    billingDueDate: normalizeBillingDay(t.billingDueDate),
    imageName: t.avatarUrl || t.avatarId ? 'Photo on file' : '',
    imagePreview: t.avatarUrl ?? '',
    avatarUploadId: t.avatarId ?? '',
    cnicFrontName: t.cnicFrontUrl || t.cnicFrontId ? 'Photo on file' : '',
    cnicFrontPreview: t.cnicFrontUrl ?? '',
    cnicFrontUploadId: t.cnicFrontId ?? '',
    cnicBackName: t.cnicBackUrl || t.cnicBackId ? 'Photo on file' : '',
    cnicBackPreview: t.cnicBackUrl ?? '',
    cnicBackUploadId: t.cnicBackId ?? '',
  };
}

/**
 * A backpacker hostel bills per night, so a stay has no day-of-month cycle: the billing
 * date and billing due date are neither collected nor sent. Everything else is unchanged.
 */
export interface RenterFormContext {
  /** True when the hostel bills per night (accommodation type `backpacker`). */
  nightly: boolean;
}

const MONTHLY_ONLY_FIELDS = ['billingDate', 'billingDueDate'] as const;

/** The required keys, narrowed to the string-valued fields so `.trim()` stays valid. */
type RequiredField = (typeof REQUIRED_FIELDS)[number];

/** Required fields for this hostel — the billing cycle drops out for a nightly stay. */
function requiredFields(ctx?: RenterFormContext): readonly RequiredField[] {
  if (!ctx?.nightly) return REQUIRED_FIELDS;
  return REQUIRED_FIELDS.filter(
    (k) => !(MONTHLY_ONLY_FIELDS as readonly string[]).includes(k),
  );
}

/** True when every required field carries a non-blank value. Room stays optional. */
export function isCheckInFormValid(f: CheckInForm, ctx?: RenterFormContext): boolean {
  if (leaveBeforeJoin(f)) return false;
  return requiredFields(ctx).every((key) => !!f[key].trim());
}

/** Maps the form onto the create request body, dropping blank optionals entirely. */
/**
 * Joins a date with an optional time for the wire.
 *
 * With no time this returns the bare `YYYY-MM-DD` the API has always received, so a user
 * who never opens the time picker produces a byte-identical request. The format only
 * widens once a time is actually chosen.
 */
function toWireDateTime(value: string): string {
  return value.includes('T') ? `${value}:00` : value;
}

/**
 * Check-out earlier than check-in. Both halves are zero-padded, so a plain string
 * compare is ordering-correct; a bare date is treated as midnight so a same-day stay
 * with a check-out time before the check-in time is caught too — the case that only
 * became expressible once these fields carried a time.
 */
export function leaveBeforeJoin(f: CheckInForm): boolean {
  if (!f.joiningDate || !f.leaveDate) return false;
  const at = (v: string) => (v.includes('T') ? v : `${v}T00:00`);
  return at(f.leaveDate) < at(f.joiningDate);
}

export function toCreateRenterPayload(
  f: CheckInForm,
  ctx?: RenterFormContext,
): CreateRenterPayload {
  return {
    full_name: f.fullName.trim(),
    email: f.email.trim(),
    phone: f.phone.trim(),
    emergency_contact: f.emergencyContact.trim(),
    room_id: f.roomId || undefined,
    mess_charges: f.messCharges.trim() ? Number(f.messCharges) : undefined,
    breakfast_enabled: f.messBreakfast,
    lunch_enabled: f.messLunch,
    dinner_enabled: f.messDinner,
    transportation_charges: f.transportationCharges.trim()
      ? Number(f.transportationCharges)
      : undefined,
    advance_deposit: Number(f.advanceDeposit),
    joining_date: toWireDateTime(f.joiningDate),
    leave_date: f.leaveDate ? toWireDateTime(f.leaveDate) : undefined,
    rent: f.rent.trim(),
    address: f.address.trim(),
    // Omitted entirely for a nightly stay rather than sent as 0 or null, which the
    // backend would store as a real billing day.
    ...(ctx?.nightly
      ? {}
      : {
          billing_due_date: Number(f.billingDueDate),
          billing_date: Number(f.billingDate),
        }),
    cnic_number: f.cnicNumber.trim() || undefined,
    avatar_id: f.avatarUploadId || undefined,
    cnic_front_id: f.cnicFrontUploadId || undefined,
    cnic_back_id: f.cnicBackUploadId || undefined,
  };
}

/**
 * Maps the form onto the update request body. Clearable fields send an explicit `null`
 * rather than being omitted, so unsetting a room or a charge actually persists.
 */
export function toUpdateRenterPayload(
  f: CheckInForm,
  ctx?: RenterFormContext,
): UpdateRenterPayload {
  return {
    full_name: f.fullName.trim(),
    email: f.email.trim(),
    phone: f.phone.trim(),
    emergency_contact: f.emergencyContact.trim(),
    room_id: f.roomId || null,
    mess_charges: f.messCharges.trim() ? Number(f.messCharges) : null,
    breakfast_enabled: f.messBreakfast,
    lunch_enabled: f.messLunch,
    dinner_enabled: f.messDinner,
    transportation_charges: f.transportationCharges.trim()
      ? Number(f.transportationCharges)
      : null,
    advance_deposit: Number(f.advanceDeposit),
    joining_date: toWireDateTime(f.joiningDate),
    leave_date: f.leaveDate ? toWireDateTime(f.leaveDate) : null,
    rent: f.rent.trim(),
    address: f.address.trim(),
    ...(ctx?.nightly
      ? {}
      : {
          billing_due_date: Number(f.billingDueDate),
          billing_date: Number(f.billingDate),
        }),
    cnic_number: f.cnicNumber.trim() || undefined,
    avatar_id: f.avatarUploadId || undefined,
    cnic_front_id: f.cnicFrontUploadId || undefined,
    cnic_back_id: f.cnicBackUploadId || undefined,
  };
}
