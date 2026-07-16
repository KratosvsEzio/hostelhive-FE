import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { Gender } from '@hostelhive/data-access';
import { ApiClient } from '@core/api-resource';

interface FavouritesListResponse {
  hostels: {
    id: string;
    name: string;
    area: string;
    city: string;
    gender_type: string;
    starting_price: number;
    attachments: { url: string; is_primary: boolean; status: string }[];
  }[];
  success?: boolean;
}

export interface FavListItem {
  id: string;
  name: string;
  area: string;
  city: string;
  gender: Gender;
  priceFrom: number;
  image: string | null;
}

@Injectable({ providedIn: 'root' })
export class FavouritesApi {
  private readonly api = inject(ApiClient);

  listFavourites(): Observable<FavListItem[]> {
    return this.api.get<FavouritesListResponse>('/api/favourites').pipe(
      map((res) =>
        (res.hostels ?? []).map((h) => ({
          id: h.id,
          name: h.name,
          area: h.area,
          city: h.city,
          gender: h.gender_type as Gender,
          priceFrom: h.starting_price,
          image: h.attachments?.[0]?.url ?? null,
        })),
      ),
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
