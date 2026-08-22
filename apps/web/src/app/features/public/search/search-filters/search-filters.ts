import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AccommodationType } from '@hostelhive/data-access';
import { Button, Chip, Dropdown, DropdownOption } from '@hostelhive/ui';
import { FilterState, SearchFilterModal } from '@features/public/search/search-filter-modal/search-filter-modal';

/**
 * Filter sub-header for search results. A "Filters" button opens the full
 * modal; a Sort dropdown sits inline for quick access. Everything is URL-driven
 * (query-param merge).
 */
@Component({
  selector: 'hh-search-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Chip, Dropdown, SearchFilterModal],
  templateUrl: './search-filters.html',
  host: { class: 'contents' },
})
export class SearchFilters {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: null,
  });
  private readonly modal = viewChild(SearchFilterModal);

  protected readonly modalOpen = signal(false);

  // Sort. 'newest'/'oldest' → sort[created_at] desc/asc; 'price-*' → sort[starting_price] (API layer).
  private readonly allSortOptions: DropdownOption[] = [
    { value: 'newest', label: 'Recent first' },
    { value: 'oldest', label: 'Oldest first' },
    { value: 'price-desc', label: 'Price: high to low' },
    { value: 'price-asc', label: 'Price: low to high' },
  ];

  /**
   * Price sort is withdrawn while the list mixes pricing cycles.
   *
   * `starting_price` is one unit-less number, so a nightly bed at PKR 1,200 sorts above a
   * monthly room at PKR 15,000 as though it were cheaper — page one fills with backpacker
   * dorms a student cannot rent by the month. Choosing Month or Night gives the list a single
   * unit and brings both price sorts back. The other three are unit-agnostic and always stay.
   */
  protected readonly sortOptions = computed(() =>
    this.frequency() === 'all'
      ? this.allSortOptions.filter((o) => !String(o.value).startsWith('price-'))
      : this.allSortOptions,
  );

  /**
   * Replaces the 1–5+ sharing filter.
   *
   * Capacity is not the axis anybody shops on — the choice is a room to yourself or a bed in a
   * room with others, and how many others is a detail read after that.
   */
  protected readonly roomTypeOptions: DropdownOption[] = [
    { value: 'private', label: 'Private room' },
    { value: 'shared', label: 'Shared room' },
  ];

  /** All is the default: nothing is hidden from a seeker who has not chosen yet. */
  protected readonly frequencyOptions: DropdownOption[] = [
    { value: 'month', label: 'Per month' },
    { value: 'night', label: 'Per night' },
  ];

  protected readonly accommodationType = computed<AccommodationType | 'all'>(
    () => (this.params()?.get('gender') as AccommodationType | 'all') ?? 'all',
  );
  protected readonly propertyType = computed(
    () => this.params()?.get('propertyType') ?? '',
  );
  /**
   * Private or shared. **Inert server-side until the backend indexes `room_type`** — the
   * param travels and the UI reflects it, but results do not narrow yet. Same position the
   * amenity filter was in before `offers` reached the search document.
   */
  protected readonly roomType = computed(() => this.params()?.get('roomType') ?? '');

  /** `month` | `night` | `''` for All. Also gates the price controls — see `sortOptions`. */
  protected readonly frequency = computed(() => this.params()?.get('frequency') ?? 'all');
  protected readonly sort = computed(
    () => this.params()?.get('sort') ?? 'recommended',
  );
  private readonly minP = computed(() => this.params()?.get('minPrice') ?? '');
  private readonly maxP = computed(() => this.params()?.get('maxPrice') ?? '');
  protected readonly amenities = computed(
    () => this.params()?.get('amenities')?.split(',').filter(Boolean) ?? [],
  );

  protected readonly hasActiveFilters = computed(() => {
    return (
      this.accommodationType() !== 'all' ||
      !!this.propertyType() ||
      !!this.roomType() ||
      this.frequency() !== 'all' ||
      !!this.minP() ||
      !!this.maxP() ||
      this.amenities().length > 0 ||
      this.sort() !== 'recommended'
    );
  });

  protected readonly activeFilterCount = computed(() => {
    let n = 0;
    if (this.accommodationType() !== 'all') n++;
    if (this.propertyType()) n++;
    if (this.roomType()) n++;
    if (this.frequency() !== 'all') n++;
    if (this.minP() || this.maxP()) n++;
    if (this.amenities().length) n++;
    if (this.sort() !== 'recommended') n++;
    return n;
  });

  readonly popularAmenities = [
    { slug: 'wifi', label: 'Wi-Fi', icon: 'wifi' },
    { slug: 'air-conditioning', label: 'AC', icon: 'air-conditioning' },
    { slug: 'kitchen', label: 'Kitchen', icon: 'tools-kitchen-2' },
    { slug: 'security-cameras', label: 'Security', icon: 'device-cctv' },
    { slug: 'parking-on-premises', label: 'Parking', icon: 'car' },
    { slug: 'attached', label: 'Attached Bath', icon: 'bath' },
  ];

  private asValue(v: string | string[] | null): string | null {
    return typeof v === 'string' && v ? v : null;
  }

  protected onRoomTypeChange(v: string | string[] | null): void {
    this.nav({ roomType: this.asValue(v) });
  }

  /**
   * Changing the cycle can invalidate the sort that is showing.
   *
   * Moving back to All while sorted by price would leave a price sort active over mixed units
   * with no control left to change it — the option is gone from the dropdown. Dropping to the
   * default here keeps the URL and the visible controls in agreement.
   */
  protected onFrequencyChange(v: string | string[] | null): void {
    const next = this.asValue(v);
    const priceSorted = this.sort().startsWith('price-');
    this.nav({
      frequency: next,
      ...(next === null && priceSorted ? { sort: null } : {}),
    });
  }

  protected toggleQuickAmenity(slug: string): void {
    const current = this.amenities();
    const updated = current.includes(slug)
      ? current.filter((s) => s !== slug)
      : [...current, slug];
    this.nav({ amenities: updated.join(',') || null });
  }

  protected openModal(): void {
    this.modal()?.seed({
      accommodationType: this.accommodationType(),
      propertyType: this.propertyType(),
      minPrice: this.minP() ? +this.minP() : null,
      maxPrice: this.maxP() ? +this.maxP() : null,
      roomType: this.roomType(),
      amenities: this.amenities(),
      sort: this.sort(),
    });
  }

  protected onSortChange(v: string | string[] | null): void {
    this.nav({ sort: typeof v === 'string' && v ? v : null });
  }

  protected onApply(state: FilterState): void {
    const joined = state.amenities.join(',');
    this.nav({
      gender: state.accommodationType === 'all' ? null : state.accommodationType,
      propertyType: state.propertyType || null,
      minPrice: state.minPrice,
      maxPrice: state.maxPrice,
      roomType: state.roomType || null,
      amenities: joined || null,
      sort: state.sort === 'recommended' ? null : state.sort,
    });
  }

  private nav(queryParams: Record<string, string | number | null>): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
    });
  }
}
