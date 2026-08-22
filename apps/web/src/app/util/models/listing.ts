/**
 * A hostel's accommodation type — exactly one per hostel.
 *
 * The backend calls this `gender_type`, which is a misnomer it is stuck with: `backpacker`
 * is not a gender. The name is corrected on this side of the API boundary and translated
 * in the mapping layer. It is also what decides the billing period — backpacker hostels
 * bill per night, the rest per month (see `periodForAccommodation`).
 */
export type AccommodationType =
  | 'boys'
  | 'girls'
  | 'coliving'
  | 'backpacker';

export interface Room {
  id: string;
  type: string; // e.g. '2-sharing'
  capacity: number;
  bedsLeft: number;
  price: number; // PKR / month
  attachedBath: boolean;
}

export interface HostSummary {
  id: string;
  name: string;
  since: number; // year joined
  verified: boolean;
}

export interface Listing {
  id: string;
  slug: string;
  name: string;
  area: string;
  city: string;
  accommodationType: AccommodationType;
  verified: boolean;
  propertyType?: string; // display label from the BE enum ('Building', 'Apartment', 'Room', 'House')
  sharing: string[]; // ['2-sharing', '3-sharing']
  amenities: string[]; // amenity keys — see AMENITIES
  offerNames?: string[]; // amenity display names from the hostel's offers, for the card pills
  priceFrom: number; // starting_price / month; use priceByCapacity for capacity-aware display
  priceByCapacity?: Record<string, number>; // capacity key ('1'|'2'|'3'|'4'|'5+') → price
  currency?: string; // ISO-4217 code the prices are quoted in (e.g. 'PKR', 'USD')
  images: string[];
  lat: number;
  lng: number;
  rooms?: Room[];
  host?: HostSummary;
  description?: string;
  rating?: number; // average review score, e.g. 4.8 — from the API's review.score; absent until reviewed
  reviews?: number; // number of reviews — from the API's review.count; absent until reviewed
  createdAt?: string; // ISO — the API's created_at; drives the "New" badge (recently listed)
  isFeatured?: boolean;
}

export interface ListingQuery {
  city?: string;
  accommodationType?: AccommodationType | 'all';
  minPrice?: number;
  maxPrice?: number;
  sharing?: string; // e.g. '2-sharing'
  propertyType?: string; // slug, e.g. 'apartment' — see PROPERTY_TYPES
  /** 'private' | 'shared'. Inert server-side until the backend indexes `room_type`. */
  roomType?: string;
  /** 'month' | 'night'. Narrows the list to one pricing cycle so price sort has a unit. */
  frequency?: string;
  near?: { lat: number; lng: number; radiusKm?: number }; // proximity search (from a picked place)
  bounds?: { north: number; south: number; east: number; west: number }; // exact map viewport
  amenities?: string[];
  /** Resolved offer IDs — sent as `f[offers.id][]=` to the public search endpoint. */
  offerIds?: number[];
  sort?: 'recommended' | 'newest' | 'oldest' | 'price-asc' | 'price-desc';
  page?: number;
  pageSize?: number;
}

/** Amenity key → display label + Tabler icon. `short` is the phone-width variant for tight tiles. */
export const AMENITIES: Record<string, { label: string; icon: string; short?: string }> = {
  wifi: { label: 'Wi-Fi', icon: 'ti-wifi' },
  ac: { label: 'Air conditioning', short: 'AC', icon: 'ti-air-conditioning' },
  kitchen: { label: 'Kitchen', icon: 'ti-tools-kitchen-2' },
  security: { label: 'Security guard', short: 'Security', icon: 'ti-shield-check' },
  parking: { label: 'Parking', icon: 'ti-car' },
  generator: { label: 'Generator', icon: 'ti-bolt' },
  cctv: { label: 'CCTV', icon: 'ti-device-cctv' },
  laundry: { label: 'Laundry', icon: 'ti-wash-machine' },
};

/** Property type slug → display label + backend enum id (GET /public/hostels → property_type). */
export const PROPERTY_TYPES: { value: string; label: string; id: number }[] = [
  { value: 'apartment', label: 'Apartment', id: 0 },
  { value: 'room', label: 'Room', id: 1 },
  { value: 'building', label: 'Building', id: 2 },
  { value: 'house', label: 'House', id: 3 },
];
