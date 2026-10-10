import { hostPagePath } from './host-route';

/**
 * Reading a host-console URL.
 *
 * This is segment arithmetic over a path, and it fails by returning a plausible
 * wrong answer rather than by throwing — which is how the language prefix broke it without
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
