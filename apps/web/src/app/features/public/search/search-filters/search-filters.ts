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
import { AMENITIES, Gender, PROPERTY_TYPES } from '@hostelhive/data-access';
import { Dropdown, DropdownOption } from '@hostelhive/ui';
import { FilterState, SearchFilterModal } from '@features/public/search/search-filter-modal/search-filter-modal';

/**
 * Airbnb-style filter sub-header for search results. A "Filters" button opens
 * the full modal; individual amenity chips and a sort dropdown sit inline for
 * quick access. Everything is URL-driven (query-param merge).
 */
@Component({
  selector: 'hh-search-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dropdown, SearchFilterModal],
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

  protected readonly amenityChips = Object.entries(AMENITIES).map(
    ([key, v]) => ({
      key,
      label: v.label,
      icon: v.icon,
    }),
  );
  protected readonly propertyTypes = PROPERTY_TYPES;
  protected readonly genderOptions: DropdownOption[] = [
    { value: 'boys', label: 'Boys' },
    { value: 'girls', label: 'Girls' },
    { value: 'coliving', label: 'Co-living' },
  ];
  // Room capacity. '4plus' is a URL-safe token for "4+" (avoids the '+' → space query
  // pitfall); the API layer maps it to f[room_types.capacity][gte]=4.
  protected readonly capacityOptions: DropdownOption[] = [
    { value: '1', label: '1' },
    { value: '2', label: '2' },
    { value: '3', label: '3' },
    { value: '4', label: '4' },
    { value: '4plus', label: '4+' },
  ];
  // Sort. 'newest'/'oldest' → sort[created_at] desc/asc; 'price-*' → sort[starting_price] (API layer).
  protected readonly sortOptions: DropdownOption[] = [
    { value: 'newest', label: 'Recent first' },
    { value: 'oldest', label: 'Oldest first' },
    { value: 'price-desc', label: 'Price: high to low' },
    { value: 'price-asc', label: 'Price: low to high' },
  ];

  protected readonly gender = computed<Gender | 'all'>(
    () => (this.params()?.get('gender') as Gender | 'all') ?? 'all',
  );
  protected readonly propertyType = computed(
    () => this.params()?.get('propertyType') ?? '',
  );
  protected readonly capacity = computed(
    () => this.params()?.get('capacity') ?? '',
  );
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
      this.gender() !== 'all' ||
      !!this.propertyType() ||
      !!this.capacity() ||
      !!this.minP() ||
      !!this.maxP() ||
      this.sort() !== 'recommended'
    );
  });

  protected readonly activeFilterCount = computed(() => {
    let n = 0;
    if (this.gender() !== 'all') n++;
    if (this.propertyType()) n++;
    if (this.capacity()) n++;
    if (this.minP() || this.maxP()) n++;
    if (this.sort() !== 'recommended') n++;
    return n;
  });

  protected openModal(): void {
    this.modal()?.seed({
      gender: this.gender(),
      propertyType: this.propertyType(),
      minPrice: this.minP() ? +this.minP() : null,
      maxPrice: this.maxP() ? +this.maxP() : null,
      capacity: this.capacity(),
      amenities: this.amenities(),
      sort: this.sort(),
    });
  }

  protected onGenderChange(v: string | string[] | null): void {
    this.nav({ gender: typeof v === 'string' && v ? v : null });
  }

  protected onPropertyChange(v: string | string[] | null): void {
    this.nav({ propertyType: typeof v === 'string' && v ? v : null });
  }

  protected onCapacityChange(v: string | string[] | null): void {
    this.nav({ capacity: typeof v === 'string' && v ? v : null });
  }

  protected onSortChange(v: string | string[] | null): void {
    this.nav({ sort: typeof v === 'string' && v ? v : null });
  }

  protected toggleAmenity(key: string): void {
    const set = new Set(this.amenities());
    if (set.has(key)) set.delete(key);
    else set.add(key);
    const joined = Array.from(set).join(',');
    this.nav({ amenities: joined || null });
  }

  protected onApply(state: FilterState): void {
    const joined = state.amenities.join(',');
    this.nav({
      gender: state.gender === 'all' ? null : state.gender,
      propertyType: state.propertyType || null,
      minPrice: state.minPrice,
      maxPrice: state.maxPrice,
      capacity: state.capacity || null,
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
