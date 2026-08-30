import { Listing } from '@hostelhive/data-access';
import { RoomOffer } from '@features/public/listing/booking/room-offer';

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
  /** Offer items with human-readable name (from the API); drives "What this place offers". */
  offers?: { slug: string; name: string }[];
  /**
   * The hostel's own room types, as "Choose your room" shows them.
   *
   * Straight off `hostel_detail.room_types` — the picker used to render a fixture that was
   * the same five rooms on every listing in the app.
   */
  roomOffers: RoomOffer[];
}
