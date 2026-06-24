/// <reference types="google.maps" />
import {
  afterNextRender,
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
import { GoogleMapsLoader } from './google-maps';

export interface PlaceResult {
  label: string;
  lat: number;
  lng: number;
  /** Suggested map zoom derived from the place's Google types (province, city, area …). */
  zoom?: number;
  // Parsed address parts from the picked place's components (present when resolvable). These
  // let a consumer fill an address form without a separate Geocoding API call.
  area?: string;
  city?: string;
  province?: string;
  country?: string;
  street?: string;
  formatted?: string;
}

interface Suggestion {
  id: string;
  main: string;
  secondary: string;
  prediction: google.maps.places.PlacePrediction;
}

/**
 * On-brand location search built on Google's Places **Data API**
 * (`AutocompleteSuggestion`) — our own input + dropdown, instead of the pre-styled
 * `PlaceAutocompleteElement` widget, so it matches the app exactly. Emits `textChange`
 * (typed text, used as a city when nothing is picked) and `selected` (a picked place
 * with coordinates). Degrades to a plain text box when no API key is configured.
 */
@Component({
  selector: 'hh-place-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block' },
  template: `
    <input
      #input
      type="text"
      [placeholder]="placeholder()"
      (input)="onInput()"
      (keydown)="onKeydown($event)"
      (focus)="focused.set(true)"
      (blur)="onBlur()"
      autocomplete="off"
      aria-label="Search location"
      class="w-full bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400"
    />
    @if (showList()) {
      <div
        class="absolute left-0 top-full z-50 mt-3 w-[min(26rem,82vw)] overflow-hidden rounded-2xl border border-ink-100 bg-white py-1.5 text-left shadow-pill"
      >
        @for (s of suggestions(); track s.id; let i = $index) {
          <button
            type="button"
            (mousedown)="select(s)"
            (mouseenter)="activeIndex.set(i)"
            class="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition"
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
        <div
          class="flex items-center justify-end gap-1 px-3.5 pb-0.5 pt-2 text-[10px] font-medium text-ink-300"
        >
          Powered by Google
        </div>
      </div>
    }
  `,
})
export class PlaceSearchField {
  private readonly loader = inject(GoogleMapsLoader);
  private readonly destroyRef = inject(DestroyRef);
  private readonly inputEl =
    viewChild.required<ElementRef<HTMLInputElement>>('input');

  readonly value = input('');
  readonly placeholder = input('Search city or area');
  /** Restrict autocomplete to specific Google place types, e.g. `['(cities)']` for city-only. */
  readonly includedPrimaryTypes = input<string[]>([]);
  /** `'main'` keeps just the place's primary name (e.g. "Lahore"); `'full'` appends the region. */
  readonly labelMode = input<'full' | 'main'>('full');
  readonly textChange = output<string>();
  readonly selected = output<PlaceResult>();

  protected readonly suggestions = signal<Suggestion[]>([]);
  protected readonly activeIndex = signal(-1);
  protected readonly focused = signal(false);
  protected readonly showList = computed(
    () => this.focused() && this.suggestions().length > 0,
  );

  private token?: google.maps.places.AutocompleteSessionToken;
  private timer?: ReturnType<typeof setTimeout>;
  private ready = false;

  constructor() {
    // Keep the input reflecting the bound value — the initial value AND later changes
    // (e.g. after a search navigates) — without disrupting active typing: only write
    // when it actually differs from what's in the box.
    effect(() => {
      const v = this.value();
      const el = this.inputEl().nativeElement;
      if (el.value !== v) el.value = v;
    });
    afterNextRender(() => void this.ensureLoaded());
    this.destroyRef.onDestroy(() => clearTimeout(this.timer));
  }

  private async ensureLoaded(): Promise<boolean> {
    if (this.ready) return true;
    if (!this.loader.configured) return false;
    try {
      await this.loader.load();
      this.ready = true;
      return true;
    } catch {
      return false;
    }
  }

