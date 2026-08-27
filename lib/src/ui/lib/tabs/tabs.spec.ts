import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { provideTranslocoTesting } from '../../../testing/provide-transloco-testing';
import { TabItem, Tabs } from './tabs';

@Component({
  imports: [Tabs],
  template: `<hh-tabs [tabs]="tabs()" [(active)]="active" />`,
})
class Host {
  readonly tabs = signal<TabItem[]>([
    { value: 'calendar', label: 'Calendar' },
    { value: 'details', label: 'Details' },
  ]);
  readonly active = signal('calendar');
}

async function render() {
  // Transloco because a tab can now carry a key instead of a finished string, and the
  // component resolves it with the pipe rather than making every caller translate first.
  await TestBed.configureTestingModule({
    imports: [Host],
    providers: [provideTranslocoTesting()],
  }).compileComponents();
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    host: fixture.componentInstance,
    bar: () => el.querySelector('hh-tabs') as HTMLElement,
    labels: () => [...el.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim()),
  };
}

describe('Tabs', () => {
  it('shows the bar when there is a choice to make', async () => {
    const { bar, labels } = await render();

    expect(bar().style.display).not.toBe('none');
    expect(labels()).toEqual(['Calendar', 'Details']);
  });

  /**
   * One tab is not a choice: whichever is showing is the only one there is, so the chip says
   * nothing the page below it does not, and a lone pill reads as a set with the rest missing.
   *
   * Some tab lists are computed — the room page drops its calendar for a monthly-billing
   * hostel — so the count is only known at render and the guard cannot live at the call site.
   */
  it('hides itself entirely when only one tab is left', async () => {
    const { fixture, host, bar } = await render();
    host.tabs.set([{ value: 'details', label: 'Details' }]);
    fixture.detectChanges();

    expect(bar().style.display).toBe('none');
  });

  it('comes back when a second tab returns', async () => {
    const { fixture, host, bar } = await render();
    host.tabs.set([{ value: 'details', label: 'Details' }]);
    fixture.detectChanges();
    host.tabs.set([
      { value: 'calendar', label: 'Calendar' },
      { value: 'details', label: 'Details' },
    ]);
    fixture.detectChanges();

    expect(bar().style.display).not.toBe('none');
  });

  // `display` rather than a `hidden` class, because the host already sets `grid` and the two
  // are display utilities of equal specificity — which won would be down to emit order.
  it('hides with an inline style the host classes cannot outrank', async () => {
    const { fixture, host, bar } = await render();
    host.tabs.set([]);
    fixture.detectChanges();

    expect(bar().style.display).toBe('none');
    expect(bar().className).toContain('grid');
  });

  it('reports the selected tab to assistive technology', async () => {
    const { fixture, host } = await render();
    const selected = () =>
      [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')]
        .filter((b) => b.getAttribute('aria-selected') === 'true')
        .map((b) => (b.textContent ?? '').trim());

    expect(selected()).toEqual(['Calendar']);
    host.active.set('details');
    fixture.detectChanges();
    expect(selected()).toEqual(['Details']);
  });
});

/**
 * A tab that carries a translation key instead of a finished string.
 *
 * Callers used to translate the label themselves, which meant an imperative `translate()`
 * inside a computed — evaluated before the language file loads, so the first pass returned
 * the key and logged a missing-translation warning. The pipe waits for the strings on its own.
 *
 * A real translation is injected here rather than relying on the shared testing loader, which
 * echoes every key back: against an echo, a template that forgot the pipe entirely would look
 * exactly like one that used it.
 */
describe('Tabs — translated labels', () => {
  async function renderKeys(tabs: TabItem[]) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideTranslocoTesting()],
    }).compileComponents();
    TestBed.inject(TranslocoService).setTranslation(
      { nav: { calendar: 'Calendar', list: 'List' } },
      'en',
    );
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.tabs.set(tabs);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return [...el.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim());
  }

  it('resolves the key rather than printing it', async () => {
    const labels = await renderKeys([
      { value: 'calendar', labelKey: 'nav.calendar' },
      { value: 'list', labelKey: 'nav.list' },
    ]);

    expect(labels).toEqual(['Calendar', 'List']);
  });

  // Every existing caller still hands over a finished string; none of them had to change.
  it('still renders a literal label', async () => {
    const labels = await renderKeys([
      { value: 'a', label: 'Spend' },
      { value: 'b', label: 'Menu' },
    ]);

    expect(labels).toEqual(['Spend', 'Menu']);
  });

  it('prefers the key when a tab carries both', async () => {
    const labels = await renderKeys([
      { value: 'calendar', labelKey: 'nav.calendar', label: 'stale literal' },
      { value: 'list', labelKey: 'nav.list' },
    ]);

    expect(labels[0]).toBe('Calendar');
  });
});
