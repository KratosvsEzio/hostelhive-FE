import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';
import { Button } from '../button/button';
import { Toggle } from '../toggle/toggle';
import { DateRange, DateRangePicker } from '../date-range-picker/date-range-picker';
import { TranslocoPipe } from '@jsverse/transloco';

// ── public types ──────────────────────────────────────────────────────────────

export type FilterFieldType =
  | 'checkbox'        // multi-select checkbox list
  | 'radio'           // single-select radio list
  | 'switch'          // on/off toggle in the right panel
  | 'date-range'      // from / to date inputs
  | 'number-range'    // min / max numeric inputs
  | 'search-checkbox' // searchable multi-select checkbox list
  | 'select'          // searchable single-select list
  | 'nested-select';  // two-level group → item radio list

export interface FilterOption {
  value: string;
  label: string;
}

/** One group (parent) in a nested-select field, with its child items. */
export interface NestedSelectGroup {
  value: string;
  label: string;
  items: FilterOption[];
}

/** Value produced by a nested-select field: group slug, optional item slug. */
export interface NestedSelectValue {
  group: string;
  item?: string;
}

export interface FilterField {
  /** Key used in FilterValues to store this field's value. */
  key: string;
  type: FilterFieldType;
  /** Displayed as a small-caps section heading above the field. */
  label?: string;
  /** Subtitle below the label. */
  description?: string;
  /** Static options list (for checkbox / radio / select / search-checkbox). */
  options?: FilterOption[];
  /** Groups for the nested-select type. */
  nestedGroups?: NestedSelectGroup[];

  // ── API-driven options (overrides static options when present) ──────────
  /**
   * URL to dynamically load options from. Applicable to
   * search-checkbox and select field types.
   * Example: '/api/host/rooms'
   */
  apiUrl?: string;
  /** Query-string parameter name for the search term. Default: 'q'. */
  apiSearchParam?: string;
  /** Key inside the JSON response that contains the options array. Default: root array. */
  apiResultsKey?: string;
  /** Key on each item to use as the option label. Default: 'name'. */
  apiLabelKey?: string;
  /** Key on each item to use as the option value. Default: 'id'. */
  apiValueKey?: string;

  // ── range config ────────────────────────────────────────────────────────
  placeholder?: string;
  fromLabel?: string;
  toLabel?: string;
  minDate?: string;
  maxDate?: string;
  /** When set, selecting this value is treated as "no filter" and not counted toward active filters. */
  allValue?: string;
}

export interface FilterGroup {
  key: string;
  label: string;
  icon?: string;
  /**
   * When true, renders an inline toggle in the sidebar row (no right panel).
   * Its boolean value is stored at FilterValues[key].
   */
  inlineSidebar?: boolean;
  fields?: FilterField[];
}

export interface DateRangeValue   { from?: string; to?: string }
export interface NumberRangeValue { min?: string;  max?: string }
export type FilterFieldValue =
  | boolean | string | string[]
  | DateRangeValue | NumberRangeValue | NestedSelectValue;
export type FilterValues = Record<string, FilterFieldValue>;

// ── component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'hh-global-filter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Toggle, DateRangePicker, TranslocoPipe],
  templateUrl: './global-filter.html',
})
export class GlobalFilter {
  private readonly http       = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host       = inject(ElementRef<HTMLElement>);

  private readonly triggerBtn = viewChild<ElementRef<HTMLElement>>('triggerBtn');
  private readonly portal     = viewChild<ElementRef<HTMLElement>>('portal');
  protected readonly pos      = signal<{ top: number; left: number } | null>(null);

  readonly groups = input.required<FilterGroup[]>();
  readonly value  = model<FilterValues>({});
  readonly apply  = output<FilterValues>();

  protected readonly open           = signal(false);
  protected readonly activeGroupKey = signal<string | null>(null);
  protected readonly draft          = signal<FilterValues>({});
  protected readonly searches       = signal<Record<string, string>>({});