  protected onInput(): void {
    const text = this.inputEl().nativeElement.value;
    this.textChange.emit(text);
    clearTimeout(this.timer);
    if (!text.trim()) {
      this.suggestions.set([]);
      return;
    }
    this.timer = setTimeout(() => void this.fetch(text), 220);
  }

  private async fetch(text: string): Promise<void> {
    if (!(await this.ensureLoaded())) return;
    this.token ??= new google.maps.places.AutocompleteSessionToken();
    try {
      const types = this.includedPrimaryTypes();
      const { suggestions } =
        await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(
          {
            input: text,
            includedRegionCodes: ['pk'],
            // `['(cities)']` limits results to cities; omitted entirely when unset (all place types).
            ...(types.length ? { includedPrimaryTypes: types } : {}),
            sessionToken: this.token,
          },
        );
      const list: Suggestion[] = [];
      for (const s of suggestions) {
        const p = s.placePrediction;
        if (!p) continue;
        list.push({
          id: p.placeId,
          main: p.mainText?.text ?? p.text.text,
          secondary: p.secondaryText?.text ?? '',
          prediction: p,
        });
      }
      this.suggestions.set(list);
      this.activeIndex.set(-1);
    } catch {
      this.suggestions.set([]);
    }
  }

  protected async select(s: Suggestion): Promise<void> {
    const label =
      s.secondary && this.labelMode() === 'full'
        ? `${s.main}, ${s.secondary}`
        : s.main;
    this.inputEl().nativeElement.value = label;
    this.suggestions.set([]);
    this.focused.set(false);
    this.textChange.emit(label);
    const place = s.prediction.toPlace();
    await place.fetchFields({
      fields: ['location', 'types', 'addressComponents', 'formattedAddress'],
    });
    this.token = undefined; // session ends at selection
    const loc = place.location;
    if (loc) {
      this.selected.emit({
        label,
        lat: loc.lat(),
        lng: loc.lng(),
        zoom: zoomForPlaceTypes(place.types),
        ...parsePlaceAddress(place),
      });
    }
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
        void this.select(this.suggestions()[i]);
      }
    } else if (e.key === 'Escape') {
      this.suggestions.set([]);
    }
  }

  protected onBlur(): void {
    // Delay so a suggestion mousedown registers before the list closes.
    setTimeout(() => this.focused.set(false), 150);
  }
}

/** Map a picked Place's address components → flat address parts (new Places API shape). */
function parsePlaceAddress(
  place: google.maps.places.Place,
): Partial<PlaceResult> {
  const comps = place.addressComponents ?? [];
  const get = (type: string): string =>
    comps.find((c) => c.types.includes(type))?.longText ?? '';
  const street = [get('street_number'), get('route')].filter(Boolean).join(' ');
  return {
    street,
    area:
      get('sublocality_level_1') ||
      get('sublocality') ||
      get('neighborhood') ||
      get('administrative_area_level_3'),
    city:
      get('locality') ||
      get('postal_town') ||
      get('administrative_area_level_2'),
    province: get('administrative_area_level_1'),
    country: get('country'),
    formatted: place.formattedAddress ?? '',
  };
}

/** Maps a Google place's `types` to a sensible map zoom (per the Maps zoom-level chart):
 *  country 6 · province 8 · division/district 7 · city 9 · town/sub-district 13 · street/POI 15. */
function zoomForPlaceTypes(
  types: string[] | null | undefined,
): number | undefined {
  if (!types?.length) return undefined;
  if (types.includes('country')) return 6;
  if (types.includes('administrative_area_level_1')) return 8;
  if (types.includes('administrative_area_level_2')) return 7;
  if (types.includes('locality') || types.includes('postal_town')) return 9;
  if (
    types.some((t) => t.startsWith('sublocality')) ||
    types.includes('neighborhood')
  )
    return 13;
  return 15;
}
