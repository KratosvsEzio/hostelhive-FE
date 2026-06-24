/**
 * Amenity catalogue from GET /api/offer_categories — the dynamic list of facilities a
 * host can mark as available, grouped into named categories. Backs the onboarding
 * "Amenities" step. (Authed endpoint; the Bearer is attached by the auth interceptor.)
 */

/** A single amenity/offer a hostel can provide. */
export interface Offer {
  id: string;
  name: string;
  slug: string;
}

/** A named group of related offers (e.g. "Kitchen and Dinning"). */
export interface OfferCategory {
  id: string;
  name: string;
  offers: Offer[];
}
