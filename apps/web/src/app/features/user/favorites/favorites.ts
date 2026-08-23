import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { Listing } from '@hostelhive/data-access';
import { FavouritesApi } from '@services/favourites-api';
import { FavoritesStore } from '@util/favorites-store';
import { Button, ConfirmModal, ErrorState, Skeleton } from '@hostelhive/ui';
import { ListingCard } from '@features/public/search/listing-card/listing-card';
import { LocaleLink } from '@core/i18n/locale-link';
import { TranslocoPipe } from '@jsverse/transloco';

interface ViewState {
  loading: boolean;
  error: boolean;
  data: Listing[];
}

@Component({
  selector: 'app-account-favorites',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LocaleLink, Button, ConfirmModal, ErrorState, Skeleton, ListingCard, TranslocoPipe],
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
  protected readonly removePending = signal<Listing | null>(null);

  /** Rows still on screen. `item` and `listing` are the same Listing — the pairing is kept
   *  so the template (card + Unfavorite button) needs no change. */
  protected readonly saved = computed(() =>
    this.state()
      .data.filter((l) => !this._removed().has(l.id))
      .map((listing) => ({ item: listing, listing })),
  );

  protected promptRemove(item: Listing): void {
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
