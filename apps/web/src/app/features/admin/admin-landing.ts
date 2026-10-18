import { inject } from '@angular/core';
import { RedirectFunction } from '@angular/router';
import { Permission, SessionStore } from '@core/auth';

/** The non-billing admin pages, in sidebar order, with the flag each one is guarded by. */
const FALLBACK_PAGES: readonly (readonly [path: string, flag: Permission])[] = [
  ['roles', 'admin:Role:index'],
  ['queue', 'moderator:Hostel:index'],
  ['listings', 'admin:Hostel:index'],
];

/**
 * Where `/admin` lands: billing for an admin, otherwise the first page the session may open.
 *
 * Billing is gated on the `admin` role, as the backend is. With no page open to the user,
 * `listings` is returned anyway so its own guard sends them to `/forbidden`. Paths stay
 * relative so the language prefix survives the redirect.
 */
export const adminLanding: RedirectFunction = () => {
  const session = inject(SessionStore);
  if (session.hasRole('admin')) return 'billing';
  const open = FALLBACK_PAGES.find(([, flag]) => session.hasPermission(flag));
  return open?.[0] ?? 'listings';
};
