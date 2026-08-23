import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  Injector,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';
import { StatusPill } from '../status-pill/status-pill';
import type { StatusTone } from '../status-pill/status-pill';

/** Distance between the trigger and the panel, and the panel's minimum inset from the viewport. */
const GAP = 6;

/** Matches the panel's `max-h-72`. The panel never wants to be taller than this. */
const PANEL_MAX_H = 288;

/**
 * Floor for the clamped height.
 *
 * In a viewport too short for even this, a panel sized to the literal space left would be a
 * sliver nobody can use. Better to keep it usable and let it overhang slightly — the list
 * scrolls, so every option is still reachable either way.
 */
const PANEL_MIN_H = 120;

export interface DropdownOption {
  value: string;
  label: string;
  icon?: string;
  /**
   * An image to sit where {@link icon} would — a flag, an avatar, a brand mark.
   *
   * Separate from `icon` rather than overloading it: that one is a Tabler class name
   * rendered into `<i class="ti …">`, so handing it a URL silently produces an empty
   * glyph. Both may be set; the image follows the icon.
   *
   * Decorative by construction — `alt=""` and `aria-hidden` — so the option is still
   * announced by its `label` alone. Anything the reader actually needs belongs there.
   */
  iconUrl?: string;
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
 * Field heights, named to match `InputSize` so one scale covers the library.
 *
 * `md` is the 42px form control — the box `hh-input` and `hh-money-input` render at, so a
 * dropdown lines up with the fields beside it. `sm` is the 32px inline variant.
 */
export type DropdownSize = 'sm' | 'md';

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
  imports: [StatusPill, TranslocoPipe],
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
        [disabled]="disabled()"
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
          <!-- The selected option's own mark, echoed into the trigger. Without this a language
               picker showed its flag in the open panel and then collapsed to bare text once
               chosen, which reads as the flag having been lost. selectedOption() is already
               null for multi-select, where one option's mark would misrepresent the rest. -->
          @if (selectedOption(); as sel) {
            @if (sel.icon) {
              <i class="ti shrink-0 text-[15px] text-ink-400" [class]="sel.icon" aria-hidden="true"></i>
            }
            @if (sel.iconUrl) {
              <img
                [src]="sel.iconUrl"
                alt=""
                aria-hidden="true"
                class="h-[15px] w-5 shrink-0 rounded-[2px] object-cover"
              />
            }
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
            class="ti ti-chevron-down transition-transform"
            [class.text-brand-700]="chevronBrand()"
            [class.text-ink-400]="!chevronBrand()"
            [class.text-base]="variant() === 'field' && !isSm()"
            [class.text-sm]="variant() !== 'field' || isSm()"
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
            [attr.aria-label]="'a11y.close' | transloco"
            (click)="close()"
          ></button>
          <div
            role="listbox"
            [class]="panelClass()"
            [style.top.px]="pos()?.top ?? null"
            [style.bottom.px]="pos()?.bottom ?? null"
            [style.left.px]="pos()?.left"
            [style.max-height.px]="pos()?.maxHeight ?? null"
            [style.min-width.px]="variant() === 'field' ? pos()?.width : null"
          >
            @if (searchable()) {
              <div class="shrink-0 border-b border-ink-100 px-3 py-2">
                <div class="flex items-center gap-2">
                  <i class="ti ti-search shrink-0 text-sm text-ink-400" aria-hidden="true"></i>
                  <input
                    type="text"
                    [placeholder]="searchPlaceholder() ?? ('common.searchEllipsis' | transloco)"
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
                  class="flex w-full items-center rounded-lg px-3 py-2 text-start text-sm transition"
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
                <p class="py-5 text-center text-sm text-ink-400">{{ emptyLabel() ?? ('common.noOptionsFound' | transloco) }}</p>
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
                    class="flex w-full gap-2.5 rounded-lg px-3 py-2 text-start text-sm transition"
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
                    @if (o.iconUrl) {
                      <img
                        [src]="o.iconUrl"
                        alt=""
                        aria-hidden="true"
                        loading="lazy"
                        class="mt-0.5 h-[15px] w-5 shrink-0 rounded-[2px] object-cover"
                      />
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
                      <span class="ms-auto shrink-0 self-center whitespace-nowrap text-[11px] text-ink-400">{{ o.disabledTooltip }}</span>
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
  readonly placeholder = input<string | undefined>(undefined);
  /** Single-select only: label for a top row that clears the selection (e.g. "All stays"). */
  readonly clearLabel = input('');
  readonly variant = input<'pill' | 'field' | 'borderless'>('pill');
  /**
   * Which surface the trigger sits on.
   *
   * Not the same thing as `color="dark"` on the button, which means a dark-*coloured*
   * control: on a dark background that renders dark text on dark, or a fill the same shade
   * as what is behind it. This says where the control is, and the light styles invert to
   * suit — currently for the pill, which is the variant that appears outside a form.
   *
   * The panel deliberately stays light either way: it is an overlay in front of the page,
   * not part of the surface the trigger is on, and a dark list of options over a dark
   * footer loses the edge that says where the list begins.
   */
  readonly surface = input<'light' | 'dark'>('light');
  readonly align = input<'left' | 'right'>('left');
  /** `'neutral'` keeps the pill grey even when a value is selected; `'auto'` (default) brand-tints when active. */
  readonly tone = input<'auto' | 'neutral'>('auto');
  /** Borderless, transparent trigger — for sitting inside a shared bordered container (grouped search). */
  readonly seamless = input(false);
  /** Tighter padding + smaller font for field dropdowns embedded inside cards or table cells. */
  /**
   * Field height, on the same scale as every other control in the library.
   *
   * `md` is the 42px form field — the box `hh-input` and `hh-money-input` render at, so a
   * dropdown lines up with its neighbours. `sm` is the 32px inline variant.
   *
   * This replaced a `compact` boolean, which was the only sizing API in the library that was
   * not a `size`. It read as "a bit tighter" rather than naming a variant, which is part of
   * why nobody noticed its default was rendering four pixels taller than everything beside it.
   */
  readonly size = input<DropdownSize>('md');

  /** The 32px inline variant. Named once here so the templates read as one idea. */
  protected readonly isSm = computed(() => this.size() === 'sm');
  /** Icon class (e.g. `'ti-building-community'`) shown at the start of the trigger button. */
  readonly triggerIcon = input('');
  /** Open the panel to the RIGHT of the trigger instead of below — use for sidebar / nav pickers. */
  readonly openRight = input(false);
  /**
   * Locks the trigger. The selected value still renders — this is for a choice that is
   * already made and not the user's to change (e.g. the expense type when the form was
   * opened from the mess page), not for hiding it.
   */
  readonly disabled = input(false);

  // Async / searchable mode
  readonly searchable = input(false);
  readonly searchPlaceholder = input<string | undefined>(undefined);
  readonly loading = input(false);
  readonly hasMore = input(false);
  readonly emptyLabel = input<string | undefined>(undefined);

  readonly value = model<string | string[] | null>(null);

  readonly searchChange = output<string>();
  readonly loadMore = output<void>();
  readonly opened = output<void>();


  private readonly i18n = inject(TranslocoService);
  /** Re-runs dependent computeds when the active language changes. */
  private readonly lang = toSignal(this.i18n.langChanges$, {
    initialValue: this.i18n.getActiveLang(),
  });
  protected t(key: string): string {
    this.lang();
    return this.i18n.translate(key);
  }

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly portal = viewChild<ElementRef<HTMLElement>>('portal');
  private portalEl: HTMLElement | null = null;

  protected readonly open = signal(false);
  protected readonly searchQuery = signal('');
  private readonly injector = inject(Injector);

  protected readonly loadingRows = [1, 2, 3];

  protected readonly pos = signal<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    /** Clamped to the space on the chosen side, so the panel can never run off-screen. */
    maxHeight?: number;
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

  /**
   * Writes a position only when it actually differs.
   *
   * `pos` holds an object literal, so every `set` is a change as far as signals are
   * concerned, and every change re-renders the panel. That matters because `reposition`
   * runs from a capture-phase `scroll` listener, which the panel's *own* internal scrolling
   * also triggers: re-rendering it there fed straight back into another scroll event, and
   * the two chased each other until the tab locked up with no error and no network traffic.
   * Comparing first breaks the cycle at its source; the coalescing below is the second belt.
   */
  private setPos(next: NonNullable<ReturnType<typeof this.pos>>): void {
    const cur = this.pos();
    if (
      cur &&
      cur.top === next.top &&
      cur.bottom === next.bottom &&
      cur.left === next.left &&
      cur.width === next.width &&
      cur.maxHeight === next.maxHeight
    ) {
      return;
    }
    this.pos.set(next);
  }

  /** Set while a measure is already queued, so a burst of scroll events costs one frame. */
  private repositionQueued = false;

  private readonly reposition = (): void => {
    if (typeof window === 'undefined' || this.repositionQueued) return;
    this.repositionQueued = true;
    requestAnimationFrame(() => {
      this.repositionQueued = false;
      if (this.open()) this.measure();
    });
  };

  private measure(): void {
    const btn = this.host.nativeElement.querySelector(
      'button[aria-haspopup]',
    ) as HTMLElement | null;
    if (!btn || typeof window === 'undefined') return;
    const r = btn.getBoundingClientRect();

    // The layout viewport, not the window.
    //
    // `innerWidth` counts the vertical scrollbar, so clamping to it lets the panel sit
    // partly underneath one — which is horizontal overflow, which raises a *horizontal*
    // scrollbar, which fires `resize`, which repositions, which removes the overflow, which
    // fires `resize` again. Opening a dropdown near the bottom of a long page span that
    // loop at one frame apiece and the tab stops responding, with nothing logged.
    // `clientWidth` excludes both scrollbars, so a panel clamped to it cannot cause one.
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    if (this.openRight()) {
      this.setPos({
        top: undefined,
        bottom: vh - r.bottom,
        left: r.right + GAP,
        width: r.width,
        maxHeight: Math.min(PANEL_MAX_H, vh - GAP * 2),
      });
      return;
    }

    // Horizontal: measure rendered panel width, then clamp to viewport
    const panelEl = this.portal()?.nativeElement?.querySelector<HTMLElement>('[role="listbox"]');
    const panelW = panelEl ? panelEl.offsetWidth
      : (this.variant() === 'field' ? r.width : 208);
    let left = this.variant() === 'pill' && this.align() === 'right'
      ? r.right - panelW
      : r.left;
    if (left + panelW > vw - GAP) left = r.right - panelW;
    left = Math.max(GAP, Math.min(left, vw - panelW - GAP));

    // Vertical: open below by default, flip above when space is tighter below than above.
    //
    // Whichever side wins, the panel is then capped to that side's space. Picking a side was
    // never enough on its own: with, say, 200px below and 180px above, below wins and the
    // panel still rendered its full height — so the last ~90px hung past the viewport edge,
    // unreachable, because the panel scrolls internally rather than the page scrolling to it.
    const spaceBelow = vh - r.bottom - GAP * 2;
    const spaceAbove = r.top - GAP * 2;
    const openUp = spaceBelow < PANEL_MAX_H && spaceAbove > spaceBelow;
    const maxHeight = Math.min(PANEL_MAX_H, Math.max(openUp ? spaceAbove : spaceBelow, PANEL_MIN_H));

    if (openUp) {
      this.setPos({ top: undefined, bottom: vh - r.top + GAP, left, width: r.width, maxHeight });
    } else {
      this.setPos({ top: r.bottom + GAP, bottom: undefined, left, width: r.width, maxHeight });
    }
  }

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
    const fallback = () => this.placeholder() ?? this.t('common.select');
    const sel = this.selected();
    if (this.multiple() || !sel.length) return fallback();
    return this.opts().find((o) => o.value === sel[0])?.label ?? fallback();
  });

  protected readonly triggerLoading = computed(() => {
    if (!this.loading()) return false;
    const v = this.value();
    if (!v || Array.isArray(v)) return false;
    return !this.opts().find((o) => o.value === v);
  });

  protected readonly triggerClass = computed(() => {
    const base =
      'inline-flex select-none items-center gap-2 border font-medium text-start ' +
      'transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ' +
      (this.disabled()
        ? 'cursor-not-allowed bg-ink-50 text-ink-500 opacity-70'
        : 'cursor-pointer');

    if (this.variant() === 'field') {
      // `py-2.5 px-3` is the 42px form control — the same box `hh-input` and `hh-money-input`
      // render at their default `md`. This used to be `py-3 px-4`, which is precisely the
      // input's `lg`: 46px, four taller than every field it sits beside, in nine forms.
      const size = this.isSm()
        ? 'h-8 rounded-lg px-2.5 text-[11px]'
        : 'rounded-xl px-3 py-2.5 text-sm';
      return `${base} w-full justify-between whitespace-nowrap border-ink-200 bg-white ${size} text-ink-800 hover:border-ink-400 focus-visible:border-ink-400`;
    }

    if (this.variant() === 'borderless') {
      return `${base} w-full justify-between !border-transparent bg-transparent rounded-xl px-3 py-2 text-sm text-ink-800 hover:bg-surface`;
    }

    if (this.seamless()) {
      return `${base} h-8 whitespace-nowrap rounded-full !border-0 bg-transparent ps-3.5 pe-2 text-[13px] text-ink-800 hover:text-ink-900`;
    }

    const pill = `${base} h-8 whitespace-nowrap rounded-full ps-3 pe-2.5 text-[13px]`;

    if (this.surface() === 'dark') {
      // One calm treatment rather than the light surface's active/inactive pair. A control
      // parked on a dark chrome — the footer's language and currency — always has a value,
      // so a brand tint for "something is selected" would just be its permanent colour, and
      // a near-white `brand-50` fill on `ink-900` shouts louder than anything around it.
      return `${pill} border-ink-600 bg-transparent text-ink-200 hover:border-ink-400 hover:text-white`;
    }

    const tone =
      this.tone() === 'auto' && this.active()
        ? 'border-brand-500 bg-brand-50 text-brand-700'
        : 'border-ink-300 text-ink-800 hover:border-ink-400';
    return `${pill} bg-white ${tone}`;
  });

  /**
   * The chevron matches the trigger's brand tint only in the one state where the trigger
   * itself turns brand: an active (value-selected) auto-toned pill. Field, borderless,
   * seamless and inactive triggers keep the subtle ink-400 chevron.
   */
  protected readonly chevronBrand = computed(
    () =>
      this.variant() === 'pill' &&
      // The dark pill has no brand state for the chevron to echo.
      this.surface() === 'light' &&
      !this.seamless() &&
      this.tone() === 'auto' &&
      this.active(),
  );

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
    if (this.disabled()) return;
    if (this.open()) {
      this.close();
      return;
    }
    if (this.searchQuery()) {
      this.searchQuery.set('');
      this.searchChange.emit('');
    }
    // Placed synchronously, unlike the scroll/resize path: the panel has to be positioned
    // before its first paint or it flashes at the wrong spot on the way to the right one.
    this.measure();
    this.open.set(true);
    this.attachListeners();
    // The first measure runs before the panel exists, so the width measurement above falls
    // back to an estimate and the horizontal clamp works off that. Measure again now that it
    // is in the DOM, or a panel wider than its trigger stays overflowing the viewport edge.
    afterNextRender(() => this.measure(), { injector: this.injector });
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
