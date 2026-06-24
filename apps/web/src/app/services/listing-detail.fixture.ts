import { Listing } from '@hostelhive/data-access';

/**
 * Detail view-model — the canonical {@link Listing} plus a few fields the detail
 * screen renders that the list payload doesn't carry (full street address, the
 * extra gallery photos, and nearby landmarks). **Stub pending Q-API (§0)**:
 * when the typed SDK lands, fold these into the real listing response.
 */
export interface ListingDetail extends Listing {
  /** Human-readable street address shown above the faux map. */
  address: string;
  /** Total photo count (gallery shows a subset, button reveals the rest). */
  photoCount: number;
  /** Total amenity count (grid shows a subset). */
  amenityCount: number;
  /** Walking-distance points of interest. */
  nearby: { icon: string; label: string }[];
}

/** Single stub listing keyed off the canonical Al-Madina fixture (id '1'). */
export const LISTING_DETAIL: ListingDetail = {
  id: '1',
  slug: 'al-madina-boys-hostel',
  name: 'Al-Madina Boys Hostel',
  area: 'DHA Phase 6',
  city: 'Karachi',
  gender: 'boys',
  verified: true,
  sharing: ['1-sharing', '2-sharing', '3-sharing'],
  amenities: [
    'wifi',
    'ac',
    'generator',
    'kitchen',
    'laundry',
    'cctv',
    'security',
    'parking',
  ],
  priceFrom: 12000,
  images: [
    'https://picsum.photos/seed/hhd1/900/700',
    'https://picsum.photos/seed/hhd2/500/400',
    'https://picsum.photos/seed/hhd3/500/400',
    'https://picsum.photos/seed/hhd4/500/400',
    'https://picsum.photos/seed/hhd5/500/400',
  ],
  lat: 24.8008,
  lng: 67.0571,
  host: { id: 'h1', name: 'Imran Khan', since: 2023, verified: true },
  description:
    'A clean, secure and well-managed boys hostel in the heart of DHA Phase 6, ' +
    'walking distance from major universities and the main commercial area. ' +
    'Purpose-built rooms with attached baths, backup power, high-speed Wi-Fi and ' +
    'daily housekeeping. Meals available on request.',
  rooms: [
    {
      id: 'r1',
      type: '1-sharing (private)',
      capacity: 1,
      bedsLeft: 2,
      price: 22000,
      attachedBath: true,
    },
    {
      id: 'r2',
      type: '2-sharing',
      capacity: 2,
      bedsLeft: 5,
      price: 14000,
      attachedBath: true,
    },
    {
      id: 'r3',
      type: '3-sharing',
      capacity: 3,
      bedsLeft: 1,
      price: 12000,
      attachedBath: false,
    },
  ],
  address: 'Street 12, DHA Phase 6, Karachi, Sindh',
  photoCount: 18,
  amenityCount: 14,
  nearby: [
    { icon: 'ti-school', label: 'Bahria University — 1.2 km' },
    { icon: 'ti-building-store', label: 'DHA Phase 6 Market — 400 m' },
    { icon: 'ti-bus', label: 'Metro bus stop — 600 m' },
    { icon: 'ti-heartbeat', label: 'Shifa Clinic — 900 m' },
  ],
};
