import { RoomOffer } from './room-offer';

/**
 * Bookable rooms for a hostel. **Stub pending Q-API.**
 *
 * The backend has no room-type split, no discounted price, no per-room images, no bookable
 * flag and no availability endpoint — all of which the Rooms & Booking PRD specifies and none
 * of which exists yet. Rather than block the whole picker on that, this returns the shape the
 * contract describes so the UI can be built and reviewed against it.
 *
 * Prices mirror the reference design so the totals in the rail can be checked by eye against
 * a screen somebody has already agreed to.
 */
export const ROOM_OFFERS: readonly RoomOffer[] = [
  {
    id: 'p-deluxe-6',
    title: 'Deluxe 6 Bed Private Ensuite',
    description:
      'Perfect for groups of up to 6, our Deluxe 6-Bed room features ultra-comfy pod-style ' +
      'beds, a private ensuite bathroom, shower, and secure lockers. Enjoy extra privacy, ' +
      'comfort, and space while staying in the heart of the city.',
    kind: 'private',
    capacity: 6,
    actualPrice: 48_183.82,
    discountedPrice: 36_137.86,
    images: [],
    bookable: true,
    available: 3,
  },
  {
    id: 'p-twin',
    title: 'Standard Twin Private',
    description:
      'Two single beds, a desk and a shared bathroom down the hall. The quietest rooms in ' +
      'the building — they face the courtyard rather than the road.',
    kind: 'private',
    capacity: 2,
    actualPrice: 18_400,
    images: [],
    bookable: true,
    available: 2,
  },
  {
    id: 's-mixed-12',
    title: 'Deluxe 12 Bed Mixed Dorm Ensuite',
    description:
      'Single bed in a modern 12-bed mixed dorm. Air conditioning, secure lockers and an ' +
      'ensuite bathroom with a hot shower. Each bed has a reading light and a power outlet.',
    kind: 'shared',
    capacity: 12,
    actualPrice: 3_770.58,
    discountedPrice: 2_827.94,
    images: [],
    bookable: true,
    available: 7,
  },
  {
    id: 's-mixed-8',
    title: 'Deluxe 8 Bed Mixed Dorm Ensuite',
    description:
      'Dormitory style, eight beds, ensuite. A little roomier than the 12-bed and the beds ' +
      'nearest the window go first.',
    kind: 'shared',
    capacity: 8,
    actualPrice: 4_630.24,
    discountedPrice: 3_472.68,
    images: [],
    bookable: true,
    available: 2,
  },
  // Not bookable online — the host has the toggle off. Filtered out of the picker entirely
  // rather than shown disabled, so it exercises that path.
  {
    id: 's-womens-6',
    title: 'Standard 6 Bed Female Dorm',
    kind: 'shared',
    capacity: 6,
    actualPrice: 3_100,
    images: [],
    bookable: false,
    available: 6,
  },
];
