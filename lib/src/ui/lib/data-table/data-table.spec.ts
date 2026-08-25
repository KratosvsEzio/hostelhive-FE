import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslocoTesting } from '../../../testing/provide-transloco-testing';
import { By } from '@angular/platform-browser';
import { CellDef, ColumnDef, DataTable, SortState } from './data-table';

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

/**
 * The badge cell, whose shape the table owns.
 *
 * These exist because the failure mode is invisible in code review: a caller passes colours,
 * the component renders a bare `<span>`, and the result is a coloured word rather than a
 * chip. It also pins the Angular behaviour the fix depends on — a static `class` and a
 * `[class]` binding on the same element are merged, not replaced. If that ever stopped being
 * true the chrome would vanish and every badge in the app would silently go flat again.
 */
describe('DataTable badge cells', () => {
  let fixture: ComponentFixture<DataTable>;

  async function render(cell: CellDef): Promise<HTMLElement> {
    globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [DataTable],
      providers: [provideTranslocoTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(DataTable);
    fixture.componentRef.setInput('columns', [
      { key: 'status', label: 'Status', cell: () => cell },
    ] satisfies ColumnDef[]);
    fixture.componentRef.setInput('rows', ROWS);
    fixture.componentRef.setInput('rowId', (r: { id: string }) => r.id);
    fixture.detectChanges();
    return fixture.debugElement.query(By.css('td span')).nativeElement as HTMLElement;
  }

  it('carries the chip chrome as well as the caller’s colours', async () => {
    const el = await render({ kind: 'badge', text: 'Checked in', class: 'bg-ok/10 text-ok' });

    // The caller's half.
    expect(el.className).toContain('bg-ok/10');
    expect(el.className).toContain('text-ok');
    // The table's half — the part that makes it a chip rather than a coloured word.
    expect(el.className).toContain('rounded-full');
    expect(el.className).toContain('px-2');
    expect(el.className).toContain('inline-flex');
  });

  it('renders a dot when one is given, and none when it is not', async () => {
    const withDot = await render({
      kind: 'badge',
      text: 'Pending',
      class: 'bg-warn/10 text-warn',
      dot: 'bg-warn',
    });
    expect(withDot.querySelector('span.rounded-full')).not.toBeNull();

    const plain = await render({ kind: 'badge', text: 'Rental', class: 'bg-tint-sky' });
    expect(plain.querySelector('span')).toBeNull();
  });

  it('keeps the label on one line', async () => {
    const el = await render({ kind: 'badge', text: 'Pending allotment', class: 'bg-warn/10' });
    expect(el.className).toContain('whitespace-nowrap');
  });
});

/**
 * The badge a composite cell can carry beside its primary line.
 *
 * Separate from the badge *cell* above: this one is a field on another cell, with its own
 * default, and until the bookings table it was only ever used without a colour. The failure
 * it guards against is the quiet one — a caller passes a class, the template drops it, and
 * every pill in the column comes out the same brand blue no matter what it means.
 */
describe('DataTable composite badges', () => {
  async function renderCell(cell: CellDef): Promise<HTMLElement> {
    globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [DataTable],
      providers: [provideTranslocoTesting()],
    }).compileComponents();
    const fx = TestBed.createComponent(DataTable);
    fx.componentRef.setInput('columns', [
      { key: 'total', label: 'Total', cell: () => cell },
    ] satisfies ColumnDef[]);
    fx.componentRef.setInput('rows', ROWS);
    fx.componentRef.setInput('rowId', (r: { id: string }) => r.id);
    fx.detectChanges();
    return fx.debugElement.query(By.css('td')).nativeElement as HTMLElement;
  }

  it('renders the caller’s colours, not the default tint', async () => {
    const td = await renderCell({
      kind: 'composite',
      primary: 'PKR 616,000',
      badge: { text: 'Due', class: 'bg-ink-100 text-ink-600' },
    });

    const badge = [...td.querySelectorAll('span')].find((n) => n.textContent?.trim() === 'Due');
    expect(badge).toBeDefined();
    expect(badge!.className).toContain('bg-ink-100');
    expect(badge!.className).toContain('text-ink-600');
    expect(badge!.className).not.toContain('bg-brand-50');
    // Still a chip, not a coloured word.
    expect(badge!.className).toContain('rounded-full');
  });

  it('keeps the primary line beside it', async () => {
    const td = await renderCell({
      kind: 'composite',
      primary: 'PKR 616,000',
      badge: { text: 'Paid', class: 'bg-ok/10 text-ok' },
    });

    expect(td.textContent).toContain('PKR 616,000');
    expect(td.textContent).toContain('Paid');
  });

  it('renders no badge when the cell has none', async () => {
    const td = await renderCell({
      kind: 'composite',
      primary: 'PKR 616,000',
      secondary: 'PKR 516,000 due',
    });

    expect(td.querySelector('span.rounded-full')).toBeNull();
    expect(td.textContent).toContain('PKR 516,000 due');
  });
});

