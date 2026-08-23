import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  PLATFORM_ID,
  computed,
  inject,
  model,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { isPlatformBrowser } from '@angular/common';
import { catchError, of } from 'rxjs';
import { AMENITIES, AccommodationType, PROPERTY_TYPES } from '@hostelhive/data-access';
import { Button, Dropdown, DropdownOption, RangeSlider } from '@hostelhive/ui';
import { OffersApi } from '@services';
import { BUDGET_MAX, BUDGET_MIN, BUDGET_STEP } from '@util/budget-range';
import { DEFAULT_OCCUPANCY_TYPE } from '@util/occupancy-type';
import { currencySymbol } from '@util/currencies';
import { CurrencyPreference } from '@core/preferences/currency-preference';
import { TranslocoPipe } from '@jsverse/transloco';

/** Filter state emitted from the modal when the user hits "Show results". */
export interface FilterState {
  accommodationType: AccommodationType | 'all';
  propertyType: string;
  minPrice: number | null;
  maxPrice: number | null;
  roomType: string;
  amenities: string[];
  sort: string;
}


// Replaces the 1–5+ capacity buttons. Capacity was never the axis anybody shopped on: the
// choice is a room to yourself or a bed among others, and the headcount is a detail read
// after that. Kept as buttons rather than a dropdown so the modal reads the same as before.
/**
 * Shared first, and there is no "Any".
 *
 * A bed in a shared room is what most seekers here are actually looking for, and the two
 * options answer genuinely different questions -- one is priced per bed, the other per room.
 * An "Any" that mixed them produced a list sorted by numbers that did not mean the same
 * thing, so the filter now always names one.
 */
const ROOM_TYPES: { value: string; label: string }[] = [
  { value: 'shared', label: 'Shared room' },
  { value: 'private', label: 'Private room' },
];

/**
 * Airbnb-style full-screen filter modal: amenity grid, stay type toggle,
 * room sharing, price range slider, and sort. Emits the whole filter state
 * on apply; the parent merges it into the URL query params.
 */
@Component({
  selector: 'hh-search-filter-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, Button, Dropdown, RangeSlider],
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

    /**
     * Idempotent, and re-queries a root that is no longer attached.
     *
     * A one-shot move assumes `.hh-modal-root` is created exactly once and never replaced.
     * When that assumption breaks the overlay is left inside the filter bar, where its
     * z-index is resolved against a stacking context that sits below the header — so the
     * modal opens *behind* the header no matter how high its own z-index goes.
     */
    const teleport = (): void => {
      if (!root?.isConnected) {
        root = host.querySelector('.hh-modal-root');
        anchor = null;
      }
      if (!root || root.parentNode === document.body) return;
      if (!anchor) {
        anchor = document.createComment('hh-modal');
        root.parentNode?.insertBefore(anchor, root);
      }
      document.body.appendChild(root);
    };

    afterNextRender(teleport);

    // Re-asserted on every open rather than only at startup: cheap, and it means a root that
    // was swapped out underneath us still ends up in the right place before it is seen.
    effect(() => {
      if (this.open()) teleport();
    });
    inject(DestroyRef).onDestroy(() => {
      if (root && anchor?.parentNode) {
        anchor.parentNode.insertBefore(root, anchor);
        anchor.remove();
      }
    });
  }

  protected readonly genders: { label: string; value: AccommodationType | 'all' }[] = [
    { label: 'Any type', value: 'all' },
    { label: 'Boys', value: 'boys' },
    { label: 'Girls', value: 'girls' },
    { label: 'Co-living', value: 'coliving' },
    { label: 'Backpacker', value: 'backpacker' },
  ];
  protected readonly roomTypes = ROOM_TYPES;
  protected readonly sortOptions = [
    { label: 'Recommended', value: 'recommended' },
    { label: 'Recent first', value: 'newest' },
    { label: 'Oldest first', value: 'oldest' },
    { label: 'Price: high to low', value: 'price-desc' },
    { label: 'Price: low to high', value: 'price-asc' },
  ];

  private readonly _offersApi = inject(OffersApi);
  private readonly _offerCategories = toSignal(
    this._offersApi.categories().pipe(catchError(() => of([]))),
  );

  /** Flat list of all amenity options grouped by category for the single multi-select dropdown. */
  protected readonly amenityOptions = computed((): DropdownOption[] => {
    const cats = this._offerCategories();
    if (cats?.length) {
      return cats.flatMap((cat) =>
        cat.offers.map((o): DropdownOption => ({ value: o.slug, label: o.name, group: cat.name })),
      );
    }
    return Object.entries(AMENITIES).map(([slug, v]): DropdownOption => ({ value: slug, label: v.label }));
  });

  protected readonly amenityValue = computed(() => this.draftAmenities());

  protected setAmenities(v: string | string[] | null): void {
    this.draftAmenities.set(Array.isArray(v) ? v : v ? [v] : []);
  }

  protected readonly propertyTypes = PROPERTY_TYPES;

  // Same scale as the search bar's Budget popover — both edit minPrice/maxPrice.
  protected readonly BUDGET_MIN = BUDGET_MIN;
  protected readonly BUDGET_MAX = BUDGET_MAX;

  /** Quoted in the currency the filter is actually sent in -- see `SearchBar`. */
  private readonly currency = inject(CurrencyPreference);
  protected readonly budgetSymbol = computed(() => currencySymbol(this.currency.code()));
  protected readonly BUDGET_STEP = BUDGET_STEP;

  // Draft state (mutated inside the modal; committed on "Show results").
  protected readonly draftGender = signal<AccommodationType | 'all'>('all');
  protected readonly draftPropertyType = signal('');
  protected readonly draftMinPrice = signal(BUDGET_MIN);
  protected readonly draftMaxPrice = signal(BUDGET_MAX);
  protected readonly draftRoomType = signal<string>(DEFAULT_OCCUPANCY_TYPE);
  protected readonly draftAmenities = signal<string[]>([]);
  protected readonly draftSort = signal('recommended');

  /** Seed the draft from the current URL-driven values before opening. */
  seed(state: FilterState): void {
    this.draftGender.set(state.accommodationType);
    this.draftPropertyType.set(state.propertyType);
    this.draftMinPrice.set(state.minPrice ?? BUDGET_MIN);
    this.draftMaxPrice.set(state.maxPrice ?? BUDGET_MAX);
    this.draftRoomType.set(state.roomType || DEFAULT_OCCUPANCY_TYPE);
    this.draftAmenities.set([...state.amenities]);
    this.draftSort.set(state.sort || 'recommended');
    this.open.set(true);
  }

  protected setDraftProperty(v: string | string[] | null): void {
    this.draftPropertyType.set(typeof v === 'string' ? v : '');
  }

  protected clearAll(): void {
    this.draftGender.set('all');
    this.draftPropertyType.set('');
    this.draftMinPrice.set(BUDGET_MIN);
    this.draftMaxPrice.set(BUDGET_MAX);
    this.draftRoomType.set(DEFAULT_OCCUPANCY_TYPE);
    this.draftAmenities.set([]);
    this.draftSort.set('recommended');
  }

  protected apply(): void {
    const min = this.draftMinPrice();
    const max = this.draftMaxPrice();
    this.applied.emit({
      accommodationType: this.draftGender(),
      propertyType: this.draftPropertyType(),
      minPrice: min > BUDGET_MIN ? min : null,
      maxPrice: max < BUDGET_MAX ? max : null,
      roomType: this.draftRoomType(),
      amenities: this.draftAmenities(),
      sort: this.draftSort(),
    });
    this.open.set(false);
  }

  protected close(): void {
    this.open.set(false);
  }
}
