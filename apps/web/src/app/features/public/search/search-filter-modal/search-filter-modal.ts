import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  inject,
  model,
  output,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AMENITIES, Gender, PROPERTY_TYPES } from '@hostelhive/data-access';
import { Button, Dropdown, RangeSlider } from '@hostelhive/ui';

/** Filter state emitted from the modal when the user hits "Show results". */
export interface FilterState {
  gender: Gender | 'all';
  propertyType: string;
  minPrice: number | null;
  maxPrice: number | null;
  capacity: string;
  amenities: string[];
  sort: string;
}

// Room capacity (people per room). Values mirror the inline dropdown so the two stay in
// sync; the API layer maps them to f[room_types.capacity] (exact) / [gte]=4 for "4+".
const CAPACITIES: { value: string; label: string }[] = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '4plus', label: '4+' },
];

/**
 * Airbnb-style full-screen filter modal: amenity grid, stay type toggle,
 * room sharing, price range slider, and sort. Emits the whole filter state
 * on apply; the parent merges it into the URL query params.
 */
@Component({
  selector: 'hh-search-filter-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Dropdown, RangeSlider],
  host: { class: 'contents' },
  templateUrl: './search-filter-modal.html',
})
export class SearchFilterModal {
  readonly open = model(false);
  readonly applied = output<FilterState>();

  constructor() {
    // The modal's fixed overlay lives inside the sticky filter bar, which forms a
    // stacking context (z-20) sitting *below* the site header (z-40). Teleport the modal
    // root to <body> so the overlay layers above the header. Restored next to its anchor
    // on destroy so Angular's view teardown removes it without error.
    const host = inject(ElementRef).nativeElement as HTMLElement;
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    let root: HTMLElement | null = null;
    let anchor: Comment | null = null;
    afterNextRender(() => {
      root = host.querySelector('.hh-modal-root');
      if (!root?.parentNode) return;
      anchor = document.createComment('hh-modal');
      root.parentNode.insertBefore(anchor, root);
      document.body.appendChild(root);
    });
    inject(DestroyRef).onDestroy(() => {
      if (root && anchor?.parentNode) {
        anchor.parentNode.insertBefore(root, anchor);
        anchor.remove();
      }
    });
  }

  protected readonly genders: { label: string; value: Gender | 'all' }[] = [
    { label: 'Any type', value: 'all' },
    { label: 'Boys', value: 'boys' },
    { label: 'Girls', value: 'girls' },
    { label: 'Co-living', value: 'coliving' },
  ];
  protected readonly capacities = CAPACITIES;
  protected readonly sortOptions = [
    { label: 'Recommended', value: 'recommended' },
    { label: 'Recent first', value: 'newest' },
    { label: 'Oldest first', value: 'oldest' },
    { label: 'Price: high to low', value: 'price-desc' },
    { label: 'Price: low to high', value: 'price-asc' },
  ];

  /** Top 4 amenities shown as icon cards (Airbnb-style). */
  protected readonly topAmenities = Object.entries(AMENITIES)
    .slice(0, 4)
    .map(([key, v]) => ({
      key,
      icon: v.icon.replace('ti-', ''),
      label: v.label,
    }));

  /** All amenities for quick-chip toggles in the outer bar (exported for parent). */
  static readonly ALL_AMENITIES = Object.entries(AMENITIES).map(([key, v]) => ({
    key,
    label: v.label,
  }));

  protected readonly propertyTypes = PROPERTY_TYPES;

  // Draft state (mutated inside the modal; committed on "Show results").
  protected readonly draftGender = signal<Gender | 'all'>('all');
  protected readonly draftPropertyType = signal('');
  protected readonly draftMinPrice = signal(0);
  protected readonly draftMaxPrice = signal(60000);
  protected readonly draftCapacity = signal('');
  protected readonly draftAmenities = signal<string[]>([]);
  protected readonly draftSort = signal('recommended');

  /** Seed the draft from the current URL-driven values before opening. */
  seed(state: FilterState): void {
    this.draftGender.set(state.gender);
    this.draftPropertyType.set(state.propertyType);
    this.draftMinPrice.set(state.minPrice ?? 0);
    this.draftMaxPrice.set(state.maxPrice ?? 60000);
    this.draftCapacity.set(state.capacity);
    this.draftAmenities.set([...state.amenities]);
    this.draftSort.set(state.sort || 'recommended');
    this.open.set(true);
  }

  protected toggleAmenity(key: string): void {
    this.draftAmenities.update((a) =>
      a.includes(key) ? a.filter((x) => x !== key) : [...a, key],
    );
  }

  protected setDraftProperty(v: string | string[] | null): void {
    this.draftPropertyType.set(typeof v === 'string' ? v : '');
  }

  protected clearAll(): void {
    this.draftGender.set('all');
    this.draftPropertyType.set('');
    this.draftMinPrice.set(0);
    this.draftMaxPrice.set(60000);
    this.draftCapacity.set('');
    this.draftAmenities.set([]);
    this.draftSort.set('recommended');
  }

  protected apply(): void {
    const min = this.draftMinPrice();
    const max = this.draftMaxPrice();
    this.applied.emit({
      gender: this.draftGender(),
      propertyType: this.draftPropertyType(),
      minPrice: min > 0 ? min : null,
      maxPrice: max < 60000 ? max : null,
      capacity: this.draftCapacity(),
      amenities: this.draftAmenities(),
      sort: this.draftSort(),
    });
    this.open.set(false);
  }

  protected close(): void {
    this.open.set(false);
  }
}
