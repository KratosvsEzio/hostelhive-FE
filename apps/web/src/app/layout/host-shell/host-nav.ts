import { Permission } from '@core/auth';

/** The sections a plan without CRM cannot open. Profile and Billing are deliberately absent. */
export const CRM_SECTIONS = ['overview', 'rooms', 'bookings', 'tenants', 'team', 'utilities', 'mess', 'expenses', 'invoices'] as const;
export type CrmSection = (typeof CRM_SECTIONS)[number];

/** Each CRM section's nav label, as a translation key — the same keys {@link hostNav} uses. */
export const CRM_SECTION_LABELS: Record<CrmSection, string> = {
  overview: 'common.overview',
  rooms: 'common.rooms',
  bookings: 'common.bookings',
  tenants: 'common.tenants',
  team: 'hostNav.teamStaff',
  utilities: 'common.utilities',
  mess: 'common.mess',
  expenses: 'common.expenses',
  invoices: 'common.invoices',
};

function firstSegment(pagePath: string): string {
  return pagePath.split('/').find(Boolean) ?? '';
}

/** The CRM section a host page belongs to, from `hostPagePath()` output; null for any other page. */
export function crmSectionOf(pagePath: string): CrmSection | null {
  const segment = firstSegment(pagePath);
  return (CRM_SECTIONS as readonly string[]).includes(segment) ? (segment as CrmSection) : null;
}

/** Whether a host page, from `hostPagePath()` output, is the billing page or one below it. */
export function isBillingPage(pagePath: string): boolean {
  return firstSegment(pagePath) === 'subscription';
}

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
  /** Shown with a lock: the plan lacks CRM. Still a link. */
  locked?: boolean;
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
  opts: {
    monthlyBilled: boolean;
    nightlyBilled: boolean;
    can: (permission: Permission) => boolean;
    crmLocked?: boolean;
  },
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
    // Tenants is the other half of the Bookings swap. A nightly hostel turns arrivals over;
    // it has guests, not tenancies, so the list is empty by construction and the register
    // form writes a record nothing on that hostel reads. The bottom tab bar already chose
    // between the two — see {@link hostTabBar} — and this is the sidebar and More list
    // agreeing with it.
    ...(opts.nightlyBilled
      ? []
      : [{ label: 'common.tenants', icon: 'ti-users', link: `${b}/tenants`, permission: 'host:Renter:index' } as NavEntry]),
    { label: 'hostNav.teamStaff',     icon: 'ti-user-shield',      link: `${b}/team`,         permission: 'host:Staff:index' },
    // The mirror of Bookings above. Utilities and Mess belong to a hostel that houses
    // people by the month: a nightly hostel has guests for two days, not meters to split
    // between them or a weekly menu to plan, so both pages are empty by construction.
    //
    // Gated on `nightlyBilled` rather than on `!monthlyBilled`, so a hostel whose billing
    // cycle failed to arrive keeps them. Hiding a working page because a field was missing
    // is the worse of the two failures — the same argument `isMonthlyBilled` makes for
    // leaving Bookings visible.
    ...(opts.nightlyBilled
      ? []
      : [
          { label: 'common.utilities', icon: 'ti-bolt',            link: `${b}/utilities`, permission: 'host:UtilityBill:index' } as NavEntry,
          { label: 'common.mess',      icon: 'ti-tools-kitchen-2', link: `${b}/mess`,      permission: 'host:WeeklyMenu:index' } as NavEntry,
        ]),
    { label: 'common.expenses',       icon: 'ti-report-money',     link: `${b}/expenses`,     permission: 'host:Expense:index' },
    { label: 'common.invoices',       icon: 'ti-file-invoice',     link: `${b}/invoices`,     permission: 'host:RenterBill:index' },
    { divider: true },
    // Not `exact`: the plan page is the parent of the checkout at `/subscription/pay/:id`, and
    // the entry should stay lit there.
    { label: 'hostNav.billing',       icon: 'ti-receipt',          link: `${b}/subscription`, permission: 'core:Subscription:show' },
  ];

  const visible = entries.filter((e) => !e.permission || opts.can(e.permission));
  // Drop a divider that lost everything below it, so the list never ends on a stray rule.
  const shown = visible.filter(
    (e, i) => !e.divider || visible.slice(i + 1).some((n) => !n.divider),
  );
  if (!opts.crmLocked) return shown;
  return shown.map((e) =>
    e.link && crmSectionOf(e.link.slice(b.length)) ? { ...e, locked: true } : e,
  );
}

/** One destination in the bottom tab bar. `suffix` joins the hostel base, as in {@link hostNav}. */
export interface TabBarEntry {
  label: string;
  icon: string;
  suffix: string;
  /** Shown with a lock: the plan lacks CRM. Still a link. */
  locked?: boolean;
}

/**
 * What the bottom tab bar carries, for this hostel.
 *
 * Four fixed destinations plus More, and the third slot is the one that moves: a month-billed
 * hostel houses tenants, a nightly one turns arrivals over, and only one of those two can
 * have the tab. The bar was a fixed five, so a backpacker hostel got Tenants — a page empty
 * by construction, and one `monthlyOnlyGate` now turns away outright — while Bookings, the
 * thing its day is made of, sat two taps away under More.
 *
 * Nightly on an unknown billing cycle, matching the Bookings rule in {@link hostNav}:
 * `bookingsGate` lets an unknown hostel through, and whichever page loses the slot is still
 * one tap away under More — see {@link tabBarSuffixes}.
 */
export function hostTabBar(opts: { monthlyBilled: boolean; crmLocked?: boolean }): TabBarEntry[] {
  const bar: TabBarEntry[] = [
    { label: 'common.overview', icon: 'ti-layout-dashboard', suffix: '/overview' },
    { label: 'common.rooms', icon: 'ti-bed', suffix: '/rooms' },
    opts.monthlyBilled
      ? { label: 'common.tenants', icon: 'ti-users', suffix: '/tenants' }
      : { label: 'common.bookings', icon: 'ti-calendar', suffix: '/bookings' },
    { label: 'common.invoices', icon: 'ti-file-invoice', suffix: '/invoices' },
  ];
  if (!opts.crmLocked) return bar;
  return bar.map((t) => (crmSectionOf(t.suffix) ? { ...t, locked: true } : t));
}

/**
 * Where the bottom tab bar already goes, as suffixes.
 *
 * The More page lists what the tab bar does not, so these are the entries it drops. Derived
 * from {@link hostTabBar} rather than written out beside it: the two were separate lists, and
 * a swap in one without the other either hides a page from both surfaces — unreachable on a
 * phone, where there is no sidebar — or shows it on both.
 */
export function tabBarSuffixes(opts: { monthlyBilled: boolean }): readonly string[] {
  return hostTabBar(opts).map((t) => t.suffix);
}

/** Splits the nav at its divider: hostel sections, then the account ones below it. */
export function splitNav(entries: NavEntry[]): { hostel: NavEntry[]; account: NavEntry[] } {
  const at = entries.findIndex((e) => e.divider);
  if (at < 0) return { hostel: entries.filter((e) => !e.divider), account: [] };
  return {
    hostel: entries.slice(0, at).filter((e) => !e.divider),
    account: entries.slice(at + 1).filter((e) => !e.divider),
  };
}
