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
  protected readonly sortOptions: DropdownOption[] = [
    { value: 'newest', label: 'Recent first' },
    { value: 'oldest', label: 'Oldest first' },
    { value: 'price-desc', label: 'Price: high to low' },
    { value: 'price-asc', label: 'Price: low to high' },
  ];

  protected readonly accommodationType = computed<AccommodationType | 'all'>(
    () => (this.params()?.get('gender') as AccommodationType | 'all') ?? 'all',
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
      this.accommodationType() !== 'all' ||
      !!this.propertyType() ||
      !!this.capacity() ||
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
    if (this.capacity()) n++;
    if (this.minP() || this.maxP()) n++;
    if (this.amenities().length) n++;
    if (this.sort() !== 'recommended') n++;
    return n;
  });

  readonly genderPills: { label: string; value: AccommodationType; icon: string }[] = [
    { label: 'Boys', value: 'boys', icon: 'gender-male' },
    { label: 'Girls', value: 'girls', icon: 'gender-female' },
    { label: 'Co-living', value: 'coliving', icon: 'users' },
    { label: 'Backpacker', value: 'backpacker', icon: 'backpack' },
  ];

  readonly popularAmenities = [
    { slug: 'wifi', label: 'Wi-Fi', icon: 'wifi' },
    { slug: 'air-conditioning', label: 'AC', icon: 'air-conditioning' },
    { slug: 'kitchen', label: 'Kitchen', icon: 'tools-kitchen-2' },
    { slug: 'security-cameras', label: 'Security', icon: 'device-cctv' },
    { slug: 'parking-on-premises', label: 'Parking', icon: 'car' },
    { slug: 'attached', label: 'Attached Bath', icon: 'bath' },
  ];

  protected toggleGender(value: AccommodationType): void {
    this.nav({ gender: this.accommodationType() === value ? null : value });
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
      capacity: this.capacity(),
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
