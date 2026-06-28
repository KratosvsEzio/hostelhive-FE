import { Injectable, inject } from '@angular/core';
import { Observable, map, catchError, of } from 'rxjs';
import { HostelDetail } from '@hostelhive/data-access';
import { HostelsApi } from './hostels-api';
import { ListingDetail } from './listing-detail.fixture';
import type { Gender, Room } from '@hostelhive/data-access';

const GENDER_MAP: Record<string, Gender> = {
  'co-living': 'coliving',
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

  const roomPrices = (d.room_types ?? []).map((rt) => rt.price).filter((p) => p > 0);
  const priceFrom = d.min_price || (roomPrices.length ? Math.min(...roomPrices) : 0);

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
    area: d.area ?? '',
    city: d.city ?? '',
    gender: GENDER_MAP[d.gender_type] ?? 'coliving',
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
