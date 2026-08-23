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
import { ActivatedRoute, NavigationEnd, ParamMap, Router } from '@angular/router';
import { filter } from 'rxjs';
import { fromLocationSlug, searchRouteFor } from '@util/location-slug';
import { resolveSearchSlug } from '@features/public/landing/search-slug';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PlaceResult, PlaceSearchField } from '@hostelhive/maps';
import { RangeSlider } from '@hostelhive/ui';
import { SearchCapacity } from '@services';
import { BUDGET_MAX, BUDGET_MIN, BUDGET_STEP } from '@util/budget-range';
import { currencySymbol } from '@util/currencies';
import { CurrencyPreference } from '@core/preferences/currency-preference';
import { TranslocoPipe } from '@jsverse/transloco';

type Seg = 'where' | 'budget' | 'accommodation';

// Keys rather than copy: these are data, so the template translates them at render.
// Replaces the sharing sizes. Capacity was never the question a seeker could answer from
// the search bar — the choice is what kind of place it is, and how many share a room is a
// detail read afterwards on the listing itself.
const ACCOMMODATIONS: { v: string; l: string }[] = [
  { v: '', l: 'searchBar.anyAccommodation' },
  { v: 'boys', l: 'searchBar.boys' },
  { v: 'girls', l: 'searchBar.girls' },
  { v: 'coliving', l: 'searchBar.coliving' },
  { v: 'backpacker', l: 'searchBar.backpacker' },
];
/**
 * Compact budget figure for the collapsed chip: `14.76k`, `900`, `20k`.
 *
 * Capped at two decimals because the raw division printed whatever the number happened to
 * carry — a 14,762 bound rendered as "14.762k", and a converted or odd-stepped bound can run
 * to far more digits than that in a chip only a few characters wide.
 *
 * Unary `+` after `toFixed` drops trailing zeros, so a round 20,000 stays "20k" rather than
 * becoming "20.00k" — two decimals is the ceiling, not a fixed width.
 */
const round2 = (n: number): number => +n.toFixed(2);
const fmtK = (n: number): string =>
  n >= 1000 ? `${round2(n / 1000)}k` : `${round2(n)}`;

/** A translation key with whatever it interpolates, for the template to resolve. */
type Label = { key: string; params?: Record<string, string> };

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
  imports: [TranslocoPipe, PlaceSearchField, RangeSlider],
  styleUrl: './search-bar.scss',
  templateUrl: './search-bar.html',
})
export class SearchBar {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly capacityStore = inject(SearchCapacity);
  private readonly el = inject(ElementRef);
  private readonly whereEl = viewChild<ElementRef<HTMLElement>>('whereSeg');

  protected readonly accommodationOpts = ACCOMMODATIONS;
  protected readonly BUDGET_MIN = BUDGET_MIN;
  protected readonly BUDGET_MAX = BUDGET_MAX;

  /**
   * The symbol the budget is quoted in -- the seeker's preferred currency, because that is
   * the currency the filter is actually sent in. A slider that said "Rs" while the request
   * asked for dollars would be inviting someone to type a number meaning one thing and have
   * it read as another.
   */
  private readonly currency = inject(CurrencyPreference);
  protected readonly budgetSymbol = computed(() => currencySymbol(this.currency.code()));
  protected readonly BUDGET_STEP = BUDGET_STEP;

  protected readonly open = signal<Seg | null>(null);
  protected readonly place = signal('');
  private readonly lat = signal<number | null>(null);
  private readonly lng = signal<number | null>(null);
  private readonly zoom = signal<number | null>(null);
  protected readonly budgetLow = signal(BUDGET_MIN);
  protected readonly budgetHigh = signal(BUDGET_MAX);
  /**
   * The active sort, read but never set here — see the price-sort clause in {@link search}.
   *
   * The bar has no sort control of its own; it needs this only because the accommodation
   * type it *does* own is what decides whether a price sort means anything.
   */
  private readonly activeSort = signal('');
  protected readonly accommodation = signal('');

  protected readonly budgetActive = computed(
    () => this.budgetLow() > BUDGET_MIN || this.budgetHigh() < BUDGET_MAX,
  );

