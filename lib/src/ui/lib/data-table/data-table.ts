import { DecimalPipe } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button } from '../button/button';
import { HhLink } from '../link/link';
import { StatusPill } from '../status-pill/status-pill';
import { NoResults } from '../states/no-results';

// ---------------------------------------------------------------------------
// Cell descriptor types — parent computes these; component renders them
// ---------------------------------------------------------------------------

export interface CellText {
  kind: 'text';
  value: string;
  class?: string;
}

export interface CellCurrency {
  kind: 'currency';
  amount: number;
  prefix?: string;     // default 'Rs '
  class?: string;      // applied when amount != 0 (or when no zeroText)
  zeroText?: string;   // show this instead of the amount when amount === 0
  zeroClass?: string;  // class for zeroText (default 'text-xs text-ink-400')
}

export interface CellPill {
  kind: 'pill';
  text: string;
  tone: 'ok' | 'warn' | 'danger' | 'neutral';
}

export interface CellBadge {
  kind: 'badge';
  text: string;
  class: string;
}

export interface CellIconText {
  kind: 'icon-text';
  icon: string;  // tabler icon class e.g. 'ti-bolt'
  text: string;
}

export interface CellComposite {
  kind: 'composite';
  primary: string;
  secondary?: string;
}

export interface CellLink {
  kind: 'link';
  value: string;
  href: string;
  class?: string;
  /** When true, renders a plain <a href> instead of routerLink (for external URLs). */
  external?: boolean;
}

export type CellDef =
  | CellText
  | CellCurrency
  | CellPill
  | CellBadge
  | CellIconText
  | CellComposite
  | CellLink;

// ---------------------------------------------------------------------------
// Table configuration types
// ---------------------------------------------------------------------------

export interface SortState {
  key: string;
  dir: 'asc' | 'desc';
}

export interface ColumnDef {
  key: string;
  label: string;
  align?: 'left' | 'right';
  sortable?: boolean;
  sticky?: boolean;
  cell: (row: unknown) => CellDef;
}

export interface SubColumnDef {
  label: string;
  align?: 'left' | 'right';
  cell: (subRow: unknown) => CellDef;
}

export interface ExpandConfig {
  childRows: (row: unknown) => unknown[];
  childId: (sub: unknown) => string;
  childName: (sub: unknown) => string;
  /** How many parent columns the child-name cell spans (colspan). */
  nameColSpan: number;
  columns: SubColumnDef[];
}

