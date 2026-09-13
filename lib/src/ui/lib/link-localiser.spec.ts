import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideTranslocoTesting } from '../../testing/provide-transloco-testing';
import { Breadcrumb } from './breadcrumb/breadcrumb';
import { CellDef, ColumnDef, DataTable } from './data-table/data-table';
import { HH_LINK_LOCALISER, HhLinkCommands } from './link-localiser';

/**
 * Links built inside this library have to carry the app's language.
 *
 * The app keeps links in-language with a directive matching `a[routerLink]`, and Angular
 * matches directives against the *declaring* template's imports — so it reaches every anchor
 * written in the app and none written in here. Both of these components build their own
 * `routerLink`, and both were rendering hrefs with no prefix: the click still landed, because
 * the router redirects a bare path to its prefixed twin, so nothing looked broken while
 * copy-link-address, middle-click and anything reading the markup took the wrong URL.
 *
 * These tests assert on the rendered `href`, because that is the half that was wrong.
 */
const localiser = (prefix: string) => ({
  provide: HH_LINK_LOCALISER,
  useValue: (link: HhLinkCommands) =>
    typeof link === 'string' && link.startsWith('/') ? `${prefix}${link}` : link,
});

/** The table observes its own width; the test DOM has no ResizeObserver. */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe('breadcrumb links', () => {
  async function render(providers: unknown[]): Promise<ComponentFixture<Breadcrumb>> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [Breadcrumb],
      providers: [provideRouter([]), provideTranslocoTesting(), ...(providers as [])],
    }).compileComponents();
    const fixture = TestBed.createComponent(Breadcrumb);
    fixture.componentRef.setInput('backUrl', '/host/abc');
    fixture.componentRef.setInput('crumbs', [
      { label: 'Overview', url: '/host/abc' },
      { label: 'Invoices' },
    ]);
    fixture.detectChanges();
    return fixture;
  }

  const hrefs = (f: ComponentFixture<Breadcrumb>) =>
    f.debugElement.queryAll(By.css('a')).map((a) => (a.nativeElement as HTMLAnchorElement).getAttribute('href'));

  it('carries the prefix on the back button and the trail', async () => {
    expect(hrefs(await render([localiser('/ur')]))).toEqual(['/ur/host/abc', '/ur/host/abc']);
  });

  it('leaves links alone when nothing provides a localiser', async () => {
    // The default is identity, so the component still works in Storybook, in tests, and in
    // an app whose URLs carry no prefix at all.
    expect(hrefs(await render([]))).toEqual(['/host/abc', '/host/abc']);
  });
});

describe('data table link cells', () => {
  async function render(cell: CellDef, providers: unknown[]): Promise<HTMLAnchorElement> {
    globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [DataTable],
      providers: [provideRouter([]), provideTranslocoTesting(), ...(providers as [])],
    }).compileComponents();
    const fixture = TestBed.createComponent(DataTable);
    fixture.componentRef.setInput('columns', [
      { key: 'room', label: 'Room', cell: () => cell },
    ] satisfies ColumnDef[]);
    fixture.componentRef.setInput('rows', [{ id: '1' }]);
    fixture.componentRef.setInput('rowId', (r: { id: string }) => r.id);
    fixture.detectChanges();
    return fixture.debugElement.query(By.css('td a')).nativeElement as HTMLAnchorElement;
  }

  it('carries the prefix on an in-app cell link', async () => {
    const a = await render(
      { kind: 'link', value: 'Room 4', href: '/host/abc/rooms/4' },
      [localiser('/ur')],
    );
    expect(a.getAttribute('href')).toBe('/ur/host/abc/rooms/4');
  });

  it('leaves an external link exactly as given', async () => {
    // An `external` cell points somewhere else entirely, so a language prefix would be
    // nonsense — and it renders through `href`, never `routerLink`.
    const a = await render(
      { kind: 'link', value: 'Receipt', href: 'https://example.com/r/4', external: true },
      [localiser('/ur')],
    );
    expect(a.getAttribute('href')).toBe('https://example.com/r/4');
    expect(a.getAttribute('target')).toBe('_blank');
  });
});
