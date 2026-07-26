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
  joiningDate: string;
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
  'emergencyContact',
  'cnicNumber',
  'address',
  'joiningDate',
  'rent',
  'advanceDeposit',
  'billingDate',
  'billingDueDate',
] as const satisfies readonly (keyof CheckInForm)[];

function today(): string {
  return new Date().toISOString().slice(0, 10);
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
    joiningDate: today(),
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
    joiningDate: t.joined,
    leaveDate: t.leaveDate ?? '',
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

/** True when every required field carries a non-blank value. Room stays optional. */
export function isCheckInFormValid(f: CheckInForm): boolean {
  return REQUIRED_FIELDS.every((key) => !!f[key].trim());
}

/** Maps the form onto the create request body, dropping blank optionals entirely. */
export function toCreateRenterPayload(f: CheckInForm): CreateRenterPayload {
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
    joining_date: f.joiningDate,
    leave_date: f.leaveDate || undefined,
    rent: f.rent.trim(),
    address: f.address.trim(),
    billing_due_date: Number(f.billingDueDate),
    billing_date: Number(f.billingDate),
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
export function toUpdateRenterPayload(f: CheckInForm): UpdateRenterPayload {
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
    joining_date: f.joiningDate,
    leave_date: f.leaveDate || undefined,
    rent: f.rent.trim(),
    address: f.address.trim(),
    billing_due_date: Number(f.billingDueDate),
    billing_date: Number(f.billingDate),
    cnic_number: f.cnicNumber.trim() || undefined,
    avatar_id: f.avatarUploadId || undefined,
    cnic_front_id: f.cnicFrontUploadId || undefined,
    cnic_back_id: f.cnicBackUploadId || undefined,
  };
}
