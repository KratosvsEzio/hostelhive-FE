import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Gender, Listing } from '@hostelhive/data-access';
import { FavoritesStore } from '@util/favorites-store';
import { Badge } from '@hostelhive/ui';

/**
 * Airbnb-style listing card (HostelHive theme): rounded photo with a peek-through
 * image carousel, gender badge, save heart, rating, and price. Uses the
 * "stretched link" pattern so the whole card navigates while the heart/arrows stay
 * independently clickable (valid HTML — no interactive controls nested in the <a>).
 */
@Component({
  selector: 'hh-listing-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DecimalPipe, Badge],
  templateUrl: './listing-card.html',
})
export class ListingCard {
  readonly listing = input.required<Listing>();
  /** Highlights the card (e.g. when its map pin is hovered). */
  readonly active = input(false);

  private readonly favorites = inject(FavoritesStore);

  protected readonly img = signal(0);
  /** Reactive saved state, backed by the localStorage-persisted FavoritesStore. */
  protected readonly saved = computed(() =>
    this.favorites.isFavorite(this.listing().id),
  );
  /** Lazy image loading: indices 0..loadedThrough() have their <img> mounted.
   *  Starts at 2 (first 3 images), then advances one slide ahead as the user pages. */
  private readonly loadedThrough = signal(2);
  /** Image indices whose <img> has finished downloading — a shimmer shows until then. */
  private readonly readyImgs = signal<ReadonlySet<number>>(new Set<number>());

  protected readonly images = computed(() => {
    const im = this.listing().images;
    return im.length ? im : ['https://picsum.photos/seed/hh-fallback/800/800'];
  });

  /** Airbnb-style sliding dot window: show max 5 dots, shrink edge dots. */
  protected readonly visibleDots = computed(() => {
    const total: number = this.images().length;
    const current: number = this.img();
    const maxDots = 5;
    if (total <= maxDots) {
      return Array.from({ length: total }, (_, i) => ({
        idx: i,
        scale: 'full' as const,
      }));
    }
    // Sliding window centered on current
    let start: number = Math.max(0, current - Math.floor(maxDots / 2));
    const end: number = Math.min(total, start + maxDots);
    if (end - start < maxDots) start = end - maxDots;
    const dots: { idx: number; scale: 'full' | 'sm' }[] = [];
    for (let i = start; i < end; i++) {
      const isEdge: boolean = i === start || i === end - 1;
      dots.push({ idx: i, scale: isEdge && total > maxDots ? 'sm' : 'full' });
    }
    return dots;
  });

  protected readonly genderLabel = computed(() =>
    this.label(this.listing().gender),
  );
  protected readonly sharingSummary = computed(() => {
    const s = this.listing().sharing;
    return s.length ? s.join(' · ') : 'Shared rooms';
  });

  protected isLoaded(i: number): boolean {
    return i <= this.loadedThrough();
  }

  protected isImgReady(i: number): boolean {
    return this.readyImgs().has(i);
  }

  protected onImgReady(i: number): void {
    this.readyImgs.update((s) => new Set(s).add(i));
  }

  protected step(dir: number, e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    const n = this.images().length;
    this.img.update((i) => Math.max(0, Math.min(n - 1, i + dir)));
    // Keep one slide loaded ahead of the current position (first 3 are already loaded).
    this.loadedThrough.update((m) => Math.max(m, this.img() + 1));
  }

  protected toggleSaved(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    this.favorites.toggle(this.listing());
  }

  private label(g: Gender): string {
    return g === 'coliving' ? 'Co-living' : g === 'boys' ? 'Boys' : 'Girls';
  }
}
