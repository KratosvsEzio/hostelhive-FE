export type Gender = 'boys' | 'girls' | 'coliving';

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
  gender: Gender;
  verified: boolean;
  sharing: string[]; // ['2-sharing', '3-sharing']
  amenities: string[]; // amenity keys — see AMENITIES
  priceFrom: number; // PKR / month
  images: string[];
  lat: number;
  lng: number;
  rooms?: Room[];
  host?: HostSummary;
  description?: string;
  rating?: number; // average review score, e.g. 4.8 (stub data until reviews API lands)
  reviews?: number; // number of reviews (stub data)
}

export interface ListingQuery {
  city?: string;
  gender?: Gender | 'all';
  minPrice?: number;
  maxPrice?: number;
  sharing?: string; // e.g. '2-sharing'
  propertyType?: string; // slug, e.g. 'apartment' — see PROPERTY_TYPES
  capacity?: string; // room capacity: '1'|'2'|'3'|'4' (exact) or '4plus' (4 or more → gte)
  near?: { lat: number; lng: number; radiusKm?: number }; // proximity search (from a picked place)
  bounds?: { north: number; south: number; east: number; west: number }; // exact map viewport
  amenities?: string[];
  sort?: 'recommended' | 'newest' | 'oldest' | 'price-asc' | 'price-desc';
  page?: number;
  pageSize?: number;
}

/** Amenity key → display label + Tabler icon. */
export const AMENITIES: Record<string, { label: string; icon: string }> = {
  wifi: { label: 'Wi-Fi', icon: 'ti-wifi' },
  ac: { label: 'Air conditioning', icon: 'ti-air-conditioning' },
  kitchen: { label: 'Kitchen', icon: 'ti-tools-kitchen-2' },
  security: { label: 'Security guard', icon: 'ti-shield-check' },
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
