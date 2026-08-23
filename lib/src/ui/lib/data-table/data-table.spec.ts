import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslocoTesting } from '../../../testing/provide-transloco-testing';
import { By } from '@angular/platform-browser';
import { ColumnDef, DataTable, SortState } from './data-table';

const COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Property', cell: () => ({ kind: 'text', value: 'A' }) },
  { key: 'created_at', label: 'Created', sortable: true, cell: () => ({ kind: 'text', value: 'x' }) },
  {
    key: 'starting_price',
    label: 'From',
    sortable: true,
    align: 'right',
    cell: () => ({ kind: 'text', value: '1' }),
  },
];

const ROWS = [{ id: '1' }];

/**
 * The table observes its own width to fade the sticky column's edge. The test DOM has no
 * ResizeObserver, and without one ngAfterViewInit throws before a single row renders.
 */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/**
 * The sortable header, which is the part a user actually clicks.
 *
 * Worth its own tests because the failure is silent: a header that emits nothing looks
 * identical to one whose consumer ignores the event, and both look identical to a backend
 * that drops the sort param. Pinning the component's half means the next person only has two
 * places left to look.
 */
describe('DataTable sorting', () => {
  let fixture: ComponentFixture<DataTable>;
  let emitted: (SortState | null)[];

  beforeEach(async () => {
    globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
    await TestBed.configureTestingModule({ imports: [DataTable], providers: [provideTranslocoTesting()] }).compileComponents();
    fixture = TestBed.createComponent(DataTable);
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('rows', ROWS);
    fixture.componentRef.setInput('rowId', (r: { id: string }) => r.id);
    emitted = [];
    fixture.componentInstance.sortChange.subscribe((s) => emitted.push(s));
    fixture.detectChanges();
  });

  function headers(): HTMLElement[] {
    return fixture.debugElement.queryAll(By.css('th')).map((d) => d.nativeElement);
  }

  function clickHeader(label: string): void {
    const th = headers().find((h) => h.textContent?.includes(label));
    if (!th) throw new Error(`no header matching ${label}`);
    th.click();
    fixture.detectChanges();
  }

  it('emits ascending on the first click of an unsorted column', () => {
    clickHeader('Created');
    expect(emitted).toEqual([{ key: 'created_at', dir: 'asc' }]);
  });

  it('cycles ascending → descending → cleared', () => {
    fixture.componentRef.setInput('sort', { key: 'created_at', dir: 'asc' });
    fixture.detectChanges();
    clickHeader('Created');
    expect(emitted.at(-1)).toEqual({ key: 'created_at', dir: 'desc' });

    fixture.componentRef.setInput('sort', { key: 'created_at', dir: 'desc' });
    fixture.detectChanges();
    clickHeader('Created');
    // Third click clears rather than looping back to ascending, so there is a way out.
    expect(emitted.at(-1)).toBeNull();
  });

  it('starts a different column fresh rather than inheriting the previous direction', () => {
    fixture.componentRef.setInput('sort', { key: 'created_at', dir: 'desc' });
    fixture.detectChanges();
    clickHeader('From');
    expect(emitted.at(-1)).toEqual({ key: 'starting_price', dir: 'asc' });
  });

  // Three tables default to newest-first and cannot render "unsorted", so they map the cleared
  // null back onto that default. Without this the third click is a no-op — and since their
  // default column already starts on desc, its very first click was the no-op.
  it('toggles asc and desc forever when the sort cannot be cleared', () => {
    fixture.componentRef.setInput('canClearSort', false);
    fixture.componentRef.setInput('sort', { key: 'created_at', dir: 'desc' });
    fixture.detectChanges();

    clickHeader('Created');
    expect(emitted.at(-1)).toEqual({ key: 'created_at', dir: 'asc' });

    fixture.componentRef.setInput('sort', { key: 'created_at', dir: 'asc' });
    fixture.detectChanges();
    clickHeader('Created');
    expect(emitted.at(-1)).toEqual({ key: 'created_at', dir: 'desc' });

    expect(emitted).not.toContain(null);
  });

  it('ignores clicks on a column that is not sortable', () => {
    clickHeader('Property');
    expect(emitted).toEqual([]);
  });

  // The bug this was written for: `thead` carried `text-start`, but a browser's own stylesheet
  // gives `th` `text-align: center`, and a UA rule on the element beats an inherited value.
  it('left-aligns headers, since the cells under them are left-aligned', () => {
    const [property, created] = headers();
    expect(property.className).toContain('text-start');
    expect(created.className).toContain('text-start');
  });

  it('right-aligns a header whose column is right-aligned', () => {
    const from = headers().find((h) => h.textContent?.includes('From'));
    expect(from?.className).toContain('text-right');
    expect(from?.className).not.toContain('text-start');
  });
});
