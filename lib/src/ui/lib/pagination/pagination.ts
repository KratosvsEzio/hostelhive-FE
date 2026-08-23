import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/** Numbered pagination. `<hh-pagination [pageCount]="5" [(page)]="page" />` */
@Component({
  selector: 'hh-pagination',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="grid h-8 w-8 place-items-center rounded-lg border border-ink-200 text-ink-600 transition hover:bg-ink-50 disabled:opacity-40"
      [disabled]="page() <= 1"
      (click)="go(1)"
      [attr.aria-label]="'a11y.firstPage' | transloco"
    >
      <i class="ti ti-chevron-left-pipe" aria-hidden="true"></i>
    </button>
    <button
      type="button"
      class="grid h-8 w-8 place-items-center rounded-lg border border-ink-200 text-ink-600 transition hover:bg-ink-50 disabled:opacity-40"
      [disabled]="page() <= 1"
      (click)="go(page() - 1)"
      [attr.aria-label]="'a11y.previousPage' | transloco"
    >
      <i class="ti ti-chevrons-left" aria-hidden="true"></i>
    </button>
    @for (p of pages(); track p) {
      <button
        type="button"
        (click)="go(p)"
        [class]="btnClass(p)"
        [attr.aria-current]="p === page() ? 'page' : null"
      >
        {{ p }}
      </button>
    }
    <button
      type="button"
      class="grid h-8 w-8 place-items-center rounded-lg border border-ink-200 text-ink-600 transition hover:bg-ink-50 disabled:opacity-40"
      [disabled]="page() >= pageCount()"
      (click)="go(page() + 1)"
      [attr.aria-label]="'a11y.nextPage' | transloco"
    >
      <i class="ti ti-chevrons-right" aria-hidden="true"></i>
    </button>
    <button
      type="button"
      class="grid h-8 w-8 place-items-center rounded-lg border border-ink-200 text-ink-600 transition hover:bg-ink-50 disabled:opacity-40"
      [disabled]="page() >= pageCount()"
      (click)="go(pageCount())"
      [attr.aria-label]="'a11y.lastPage' | transloco"
    >
      <i class="ti ti-chevron-right-pipe" aria-hidden="true"></i>
    </button>
  `,
  host: { class: 'flex flex-wrap items-center gap-1', role: 'navigation' },
})
export class Pagination {
  readonly pageCount = input(1);
  readonly page = model(1);

  protected readonly pages = computed(() =>
    Array.from({ length: this.pageCount() }, (_, i) => i + 1),
  );

  protected go(p: number): void {
    if (p >= 1 && p <= this.pageCount()) this.page.set(p);
  }

  protected btnClass(p: number): string {
    const base =
      'grid h-8 w-8 place-items-center rounded-lg text-sm transition';
    return p === this.page()
      ? `${base} bg-ink-900 font-medium text-white`
      : `${base} border border-ink-200 text-ink-600 hover:bg-ink-50`;
  }
}
