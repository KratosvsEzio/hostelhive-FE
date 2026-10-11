import { Permission } from '@core/auth';
import { NavEntry, hostNav, hostTabBar, splitNav, tabBarSuffixes } from './host-nav';

const ALL = () => true;
const NONE = () => false;

function nav(
  opts: Partial<{
    monthlyBilled: boolean;
    nightlyBilled: boolean;
    can: (p: Permission) => boolean;
  }> = {},
) {
  return hostNav('/host/nHelLt', {
    monthlyBilled: opts.monthlyBilled ?? false,
    nightlyBilled: opts.nightlyBilled ?? false,
    can: opts.can ?? ALL,
  });
}

const labels = (entries: NavEntry[]) => entries.map((e) => e.label).filter(Boolean);

/**
 * The one list both navigation surfaces read.
 *
 * Under 768px the sidebar is not rendered, so the bottom tab bar plus the More page are the
 * whole of host navigation — a destination in neither cannot be reached except by typing its
 * URL, which is what happened to Bookings before anyone noticed. That makes the split below
 * a correctness property rather than a layout detail, and it fails silently either way: a
 * section that quietly stops appearing looks the same as one that was never added.
 */
describe('hostNav', () => {
  it('gives every entry the active hostel', () => {
    for (const e of nav()) {
      if (e.link) expect(e.link.startsWith('/host/nHelLt/')).toBe(true);
    }
  });

  it('hides what the session has no permission for, and keeps what is ungated', () => {
    // Overview is deliberately ungated: a dashboard over what the user can already see.
    expect(labels(nav({ can: NONE }))).toEqual(['common.overview']);
  });

  // A month-billed hostel sells tenancies, not nights — there is nothing for the page to
  // list, and `bookingsGate` turns away a typed URL.
  it('drops Bookings for a month-billed hostel', () => {
    expect(labels(nav({ monthlyBilled: false }))).toContain('common.bookings');
    expect(labels(nav({ monthlyBilled: true }))).not.toContain('common.bookings');
  });

  // The exact counterpart of Bookings above: a nightly hostel turns arrivals over, so it has
  // guests rather than tenancies and the list is empty by construction. The bottom tab bar
  // already chose between the two; this is the sidebar agreeing.
  it('drops Tenants for a night-billed hostel', () => {
    expect(labels(nav({ monthlyBilled: true }))).toContain('common.tenants');
    expect(labels(nav({ nightlyBilled: true }))).not.toContain('common.tenants');
  });

  it('gives a hostel Bookings or Tenants, never both and never neither', () => {
    // The pair is the whole point: whichever way a known hostel is billed, exactly one of
    // these two describes how people actually arrive at it.
    for (const [monthlyBilled, nightlyBilled] of [
      [true, false],
      [false, true],
    ] as const) {
      const shown = labels(nav({ monthlyBilled, nightlyBilled }));
      const pair = ['common.bookings', 'common.tenants'].filter((l) => shown.includes(l));
      expect({ monthlyBilled, pair }).toEqual({ monthlyBilled, pair: [monthlyBilled ? 'common.tenants' : 'common.bookings'] });
    }
  });

  // The mirror of Bookings. A nightly hostel has guests for two days — no meters to split
  // between them, no weekly menu to plan — so both pages are empty by construction.
  it('drops Utilities and Mess for a night-billed hostel', () => {
    const monthly = labels(nav({ monthlyBilled: true }));
    expect(monthly).toContain('common.utilities');
    expect(monthly).toContain('common.mess');

    const nightly = labels(nav({ nightlyBilled: true }));
    expect(nightly).not.toContain('common.utilities');
    expect(nightly).not.toContain('common.mess');
  });

  /**
   * The case that decides which way each gate fails.
   *
   * `billingFrequency` is empty when the payload did not say, so such a hostel is neither
   * monthly nor nightly. It keeps everything: hiding a working page because a field failed
   * to arrive costs a host the job they came to do, while showing a page they do not need
   * costs one empty list.
   */
  it('keeps every section when the billing cycle is unknown', () => {
    const unknown = labels(nav({ monthlyBilled: false, nightlyBilled: false }));
    for (const label of ['common.bookings', 'common.tenants', 'common.utilities', 'common.mess']) {
      expect({ label, present: unknown.includes(label) }).toEqual({ label, present: true });
    }
  });

  it('never shows a hostel both halves of the console at once', () => {
    // A hostel cannot be billed both ways, so Bookings and Utilities are mutually exclusive
    // wherever the cycle is actually known.
    const monthly = labels(nav({ monthlyBilled: true }));
    expect(monthly).not.toContain('common.bookings');
    expect(monthly).toContain('common.utilities');

    const nightly = labels(nav({ nightlyBilled: true }));
    expect(nightly).toContain('common.bookings');
    expect(nightly).not.toContain('common.utilities');
  });

  // The plan and payment-history pages are gone; a menu row leading to them would be a dead end.
  it('offers no billing destination', () => {
    for (const e of nav()) {
      expect(e.link ?? '').not.toContain('/subscription');
    }
    expect(labels(nav())).not.toContain('common.subscription');
    expect(labels(nav())).not.toContain('hostSubscription.paymentHistory');
  });

  // A divider with nothing under it would render as a rule at the end of the list.
  it('never ends on a stray divider', () => {
    for (const can of [ALL, NONE]) {
      const entries = nav({ can });
      expect(entries.some((e) => e.divider)).toBe(false);
    }
  });
});

