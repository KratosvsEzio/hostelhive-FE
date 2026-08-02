import type { Tenant } from '@hostelhive/data-access';
import type { HostOpsApi } from '@services/host-ops-api';

/** Every field the add-invoice drawer binds to, held as form-shaped strings. */
export interface InvoiceForm {
  renterId: string;
  renterName: string;
  roomId: string;
  roomNumber: string;
  issuedDate: string;
  dueDate: string;
  rent: string;
  messCharges: string;
  transportationCharges: string;
  notes: string;
}

/** A tenant as the drawer's tenant selector needs it, before it becomes a `DropdownOption`. */
export interface TenantOption {
  id: string;
  name: string;
  label: string;
}

/** Request body accepted by the renter-bill create endpoint. */
export type CreateInvoicePayload = Parameters<HostOpsApi['createInvoice']>[1];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Blank form a fresh invoice starts from, defaulting the issue date to today. */
export function emptyInvoiceForm(): InvoiceForm {
  return {
    renterId: '',
    renterName: '',
    roomId: '',
    roomNumber: '',
    issuedDate: today(),
    dueDate: '',
    rent: '',
    messCharges: '',
    transportationCharges: '',
    notes: '',
  };
}

/**
 * Prefills the amount fields from the picked tenant's record — the common case is a
 * monthly rent bill for exactly what the tenant is contracted to pay, editable before submit.
 */
export function prefillFromTenant(f: InvoiceForm, t: Tenant): InvoiceForm {
  return {
    ...f,
    renterId: t.id,
    renterName: t.name,
    roomId: t.roomId ?? '',
    roomNumber: t.roomNumber ?? '',
    rent: t.rent ? String(t.rent) : '',
    messCharges: t.messCharges != null ? String(t.messCharges) : '',
    transportationCharges:
      t.transportationCharges != null ? String(t.transportationCharges) : '',
  };
}

/** Parses a form money field to a non-negative number, treating blank/invalid as 0. */
export function money(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Sum of the breakdown lines — the invoice total. */
export function invoiceTotal(f: InvoiceForm): number {
  return money(f.rent) + money(f.messCharges) + money(f.transportationCharges);
}

/**
 * True when the form can be submitted: a tenant is chosen, both dates are set, and the
 * total is positive (the backend rejects a zero-amount bill).
 */
export function isInvoiceFormValid(f: InvoiceForm): boolean {
  return (
    !!f.renterId &&
    !!f.issuedDate.trim() &&
    !!f.dueDate.trim() &&
    invoiceTotal(f) > 0
  );
}

/** Maps the form onto the create request body, dropping breakdown lines that are zero. */
export function toCreateInvoicePayload(f: InvoiceForm): CreateInvoicePayload {
  const rent = money(f.rent);
  const mess = money(f.messCharges);
  const transport = money(f.transportationCharges);
  const breakdown: CreateInvoicePayload['break_down'] = {};
  if (rent) breakdown.rent = rent;
  if (mess) breakdown.mess_charges = mess;
  if (transport) breakdown.transportation_charges = transport;
  return {
    renter_id: f.renterId,
    room_id: f.roomId || undefined,
    amount: rent + mess + transport,
    issued_date: f.issuedDate,
    due_date: f.dueDate,
    break_down: breakdown,
    notes: f.notes.trim() || undefined,
  };
}
