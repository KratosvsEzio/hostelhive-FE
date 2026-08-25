import { areaOf, isConsoleArea } from './area';

/**
 * Which area a URL belongs to.
 *
 * Two things here fail silently rather than loudly, which is why they are worth pinning.
 *
 * `/hostel/:id` is a public listing page whose first five letters are the host console, so a
 * `startsWith('/host')` puts every seeker reading a listing into console chrome — and console
 * chrome on a public page looks deliberate enough that nobody files it.
 *
 * A language prefix breaks every one of these comparisons at once: `/ur/host` is the console
 * but matches none of the bare paths the route table declares. That only shows up after
 * somebody switches language, which is exactly when nobody is testing.
 */
describe('areaOf', () => {
  it('reads the three consoles', () => {
    expect(areaOf('/host')).toBe('host');
    expect(areaOf('/host/nHelLt/bookings')).toBe('host');
    expect(areaOf('/admin/contracts')).toBe('admin');
    expect(areaOf('/moderator/queue')).toBe('moderator');
  });

  // The trap. `/hostel` and `/hostels` are seeker pages that start with "/host".
  it('does not mistake a public listing for the host console', () => {
    expect(areaOf('/hostel/vKkMIE')).toBe('seeker');
    expect(areaOf('/hostels/lahore')).toBe('seeker');
    expect(areaOf('/hostelworld')).toBe('seeker');
  });

  it('treats sign-in and invitations as their own area', () => {
    expect(areaOf('/auth')).toBe('auth');
    expect(areaOf('/confirm_invitation/abc123')).toBe('auth');
  });

  it('falls back to the seeker site', () => {
    expect(areaOf('/')).toBe('seeker');
    expect(areaOf('')).toBe('seeker');
    expect(areaOf('/search/lahore')).toBe('seeker');
  });

  // The second trap: every comparison above is against an unprefixed path.
  it('sees through a language prefix', () => {
    expect(areaOf('/ur/host')).toBe('host');
    expect(areaOf('/de/host/nHelLt/bookings')).toBe('host');
    expect(areaOf('/ja/admin/contracts')).toBe('admin');
    expect(areaOf('/ru')).toBe('seeker');
    // Both traps at once.
    expect(areaOf('/de/hostel/vKkMIE')).toBe('seeker');
  });
});

/**
 * Which areas offer a way back out to the public site.
 *
 * The account menu's "View site" row hangs off this. Getting `auth` wrong would put an exit
 * link on the sign-in page, which is the one place a user has nothing to exit from.
 */
describe('isConsoleArea', () => {
  it('is true for the three consoles and nothing else', () => {
    expect(isConsoleArea('host')).toBe(true);
    expect(isConsoleArea('admin')).toBe(true);
    expect(isConsoleArea('moderator')).toBe(true);

    expect(isConsoleArea('seeker')).toBe(false);
    expect(isConsoleArea('auth')).toBe(false);
  });
});
