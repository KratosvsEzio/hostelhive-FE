import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Fixed-position context menu panel with a backdrop dismiss layer.
 *
 * Rendered by the parent via `@if` — this component has no internal open state.
 * Position is driven by `top` and `right` (pixel values from the trigger's bounding rect).
 * The panel self-adjusts after render to stay within the viewport in all directions.
 * Menu items are projected via `<ng-content>` — use `hh-button variant="text" role="menuitem"
 * class="w-full !justify-start"` for each item.
 *
 * @example
 * @if (menuPos(); as pos) {
 *   <hh-context-menu [top]="pos.top" [right]="pos.right" (close)="closeMenu()">
 *     <button hh-button variant="text" role="menuitem" class="w-full !justify-start" (click)="edit()">
 *       <i class="ti ti-pencil text-sm text-ink-400"></i> Edit
 *     </button>
 *     <hh-context-menu-divider />
 *     <button hh-button variant="text" role="menuitem" class="w-full !justify-start !text-danger" (click)="delete()">
 *       <i class="ti ti-trash text-sm"></i> Delete
 *     </button>
 *   </hh-context-menu>
 * }
 */
@Component({
  selector: 'hh-context-menu',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="fixed inset-0 z-40 cursor-default"
      [attr.aria-label]="'a11y.closeMenu' | transloco"
      (click)="close.emit()"
    ></button>
    <div
      class="fixed z-50 overflow-hidden rounded-xl border border-ink-100 bg-white p-1.5 shadow-lg"
      [style.top.px]="adjustedTop()"
      [style.right.px]="adjustedRight()"
      [style.width.px]="width()"
      role="menu"
      tabindex="-1"
      #panel
      (click)="$event.stopPropagation()"
      (keydown)="$event.stopPropagation()"
    >
      <ng-content />
    </div>
  `,
})
export class ContextMenu {
  readonly top = input.required<number>();
  readonly right = input.required<number>();
  /** Panel width in pixels. Defaults to 160 (w-40). */
  readonly width = input(160);

  readonly close = output<void>();

  private readonly panelEl = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly adj = signal({ dy: 0, dx: 0 });

  protected readonly adjustedTop = computed(() => this.top() + this.adj().dy);
  protected readonly adjustedRight = computed(() => this.right() + this.adj().dx);

  constructor() {
    afterNextRender(() => {
      const el = this.panelEl()?.nativeElement;
      if (!el || typeof window === 'undefined') return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const GAP = 8;

      // Vertical: push up if the panel clips below the viewport
      let dy = 0;
      if (r.bottom > vh - GAP) dy = -(r.bottom - vh + GAP);
      if (r.top + dy < GAP) dy = GAP - r.top;

      // Horizontal: push right if the panel clips the left viewport edge
      // (panel is end-anchored, so left edge = vw - right - width)
      let dx = 0;
      const panelLeft = vw - this.right() - r.width;
      if (panelLeft < GAP) dx = panelLeft - GAP; // negative → decreases right → shifts panel right

      const curr = this.adj();
      if (dy !== curr.dy || dx !== curr.dx) this.adj.set({ dy, dx });
    });
  }
}

/** Thin horizontal rule between groups of menu items. */
@Component({
  selector: 'hh-context-menu-divider',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // mx-1.5 + the panel’s p-1.5 keeps the rule inset 12px from the panel edge, the same as
  // before the panel gained padding.
  template: `<div class="mx-1.5 border-t border-ink-100"></div>`,
})
export class ContextMenuDivider {}
