/**
 * In-app paths to a single booking or invoice in the host area.
 *
 * Plain absolute paths with no language prefix, like every other in-app link: a `routerLink`
 * (through `LocaleLink`), a data-table `link` cell (through `HH_LINK_LOCALISER`) and a
 * `Router.navigateByUrl` (through `keepLocale`) each add the active locale themselves, so
 * prefixing here would only be undone or doubled.
 */

/** `/host/:hostelId/bookings/:bookingId`, which opens that booking's details over the list. */
export function bookingPath(hostelId: string, bookingId: string): string {
  return `/host/${hostelId}/bookings/${bookingId}`;
}

/** `/host/:hostelId/invoices/view/:billId`, which opens that invoice's preview over the list. */
export function invoicePath(hostelId: string, billId: string): string {
  return `/host/${hostelId}/invoices/view/${billId}`;
}
