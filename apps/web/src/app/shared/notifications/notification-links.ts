import type { UserInvite } from '@services';

/**
 * Notification types about a hostel's plan and payments. Each opens that hostel's billing page:
 * the backend files the invoice, payment or subscription under `associated_id`, and the hostel
 * itself under `hostel_id` (be-hostelhive PR #74; for `subscription_ended` the hostel is the
 * associated record too).
 */
export const BILLING_NOTIFICATION_TYPES: ReadonlySet<string> = new Set([
  'payment_received',
  'payment_rejected',
  'renewal_invoice',
  'renewal_reminder',
  'subscription_past_due',
  'subscription_ended',
  'card_declined',
  'card_expiring',
]);

/**
 * Where a billing notification leads: the billing page of the hostel it is about. Opening
 * `/host/<id>/…` also selects that hostel, so this works whichever hostel is selected now
 * (`knownHostelGate` sends an id the host no longer has back to `/host`). `null` for any other
 * type, and for a billing notice with no hostel, which then stays unclickable.
 */
export function billingPageFor(
  invite: Pick<UserInvite, 'inviteType' | 'hostelId'>,
): string[] | null {
  if (!invite.hostelId || !BILLING_NOTIFICATION_TYPES.has(invite.inviteType)) return null;
  return ['/host', invite.hostelId, 'subscription'];
}
