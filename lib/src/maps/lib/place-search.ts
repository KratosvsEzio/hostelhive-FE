import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PlaceSuggestion, PlaceSuggestionCache } from './place-cache';
import {
  PhotonFeature,
  parsePhotonAddress,
  photonSearch,
  zoomForPhotonExtent,
} from './photon';

export interface PlaceResult {
  label: string;
  lat: number;
  lng: number;
  /** Suggested map zoom, derived from the place's extent (province → area → street). */
  zoom?: number;
  // Address parts, resolved from the same search response (no separate lookup). Let a
  // consumer fill an address form straight from a picked place.
  area?: string;
  city?: string;
  province?: string;
  country?: string;
  street?: string;
  formatted?: string;
}

/** Local alias — the shape lives with the cache that stores it. */
type Suggestion = PlaceSuggestion;

/** Short prefixes match half of Pakistan and nobody picks from them; three characters is
 *  the shortest real place name we care about ("Dir", "Swat"). */
const MIN_QUERY_LENGTH = 3;
/** Debounce a typing burst. Kept modest since Photon is quick and the request goes from
 *  each user's own browser (their own IP), so one user never nears the fair-use rate. */
const DEBOUNCE_MS = 300;

/**
 * On-brand location search built on OpenStreetMap's **Photon** geocoder (Komoot) — our own
 * input and dropdown, keyless and free (see `photon.ts`). Photon is built for
 * search-as-you-type: faster than Nominatim, more candidates, and English labels. Emits
 * `textChange` (typed text, used as a city when nothing is picked) and `selected` (a picked
 * place with coordinates and address parts). Shows a "Searching…" state while a query is in
 * flight so it never looks dead, and works with no configuration — there is no key to miss.
 */
@Component({
  selector: 'hh-place-search',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block' },
  template: `
    <input
      #input
      type="text"
      [placeholder]="placeholder() ?? ('maps.searchCityOrArea' | transloco)"
      (input)="onInput()"
      (keydown)="onKeydown($event)"
      (focus)="focused.set(true)"
      (blur)="onBlur()"
      autocomplete="off"
      [attr.aria-label]="'a11y.searchLocation' | transloco"
      class="w-full bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400"
    />
    @if (showList()) {
      <div
        class="absolute start-0 top-full z-[100] mt-3 w-[min(26rem,82vw)] overflow-hidden rounded-2xl border border-ink-100 bg-white py-1.5 text-start shadow-pill"
      >
        @if (suggestions().length) {
          @for (s of suggestions(); track s.id; let i = $index) {
            <button
              type="button"
              (mousedown)="select(s)"
              (mouseenter)="activeIndex.set(i)"
              class="flex w-full items-center gap-3 px-3.5 py-2.5 text-start transition"
              [class.bg-brand-50]="i === activeIndex()"
            >
              <span
                class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-50 text-ink-500"
              >
                <i class="ti ti-map-pin text-base"></i>
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium text-ink-900">{{
                  s.main
                }}</span>
                @if (s.secondary) {
                  <span class="block truncate text-xs text-ink-400">{{
                    s.secondary
                  }}</span>
                }
              </span>
            </button>
          }
        } @else if (loading()) {
          <div
            class="flex items-center gap-3 px-3.5 py-3 text-sm text-ink-400"
            role="status"
          >
            <i
              class="ti ti-loader-2 animate-spin text-base text-brand-500"
              aria-hidden="true"
            ></i>
            Searching…
          </div>
        } @else if (noMatches()) {
          <div class="px-3.5 py-3 text-sm text-ink-400">No matching places</div>
        }
        <div
          class="flex items-center justify-end gap-1 px-3.5 pb-0.5 pt-2 text-[10px] font-medium text-ink-300"
        >
          Powered by OpenStreetMap
        </div>
      </div>
    }
  `,
})
export class PlaceSearchField {
  private readonly cache = inject(PlaceSuggestionCache);
  private readonly destroyRef = inject(DestroyRef);
  private readonly inputEl =
    viewChild.required<ElementRef<HTMLInputElement>>('input');

  readonly value = input('');
  readonly placeholder = input<string | undefined>(undefined);
  /** Non-empty restricts results to populated places (cities/towns/villages) — the address
   *  form's city field passes `['(cities)']`. The exact strings are legacy; only presence
   *  matters now. */
  readonly includedPrimaryTypes = input<string[]>([]);
  /** `'main'` keeps just the place's primary name (e.g. "Lahore"); `'full'` appends the region. */
  readonly labelMode = input<'full' | 'main'>('full');
  readonly textChange = output<string>();
  readonly selected = output<PlaceResult>();

