import { Injectable, inject } from '@angular/core';
import { Observable, map, catchError, of } from 'rxjs';
import { HostelDetail } from '@hostelhive/data-access';
import { HostelsApi } from './hostels-api';
import { ListingDetail } from './listing-detail.fixture';
import type { AccommodationType, Room } from '@hostelhive/data-access';
import { RoomOffer } from '@features/public/listing/booking/room-offer';
import { isPrivateOccupancy } from '@util/occupancy-type';

/**
 * How many rooms of a private type a seeker may take while nothing counts them.
 *
 * A ceiling on the stepper, not an inventory. Above the picker's "N left" threshold on
 * purpose, so an unmeasured number never manufactures urgency.
 */
const PRIVATE_UNITS_UNKNOWN = 9;

/** Prices arrive as strings (`"2000.0"`), and a bad one must not become `NaN` in a total. */
function amount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The hostel's room types, as the booking picker takes them.
 *
 * Everything the picker shows is on the record already — name, description, capacity, both
 * prices, the bookable flag and the photos. It used to render a five-room fixture instead,
 * identical on every listing in the app.
 *
 * Two details the shapes do not share:
 *
 * - **Occupancy.** The API says `private_room`, the picker's `kind` says `private`. Compared
 *   by string these never match, and every private room would file itself under "Shared
 *   rooms" — so the reading goes through {@link isPrivateOccupancy}, which knows the slugs.
 * - **`available`.** `hostel_detail` carries no inventory. A shared type's capacity *is* its
 *   bed count, so that one is real. Nothing says how many rooms of a private type exist, so
 *   {@link PRIVATE_UNITS_UNKNOWN} stands in as a stepper ceiling until the availability
 *   endpoint lands. It is deliberately above the "N left" threshold: the picker raises that
 *   chip at three or fewer, and a number nobody measured has no business telling a seeker a
 *   room is nearly gone. The hostel's own `total_rooms` was the first thing tried here and is
 *   exactly the trap — a two-room hostel then advertised "2 rooms left" on every private type.
 */
function toRoomOffers(d: HostelDetail): RoomOffer[] {
  const raw = (d.room_types ?? []) as unknown as ApiRoomType[];
  return raw.map((rt) => {
    const priv = isPrivateOccupancy(rt.occupancy_type);
    const discounted = amount(rt.discounted_price);
    const price = amount(rt.price);
    return {
      id: String(rt.id ?? ''),
      title: rt.name ?? '',
      description: rt.description ?? undefined,
      kind: priv ? ('private' as const) : ('shared' as const),
      capacity: rt.capacity ?? 0,
      actualPrice: price,
      // Only when the host has it switched on *and* it is really a discount. A "discounted"
      // price at or above the list price would strike through the smaller of the two.
      discountedPrice:
        rt.is_discountable && discounted > 0 && discounted < price ? discounted : undefined,
      images: (rt.attachments ?? [])
        .map((a) => a.url ?? '')
        .filter(Boolean)
        .slice(0, 3),
      bookable: !!rt.is_bookable,
      available: priv ? PRIVATE_UNITS_UNKNOWN : (rt.capacity ?? 0),
    };
  });
}

/** The room-type fields `hostel_detail` returns that {@link HostelDetail} does not yet name. */
interface ApiRoomType {
  id?: string | number | null;
  name?: string | null;
  description?: string | null;
  capacity?: number | null;
  price?: number | string | null;
  discounted_price?: number | string | null;
  is_discountable?: boolean | null;
  is_bookable?: boolean | null;
  occupancy_type?: string | null;
  attachments?: { url?: string | null }[] | null;
}

const GENDER_MAP: Record<string, AccommodationType> = {
  'co-living': 'coliving',
  backpacker: 'backpacker',
  boys: 'boys',
  girls: 'girls',
};

