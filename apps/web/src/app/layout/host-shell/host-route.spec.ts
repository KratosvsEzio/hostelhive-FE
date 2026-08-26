import { hostPagePath, opensWithoutSubscription } from './host-route';

/**
 * Reading a host-console URL.
 *
 * Both of these are segment arithmetic over a path, and both fail by returning a plausible
 * wrong answer rather than by throwing — which is how the language prefix broke them without
 * breaking a build. The cases that matter are therefore the non-English ones, and those are
 * exactly the ones nobody clicks through by hand.
 */
describe('hostPagePath', () => {
  it('reads the page below the hostel', () => {
    expect(hostPagePath('/en/host/nHelLt/rooms')).toBe('rooms');
    expect(hostPagePath('/en/host/nHelLt/rooms/edit/r2')).toBe('rooms/edit/r2');
  });

  it('is empty at the console root', () => {
    expect(hostPagePath('/en/host/nHelLt')).toBe('');
  });

  // The whole point. Every console URL carries a language, so the page is the fourth
  // segment — and an unprefixed URL, which the router only ever redirects away from,
  // still has to read the same.
  it('reads the same page whatever the language', () => {
    expect(hostPagePath('/ur/host/nHelLt/profile')).toBe('profile');
    expect(hostPagePath('/ar/host/nHelLt/profile')).toBe('profile');
    expect(hostPagePath('/host/nHelLt/profile')).toBe('profile');
  });

  it('ignores the query and the fragment', () => {
    expect(hostPagePath('/en/host/nHelLt/bookings?status=pending')).toBe('bookings');
    expect(hostPagePath('/en/host/nHelLt/invoices#total')).toBe('invoices');
  });
});

describe('opensWithoutSubscription', () => {
  it('lets a lapsed host reach the two pages that can un-lapse them', () => {
    expect(opensWithoutSubscription('/en/host/nHelLt/subscription')).toBe(true);
    expect(opensWithoutSubscription('/en/host/nHelLt/profile')).toBe(true);
  });

  // Where the paying actually happens. Exempting the plan list but not checkout would
  // bounce the host on the click that matters.
  it('covers checkout', () => {
    expect(opensWithoutSubscription('/en/host/nHelLt/subscription/checkout/p1')).toBe(true);
  });

  it('still paywalls the rest of the console', () => {
    const paid = [
      'overview', 'rooms', 'bookings', 'tenants', 'team',
      'utilities', 'mess', 'expenses', 'invoices', 'more',
    ];
    for (const page of paid) {
      expect(opensWithoutSubscription(`/en/host/nHelLt/${page}`)).toBe(false);
    }
    expect(opensWithoutSubscription('/en/host/nHelLt')).toBe(false);
  });

  it('holds in a language other than English', () => {
    expect(opensWithoutSubscription('/ur/host/nHelLt/profile')).toBe(true);
    expect(opensWithoutSubscription('/ur/host/nHelLt/subscription')).toBe(true);
    expect(opensWithoutSubscription('/ur/host/nHelLt/rooms')).toBe(false);
  });
});
