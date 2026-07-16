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
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';

export interface NestedDropdownGroup {
  value: string;
  label: string;
  items: { value: string; label: string }[];
}

/** Selected filter — `group` is the status slug, `item` (optional) is the disposition slug. */
export type NestedDropdownValue = { group: string; item?: string } | null;

/**
 * Grouped two-level dropdown — top-level groups (statuses) with indented sub-items
 * (dispositions). Selecting a group header filters by that status; selecting an item
 * filters by that specific disposition within the group.
 *
 * The open panel is teleported to `<body>` so it is never clipped by overflow ancestors.
 *
 * `<hh-nested-dropdown [groups]="groups()" placeholder="All statuses"
 *   [value]="filterValue()" (valueChange)="filterValue.set($event)" />`
 */
@Component({
  selector: 'hh-nested-dropdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative inline-block">
      <button
        type="button"
        (click)="toggle()"
        aria-haspopup="listbox"
        [attr.aria-expanded]="open()"
        [class]="triggerClass()"
      >
        <span class="truncate">{{ triggerLabel() }}</span>
        <i
          class="ti ti-chevron-down text-sm transition-transform"
          [class.rotate-180]="open()"
          [class.text-brand-400]="active()"
          [class.text-ink-400]="!active()"
        ></i>
      </button>

      @if (open()) {
        <div #portal class="contents">
          <!-- Backdrop -->
          <button
            type="button"
            class="fixed inset-0 z-[70] cursor-default bg-ink-900/20"
            aria-label="Close"
            (click)="close()"
          ></button>
          <!-- Panel -->
          <div
            role="listbox"
            class="fixed z-[71] max-h-80 w-56 overflow-auto rounded-2xl border border-ink-100 bg-white p-1.5 shadow-pill"
            [style.top.px]="pos()?.top ?? null"
            [style.bottom.px]="pos()?.bottom ?? null"
            [style.left.px]="pos()?.left"
          >
            <!-- Clear / "All" row -->
            <button
              type="button"
              role="option"
              [attr.aria-selected]="!value()"
              (click)="selectClear()"
              class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-ink-50"
              [class]="!value() ? 'font-medium text-brand-700' : 'text-ink-700'"
            >
              <span class="grid h-5 w-5 shrink-0 place-items-center">
                @if (!value()) {
                  <i class="ti ti-check text-brand-500"></i>
                }
              </span>
              {{ clearLabel() }}
            </button>

            <div class="my-1 border-t border-ink-100"></div>

            @for (g of groups(); track g.value) {
              <!-- Status group header -->
              <button
                type="button"
                role="option"
                [attr.aria-selected]="isGroupOnly(g.value)"
                (click)="selectGroup(g.value)"
                class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition hover:bg-ink-50"
                [class]="isGroupActive(g.value) ? 'text-brand-700' : 'text-ink-800'"
              >
                <span class="grid h-5 w-5 shrink-0 place-items-center">
                  @if (isGroupOnly(g.value)) {
                    <i class="ti ti-check text-brand-500"></i>
                  }
                </span>
                {{ g.label }}
              </button>

              <!-- Disposition items (indented) -->
              @for (item of g.items; track item.value) {
                <button
                  type="button"
                  role="option"
                  [attr.aria-selected]="isItemSelected(g.value, item.value)"
                  (click)="selectItem(g.value, item.value)"
                  class="flex w-full items-center gap-2 rounded-lg py-1.5 pl-9 pr-3 text-left text-sm transition hover:bg-ink-50"
                  [class]="
                    isItemSelected(g.value, item.value)
                      ? 'font-medium text-brand-700'
                      : 'text-ink-500'
                  "
                >
                  <span class="grid h-4 w-4 shrink-0 place-items-center">
                    @if (isItemSelected(g.value, item.value)) {
                      <i class="ti ti-check text-[11px] text-brand-500"></i>
                    }
                  </span>
                  {{ item.label }}
                </button>
              }
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class NestedDropdown {
  readonly groups = input<NestedDropdownGroup[]>([]);
  readonly placeholder = input('All');
  readonly clearLabel = input('All');
  readonly value = model<NestedDropdownValue>(null);

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly portal = viewChild<ElementRef<HTMLElement>>('portal');

  protected readonly open = signal(false);
  protected readonly pos = signal<{ top?: number; bottom?: number; left: number } | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.detachListeners());
    effect(() => {
      const el = this.portal()?.nativeElement;
      if (el && typeof document !== 'undefined' && el.parentNode !== document.body) {
        document.body.appendChild(el);
      }
    });
    inject(Router).events
      .pipe(filter((e) => e instanceof NavigationStart), takeUntilDestroyed())
      .subscribe(() => this.close());
  }

  protected readonly active = computed(() => !!this.value());

  protected readonly triggerLabel = computed(() => {
    const v = this.value();
    if (!v) return this.placeholder();
    if (v.item) {
      const group = this.groups().find((g) => g.value === v.group);
      return group?.items.find((i) => i.value === v.item)?.label ?? v.item;
    }
    return this.groups().find((g) => g.value === v.group)?.label ?? v.group;
  });

  protected readonly triggerClass = computed(() => {
    const base =
      'inline-flex h-9 cursor-pointer select-none items-center gap-1.5 whitespace-nowrap rounded-full border font-medium ' +
      'transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 pl-3 pr-2.5 text-[13px]';
    return this.active()
      ? `${base} border-brand-500 bg-brand-50 text-brand-700`
      : `${base} border-ink-300 bg-white text-ink-800 hover:border-ink-400`;
  });

  protected isGroupActive(groupValue: string): boolean {
    return this.value()?.group === groupValue;
  }

  protected isGroupOnly(groupValue: string): boolean {
    const v = this.value();
    return v?.group === groupValue && !v.item;
  }

  protected isItemSelected(groupValue: string, itemValue: string): boolean {
    const v = this.value();
    return v?.group === groupValue && v.item === itemValue;
  }

  protected selectClear(): void {
    this.value.set(null);
    this.close();
  }

  protected selectGroup(groupValue: string): void {
    this.value.set({ group: groupValue });
    this.close();
  }

  protected selectItem(groupValue: string, itemValue: string): void {
    this.value.set({ group: groupValue, item: itemValue });
    this.close();
  }

  protected toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    this.reposition();
    this.open.set(true);
    this.attachListeners();
  }

  protected close(): void {
    this.open.set(false);
    this.detachListeners();
  }

  private readonly reposition = (): void => {
    const btn = this.host.nativeElement.querySelector(
      'button[aria-haspopup]',
    ) as HTMLElement | null;
    if (!btn || typeof window === 'undefined') return;
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const GAP = 8;
    const PANEL_W = 224; // w-56
    const PANEL_H = 320; // max-h-80

    // Horizontal: clamp so the panel doesn't overflow either viewport edge
    let left = r.left;
    if (left + PANEL_W > vw - GAP) left = r.right - PANEL_W;
    left = Math.max(GAP, Math.min(left, vw - PANEL_W - GAP));

    // Vertical: open below by default, flip above when space is tighter below than above
    const spaceBelow = vh - r.bottom - GAP;
    const spaceAbove = r.top - GAP;
    if (spaceBelow < PANEL_H && spaceAbove > spaceBelow) {
      this.pos.set({ top: undefined, bottom: vh - r.top + GAP, left });
    } else {
      this.pos.set({ top: r.bottom + GAP, bottom: undefined, left });
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
}
