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
import { DEFAULT_OCCUPANCY_TYPE } from '@util/occupancy-type';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

/**
 * Filter sub-header for search results. A "Filters" button opens the full
 * modal; a Sort dropdown sits inline for quick access. Everything is URL-driven
 * (query-param merge).
 */
@Component({
  selector: 'hh-search-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Chip, Dropdown, SearchFilterModal, TranslocoPipe],
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
  /**
   * Option labels live in TypeScript, so they cannot use the pipe. Reading the active
   * language here makes the arrays below recompute on a language change — without it they
   * would keep whatever language was active when this component was constructed.
   */
  private readonly i18n = inject(TranslocoService);
  private readonly lang = toSignal(this.i18n.langChanges$, {
    initialValue: this.i18n.getActiveLang(),
  });
  private t(key: string): string {
    this.lang();
    return this.i18n.translate(key);
  }

  private readonly allSortOptions = computed<DropdownOption[]>(() => [
    { value: 'newest', label: this.t('search.recentFirst') },
    { value: 'oldest', label: this.t('search.oldestFirst') },
    { value: 'price-desc', label: this.t('search.priceHighToLow') },
    { value: 'price-asc', label: this.t('search.priceLowToHigh') },
  ]);

  /**
   * Price sort is withdrawn while the list mixes pricing cycles.
   *
   * `starting_price` is one unit-less number, so a nightly bed at PKR 1,200 sorts above a
   * monthly room at PKR 15,000 as though it were cheaper — page one fills with backpacker
   * dorms a student cannot rent by the month. The other three sorts are unit-agnostic and
   * always stay.
   *
   * The unit now comes from the accommodation type rather than a filter of its own: only
   * backpacker hostels are nightly (see `periodForAccommodation`), so naming any one type
   * pins the list to a single cycle, and "All" is the only mix. That was the whole job of
   * the Frequency dropdown that used to sit here, which asked the seeker to state something
   * their accommodation choice had already decided.
   */
  protected readonly sortOptions = computed(() =>
    this.accommodationType() === 'all'
      ? this.allSortOptions().filter((o) => !String(o.value).startsWith('price-'))
      : this.allSortOptions(),
  );

  /**
   * Replaces the 1–5+ sharing filter.
   *
   * Capacity is not the axis anybody shops on — the choice is a room to yourself or a bed in a
   * room with others, and how many others is a detail read after that.
   */
  protected readonly roomTypeOptions = computed<DropdownOption[]>(() => [
    { value: 'shared', label: this.t('search.sharedRoom') },
    { value: 'private', label: this.t('search.privateRoom') },
  ]);

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
  /**
   * Always one of the two -- there is no "Any" any more.
   *
   * Shared is the floor rather than a chosen filter, so it does not count towards the
   * "filters applied" badge below: a seeker who has touched nothing should not be told they
   * have a filter on.
   */
  protected readonly roomType = computed(
    () => this.params()?.get('roomType') || DEFAULT_OCCUPANCY_TYPE,
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
      this.roomType() !== DEFAULT_OCCUPANCY_TYPE ||
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
    if (this.roomType() !== DEFAULT_OCCUPANCY_TYPE) n++;
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

  /** Never clears to nothing: the dropdown offers no empty option, so null means "unchanged". */
  protected onRoomTypeChange(v: string | string[] | null): void {
    const next = this.asValue(v);
    if (next) this.nav({ roomType: next });
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
