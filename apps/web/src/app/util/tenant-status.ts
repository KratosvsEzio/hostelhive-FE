import { TenantStatus } from '@hostelhive/data-access';

/**
 * What a tenant's status is called, and what colour it carries.
 *
 * One table for the whole console. The room detail page used to keep its own, and it was a
 * two-way guess — `active` or "Checked out" — so a tenant the API reported as **Inactive**,
 * or on notice, was labelled as having left. Every state that is not `active` is not the
 * same state, and a host reading "Checked out" beside somebody still in the room has no way
 * to tell the page is wrong.
 *
 * The tone is the same decision: `on-notice` is the one a host has to act on, so it is the
 * only one that is warm. Grouping it with `inactive` under one grey is how a notice period
 * goes unnoticed.
 */
const LABEL: Record<TenantStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  'on-notice': 'On notice',
  'checked-out': 'Checked-out',
};

export type TenantStatusTone = 'ok' | 'warn' | 'danger' | 'neutral';

const TONE: Record<TenantStatus, TenantStatusTone> = {
  active: 'ok',
  inactive: 'neutral',
  'on-notice': 'warn',
  'checked-out': 'neutral',
};

/**
 * The status as a host should read it.
 *
 * An unrecognised slug is shown as it arrived rather than mapped to a default. The backend
 * owns this vocabulary and can add to it; printing the raw value is honest about a state the
 * frontend has not been taught yet, where a fallback label would quietly assert the wrong one.
 */
export function tenantStatusLabel(status: string): string {
  return LABEL[status as TenantStatus] ?? status;
}

/** Neutral for anything unrecognised: a colour is a claim, and this one would be a guess. */
export function tenantStatusTone(status: string): TenantStatusTone {
  return TONE[status as TenantStatus] ?? 'neutral';
}
