import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, shareReplay, throwError } from 'rxjs';
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

  /**
   * In-flight/settled request, shared across callers. The catalogue is global reference
   * data, not per-user, so one fetch per app load is enough — and the search page alone has
   * two independent subscribers (the map and the filter modal, the latter constructed twice
   * under hydration), which was three identical requests on every load.
   */
  private cached?: Observable<OfferCategory[]>;

  /** GET /api/offer_categories — amenity categories with their offers (authed). */
  categories(): Observable<OfferCategory[]> {
    this.cached ??= this.api
      .get<OfferCategoriesResponse | OfferCategory[]>('/api/offer_categories')
      .pipe(
        map((res) => (Array.isArray(res) ? res : (res.offer_categories ?? []))),
        // Drop the cache on failure, or shareReplay would hand the same error to every
        // later caller and the onboarding step's Retry could never actually refetch.
        catchError((err: unknown) => {
          this.cached = undefined;
          return throwError(() => err);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    return this.cached;
  }
}
