import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
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
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';
import { StatusPill } from '../status-pill/status-pill';
import type { StatusTone } from '../status-pill/status-pill';

export interface DropdownOption {
  value: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  badge?: string;
  disabledTooltip?: string;
  // Multi-line / rich option support
  subtitle?: string;
  statusTone?: StatusTone;
  statusLabel?: string;
  suffixBadge?: string;
  suffixBadgeClass?: string;
  /** Group label — consecutive options with the same group string are rendered under a shared header. */
  group?: string;
}

/**
 * Themed single/multi-select dropdown — the brand-styled replacement for native
 * `<select>` (whose option list renders OS-default and can't be themed).
 *
 *  - **single**: `value` is a `string | null`
 *  - **multiple**: `value` is a `string[]`
 *
 * Variants:
 *  - `'pill'`      (default) — compact rounded-full chip, for inline filter bars
 *  - `'field'`     — full-width bordered form control, for modals / console forms
 *  - `'borderless'`— full-width, no border, hover:bg-surface; for sidebar / nav pickers
 *
 * Async / searchable mode — opt in with `[searchable]="true"`:
 *  - Renders a search input pinned above the list
 *  - Emits `(searchChange)` as the user types
 *  - Accepts `[loading]` to show a skeleton while options load
 *  - Accepts `[hasMore]` + emits `(loadMore)` for infinite-scroll pagination
 *
 * Rich options — set fields on `DropdownOption`:
 *  - `subtitle`       second line of text below the label
 *  - `statusTone/Label` renders a hh-status-pill in the option and in the trigger
 *  - `suffixBadge/Class` inline colored badge after the subtitle (e.g. gender tag)
 *
 * The open panel is teleported to `<body>` and positioned `fixed` against the
 * trigger's viewport rect, so it is never clipped by an `overflow` ancestor.
 * With `[openRight]="true"` the panel opens to the right of the trigger instead
 * of below — useful for sidebar pickers where there's no space below.
 */
