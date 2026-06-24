import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Gender } from '@hostelhive/data-access';
import { FavoritesStore } from '@util/favorites-store';
import { Badge, Button } from '@hostelhive/ui';

@Component({
  selector: 'app-account-favorites',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RouterLink, Badge, Button],
  templateUrl: './favorites.html',
})
export class AccountFavorites {
  private readonly favorites = inject(FavoritesStore);

  /** Saved hostels, persisted in localStorage via FavoritesStore. */
  protected readonly saved = this.favorites.items;

  protected remove(id: string): void {
    this.favorites.remove(id);
  }

  protected label(g: Gender): string {
    return g === 'coliving' ? 'Co-living' : g === 'boys' ? 'Boys' : 'Girls';
  }
}