function toListingDetail(d: HostelDetail): ListingDetail {
  const lat = typeof d.latitude === 'string' ? parseFloat(d.latitude) : (d.latitude ?? 0);
  const lng = typeof d.longitude === 'string' ? parseFloat(d.longitude) : (d.longitude ?? 0);

  const images = (d.attachments ?? [])
    .filter((a) => !!a.url)
    .map((a) => a.url as string);

  const rooms: Room[] = (d.room_types ?? []).map((rt) => ({
    id: String(rt.id),
    type: rt.name,
    capacity: rt.capacity,
    bedsLeft: rt.capacity,
    price: rt.price,
    attachedBath: false,
  }));

  const sharing = [
    ...new Set((d.room_types ?? []).map((rt) => `${rt.capacity}-sharing`)),
  ];

  const amenitySlug = (d.offers ?? []).map((o) => o.slug).filter(Boolean);
  const amenities =
    amenitySlug.length
      ? amenitySlug
      : (d.hostel_offers ?? []).map((ho) => ho.offer?.slug ?? '').filter(Boolean);

  const rawOffers = (d.offers ?? []).filter((o) => o.slug && o.name).map((o) => ({ slug: o.slug, name: o.name }));
  const offers = rawOffers.length
    ? rawOffers
    : (d.hostel_offers ?? [])
        .map((ho) => ({ slug: ho.offer?.slug ?? '', name: ho.offer?.name ?? '' }))
        .filter((o) => o.slug && o.name);

  const roomOffers = toRoomOffers(d);

  /**
   * The cheapest a seeker could actually pay, discounts included.
   *
   * This read `rt.price` — the list price — so a hostel whose only rooms were discounted
   * advertised a "From" nobody would be charged, and one strictly higher than the figure on
   * the room card directly beside it. A dormitory at 2,000 marked down to 1,200 was offered
   * as "from 2,000" while the card under it said 1,200.
   *
   * Taken from {@link toRoomOffers} rather than recomputed, so "is this really a discount"
   * is decided once: a discounted price at or above the list price is not one, and would
   * otherwise raise the From price rather than lower it.
   *
   * `min_price` is now only the fallback for a listing with no room types at all. It is the
   * server's undiscounted minimum, so preferring it was what let the list price win.
   */
  const payable = roomOffers
    .map((r) => r.discountedPrice ?? r.actualPrice)
    .filter((p) => p > 0);
  const priceFrom = payable.length ? Math.min(...payable) : (d.min_price || 0);

  const address = [d.address_1, d.area, d.city, d.state, d.country]
    .filter(Boolean)
    .join(', ');

  const nearby: { icon: string; label: string }[] = (d.nearby_landmarks ?? '')
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((label) => ({ icon: 'ti-map-pin', label }));

  return {
    id: String(d.id),
    slug: String(d.id),
    name: d.name,
    currency: d.currency ?? undefined,
    area: d.area ?? '',
    city: d.city ?? '',
    accommodationType: GENDER_MAP[d.gender_type] ?? 'coliving',
    billingFrequency: d.billing_frequency ?? undefined,
    verified: d.status?.slug === 'active',
    sharing,
    amenities,
    offers: offers.length ? offers : undefined,
    priceFrom,
    images: images.length ? images : [`https://picsum.photos/seed/hh-be-${d.id}/800/800`],
    lat: Number.isFinite(lat) ? (lat as number) : 0,
    lng: Number.isFinite(lng) ? (lng as number) : 0,
    host: d.host
      ? {
          id: String(d.host.id),
          name: d.host.name,
          since: d.created_at ? new Date(d.created_at).getFullYear() : 0,
          verified: false,
        }
      : undefined,
    description: d.description ?? '',
    rooms,
    roomOffers,
    address,
    photoCount: (d.attachments ?? []).length,
    amenityCount: (d.offers ?? d.hostel_offers ?? []).length,
    nearby,
  };
}

@Injectable({ providedIn: 'root' })
export class ListingDetailApi {
  private readonly hostels = inject(HostelsApi);

  getBySlug(slug: string): Observable<ListingDetail | undefined> {
    return this.hostels
      .getById(slug)
      .pipe(
        map((d) => toListingDetail(d)),
        catchError(() => of(undefined)),
      );
  }
}
