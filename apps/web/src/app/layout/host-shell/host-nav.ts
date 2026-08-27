import { Permission } from '@core/auth';

export interface NavEntry {
  /** A translation key, not display text — resolved by the pipe so it follows a language change. */
  label?: string;
  icon?: string;
  link?: string;
  /**
   * Match the link exactly rather than by prefix.
   *
   * For an entry whose link is a prefix of another's: without it both light up on the
   * deeper page, which reads as a bug.
   */
  exact?: boolean;
  divider?: boolean;
  /** Hidden unless the session holds this flag. Omit for entries everyone may see. */
  permission?: Permission;
}

/**
 * Every host destination, in order, filtered to what this session may open.
 *
 * A pure function rather than a computed on the shell, because **two** surfaces render it
 * and the console is only navigable if they agree. Under 768px the sidebar is not rendered
 * at all, so the bottom tab bar plus the mobile More page are the whole of navigation —
 * a destination missing from both cannot be reached except by typing its URL, which is
 * exactly what happened to Bookings until somebody noticed.
 *
 * Both surfaces used to hold their own hand-written list, and they had already drifted:
 * the sidebar carried ten entries More did not. Deriving both from here means adding a
 * section is one edit, and a section can no longer be visible on a laptop and unreachable
 * on a phone.
 */
export function hostNav(
  base: string,
  opts: { monthlyBilled: boolean; can: (permission: Permission) => boolean },
): NavEntry[] {
  const b = base;
  // Each destination names the API action it needs, so a sub-user only sees the sections
  // their permissions actually reach. Overview is ungated: it is a dashboard over whatever
  // the user can already see, not a resource of its own.
  const entries: NavEntry[] = [
    { label: 'common.overview',       icon: 'ti-layout-dashboard', link: `${b}/overview` },
    { label: 'common.hostelProfile',  icon: 'ti-building',         link: `${b}/profile`,      permission: 'host:Hostel:show' },
    { label: 'common.rooms',          icon: 'ti-bed',              link: `${b}/rooms`,        permission: 'host:Room:index' },
    // Bookings is a nightly hostel's page. A month-billed hostel sells tenancies rather
    // than nights, so there is nothing here to list and nothing its create form could
    // legally write — see `HostPropertyStore.isMonthlyBilled`. `bookingsGate` turns away a
    // typed URL; this is what stops the console offering it in the first place.
    ...(opts.monthlyBilled
      ? []
      : [{ label: 'common.bookings', icon: 'ti-calendar', link: `${b}/bookings`, permission: 'host:Room:index' } as NavEntry]),
    { label: 'common.tenants',        icon: 'ti-users',            link: `${b}/tenants`,      permission: 'host:Renter:index' },
    { label: 'hostNav.teamStaff',     icon: 'ti-user-shield',      link: `${b}/team`,         permission: 'host:Staff:index' },
    { label: 'common.utilities',      icon: 'ti-bolt',             link: `${b}/utilities`,    permission: 'host:UtilityBill:index' },
    { label: 'common.mess',           icon: 'ti-tools-kitchen-2',  link: `${b}/mess`,         permission: 'host:WeeklyMenu:index' },
    { label: 'common.expenses',       icon: 'ti-report-money',     link: `${b}/expenses`,     permission: 'host:Expense:index' },
    { label: 'common.invoices',       icon: 'ti-file-invoice',     link: `${b}/invoices`,     permission: 'host:RenterBill:index' },
    { divider: true },
    // `exact` so it does not stay lit while Payment history below it is the page you are
    // on — two highlighted rows read as a bug. The cost is that checkout, which lives at
    // `/subscription/checkout/:id`, now highlights nothing; it is a flow you pass through
    // from a plan card rather than a place you navigate to.
    { label: 'common.subscription',   icon: 'ti-rosette',          link: `${b}/subscription`, exact: true, permission: 'core:Hostel:subscription' },
    { label: 'hostSubscription.paymentHistory', icon: 'ti-receipt', link: `${b}/subscription/payments`, permission: 'core:Hostel:subscription' },
  ];

  const visible = entries.filter((e) => !e.permission || opts.can(e.permission));
  // Drop a divider that lost everything below it, so the list never ends on a stray rule.
  return visible.filter(
    (e, i) => !e.divider || visible.slice(i + 1).some((n) => !n.divider),
  );
}

/**
 * Where the bottom tab bar already goes.
 *
 * The More page lists what the tab bar does not, so these are the entries it drops. Suffixes
 * rather than full links, since the hostel id is in every one.
 */
export const TAB_BAR_SUFFIXES: readonly string[] = [
  '/overview',
  '/rooms',
  '/tenants',
  '/invoices',
];

/** Splits the nav at its divider: hostel sections, then the billing ones below it. */
export function splitNav(entries: NavEntry[]): { hostel: NavEntry[]; account: NavEntry[] } {
  const at = entries.findIndex((e) => e.divider);
  if (at < 0) return { hostel: entries.filter((e) => !e.divider), account: [] };
  return {
    hostel: entries.slice(0, at).filter((e) => !e.divider),
    account: entries.slice(at + 1).filter((e) => !e.divider),
  };
}
