import type { Invoice, Tenant } from '@hostelhive/data-access';
import type { HostOpsApi } from '@services/host-ops-api';
import { localToday } from '@util/api-date';

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
  return localToday();
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
  // Issue and due dates are optional — a nightly (backpacker) invoice has no due-date cycle
  // at all, and the backend defaults the issue date when none is sent.
  return !!f.renterId && invoiceTotal(f) > 0;
}

/**
 * Seeds the form from an existing invoice, for editing.
 *
 * Reads `breakdown` rather than `lines`: by the time an invoice reaches the UI its
 * lines carry display labels ("Mess charges"), and turning those back into field names
 * would mean parsing English. A bill the API returned as pre-built `line_items` has no
 * breakdown at all — its whole amount lands on rent so the total still reconciles, and
 * the host can re-split it by hand.
 */
export function fromInvoice(inv: Invoice): InvoiceForm {
  const b = inv.breakdown;
  const rent = b?.['rent'];
  const mess = b?.['mess_charges'];
  const transport = b?.['transportation_charges'];
  const hasBreakdown = rent != null || mess != null || transport != null;
  return {
    renterId: inv.renterId,
    renterName: inv.tenantName,
    roomId: inv.roomId,
    roomNumber: inv.roomNumber,
    issuedDate: inv.issued,
    dueDate: inv.due,
    rent: String(hasBreakdown ? (rent ?? 0) : inv.amount),
    messCharges: mess != null ? String(mess) : '',
    transportationCharges: transport != null ? String(transport) : '',
    notes: inv.payNote ?? '',
  };
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
