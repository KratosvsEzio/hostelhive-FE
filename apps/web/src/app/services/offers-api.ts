import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { OfferCategory } from '@hostelhive/data-access';
import { ApiClient } from '@core/api-resource';

/** Response envelope for GET /api/offer_categories ({ offer_categories: [...] }). */
interface OfferCategoriesResponse {
  offer_categories: OfferCategory[];
  success?: boolean;
}

/**
 * Offers / amenities API. Backs the onboarding "Amenities" step with the live, dynamic
 * catalogue of amenity categories and their offers — no hardcoded list.
 */
@Injectable({ providedIn: 'root' })
export class OffersApi {
  private readonly api = inject(ApiClient);

  /** GET /api/offer_categories — amenity categories with their offers (authed). */
  categories(): Observable<OfferCategory[]> {
    return this.api
      .get<OfferCategoriesResponse | OfferCategory[]>('/api/offer_categories')
      .pipe(
        map((res) => (Array.isArray(res) ? res : (res.offer_categories ?? []))),
      );
  }
}