export interface PaginationConfig {
  page: number;
  total: number;
  totalPages: number | null;
  hasNextPage: boolean;
  itemLabel: string; // 'bill', 'invoice', etc.
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

@Component({
  selector: 'hh-data-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RouterLink, Button, HhLink, StatusPill, NoResults],
  // Block-level host so vertical margins (e.g. a `space-y` parent's top margin) apply — an
  // inline host silently drops them, which is a subtle layout footgun for consumers.
  host: { class: 'block' },
  template: `
    <div class="rounded-2xl bg-white shadow-card">
      <div class="overflow-x-auto" #scrollWrap>
        <table class="w-full text-sm" [style.min-width]="minWidth()">

          <!-- Header -->
          <thead class="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400">
            <tr>
              @let activeSort = sort();
              @for (col of columns(); track col.key) {
                <th
                  class="whitespace-nowrap px-5 py-2.5 font-medium"
                  [class]="stickyTh(col)"
                  [class.text-right]="col.align === 'right' && !col.sortable"
                  [class.cursor-pointer]="col.sortable"
                  [class.select-none]="col.sortable"
                  (click)="headerClick(col)"
                >
                  @if (col.sticky && !atScrollEnd()) {
                    <div class="pointer-events-none absolute inset-y-0 right-full w-5 bg-gradient-to-r from-transparent to-black/[0.07]"></div>
                  }
                  @if (col.sortable) {
                    <span class="inline-flex items-center gap-1" [class.justify-end]="col.align === 'right'">
                      {{ col.label }}
                      @if (activeSort?.key === col.key) {
                        <i class="ti text-brand-500"
                          [class.ti-arrow-up]="activeSort!.dir === 'asc'"
                          [class.ti-arrow-down]="activeSort!.dir === 'desc'"
                        ></i>
                      } @else {
                        <i class="ti ti-arrows-sort text-ink-300"></i>
                      }
                    </span>
                  } @else {
                    {{ col.label }}
                  }
                </th>
              }
              @if (showActions()) {
                <th class="relative sticky right-0 bg-white px-5 py-2.5">
                  @if (!atScrollEnd()) {
                    <div class="pointer-events-none absolute inset-y-0 right-full w-5 bg-gradient-to-r from-transparent to-black/[0.07]"></div>
                  }
                </th>
              }
            </tr>
          </thead>

          <!-- Body -->
          <tbody class="divide-y divide-ink-100">

            @if (!rows().length) {
              <!-- No results (filtered state) -->
              <tr>
                <td [attr.colspan]="totalCols()">
                  <hh-no-results>
                    @if (clearable()) {
                      <button hh-button variant="outlined" size="sm" (click)="clearFilters.emit()">
                        <i class="ti ti-x" aria-hidden="true"></i>Clear filters
                      </button>
                    }
                  </hh-no-results>
                </td>
              </tr>

            } @else {

              @for (row of rows(); track getId(row)) {
                @let rid = getId(row);
                @let exp = expandable();
                @let subRows = exp ? exp.childRows(row) : [];
                @let expanded = isExpanded(rid);

                <!-- Main row -->
                <tr
                  class="group hover:bg-surface"
                  [class.cursor-pointer]="exp || hasRowClick()"
                  (click)="onRowClick(row, rid, subRows.length > 0)"
                >
                  @for (col of columns(); track col.key; let first = $first) {
                    @let cell = col.cell(row);
                    <td
                      class="whitespace-nowrap px-5 py-3"
                      [class]="stickyTd(col)"
                      [class.text-right]="col.align === 'right'"
                    >
                      @if (col.sticky && !atScrollEnd()) {
                        <div class="pointer-events-none absolute inset-y-0 right-full w-5 bg-gradient-to-r from-transparent to-black/[0.07]"></div>
                      }
                      @if (first && exp) {
                        <!-- Expandable first cell: chevron + composite content -->
                        <div class="flex items-center gap-2">
                          <i
                            class="ti text-ink-400 transition-transform"
                            [class.ti-chevron-down]="!expanded"
                            [class.ti-chevron-up]="expanded"
                          ></i>
                          <div>
                            @if (cell.kind === 'composite') {
                              <p class="font-medium text-ink-900">{{ $any(cell).primary }}</p>
                              @if ($any(cell).secondary) {
                                <p class="text-xs text-ink-400">{{ $any(cell).secondary }}</p>
                              }
                            } @else {
                              <span>{{ $any(cell).value ?? $any(cell).primary ?? $any(cell).text }}</span>
                            }
                          </div>
                        </div>
                      } @else {
                        <!-- Standard cell rendering -->
                        @switch (cell.kind) {

                          @case ('text') {
                            <span [class]="$any(cell).class">{{ $any(cell).value }}</span>
                          }

                          @case ('currency') {
                            @if ($any(cell).amount !== 0 || !$any(cell).zeroText) {
                              <span [class]="$any(cell).class">
                                {{ $any(cell).prefix ?? 'Rs ' }}{{ $any(cell).amount | number }}
                              </span>
                            } @else {
                              <span [class]="$any(cell).zeroClass ?? 'text-xs text-ink-400'">
                                {{ $any(cell).zeroText }}
                              </span>
                            }
                          }

                          @case ('pill') {
                            <hh-status-pill [tone]="$any(cell).tone">
                              {{ $any(cell).text }}
                            </hh-status-pill>
                          }

                          @case ('badge') {
                            <span [class]="$any(cell).class">{{ $any(cell).text }}</span>
                          }

                          @case ('icon-text') {
                            <span class="flex items-center gap-2 text-ink-700">
                              <i class="ti text-brand-500" [class]="$any(cell).icon"></i>
                              {{ $any(cell).text }}
                            </span>
                          }

                          @case ('composite') {
                            <div>
                              <p class="font-medium text-ink-900">{{ $any(cell).primary }}</p>
                              @if ($any(cell).secondary) {
                                <p class="text-xs text-ink-400">{{ $any(cell).secondary }}</p>
                              }
                            </div>
                          }

                          @case ('link') {
                            @if ($any(cell).external) {
                              <a
                                hhLink
                                [href]="$any(cell).href"
                                target="_blank"
                                rel="noopener noreferrer"
                                [class]="$any(cell).class"
                                (click)="$event.stopPropagation()"
                              >{{ $any(cell).value }}</a>
                            } @else {
                              <a
                                hhLink
                                [routerLink]="$any(cell).href"
                                [class]="$any(cell).class"
                                (click)="$event.stopPropagation()"
                              >{{ $any(cell).value }}</a>
                            }
                          }

                        }
                      }
                    </td>
                  }

                  @if (showActions()) {
                    <td
                      class="relative sticky right-0 bg-white px-5 py-3 text-right group-hover:bg-surface"
                      (click)="$event.stopPropagation()"
                    >
                      @if (!atScrollEnd()) {
                        <div class="pointer-events-none absolute inset-y-0 right-full w-5 bg-gradient-to-r from-transparent to-black/[0.07]"></div>
                      }
                      <button
                        hh-button
                        variant="icon"
                        size="sm"
                        type="button"
                        aria-label="Row actions"
                        [class.bg-ink-100]="actionActive()(row)"
                        [class.text-ink-700]="actionActive()(row)"
                        (click)="rowAction.emit({ row, event: $event })"
                      >
                        <i class="ti ti-dots-vertical"></i>
                      </button>
                    </td>
                  }
                </tr>

                <!-- Expanded child rows -->
                @if (exp && expanded && subRows.length) {

                  <!-- Child sub-header -->
                  <tr class="bg-surface">
                    <td
                      [attr.colspan]="exp.nameColSpan"
                      class="px-5 pb-1 pt-2 pl-14 text-[10px] font-medium uppercase tracking-wide text-ink-400"
                    >Tenant</td>
                    @for (sc of exp.columns; track sc.label; let scFirst = $first) {
                      <td
                        class="pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-ink-400"
                        [class.pr-5]="scFirst"
                        [class.px-5]="!scFirst"
                        [class.text-right]="sc.align === 'right'"
                      >{{ sc.label }}</td>
                    }
                    @if (showActions()) {
                      <td class="relative sticky right-0 bg-surface">
                        @if (!atScrollEnd()) {
                          <div class="pointer-events-none absolute inset-y-0 right-full w-5 bg-gradient-to-r from-transparent to-black/[0.07]"></div>
                        }
                      </td>
                    }
                  </tr>

                  <!-- Child data rows -->
                  @for (sub of subRows; track childId(sub)) {
                    <tr class="bg-surface border-t border-ink-100">
                      <td
                        [attr.colspan]="exp.nameColSpan"
                        class="whitespace-nowrap px-5 py-2.5 pl-14 text-sm text-ink-800"
                      >{{ exp.childName(sub) }}</td>

                      @for (sc of exp.columns; track sc.label; let scFirst = $first) {
                        @let scell = sc.cell(sub);
                        <td
                          class="whitespace-nowrap py-2.5 text-sm"
                          [class.pr-5]="scFirst"
                          [class.px-5]="!scFirst"
                          [class.text-right]="sc.align === 'right'"
                        >
                          @switch (scell.kind) {

                            @case ('text') {
                              <span [class]="$any(scell).class">{{ $any(scell).value }}</span>
                            }

                            @case ('currency') {
                              @if ($any(scell).amount !== 0 || !$any(scell).zeroText) {
                                <span [class]="$any(scell).class">
                                  {{ $any(scell).prefix ?? 'Rs ' }}{{ $any(scell).amount | number }}
                                </span>
                              } @else {
                                <span [class]="$any(scell).zeroClass ?? 'text-xs text-ink-400'">
                                  {{ $any(scell).zeroText }}
                                </span>
                              }
                            }

                            @case ('pill') {
                              <hh-status-pill [tone]="$any(scell).tone">{{ $any(scell).text }}</hh-status-pill>
                            }

                            @default {
                              <span>{{ $any(scell).value ?? $any(scell).text }}</span>
                            }

                          }
                        </td>
                      }

                      @if (showActions()) {
                        <td class="relative sticky right-0 bg-surface">
                          @if (!atScrollEnd()) {
                            <div class="pointer-events-none absolute inset-y-0 right-full w-5 bg-gradient-to-r from-transparent to-black/[0.07]"></div>
                          }
                        </td>
                      }
                    </tr>
                  }

                }

              }
            }

          </tbody>
        </table>
      </div>

      <!-- Pagination footer -->
      @if (pagination(); as pag) {
        <div class="flex items-center justify-between border-t border-ink-100 px-5 py-3">
          <p class="text-xs text-ink-400">
            @if (pag.total > 0) {
              {{ pag.total }} {{ pag.itemLabel }}{{ pag.total !== 1 ? 's' : '' }}
              · Page {{ pag.page }}{{ pag.totalPages ? ' of ' + pag.totalPages : '' }}
            } @else {
              Page {{ pag.page }}
            }
          </p>
          <div class="flex items-center gap-1">
            <button
              type="button"
              hh-button variant="icon" size="sm"
              [disabled]="pag.page === 1"
              (click)="pageChange.emit(1)"
              aria-label="First page"
            ><i class="ti ti-chevron-left-pipe text-sm"></i></button>
            <button
              type="button"
              hh-button variant="icon" size="sm"
              [disabled]="pag.page === 1"
              (click)="pageChange.emit(pag.page - 1)"
              aria-label="Previous page"
            ><i class="ti ti-chevrons-left text-sm"></i></button>
            <span class="min-w-[1.75rem] text-center text-sm font-medium text-ink-700">
              {{ pag.page }}
            </span>
            <button
              type="button"
              hh-button variant="icon" size="sm"
              [disabled]="!pag.hasNextPage"
              (click)="pageChange.emit(pag.page + 1)"
              aria-label="Next page"
            ><i class="ti ti-chevrons-right text-sm"></i></button>
            <button
              type="button"
              hh-button variant="icon" size="sm"
              [disabled]="!pag.hasNextPage"
              (click)="pageChange.emit(pag.totalPages ?? pag.page)"
              aria-label="Last page"
            ><i class="ti ti-chevron-right-pipe text-sm"></i></button>
          </div>
        </div>
      }

    </div>
  `,
})
export class DataTable implements AfterViewInit, OnDestroy {
  @ViewChild('scrollWrap') private readonly scrollWrap!: ElementRef<HTMLElement>;
  private scrollCleanup?: () => void;

