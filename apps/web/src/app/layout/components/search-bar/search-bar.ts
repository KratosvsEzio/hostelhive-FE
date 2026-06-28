import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewEncapsulation,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PlaceResult, PlaceSearchField } from '@hostelhive/maps';
import { SearchCapacity } from '@services';

type Seg = 'where' | 'budget' | 'sharing';

const BUDGETS: { l: string; min: number | null; max: number | null }[] = [
  { l: 'Any budget', min: null, max: null },
  { l: 'Under Rs 10,000', min: null, max: 10000 },
  { l: 'Rs 10,000 – 20,000', min: 10000, max: 20000 },
  { l: 'Rs 20,000 – 35,000', min: 20000, max: 35000 },
  { l: 'Rs 35,000+', min: 35000, max: null },
];
const SHARING: { v: string; l: string }[] = [
  { v: '', l: 'Any sharing' },
  { v: '1', l: '1 per room' },
  { v: '2', l: '2 per room' },
  { v: '3', l: '3 per room' },
  { v: '4', l: '4 per room' },
  { v: '5+', l: '5+ per room' },
];
const fmtK = (n: number): string => (n >= 1000 ? `${n / 1000}k` : `${n}`);

/**
 * Airbnb-style segmented search bar (≈850px). Three segments — Where · Budget · Sharing —
 * each opens a popover; the active/hovered segment lifts to a full-height white pill while
 * the bar greys (contained by `overflow:hidden`, so the highlight never spills past the
 * rounded edge). Search navigates to /search, merging params so page filters survive.
 * ViewEncapsulation.None + `hhsb-` prefixed classes so the `:has()` hover works reliably.
 */
@Component({
  selector: 'app-search-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [PlaceSearchField],
  styleUrl: './search-bar.scss',
  templateUrl: './search-bar.html',
})
export class SearchBar {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly capacityStore = inject(SearchCapacity);
  private readonly whereEl = viewChild<ElementRef<HTMLElement>>('whereSeg');

  protected readonly budgetOpts = BUDGETS;
  protected readonly sharingOpts = SHARING;

  protected readonly open = signal<Seg | null>(null);
  protected readonly place = signal('');
  private readonly lat = signal<number | null>(null);
  private readonly lng = signal<number | null>(null);
  private readonly zoom = signal<number | null>(null);
  protected readonly minPrice = signal<number | null>(null);
  protected readonly maxPrice = signal<number | null>(null);
  protected readonly sharing = signal('');

  protected readonly budgetLabel = computed(() => {
    const lo = this.minPrice();
    const hi = this.maxPrice();
    if (lo === null && hi === null) return 'Add budget';
    if (lo !== null && hi !== null) return `Rs ${fmtK(lo)}–${fmtK(hi)}`;
    if (hi !== null) return `Under Rs ${fmtK(hi)}`;
    return `Rs ${fmtK(lo as number)}+`;
  });
  protected readonly sharingLabel = computed(() => {
    const s = this.sharing();
    return s
      ? (SHARING.find((o) => o.v === s)?.l ?? 'Add sharing')
      : 'Add sharing';
  });

  constructor() {
    // Reflect the active search (query params) into the bar reactively — so after a
    // search it keeps showing the searched place instead of going blank. Typing doesn't
    // navigate, so in-progress edits are preserved (this only fires on real navigation).
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.place.set(p.get('place') ?? p.get('city') ?? '');
      const la = p.get('lat');
      const ln = p.get('lng');
      this.lat.set(la ? +la : null);
      this.lng.set(ln ? +ln : null);
      const z = p.get('zoom');
      this.zoom.set(z ? +z : null);
      const mn = p.get('minPrice');
      const mx = p.get('maxPrice');
      this.minPrice.set(mn ? +mn : null);
      this.maxPrice.set(mx ? +mx : null);
      const cap = p.get('capacity') ?? p.get('sharing') ?? '';
      this.sharing.set(cap);
      this.capacityStore.active.set(cap);
    });
  }

  protected toggle(seg: Seg): void {
    this.open.update((o) => (o === seg ? null : seg));
  }
  protected focusWhere(): void {
    this.open.set('where');
    const el = this.whereEl()?.nativeElement;
    const input = el?.querySelector('input');
    input?.focus();
  }
  protected close(): void {
    this.open.set(null);
  }

  protected onText(text: string): void {
    this.place.set(text);
    this.lat.set(null);
    this.lng.set(null);
    this.zoom.set(null);
  }
  protected onSelected(r: PlaceResult): void {
    this.place.set(r.label);
    this.lat.set(r.lat);
    this.lng.set(r.lng);
    this.zoom.set(r.zoom ?? null);
    this.open.set('budget');
  }
  protected pickBudget(b: { min: number | null; max: number | null }): void {
    this.minPrice.set(b.min);
    this.maxPrice.set(b.max);
    this.open.set('sharing');
  }
  protected pickSharing(v: string): void {
    this.sharing.set(v);
    this.capacityStore.active.set(v);
    this.open.set(null);
  }

  protected search(): void {
    const hasGeo = this.lat() !== null && this.lng() !== null;
    this.open.set(null);
    this.router.navigate(['/search'], {
      queryParams: {
        place: this.place() || null,
        city: hasGeo ? null : this.place() || null,
        lat: hasGeo ? this.lat() : null,
        lng: hasGeo ? this.lng() : null,
        zoom: hasGeo ? this.zoom() : null,
        minPrice: this.minPrice(),
        maxPrice: this.maxPrice(),
        capacity: this.sharing() || null,
        sharing: null,
      },
      queryParamsHandling: 'merge',
    });
  }
}
