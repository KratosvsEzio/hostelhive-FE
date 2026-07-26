import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { Listing } from '@hostelhive/data-access';
import { FavListItem, FavouritesApi } from '@services/favourites-api';
import { FavoritesStore } from '@util/favorites-store';
import { Button, ConfirmModal, ErrorState, Skeleton } from '@hostelhive/ui';
import { ListingCard } from '@features/public/search/listing-card/listing-card';

interface ViewState {
  loading: boolean;
  error: boolean;
  data: FavListItem[];
}

/**
 * Widens a favourites row into the `Listing` the shared card renders.
 *
 * `GET /api/favourites` returns a narrower row than `/public/hostels` — no property type,
 * amenities, rating or coordinates — so the fields the card treats as optional are simply
 * left unset and it degrades to hiding those pills. `lat`/`lng`/`verified` are required by
 * the model but unread by the card; they are filler here, not real data. Widen the
 * endpoint and those pills light up with no change to this page.
 */
function toListing(f: FavListItem): Listing {
  return {
    id: f.id,
    slug: f.id, // favourites carry no slug — the id doubles as the route key, as in listings-api
    name: f.name,
    area: f.area,
    city: f.city,
    gender: f.gender,
    verified: false,
    sharing: [],
    amenities: [],
    priceFrom: f.priceFrom,
    images: f.image ? [f.image] : [],
    lat: 0,
    lng: 0,
  };
}

@Component({
  selector: 'app-account-favorites',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Button, ConfirmModal, ErrorState, Skeleton, ListingCard],
  templateUrl: './favorites.html',
})
export class AccountFavorites {
  private readonly api = inject(FavouritesApi);
  private readonly favorites = inject(FavoritesStore);

  private readonly refresh = signal(0);

  protected readonly state = toSignal(
    toObservable(this.refresh).pipe(
      switchMap(() =>
        this.api.listFavourites().pipe(
          map((data): ViewState => ({ loading: false, error: false, data })),
          startWith<ViewState>({ loading: true, error: false, data: [] }),
          catchError(() => of<ViewState>({ loading: false, error: true, data: [] })),
        ),
      ),
    ),
    { initialValue: { loading: true, error: false, data: [] } as ViewState },
  );

  private readonly _removed = signal(new Set<string>());
  protected readonly removePending = signal<FavListItem | null>(null);

  /** Rows still on screen, each paired with the card-ready shape so the template does no
   *  mapping work per change detection. */
  protected readonly saved = computed(() =>
    this.state()
      .data.filter((l) => !this._removed().has(l.id))
      .map((item) => ({ item, listing: toListing(item) })),
  );

  protected promptRemove(item: FavListItem): void {
    this.removePending.set(item);
  }

  protected confirmRemove(): void {
    const item = this.removePending();
    if (!item) return;
    this.removePending.set(null);
    this._removed.update((s) => new Set([...s, item.id]));
    this.favorites.remove(item.id);
    this.api.unmarkFavourite(item.id).subscribe();
  }

  protected cancelRemove(): void {
    this.removePending.set(null);
  }

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }
}