  readonly columns      = input.required<ColumnDef[]>();
  readonly rows         = input.required<unknown[]>();
  readonly rowId        = input.required<(row: unknown) => string>();
  readonly expandable   = input<ExpandConfig | null>(null);
  readonly pagination   = input<PaginationConfig | null>(null);
  readonly minWidth     = input('640px');
  readonly showActions  = input(false);
  readonly clearable    = input(false);
  readonly actionActive = input<(row: unknown) => boolean>(() => false);
  readonly sort         = input<SortState | null>(null);
  readonly rowClickable = input(false);

  readonly pageChange   = output<number>();
  readonly rowAction    = output<{ row: unknown; event: MouseEvent }>();
  readonly rowClick     = output<unknown>();
  readonly clearFilters = output<void>();
  readonly sortChange   = output<SortState | null>();

  private readonly expandedIds = signal(new Set<string>());

  protected readonly atScrollEnd = signal(true);

  protected readonly totalCols = computed(
    () => this.columns().length + (this.showActions() ? 1 : 0),
  );

  ngAfterViewInit(): void {
    const el = this.scrollWrap.nativeElement;
    const check = () => {
      this.atScrollEnd.set(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    this.scrollCleanup = () => { el.removeEventListener('scroll', check); ro.disconnect(); };
  }

  ngOnDestroy(): void { this.scrollCleanup?.(); }

  protected stickyTh(col: ColumnDef): string {
    return col.sticky ? 'relative sticky right-0 bg-white' : '';
  }

  protected stickyTd(col: ColumnDef): string {
    return col.sticky ? 'relative sticky right-0 bg-white group-hover:bg-surface' : '';
  }

  protected headerClick(col: ColumnDef): void {
    if (!col.sortable) return;
    const current = this.sort();
    if (!current || current.key !== col.key) {
      this.sortChange.emit({ key: col.key, dir: 'asc' });
    } else if (current.dir === 'asc') {
      this.sortChange.emit({ key: col.key, dir: 'desc' });
    } else {
      this.sortChange.emit(null);
    }
  }

  protected getId(row: unknown): string {
    return this.rowId()(row);
  }

  protected hasRowClick(): boolean {
    return this.rowClickable();
  }

  protected isExpanded(id: string): boolean {
    return this.expandedIds().has(id);
  }

  protected childId(sub: unknown): string {
    return this.expandable()?.childId(sub) ?? '';
  }

  protected onRowClick(row: unknown, id: string, hasChildren: boolean): void {
    if (this.expandable() && hasChildren) {
      this.expandedIds.update((s) => {
        const n = new Set(s);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
      });
    }
    this.rowClick.emit(row);
  }
}
