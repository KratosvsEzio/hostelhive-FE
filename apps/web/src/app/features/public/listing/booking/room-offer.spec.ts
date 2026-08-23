import {
  BasketLine,
  RoomOffer,
  bedsBooked,
  canBookOnline,
  depositFor,
  discountPercent,
  effectivePrice,
  guestFit,
  lineFor,
  lineTotal,
  nightsBetween,
  privateCapacityBooked,
  unitFor,
} from './room-offer';

/** The two rooms from the reference design, at its prices. */
const PRIVATE: RoomOffer = {
  id: 'p1',
  title: 'Deluxe 6 Bed Private Ensuite',
  kind: 'private',
  capacity: 6,
  actualPrice: 48_183.82,
  discountedPrice: 36_137.86,
  images: [],
  bookable: true,
  available: 3,
};

const DORM: RoomOffer = {
  id: 's1',
  title: 'Deluxe 12 Bed Mixed Dorm Ensuite',
  kind: 'shared',
  capacity: 12,
  actualPrice: 3_770.58,
  discountedPrice: 2_827.94,
  images: [],
  bookable: true,
  available: 12,
};

describe('canBookOnline', () => {
  it('allows nightly hostels only', () => {
    expect(canBookOnline('nightly')).toBe(true);
  });

  // A monthly hostel is a tenancy, not a checkout. It also keeps the deposit sane — 10% of a
  // twelve-month let would be PKR 30,000 asked before anybody has seen the room.
  it('refuses monthly hostels', () => {
    expect(canBookOnline('monthly')).toBe(false);
  });
});

describe('unitFor', () => {
  // The whole point of the split: a "2" means two different things by row.
  it('sells private rooms whole and shared rooms by the bed', () => {
    expect(unitFor('private')).toBe('room');
    expect(unitFor('shared')).toBe('bed');
  });
});

describe('effectivePrice', () => {
  it('charges the discount when there is one', () => {
    expect(effectivePrice(PRIVATE)).toBe(36_137.86);
  });

  it('charges the list price when there is not', () => {
    expect(effectivePrice({ ...PRIVATE, discountedPrice: undefined })).toBe(48_183.82);
  });
});

describe('discountPercent', () => {
  it('derives the badge from the two prices', () => {
    expect(discountPercent(PRIVATE)).toBe(25);
    expect(discountPercent(DORM)).toBe(25);
  });

  it('shows nothing when there is no discount', () => {
    expect(discountPercent({ ...PRIVATE, discountedPrice: undefined })).toBeNull();
  });

  // An equal pair renders "−0%" beside a struck-through price identical to the one next to
  // it, which reads as a bug. The form rejects it; this is the second line of defence.
  it('shows nothing for a discount that is not a discount', () => {
    expect(discountPercent({ ...PRIVATE, discountedPrice: 48_183.82 })).toBeNull();
    expect(discountPercent({ ...PRIVATE, discountedPrice: 50_000 })).toBeNull();
  });
});

describe('nightsBetween', () => {
  // Check-out is exclusive: 23–26 Aug is three nights, not four.
  it('counts nights, not days', () => {
    expect(nightsBetween(new Date(2026, 7, 23), new Date(2026, 7, 26))).toBe(3);
  });

  it('is zero for a same-day or reversed range', () => {
    expect(nightsBetween(new Date(2026, 7, 23), new Date(2026, 7, 23))).toBe(0);
    expect(nightsBetween(new Date(2026, 7, 26), new Date(2026, 7, 23))).toBe(0);
  });
});

describe('lineTotal', () => {
  // Reproduces the reference basket exactly — 2 rooms × 3 nights and 2 beds × 3 nights.
  it('multiplies unit price by quantity by nights', () => {
    expect(lineTotal(lineFor(PRIVATE, 2), 3)).toBeCloseTo(216_827.16, 2);
    expect(lineTotal(lineFor(DORM, 2), 3)).toBeCloseTo(16_967.64, 2);
  });

  it('totals the reference basket', () => {
    const lines = [lineFor(PRIVATE, 2), lineFor(DORM, 2)];
    const total = lines.reduce((sum, l) => sum + lineTotal(l, 3), 0);
    expect(total).toBeCloseTo(233_794.8, 2);
  });
});

describe('lineFor', () => {
  // A discount stands until the host removes it, so hosts will remove them while bookings
  // are live. A line that re-read the room would reprice a stay already paid for.
  it('captures both prices so a later price change cannot move it', () => {
    const line = lineFor(PRIVATE, 2);
    expect(line.unitPrice).toBe(36_137.86);
    expect(line.actualPrice).toBe(48_183.82);
  });
});

describe('depositFor', () => {
  it('takes 10% of the basket', () => {
    expect(depositFor(233_794.8)).toBeCloseTo(23_379.48, 2);
  });

  // The reference shows 30%; ours is 10%. The rate is configuration for exactly this reason.
  it('accepts a different rate', () => {
    expect(depositFor(233_794.8, 0.3)).toBeCloseTo(70_138.44, 2);
  });
});

describe('guestFit', () => {
  const beds = (n: number): BasketLine => lineFor(DORM, n);
  const rooms = (n: number): BasketLine => lineFor(PRIVATE, n);

  it('counts beds and private capacity separately', () => {
    const lines = [rooms(2), beds(2)];
    expect(bedsBooked(lines)).toBe(2);
    expect(privateCapacityBooked(lines)).toBe(12); // 2 rooms × sleeps 6
  });

  // Three beds is three people. No ambiguity, no room to under-fill.
  it('seats exactly one guest per bed', () => {
    expect(guestFit([beds(3)], 3).ok).toBe(true);
    expect(guestFit([beds(3)], 2).ok).toBe(false); // a bed nobody sleeps in
    expect(guestFit([beds(3)], 4).ok).toBe(false); // a guest with no bed
  });

  // A private room is a ceiling, not a requirement — two people in a six-bed private room
  // is a normal booking, and the other four beds do not go on sale to strangers.
  it('lets a private room carry fewer guests than it sleeps', () => {
    expect(guestFit([rooms(1)], 1).ok).toBe(true);
    expect(guestFit([rooms(1)], 6).ok).toBe(true);
    expect(guestFit([rooms(1)], 7).ok).toBe(false);
  });

  it('reports the shortfall so the rail can show a running tally', () => {
    const fit = guestFit([beds(3)], 4);
    expect(fit.shortfall).toBe(1);
    expect(fit.seated).toBe(3);
  });

  it('accepts a private and shared mix', () => {
    // 2 beds + 1 private sleeping 6 → seats 2 through 8.
    const lines = [beds(2), rooms(1)];
    expect(guestFit(lines, 2).ok).toBe(true);
    expect(guestFit(lines, 8).ok).toBe(true);
    expect(guestFit(lines, 9).ok).toBe(false);
    expect(guestFit(lines, 1).ok).toBe(false); // one bed would go unslept
  });

  it('refuses an empty basket however many guests are named', () => {
    expect(guestFit([], 2).ok).toBe(false);
    expect(guestFit([], 0).ok).toBe(false);
  });
});