  /**
   * The label as a key plus its interpolation params, for the template to resolve.
   *
   * Not resolved here: `translate()` hands back the key itself while the language file is
   * still loading, and a computed would cache that — the header read "searchBar.addBudget"
   * until a reload. The pipe re-renders when the file arrives.
   */
  protected readonly budgetLabel = computed(
    (): Label => {
      const lo = this.budgetLow();
      const hi = this.budgetHigh();
      if (lo <= BUDGET_MIN && hi >= BUDGET_MAX) return { key: 'searchBar.addBudget' };
      if (lo <= BUDGET_MIN) {
        return {
          key: 'searchBar.underAmount',
          params: { symbol: this.budgetSymbol(), amount: fmtK(hi) },
        };
      }
      if (hi >= BUDGET_MAX) {
        return {
          key: 'searchBar.fromAmount',
          params: { symbol: this.budgetSymbol(), amount: fmtK(lo) },
        };
      }
      return {
        key: 'searchBar.betweenAmounts',
        params: { symbol: this.budgetSymbol(), low: fmtK(lo), high: fmtK(hi) },
      };
    },
  );
  protected readonly accommodationLabel = computed(() => {
    const s = this.accommodation();
    return (s && ACCOMMODATIONS.find((o) => o.v === s)?.l) || 'searchBar.addAccommodation';
  });

  /**
   * The `:location` slug of whatever is currently routed, or `''`.
   *
   * The bar sits in the layout, above the outlet, so its own `ActivatedRoute` is the root
   * and never carries the search route's params — hence the walk down. Going through the
   * route tree rather than parsing `router.url` also means `/ur/search/lahore` needs no
   * special handling: the router has already accounted for the language prefix.
   */
  private routedLocationSlug(): string {
    let r: ActivatedRoute | null = this.router.routerState?.root ?? null;
    let slug = '';
    while (r) {
      // Read through the snapshot rather than from it. On the server this runs during the
      // first `queryParamMap` emission, before the router has finished building the tree —
      // a route exists but has no snapshot yet, and reaching into one threw on every SSR
      // render of every page carrying the search bar.
      slug = r.snapshot?.paramMap?.get('location') ?? slug;
      r = r.firstChild;
    }
    return slug;
  }

  constructor() {
    // Reflect the active search (query params) into the bar reactively — so after a
    // search it keeps showing the searched place instead of going blank. Typing doesn't
    // navigate, so in-progress edits are preserved (this only fires on real navigation).
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.syncPlace(p);
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
      this.accommodation.set(p.get('gender') ?? '');
      this.activeSort.set(p.get('sort') ?? '');
    });
    // Query params are resolved before the outlet activates, so on a first load the
    // subscription above runs while the route tree is still a stub and the `:location`
    // slug is not readable yet. NavigationEnd is the point at which the tree is final —
    // re-deriving there is what makes a *pasted* /search/lahore fill the bar, rather than
    // only a search the visitor performed in this tab.
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.syncPlace(this.route.snapshot.queryParamMap));
  }

  /**
   * The place name the URL implies: its own `place`/`city` param when it has one, and the
   * routed slug when it does not.
   *
   * A pasted `/search/lahore` carries no `place`, so without the slug the bar goes blank on
   * exactly the page whose whole subject is that place. Curated names come from the same
   * table the map centres on, so the bar, the heading and the results agree.
   */
  private syncPlace(p: ParamMap): void {
    const slug = this.routedLocationSlug();
    this.place.set(
      p.get('place') ??
        p.get('city') ??
        resolveSearchSlug(slug)?.name ??
        (slug ? fromLocationSlug(slug) : ''),
    );
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
  protected pickAccommodation(v: string): void {
    this.accommodation.set(v);
    this.open.set(null);
  }

  protected search(): void {
    const hasGeo = this.lat() !== null && this.lng() !== null;
    this.open.set(null);
    // The place becomes a URL segment (/search/karachi) purely for readability. Coordinates
    // still travel in the query, so this changes nothing about how the map is driven.
    this.router.navigate(searchRouteFor(this.place()), {
      queryParams: {
        place: this.place() || null,
        city: hasGeo ? null : this.place() || null,
        lat: hasGeo ? this.lat() : null,
        lng: hasGeo ? this.lng() : null,
        zoom: hasGeo ? this.zoom() : null,
        minPrice: this.budgetLow() > BUDGET_MIN ? this.budgetLow() : null,
        maxPrice: this.budgetHigh() < BUDGET_MAX ? this.budgetHigh() : null,
        gender: this.accommodation() || null,
        // Retired params, cleared so an old shared URL does not keep filtering by a control
        // that no longer exists on screen.
        capacity: null,
        sharing: null,
        frequency: null,
        // A price sort only means something over a single pricing cycle, and naming an
        // accommodation type is what pins one — only backpacker hostels are nightly.
        // Returning to All would otherwise leave `sort=price-asc` running over mixed units
        // while the Sort dropdown no longer offers it, so the URL and the visible control
        // would disagree about what the list is doing. The Frequency filter used to carry
        // this guard; the accommodation type inherits it along with the job.
        ...(!this.accommodation() && this.activeSort().startsWith('price-')
          ? { sort: null }
          : {}),
      },
      queryParamsHandling: 'merge',
    });
  }
}