  // Per-field async state
  protected readonly asyncOptions = signal<Record<string, FilterOption[]>>({});
  protected readonly asyncLoading = signal<Record<string, boolean>>({});
  protected readonly asyncError   = signal<Record<string, boolean>>({});

  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.debounceTimers.forEach((t) => clearTimeout(t));
      this.portal()?.nativeElement.remove();
    });
    // Teleport the panel to <body> so fixed coords are viewport-relative.
    effect(() => {
      const el = this.portal()?.nativeElement;
      if (el && typeof document !== 'undefined' && el.parentNode !== document.body) {
        document.body.appendChild(el);
      }
    });
    inject(Router).events
      .pipe(filter((e) => e instanceof NavigationStart), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.closePanel());
  }

  // ── derived ────────────────────────────────────────────────────────────────

  protected readonly draftCounts = computed(() => {
    const v = this.draft();
    const out: Record<string, number> = {};
    for (const g of this.groups()) {
      out[g.key] = g.inlineSidebar
        ? (v[g.key] ? 1 : 0)
        : (g.fields ?? []).reduce((s, f) => s + this.countValue(f, v[f.key]), 0);
    }
    return out;
  });

  protected readonly totalActive = computed(() =>
    this.groups().reduce((total, g) => {
      const v = this.value();
      if (g.inlineSidebar) return total + (v[g.key] ? 1 : 0);
      return total + (g.fields ?? []).reduce((s, f) => s + this.countValue(f, v[f.key]), 0);
    }, 0),
  );

  protected readonly activeGroup = computed(() => {
    const key = this.activeGroupKey();
    return this.groups().find((g) => g.key === key) ?? null;
  });

  // ── panel lifecycle ────────────────────────────────────────────────────────

  protected toggle(): void {
    if (this.open()) { this.closePanel(); return; }
    this.openPanel();
  }

  protected openPanel(): void {
    this.draft.set({ ...this.value() });
    this.searches.set({});
    const first = this.groups().find((g) => !g.inlineSidebar);
    this.activeGroupKey.set(first?.key ?? null);
    if (first) this.loadInitialOptions(first);
    this.reposition();
    this.open.set(true);
    requestAnimationFrame(() => this.reposition());
  }

  protected closePanel(): void {
    this.open.set(false);
  }

  private readonly reposition = (): void => {
    const btn = this.triggerBtn()?.nativeElement;
    if (!btn || typeof window === 'undefined') return;
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const panel = this.portal()?.nativeElement?.querySelector<HTMLElement>('[data-filter-panel]');
    const panelW = panel ? panel.offsetWidth : Math.min(480, vw - 16);
    const panelH = panel ? panel.offsetHeight : 460;

    let left = r.left;
    if (left + panelW > vw - 8) left = r.right - panelW;
    left = Math.max(8, Math.min(left, vw - panelW - 8));

    let top = r.bottom + 8;
    if (top + panelH > vh - 8) top = r.top - panelH - 8;
    top = Math.max(8, top);

    this.pos.set({ top, left });
  };

  // ── sidebar ────────────────────────────────────────────────────────────────

  protected selectGroup(g: FilterGroup): void {
    if (g.inlineSidebar) {
      this.draft.update((d) => ({ ...d, [g.key]: !d[g.key] }));
      return;
    }
    this.activeGroupKey.set(g.key);
    this.loadInitialOptions(g);
  }

  /** Fetch initial options (empty query) for any API-backed fields in this group. */
  private loadInitialOptions(g: FilterGroup): void {
    for (const f of g.fields ?? []) {
      if (f.apiUrl && !this.asyncOptions()[f.key]?.length) {
        this.fetchOptions(f, '');
      }
    }
  }

  // ── switch ─────────────────────────────────────────────────────────────────

  protected getSwitch(key: string): boolean {
    return !!(this.draft()[key]);
  }

  protected setSwitch(key: string, v: boolean): void {
    this.draft.update((d) => ({ ...d, [key]: v }));
  }

  // ── checkbox ───────────────────────────────────────────────────────────────

  protected isChecked(key: string, value: string): boolean {
    const v = this.draft()[key];
    return Array.isArray(v) && v.includes(value);
  }

  protected toggleCheckbox(key: string, value: string): void {
    this.draft.update((d) => {
      const cur = (d[key] as string[] | undefined) ?? [];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      return { ...d, [key]: next };
    });
  }

  // ── radio ──────────────────────────────────────────────────────────────────

  protected isRadio(key: string, value: string): boolean {
    return this.draft()[key] === value;
  }

  protected setRadio(key: string, value: string): void {
    if (this.draft()[key] === value) return;
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  // ── select ─────────────────────────────────────────────────────────────────

  protected getSelect(key: string): string {
    return (this.draft()[key] as string | undefined) ?? '';
  }

  protected setSelect(key: string, value: string): void {
    const cur = this.getSelect(key);
    this.draft.update((d) => ({ ...d, [key]: cur === value ? '' : value }));
  }

  // ── nested-select ──────────────────────────────────────────────────────────

  protected getNestedSelect(key: string): NestedSelectValue | null {
    return (this.draft()[key] as NestedSelectValue | undefined) ?? null;
  }

  protected setNestedGroup(key: string, groupValue: string): void {
    this.draft.update((d) => ({ ...d, [key]: { group: groupValue } }));
  }

  protected setNestedItem(key: string, groupValue: string, itemValue: string): void {
    this.draft.update((d) => ({ ...d, [key]: { group: groupValue, item: itemValue } }));
  }

  protected isNestedGroupActive(key: string, groupValue: string): boolean {
    const v = this.getNestedSelect(key);
    return v?.group === groupValue && !v?.item;
  }

  protected isNestedItemActive(key: string, groupValue: string, itemValue: string): boolean {
    const v = this.getNestedSelect(key);
    return v?.group === groupValue && v?.item === itemValue;
  }

  protected isNestedGroupOrChildActive(key: string, groupValue: string): boolean {
    return this.getNestedSelect(key)?.group === groupValue;
  }

  // ── date-range ─────────────────────────────────────────────────────────────

  protected getDateFrom(key: string): string {
    return (this.draft()[key] as DateRangeValue | undefined)?.from ?? '';
  }

  protected getDateTo(key: string): string {
    return (this.draft()[key] as DateRangeValue | undefined)?.to ?? '';
  }

  protected setDateFrom(key: string, from: string): void {
    this.draft.update((d) => ({ ...d, [key]: { ...(d[key] as DateRangeValue ?? {}), from } }));
  }

  protected setDateTo(key: string, to: string): void {
    this.draft.update((d) => ({ ...d, [key]: { ...(d[key] as DateRangeValue ?? {}), to } }));
  }

  protected onDateRangeChange(key: string, range: DateRange): void {
    this.draft.update((d) => ({
      ...d,
      [key]: { from: range.from ?? undefined, to: range.to ?? undefined },
    }));
  }

  // ── number-range ───────────────────────────────────────────────────────────

  protected getNumMin(key: string): string {
    return (this.draft()[key] as NumberRangeValue | undefined)?.min ?? '';
  }

  protected getNumMax(key: string): string {
    return (this.draft()[key] as NumberRangeValue | undefined)?.max ?? '';
  }

  protected setNumMin(key: string, min: string): void {
    this.draft.update((d) => ({ ...d, [key]: { ...(d[key] as NumberRangeValue ?? {}), min } }));
  }

  protected setNumMax(key: string, max: string): void {
    this.draft.update((d) => ({ ...d, [key]: { ...(d[key] as NumberRangeValue ?? {}), max } }));
  }

  // ── search & options resolution ────────────────────────────────────────────

  protected getSearch(fieldKey: string): string {
    return this.searches()[fieldKey] ?? '';
  }

  /** Called from the template on every search-input event. */
  protected onSearch(field: FilterField, query: string): void {
    this.searches.update((s) => ({ ...s, [field.key]: query }));
    if (field.apiUrl) {
      this.scheduleLoad(field, query);
    }
  }

  /**
   * Resolved options for a field — API results when apiUrl is set,
   * otherwise client-side filtered static options.
   */
  protected fieldOptions(field: FilterField): FilterOption[] {
    if (field.apiUrl) {
      return this.asyncOptions()[field.key] ?? [];
    }
    const q = this.getSearch(field.key).toLowerCase().trim();
    const opts = field.options ?? [];
    return q ? opts.filter((o) => o.label.toLowerCase().includes(q)) : opts;
  }

  protected isLoadingOptions(fieldKey: string): boolean {
    return !!(this.asyncLoading()[fieldKey]);
  }

  protected hasApiError(fieldKey: string): boolean {
    return !!(this.asyncError()[fieldKey]);
  }

  // ── footer ─────────────────────────────────────────────────────────────────

  protected applyFilters(): void {
    const committed = { ...this.draft() };
    this.value.set(committed);
    this.apply.emit(committed);
    this.closePanel();
  }

  protected resetFilters(): void {
    this.draft.set({});
    this.searches.set({});
  }

  // ── private: API loading ───────────────────────────────────────────────────

  private scheduleLoad(field: FilterField, query: string): void {
    const existing = this.debounceTimers.get(field.key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.fetchOptions(field, query);
      this.debounceTimers.delete(field.key);
    }, 300);
    this.debounceTimers.set(field.key, timer);
  }

  private fetchOptions(field: FilterField, query: string): void {
    const params: Record<string, string> = {};
    if (query) params[field.apiSearchParam ?? 'q'] = query;

    this.asyncLoading.update((s) => ({ ...s, [field.key]: true }));
    this.asyncError.update((s) => ({ ...s, [field.key]: false }));

    this.http
      .get<unknown>(field.apiUrl!, { params })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const raw = field.apiResultsKey
            ? (res as Record<string, unknown>)[field.apiResultsKey]
            : res;
          const arr = Array.isArray(raw) ? raw : [];
          const opts: FilterOption[] = arr.map((item) => {
            const obj = item as Record<string, unknown>;
            return {
              value: String(obj[field.apiValueKey ?? 'id'] ?? ''),
              label: String(obj[field.apiLabelKey ?? 'name'] ?? ''),
            };
          });
          this.asyncOptions.update((s) => ({ ...s, [field.key]: opts }));
          this.asyncLoading.update((s) => ({ ...s, [field.key]: false }));
        },
        error: () => {
          this.asyncLoading.update((s) => ({ ...s, [field.key]: false }));
          this.asyncError.update((s) => ({ ...s, [field.key]: true }));
        },
      });
  }

  // ── private: counting ──────────────────────────────────────────────────────

  private countValue(field: FilterField, v: FilterFieldValue | undefined): number {
    if (v == null) return 0;
    switch (field.type) {
      case 'switch':          return v ? 1 : 0;
      case 'radio':
      case 'select':          return (v as string) && (v as string) !== field.allValue ? 1 : 0;
      case 'checkbox':
      case 'search-checkbox': return Array.isArray(v) ? v.length : 0;
      case 'date-range': {
        const d = v as DateRangeValue;
        return (d.from ? 1 : 0) + (d.to ? 1 : 0);
      }
      case 'number-range': {
        const n = v as NumberRangeValue;
        return (n.min ? 1 : 0) + (n.max ? 1 : 0);
      }
      case 'nested-select': {
        const ns = v as NestedSelectValue | undefined;
        return ns?.group ? 1 : 0;
      }
      default: return 0;
    }
  }
}
