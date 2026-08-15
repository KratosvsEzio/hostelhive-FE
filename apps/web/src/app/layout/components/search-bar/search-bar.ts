import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  ViewEncapsulation,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PlaceResult, PlaceSearchField } from '@hostelhive/maps';
import { RangeSlider } from '@hostelhive/ui';
import { SearchCapacity } from '@services';
import { BUDGET_MAX, BUDGET_MIN, BUDGET_STEP } from '@util/budget-range';

type Seg = 'where' | 'budget' | 'sharing';

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
  imports: [PlaceSearchField, RangeSlider],
  styleUrl: './search-bar.scss',
  templateUrl: './search-bar.html',
})
export class SearchBar {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly capacityStore = inject(SearchCapacity);
  private readonly el = inject(ElementRef);
  private readonly whereEl = viewChild<ElementRef<HTMLElement>>('whereSeg');

  protected readonly sharingOpts = SHARING;
  protected readonly BUDGET_MIN = BUDGET_MIN;
  protected readonly BUDGET_MAX = BUDGET_MAX;
  protected readonly BUDGET_STEP = BUDGET_STEP;

  protected readonly open = signal<Seg | null>(null);
  protected readonly place = signal('');
  private readonly lat = signal<number | null>(null);
  private readonly lng = signal<number | null>(null);
  private readonly zoom = signal<number | null>(null);
  protected readonly budgetLow = signal(BUDGET_MIN);
  protected readonly budgetHigh = signal(BUDGET_MAX);
  protected readonly sharing = signal('');

  protected readonly budgetActive = computed(
    () => this.budgetLow() > BUDGET_MIN || this.budgetHigh() < BUDGET_MAX,
  );

  protected readonly budgetLabel = computed(() => {
    const lo = this.budgetLow();
    const hi = this.budgetHigh();
    if (lo <= BUDGET_MIN && hi >= BUDGET_MAX) return 'Add budget';
    if (lo <= BUDGET_MIN) return `Under Rs ${fmtK(hi)}`;
    if (hi >= BUDGET_MAX) return `Rs ${fmtK(lo)}+`;
    return `Rs ${fmtK(lo)}–${fmtK(hi)}`;
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
      this.budgetLow.set(mn ? +mn : BUDGET_MIN);
      this.budgetHigh.set(mx ? +mx : BUDGET_MAX);
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

  @HostListener('document:click', ['$event'])
  protected onDocClick(e: MouseEvent): void {
    if (this.open() && !this.el.nativeElement.contains(e.target)) {
      this.close();
    }
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
  protected resetBudget(): void {
    this.budgetLow.set(BUDGET_MIN);
    this.budgetHigh.set(BUDGET_MAX);
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
        minPrice: this.budgetLow() > BUDGET_MIN ? this.budgetLow() : null,
        maxPrice: this.budgetHigh() < BUDGET_MAX ? this.budgetHigh() : null,
        capacity: this.sharing() || null,
        sharing: null,
      },
      queryParamsHandling: 'merge',
    });
  }
}