@Component({
  selector: 'hh-dropdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StatusPill],
  template: `
    <div
      [class]="
        variant() === 'pill' || seamless()
          ? 'relative inline-block'
          : 'relative block w-full'
      "
    >
      <button
        type="button"
        (click)="toggle()"
        aria-haspopup="listbox"
        [attr.aria-expanded]="open()"
        [class]="triggerClass()"
      >
        @if (triggerLoading()) {
          <span class="flex items-center gap-1.5 text-ink-400">
            <i class="ti ti-loader-2 animate-spin text-xs" aria-hidden="true"></i>Loading…
          </span>
        } @else {
          @if (triggerIcon()) {
            <i
              class="ti shrink-0 text-[15px] text-ink-400"
              [class]="triggerIcon()"
              aria-hidden="true"
            ></i>
          }
          <span class="min-w-0 flex-1" [class.text-ink-400]="!count()">
            <span [class]="labelClass()">{{ triggerLabel() }}</span>
            @if (selectedOption()?.statusLabel && variant() !== 'pill') {
              <hh-status-pill size="xs" [tone]="selectedOption()!.statusTone ?? 'neutral'" class="mt-0.5">
                {{ selectedOption()!.statusLabel }}
              </hh-status-pill>
            }
          </span>
        }
        <span class="flex shrink-0 items-center gap-1.5">
          @if (multiple() && count() > 0) {
            <span
              class="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold leading-none text-white"
              >{{ count() }}</span
            >
          }
          <i
            class="ti ti-chevron-down text-ink-400 transition-transform"
            [class.text-base]="variant() === 'field' && !compact()"
            [class.text-sm]="variant() !== 'field' || compact()"
            [class.rotate-180]="open()"
          ></i>
        </span>
      </button>

      @if (open()) {
        <!-- Teleported to <body> on open (see the effect) so it escapes overflow/transform ancestors. -->
        <div #portal class="contents">
          <button
            type="button"
            class="fixed inset-0 z-[70] cursor-default bg-ink-900/20"
            aria-label="Close"
            (click)="close()"
          ></button>
          <div
            role="listbox"
            [class]="panelClass()"
            [style.top.px]="pos()?.top ?? null"
            [style.bottom.px]="pos()?.bottom ?? null"
            [style.left.px]="pos()?.left"
            [style.min-width.px]="variant() === 'field' ? pos()?.width : null"
          >
            @if (searchable()) {
              <div class="shrink-0 border-b border-ink-100 px-3 py-2">
                <div class="flex items-center gap-2">
                  <i class="ti ti-search shrink-0 text-sm text-ink-400" aria-hidden="true"></i>
                  <input
                    type="text"
                    [placeholder]="searchPlaceholder()"
                    class="flex-1 bg-transparent text-sm text-ink-800 outline-none placeholder:text-ink-400"
                    [value]="searchQuery()"
                    (input)="onSearch($event)"
                    (click)="$event.stopPropagation()"
                    (keydown)="$event.stopPropagation()"
                  />
                </div>
              </div>
            }

            <div class="flex-1 overflow-y-auto p-1.5" (scroll)="onPanelScroll($event)">
              @if (clearLabel() && !multiple()) {
                <button
                  type="button"
                  role="option"
                  [attr.aria-selected]="count() === 0"
                  (click)="clear()"
                  class="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition"
                  [class]="count() === 0 ? 'bg-brand-50 font-medium text-brand-700 hover:bg-brand-100' : 'text-ink-700 hover:bg-ink-50'"
                >
                  {{ clearLabel() }}
                </button>
              }

              @if (loading() && options().length === 0) {
                <div class="flex flex-col gap-1">
                  @for (_ of loadingRows; track $index) {
                    <div class="h-8 animate-pulse rounded-lg bg-ink-100"></div>
                  }
                </div>
              } @else if (options().length === 0) {
                <p class="py-5 text-center text-sm text-ink-400">{{ emptyLabel() }}</p>
              } @else {
                @for (o of options(); track o.value; let i = $index) {
                  @if (o.group && o.group !== options()[i - 1]?.group) {
                    <p class="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-400 first:pt-1">{{ o.group }}</p>
                  }
                  <button
                    type="button"
                    role="option"
                    [attr.aria-selected]="isSelected(o.value)"
                    (click)="select(o.value)"
                    [disabled]="o.disabled"
                    class="flex w-full gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition"
                    [class]="optionClass(o)"
                  >
                    @if (multiple()) {
                      <span
                        class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition"
                        [class]="
                          isSelected(o.value)
                            ? 'border-brand-500 bg-brand-500 text-white'
                            : 'border-ink-300'
                        "
                      >
                        @if (isSelected(o.value)) {
                          <i class="ti ti-check text-[13px]"></i>
                        }
                      </span>
                    }
                    @if (o.icon) {
                      <i class="ti mt-0.5 shrink-0 text-base text-ink-400" [class]="o.icon"></i>
                    }

                    @if (o.subtitle || o.statusLabel || o.suffixBadge) {
                      <!-- Rich multi-line option -->
                      <span class="min-w-0 flex-1">
                        <span class="flex items-center gap-2">
                          <span class="truncate">{{ o.label }}</span>
                          @if (o.statusLabel) {
                            <hh-status-pill size="xs" [tone]="o.statusTone ?? 'neutral'" class="shrink-0">
                              {{ o.statusLabel }}
                            </hh-status-pill>
                          }
                        </span>
                        @if (o.subtitle || o.suffixBadge) {
                          <span class="mt-0.5 flex items-center gap-1.5">
                            @if (o.subtitle) {
                              <span class="truncate text-xs text-ink-400">{{ o.subtitle }}</span>
                            }
                            @if (o.suffixBadge) {
                              <span
                                class="inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-[10px] font-medium"
                                [class]="o.suffixBadgeClass ?? ''"
                              >{{ o.suffixBadge }}</span>
                            }
                          </span>
                        }
                      </span>
                    } @else {
                      <!-- Simple single-line option. min-w-0 + truncate so a long label (or
                           the disabled reason beside it) can never force the row wider than
                           the panel, which previously spawned a stray horizontal scrollbar. -->
                      <span class="min-w-0 flex-1 truncate">{{ o.label }}</span>
                    }

                    @if (o.badge) {
                      <span class="shrink-0 rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-400">{{ o.badge }}</span>
                    }
                    @if (o.disabledTooltip) {
                      <!-- Reason this option can't be picked. Rendered inline, not as a hover
                           tooltip: a floating tooltip can't escape the list's overflow-y-auto
                           (it must clip to scroll) so it was always cut off, and a disabled
                           <button> swallows pointer events on its children, so the hover often
                           never fired anyway. Inline text is un-clippable and touch-friendly. -->
                      <span class="ml-auto shrink-0 self-center whitespace-nowrap text-[11px] text-ink-400">{{ o.disabledTooltip }}</span>
                    }
                  </button>
                }
                @if (loading()) {
                  <div class="flex justify-center py-2">
                    <i class="ti ti-loader-2 animate-spin text-sm text-ink-400" aria-hidden="true"></i>
                  </div>
                }
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class Dropdown {
  readonly options = input<DropdownOption[]>([]);
  readonly multiple = input(false);
  readonly placeholder = input('Select');
  /** Single-select only: label for a top row that clears the selection (e.g. "All stays"). */
  readonly clearLabel = input('');
  readonly variant = input<'pill' | 'field' | 'borderless'>('pill');
  readonly align = input<'left' | 'right'>('left');
  /** `'neutral'` keeps the pill grey even when a value is selected; `'auto'` (default) brand-tints when active. */
  readonly tone = input<'auto' | 'neutral'>('auto');
  /** Borderless, transparent trigger — for sitting inside a shared bordered container (grouped search). */
  readonly seamless = input(false);
  /** Tighter padding + smaller font for field dropdowns embedded inside cards or table cells. */
  readonly compact = input(false);
  /** Icon class (e.g. `'ti-building-community'`) shown at the start of the trigger button. */
  readonly triggerIcon = input('');
  /** Open the panel to the RIGHT of the trigger instead of below — use for sidebar / nav pickers. */
  readonly openRight = input(false);

  // Async / searchable mode
  readonly searchable = input(false);
  readonly searchPlaceholder = input('Search…');
  readonly loading = input(false);
  readonly hasMore = input(false);
  readonly emptyLabel = input('No options found.');

  readonly value = model<string | string[] | null>(null);

  readonly searchChange = output<string>();
  readonly loadMore = output<void>();
  readonly opened = output<void>();

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly portal = viewChild<ElementRef<HTMLElement>>('portal');
  private portalEl: HTMLElement | null = null;

  protected readonly open = signal(false);
  protected readonly searchQuery = signal('');
  protected readonly loadingRows = [1, 2, 3];

  protected readonly pos = signal<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
  } | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.detachListeners();
      this.portalEl?.remove();
    });
    effect(() => {
      const el = this.portal()?.nativeElement;
      if (el && typeof document !== 'undefined' && el.parentNode !== document.body) {
        document.body.appendChild(el);
        this.portalEl = el;
      }
    });
    inject(Router).events
      .pipe(filter((e) => e instanceof NavigationStart), takeUntilDestroyed())
      .subscribe(() => this.close());
  }

  private readonly reposition = (): void => {
    const btn = this.host.nativeElement.querySelector(
      'button[aria-haspopup]',
    ) as HTMLElement | null;
    if (!btn || typeof window === 'undefined') return;
    const r = btn.getBoundingClientRect();

    if (this.openRight()) {
      this.pos.set({
        top: undefined,
        bottom: window.innerHeight - r.bottom,
        left: r.right + 8,
        width: r.width,
      });
      return;
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const GAP = 8;
    const PANEL_H = 288; // max-h-72

    // Horizontal: measure rendered panel width, then clamp to viewport
    const panelEl = this.portal()?.nativeElement?.querySelector<HTMLElement>('[role="listbox"]');
    const panelW = panelEl ? panelEl.offsetWidth
      : (this.variant() === 'field' ? r.width : 208);
    let left = this.variant() === 'pill' && this.align() === 'right'
      ? r.right - panelW
      : r.left;
    if (left + panelW > vw - GAP) left = r.right - panelW;
    left = Math.max(GAP, Math.min(left, vw - panelW - GAP));

    // Vertical: open below by default, flip above when space is tighter below than above
    const spaceBelow = vh - r.bottom - GAP;
    const spaceAbove = r.top - GAP;
    if (spaceBelow < PANEL_H && spaceAbove > spaceBelow) {
      this.pos.set({ top: undefined, bottom: vh - r.top + GAP, left, width: r.width });
    } else {
      this.pos.set({ top: r.bottom + GAP, bottom: undefined, left, width: r.width });
    }
  };

  private attachListeners(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('scroll', this.reposition, true);
    window.addEventListener('resize', this.reposition);
  }

  private detachListeners(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('scroll', this.reposition, true);
    window.removeEventListener('resize', this.reposition);
  }

  private readonly opts = computed(() => this.options() ?? []);

  private readonly selected = computed<string[]>(() => {
    const v = this.value();
    if (Array.isArray(v)) return v;
    return v ? [v] : [];
  });
  protected readonly count = computed(() => this.selected().length);
  protected readonly active = computed(() => this.count() > 0);

  protected readonly selectedOption = computed<DropdownOption | null>(() => {
    const sel = this.selected();
    if (!sel.length || this.multiple()) return null;
    return this.opts().find((o) => o.value === sel[0]) ?? null;
  });

  protected readonly triggerLabel = computed(() => {
    const sel = this.selected();
    if (this.multiple() || !sel.length) return this.placeholder();
    return this.opts().find((o) => o.value === sel[0])?.label ?? this.placeholder();
  });

  protected readonly triggerLoading = computed(() => {
    if (!this.loading()) return false;
    const v = this.value();
    if (!v || Array.isArray(v)) return false;
    return !this.opts().find((o) => o.value === v);
  });

  protected readonly triggerClass = computed(() => {
    const base =
      'inline-flex cursor-pointer select-none items-center gap-2 border font-medium text-left ' +
      'transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300';

    if (this.variant() === 'field') {
      const size = this.compact()
        ? 'h-8 rounded-lg px-2.5 text-[11px]'
        : 'rounded-xl px-4 py-3 text-sm';
      return `${base} w-full justify-between whitespace-nowrap border-ink-200 bg-white ${size} text-ink-800 hover:border-ink-400 focus-visible:border-ink-400`;
    }

    if (this.variant() === 'borderless') {
      return `${base} w-full justify-between !border-transparent bg-transparent rounded-xl px-3 py-2 text-sm text-ink-800 hover:bg-surface`;
    }

    if (this.seamless()) {
      return `${base} h-8 whitespace-nowrap rounded-full !border-0 bg-transparent pl-3.5 pr-2 text-[13px] text-ink-800 hover:text-ink-900`;
    }

    const tone =
      this.tone() === 'auto' && this.active()
        ? 'border-brand-500 bg-brand-50 text-brand-700'
        : 'border-ink-300 text-ink-800 hover:border-ink-400';
    return `${base} h-8 whitespace-nowrap rounded-full bg-white pl-3 pr-2.5 text-[13px] ${tone}`;
  });

  protected readonly labelClass = computed(() => {
    if (this.variant() === 'field' && !this.count()) return 'truncate text-ink-400';
    if (this.variant() === 'borderless' && !this.count()) return 'block truncate text-sm text-ink-400';
    if (this.variant() === 'borderless') return 'block truncate text-sm font-medium text-ink-800';
    return 'truncate';
  });

  protected readonly panelClass = computed(() => {
    const base =
      'fixed z-[71] flex flex-col max-h-72 max-w-[calc(100vw-1rem)] overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-pill';
    if (this.variant() === 'field') return base;
    const minW = this.openRight() || this.variant() === 'borderless' ? 'min-w-[18rem]' : 'min-w-[13rem]';
    return `${base} ${minW}`;
  });

  protected optionClass(o: DropdownOption): string {
    const align = o.subtitle || o.statusLabel || o.suffixBadge ? 'items-start' : 'items-center';
    if (o.disabled) return `cursor-not-allowed text-ink-300 ${align}`;
    return `${this.isSelected(o.value) ? 'bg-brand-50 hover:bg-brand-100 font-medium text-brand-700' : 'hover:bg-ink-50 text-ink-700'} ${align}`;
  }

  protected isSelected(v: string): boolean {
    return this.selected().includes(v);
  }

  protected toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    if (this.searchQuery()) {
      this.searchQuery.set('');
      this.searchChange.emit('');
    }
    this.reposition();
    this.open.set(true);
    this.attachListeners();
    this.opened.emit();
  }

  protected close(): void {
    this.open.set(false);
    this.detachListeners();
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    const target = event.target as Node;
    if (this.host.nativeElement.contains(target)) return;
    const portalEl = this.portal()?.nativeElement;
    if (portalEl?.contains(target)) return;
    this.close();
  }

  protected clear(): void {
    this.value.set(this.multiple() ? [] : null);
    this.close();
  }

  protected select(v: string): void {
    if (this.multiple()) {
      const set = new Set(this.selected());
      if (set.has(v)) set.delete(v);
      else set.add(v);
      this.value.set([...set]);
    } else {
      this.value.set(v);
      this.close();
    }
  }

  protected onSearch(event: Event): void {
    const q = (event.target as HTMLInputElement).value;
    this.searchQuery.set(q);
    this.searchChange.emit(q);
  }

  protected onPanelScroll(event: Event): void {
    if (!this.hasMore() || this.loading()) return;
    const el = event.target as HTMLElement;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
      this.loadMore.emit();
    }
  }
}
