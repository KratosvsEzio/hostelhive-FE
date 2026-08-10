import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { Listing } from '@hostelhive/data-access';
import { ApiClient } from '@core/api-resource';
import { ApiHostel, toListing } from './listings-api';

interface FavouritesListResponse {
  hostels: ApiHostel[];
  success?: boolean;
}

@Injectable({ providedIn: 'root' })
export class FavouritesApi {
  private readonly api = inject(ApiClient);

  /**
   * Maps each favourited hostel through the same `toListing` the search list uses, so the
   * favourites cards render identically — rating, "New" badge, property type, amenity pills
   * all light up from whatever fields the endpoint returns (and degrade to nothing if absent).
   */
  listFavourites(): Observable<Listing[]> {
    return this.api.get<FavouritesListResponse>('/api/favourites').pipe(
      map((res) => (res.hostels ?? []).map(toListing)),
    );
  }

  markFavourite(hostelId: string): Observable<unknown> {
    return this.api.post('/api/favourites/mark_as_favourite', { hostel_id: hostelId }).pipe(
      catchError(() => of(null)),
    );
  }

  unmarkFavourite(hostelId: string): Observable<unknown> {
    return this.api.delete('/api/favourites/mark_as_unfavourite', { hostel_id: hostelId }).pipe(
      catchError(() => of(null)),
    );
  }
}