/**
 * The pill on the *second* line, in front of the text rather than after it.
 *
 * Its own block because two things distinguish it from the primary badge: the order it
 * renders in — a pill that lands after the figure it qualifies reads as a footnote to it —
 * and the fact that it brings the second line into existence on its own, so a row with a
 * state but no figure still carries its pill where every other row keeps one.
 */
describe('DataTable composite secondary badges', () => {
  async function renderCell(cell: CellDef): Promise<HTMLElement> {
    globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [DataTable],
      providers: [provideTranslocoTesting()],
    }).compileComponents();
    const fx = TestBed.createComponent(DataTable);
    fx.componentRef.setInput('columns', [
      { key: 'total', label: 'Total', cell: () => cell },
    ] satisfies ColumnDef[]);
    fx.componentRef.setInput('rows', ROWS);
    fx.componentRef.setInput('rowId', (r: { id: string }) => r.id);
    fx.detectChanges();
    return fx.debugElement.query(By.css('td')).nativeElement as HTMLElement;
  }

  it('puts the pill before the secondary text, not after it', async () => {
    const td = await renderCell({
      kind: 'composite',
      primary: 'PKR 616,000',
      secondary: 'PKR 616,000 due',
      secondaryBadge: { text: 'Due', class: 'bg-ink-100 text-ink-600' },
    });

    const line = [...td.querySelectorAll('p')].find((p) => p.textContent?.includes('due'))!;
    expect(line).toBeDefined();
    expect(line.textContent!.trim().indexOf('Due')).toBe(0);
    expect(line.querySelector('span.rounded-full')?.textContent?.trim()).toBe('Due');
  });

  it('leaves the primary line free of it', async () => {
    const td = await renderCell({
      kind: 'composite',
      primary: 'PKR 616,000',
      secondary: 'PKR 616,000 due',
      secondaryBadge: { text: 'Due', class: 'bg-ink-100 text-ink-600' },
    });

    const primary = td.querySelector('p')!;
    expect(primary.textContent).toContain('PKR 616,000');
    expect(primary.querySelector('span.rounded-full')).toBeNull();
  });

  // A settled row has a state but no figure; the line still has to appear.
  it('renders the second line for a badge with no secondary text', async () => {
    const td = await renderCell({
      kind: 'composite',
      primary: 'PKR 616,000',
      secondaryBadge: { text: 'Paid', class: 'bg-ok/10 text-ok' },
    });

    const pill = [...td.querySelectorAll('span.rounded-full')].find((n) => n.textContent?.trim() === 'Paid');
    expect(pill).toBeDefined();
    expect(pill!.className).toContain('bg-ok/10');
  });

  it('keeps the caller’s colours here too', async () => {
    const td = await renderCell({
      kind: 'composite',
      primary: 'PKR 616,000',
      secondaryBadge: { text: 'Partial', class: 'bg-warn/10 text-warn' },
    });

    const pill = td.querySelector('span.rounded-full')!;
    expect(pill.className).toContain('bg-warn/10');
    expect(pill.className).not.toContain('bg-brand-50');
  });
});