describe('splitNav', () => {
  it('splits at the divider, dropping it from both halves', () => {
    const entries: NavEntry[] = [
      { label: 'common.overview', link: '/host/nHelLt/overview' },
      { divider: true },
      { label: 'common.accountSettings', link: '/account/settings' },
    ];
    const { hostel, account } = splitNav(entries);

    expect(labels(hostel)).toEqual(['common.overview']);
    expect(labels(account)).toEqual(['common.accountSettings']);
    expect([...hostel, ...account].some((e) => e.divider)).toBe(false);
  });

  it('puts everything in the first half when there is no divider', () => {
    const entries = nav();
    const { hostel, account } = splitNav(entries);

    expect(account).toEqual([]);
    expect(hostel.length).toBe(entries.length);
  });
});

/**
 * What the More page drops, because the tab bar already goes there.
 *
 * The suffixes have to keep matching real links: a stale one silently stops filtering, and
 * the section then appears in both the tab bar and the list below it.
 */
const hits = (link: string | undefined, monthlyBilled: boolean): boolean =>
  !!link && tabBarSuffixes({ monthlyBilled }).some((t) => link.endsWith(t));

describe('hostTabBar', () => {
  /**
   * The bar was a fixed five. A nightly hostel got Tenants — empty by construction — while
   * Bookings, the page its day is made of, sat under More.
   */
  it('gives a nightly hostel Bookings in the third slot', () => {
    const bar = hostTabBar({ monthlyBilled: false });

    expect(bar.map((t) => t.suffix)).toEqual(['/overview', '/rooms', '/bookings', '/invoices']);
  });

  it('gives a month-billed hostel Tenants instead', () => {
    const bar = hostTabBar({ monthlyBilled: true });

    expect(bar.map((t) => t.suffix)).toEqual(['/overview', '/rooms', '/tenants', '/invoices']);
  });

  // `bookingsGate` lets an unknown billing cycle through to Bookings, so the bar agrees.
  it('treats an unknown billing cycle as nightly', () => {
    expect(hostTabBar({ monthlyBilled: false })[2].suffix).toBe('/bookings');
  });

  it('keeps the bar at four destinations either way', () => {
    expect(hostTabBar({ monthlyBilled: true }).length).toBe(4);
    expect(hostTabBar({ monthlyBilled: false }).length).toBe(4);
  });

  it('labels and ices every slot', () => {
    for (const monthlyBilled of [true, false]) {
      for (const t of hostTabBar({ monthlyBilled })) {
        expect(t.label).toMatch(/^[a-z]+\.[a-zA-Z]+$/);
        expect(t.icon).toMatch(/^ti-/);
      }
    }
  });
});

describe('tabBarSuffixes', () => {
  it('every suffix still matches a real destination', () => {
    for (const monthlyBilled of [true, false]) {
      const links = nav({ monthlyBilled, nightlyBilled: !monthlyBilled }).map((e) => e.link ?? '');
      for (const suffix of tabBarSuffixes({ monthlyBilled })) {
        expect(links.some((l) => l.endsWith(suffix))).toBe(true);
      }
    }
  });

  /**
   * The invariant that matters: nothing may be absent from both surfaces. Under 768px there
   * is no sidebar, so a destination in neither the bar nor More is reachable only by typing
   * its URL — which is what a swap in one list without the other would cause.
   */
  it('leaves every other destination for the More page', () => {
    for (const monthlyBilled of [true, false]) {
      const entries = nav({ monthlyBilled, nightlyBilled: !monthlyBilled });
      const inTabBar = entries.filter((e) => hits(e.link, monthlyBilled));
      const inMore = entries.filter((e) => e.link && !hits(e.link, monthlyBilled));

      expect(inTabBar.length).toBe(tabBarSuffixes({ monthlyBilled }).length);
      expect(inTabBar.length + inMore.length).toBe(entries.filter((e) => e.link).length);
    }
  });

  // Tenants used to lose its tab on a nightly hostel and stay reachable from More, because
  // the nav still carried it. It does not any more: a nightly hostel signs no tenancies, so
  // the page is gated at the route as well and there is nothing to strand.
  it('does not strand Tenants on a night-billed hostel', () => {
    const entries = nav({ monthlyBilled: false, nightlyBilled: true });

    expect(entries.some((e) => e.link?.endsWith('/tenants'))).toBe(false);
    expect(tabBarSuffixes({ monthlyBilled: false })).not.toContain('/tenants');
  });

  // And the mirror: Bookings loses its tab on a monthly hostel, where the nav drops it too.
  it('does not strand Bookings on a month-billed hostel', () => {
    const entries = nav({ monthlyBilled: true, nightlyBilled: false });

    expect(entries.some((e) => e.link?.endsWith('/bookings'))).toBe(false);
    expect(tabBarSuffixes({ monthlyBilled: true })).not.toContain('/bookings');
  });
});
