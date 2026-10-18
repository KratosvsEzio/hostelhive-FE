import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { AccommodationType } from '@hostelhive/data-access';
import { Button, Chip, Dropdown, DropdownOption } from '@hostelhive/ui';
import { FilterState, SearchFilterModal } from '@features/public/search/search-filter-modal/search-filter-modal';
import { DEFAULT_OCCUPANCY_TYPE } from '@util/occupancy-type';
import { isAccommodationType } from '@features/public/search/search-params';
import { SORT_OPTIONS, isPriceSort, sortsFor } from '@features/public/search/search-sort';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { LocaleStore } from '@core/i18n/locale-store';
import { localiseCommands } from '@core/i18n/locale-commands';

/** Where one accommodation type lives: an un-localised path, plus any `gender` it still needs. */
export interface GenderRoute {
  path: string;
  gender: AccommodationType | null;
}

/**
 * The page for every accommodation type, when the current page's path fixes one.
 *
 * Supplied by the host page rather than worked out here: only the landing feature knows
 * which types have a page of their own, and search should not learn its URL scheme.
 */
export type GenderRoutes = Readonly<Record<AccommodationType | 'all', GenderRoute>>;

/**
 * Filter sub-header for search results. A "Filters" button opens the full
 * modal; a Sort dropdown sits inline for quick access. Everything is URL-driven
 * (query-param merge), except a change of accommodation type on a page whose path
 * fixes one — see `onApply`.
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

  /**
   * The effective filters: the query with the host page's seed beneath it, as merged by
   * `SearchMap`. Deliberately not this component's own `queryParamMap` — on a landing page
   * the path supplies filters the query never mentions, and a second reader that cannot
   * see them shows "Any type" above a list that is girls-only.
   */
  readonly params = input.required<ParamMap | null>();

  /** Set on a page whose path fixes an accommodation type; null everywhere else. */
  readonly genderRoutes = input<GenderRoutes | null>(null);

  private readonly modal = viewChild(SearchFilterModal);

  protected readonly modalOpen = signal(false);

  // Sort. 'newest'/'oldest' → sort[created_at] desc/asc; 'price-*' → sort[starting_price] (API layer).
  private readonly i18n = inject(TranslocoService);
  private readonly locale = inject(LocaleStore);

  /**
   * An option label, once there is one to read.
   *
   * Labels live in TypeScript here, so they cannot use the pipe — which subscribes, renders
   * blank and fills itself in. `translate()` cannot: it answers from whatever is loaded at
   * the moment it is called, and the first evaluation of the lists below happens before the
   * language file has landed. It found nothing and logged "Missing translation" for six keys
   * that are present in all eighteen locale files.
   *
   * The labels were never wrong — the load completes, this recomputes, and the real string
   * appears. Only the warning was, and a log that cries missing about keys that are not is a
   * log nobody finds the real misses in.
   *
   * `ready()` rather than `langChanges`: it re-asks whenever Transloco stirs, so it still
   * covers a language switch, and it answers by looking rather than by remembering an event
   * — which matters for a language served from cache, where no load event is raised at all.
   */
  private t(key: string): string {
    return this.locale.ready() ? this.i18n.translate(key) : '';
  }

  /** Recommended is not listed: the dropdown offers it as its clear label instead. */
  private readonly allSortOptions = computed<DropdownOption[]>(() =>
    SORT_OPTIONS.filter((o) => o.value !== 'recommended').map((o) => ({
      value: o.value,
      label: this.t(o.key),
    })),
  );

  /**
   * Price sort is withdrawn while the list mixes pricing cycles; the rule lives in `sortsFor`.
   *
   * The unit comes from the accommodation type rather than a filter of its own. That was the
   * whole job of the Frequency dropdown that used to sit here, which asked the seeker to state
   * something their accommodation choice had already decided.
   */
  protected readonly sortOptions = computed(() => {
    const offered = sortsFor(this.accommodationType());
    return this.allSortOptions().filter((o) => offered.some((s) => s.value === o.value));
  });

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

  /** Defence in depth: `mergeSearchParams` already drops an unknown `gender`, but a cast would let one through to `onApply`. */
  protected readonly accommodationType = computed<AccommodationType | 'all'>(() => {
    const raw = this.params()?.get('gender');
    return isAccommodationType(raw) ? raw : 'all';
  });
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

  /** Rendered in the template, so the labels go through the pipe rather than `t()`. */
  readonly popularAmenities = [
    { slug: 'wifi', key: 'filters.amenityWifi', icon: 'wifi' },
    { slug: 'air-conditioning', key: 'filters.amenityAc', icon: 'air-conditioning' },
    { slug: 'kitchen', key: 'filters.amenityKitchen', icon: 'tools-kitchen-2' },
    { slug: 'security-cameras', key: 'filters.amenitySecurity', icon: 'device-cctv' },
    { slug: 'parking-on-premises', key: 'filters.amenityParking', icon: 'car' },
    { slug: 'attached', key: 'filters.amenityAttachedBath', icon: 'bath' },
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

  /**
   * One navigation per apply, and where it goes depends on the page.
   *
   * Most pages hold the type in the query, so a merge says everything. A gender landing
   * page holds it in the path, and a query merge cannot take a path's filter away — "Any
   * type" on `/hostels/lahore/girls` would write `gender: null`, the seed would fill the
   * gap, and the list would stay girls-only. So there the apply goes to the page that
   * type lives at, keeping every other filter. Re-applying the page's own type lands on
   * the same path with `gender` cleared, which also drops a stale `?gender=` override.
   *
   * Two values are written as absent rather than as their defaults: room type (absent
   * already means shared) and a price sort on "Any type", which mixes nightly and monthly
   * prices and so cannot be price-sorted (see `sortOptions`).
   */
  protected onApply(state: FilterState): void {
    const type = state.accommodationType;
    const patch: Record<string, string | number | null> = {
      propertyType: state.propertyType || null,
      minPrice: state.minPrice,
      maxPrice: state.maxPrice,
      roomType:
        state.roomType && state.roomType !== DEFAULT_OCCUPANCY_TYPE ? state.roomType : null,
      amenities: state.amenities.join(',') || null,
      sort:
        state.sort === 'recommended' || (type === 'all' && isPriceSort(state.sort))
          ? null
          : state.sort,
    };

    const routes = this.genderRoutes();
    if (routes) {
      // The modal only offers known types, but a page that misses one still has to go somewhere.
      const target = routes[type] ?? routes.all;
      this.router.navigate(
        localiseCommands([target.path], this.locale.active()) as unknown[],
        { queryParams: { ...patch, gender: target.gender }, queryParamsHandling: 'merge' },
      );
      return;
    }

    this.nav({ ...patch, gender: type === 'all' ? null : type });
  }

  private nav(queryParams: Record<string, string | number | null>): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
    });
  }
}