  protected readonly suggestions = signal<Suggestion[]>([]);
  protected readonly activeIndex = signal(-1);
  protected readonly focused = signal(false);
  /** A request is in flight — drives the "Searching…" row. */
  protected readonly loading = signal(false);
  /** A completed search returned nothing — drives the "No matching places" row. */
  protected readonly noMatches = signal(false);
  protected readonly showList = computed(
    () =>
      this.focused() &&
      (this.suggestions().length > 0 || this.loading() || this.noMatches()),
  );

  private timer?: ReturnType<typeof setTimeout>;
  /** The in-flight request, aborted when a newer keystroke supersedes it. */
  private inflight?: AbortController;

  constructor() {
    // Keep the input reflecting the bound value — the initial value AND later changes
    // (e.g. after a search navigates) — without disrupting active typing: only write
    // when it actually differs from what's in the box.
    effect(() => {
      const v = this.value();
      const el = this.inputEl().nativeElement;
      if (el.value !== v) el.value = v;
    });
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.timer);
      this.inflight?.abort();
    });
  }

  protected onInput(): void {
    const text = this.inputEl().nativeElement.value;
    this.textChange.emit(text);
    clearTimeout(this.timer);
    const q = text.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      this.suggestions.set([]);
      this.loading.set(false);
      this.noMatches.set(false);
      return;
    }
    // Shared app-wide, so a query already answered for any other field — the header bar,
    // a previous visit to this route — resolves instantly with no request.
    const cached = this.cache.get(q, this.includedPrimaryTypes());
    if (cached) {
      this.suggestions.set(cached);
      this.activeIndex.set(-1);
      this.loading.set(false);
      this.noMatches.set(cached.length === 0);
      return;
    }
    // Show the searching state right away — through the debounce and the network wait — so
    // the box never looks dead. Prior results (if any) stay visible until they're replaced.
    this.loading.set(true);
    this.noMatches.set(false);
    this.timer = setTimeout(() => void this.fetch(q), DEBOUNCE_MS);
  }

  private async fetch(text: string): Promise<void> {
    // One request at a time: abort the previous so results never land out of order and we
    // stay within Photon's fair-use rate.
    this.inflight?.abort();
    const ctrl = new AbortController();
    this.inflight = ctrl;
    const types = this.includedPrimaryTypes();
    try {
      const features = await photonSearch(text, {
        signal: ctrl.signal,
        placesOnly: types.length > 0,
      });
      const list = features.map((f) => toSuggestion(f, this.labelMode()));
      this.cache.set(text, types, list);
      this.suggestions.set(list);
      this.activeIndex.set(-1);
      this.noMatches.set(list.length === 0);
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return; // superseded — keep the newer one's state
      this.suggestions.set([]);
      this.noMatches.set(true);
    } finally {
      // Only the latest request owns the spinner; an aborted one leaves it to its successor.
      if (this.inflight === ctrl) this.loading.set(false);
    }
  }

  protected select(s: Suggestion): void {
    const label =
      s.secondary && this.labelMode() === 'full'
        ? `${s.main}, ${s.secondary}`
        : s.main;
    this.inputEl().nativeElement.value = label;
    this.suggestions.set([]);
    this.noMatches.set(false);
    this.focused.set(false);
    this.textChange.emit(label);
    // The search result already carries coordinates + address — no follow-up call needed.
    this.selected.emit({ ...s.result, label });
  }

  protected onKeydown(e: KeyboardEvent): void {
    const n = this.suggestions().length;
    if (!n) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.activeIndex.update((i) => (i + 1) % n);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.activeIndex.update((i) => (i - 1 + n) % n);
    } else if (e.key === 'Enter') {
      const i = this.activeIndex();
      if (i >= 0) {
        e.preventDefault();
        this.select(this.suggestions()[i]);
      }
    } else if (e.key === 'Escape') {
      this.suggestions.set([]);
      this.noMatches.set(false);
    }
  }

  protected onBlur(): void {
    // Delay so a suggestion mousedown registers before the list closes.
    setTimeout(() => this.focused.set(false), 150);
  }
}

/** Map a Photon feature → the dropdown suggestion, with its fully-resolved result. */
function toSuggestion(f: PhotonFeature, _labelMode: 'full' | 'main'): Suggestion {
  const p = f.properties ?? {};
  const coords = f.geometry?.coordinates ?? [0, 0];
  const main = p.name || 'Unknown place';
  const addr = parsePhotonAddress(p);
  // Secondary = the context under the name (area, city, province, country), name removed.
  const secondary = [addr.area, addr.city, addr.province, addr.country]
    .filter(Boolean)
    .filter((v) => v !== main)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(', ');
  return {
    id: `${p.osm_type ?? ''}${p.osm_id ?? ''}` || `${main}:${coords[0]},${coords[1]}`,
    main,
    secondary,
    result: {
      label: main,
      lat: coords[1],
      lng: coords[0],
      zoom: zoomForPhotonExtent(p.extent),
      ...addr,
    },
  };
}
