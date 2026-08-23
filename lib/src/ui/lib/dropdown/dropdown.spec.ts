import { Component, signal } from '@angular/core';
import { provideTranslocoTesting } from '../../../testing/provide-transloco-testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Dropdown, DropdownOption } from './dropdown';

const OPTIONS: DropdownOption[] = [
  { value: 'en', label: 'English', iconUrl: '/flags/gb.svg' },
  { value: 'ru', label: 'Русский (Russian)', iconUrl: '/flags/ru.svg' },
  { value: 'plain', label: 'No image here' },
  { value: 'glyph', label: 'Tabler icon', icon: 'ti-world' },
];

@Component({
  imports: [Dropdown],
  template: `<hh-dropdown [options]="options" />`,
})
class Host {
  readonly options = OPTIONS;
}

/**
 * `iconUrl` is the only way an option can carry a picture — `icon` is a Tabler class name
 * rendered into `<i class="ti …">`, so a URL passed there produces a silently empty glyph.
 * The language pickers rely on this to show a flag, and nothing else in the app uses it, so
 * a regression here would surface only as a missing image on one settings screen.
 */
describe('Dropdown option images', () => {
  let fixture: ComponentFixture<Host>;

  /**
   * Opens the panel the way a user does. `open` is an internal signal rather than an
   * input, and the panel is teleported to `<body>` once open — so the options live outside
   * the fixture's own element and have to be queried from the document.
   */
  async function openPanel(): Promise<HTMLElement> {
    await TestBed.configureTestingModule({ imports: [Host], providers: [provideTranslocoTesting()] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector('button')!.click();
    fixture.detectChanges();
    const panel = document.querySelector('[role="listbox"]');
    expect(panel).toBeTruthy();
    return panel as HTMLElement;
  }

  afterEach(() => fixture?.destroy());

  it('renders one image per option that carries an iconUrl', async () => {
    const panel = await openPanel();
    const srcs = [...panel.querySelectorAll('img')].map((i) => i.getAttribute('src'));
    expect(srcs).toEqual(['/flags/gb.svg', '/flags/ru.svg']);
  });

  it('leaves the image out entirely when an option has none', async () => {
    const panel = await openPanel();
    // Four options, two images — the plain and Tabler-icon rows must not render an
    // <img src="">, which a browser resolves against the page URL and then requests.
    expect(panel.querySelectorAll('img').length).toBe(2);
  });

  // The label is what a screen reader announces; the flag is decoration beside it, and a
  // country is not a language, so it must never become the accessible name.
  it('keeps the images decorative', async () => {
    const panel = await openPanel();
    const imgs = [...panel.querySelectorAll('img')];
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) {
      expect(img.getAttribute('alt')).toBe('');
      expect(img.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('still renders a Tabler icon alongside, so the two fields do not collide', async () => {
    const panel = await openPanel();
    expect(panel.querySelector('i.ti-world')).toBeTruthy();
  });
});

/**
 * The trigger echoes the *selected* option's mark. Panel-only rendering meant a language
 * picker showed a flag while choosing and then collapsed to bare text, which reads as the
 * flag having been lost rather than as a deliberately plainer trigger.
 */
describe('Dropdown trigger image', () => {
  let fixture: ComponentFixture<TriggerHost>;

  async function render(value: string | string[] | null, multiple = false): Promise<HTMLElement> {
    await TestBed.configureTestingModule({ imports: [TriggerHost], providers: [provideTranslocoTesting()] }).compileComponents();
    fixture = TestBed.createComponent(TriggerHost);
    fixture.componentInstance.value.set(value);
    fixture.componentInstance.multiple.set(multiple);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('button')!;
  }

  afterEach(() => fixture?.destroy());

  it('shows the selected option’s flag in the closed trigger', async () => {
    const trigger = await render('ru');
    expect(trigger.querySelector('img')?.getAttribute('src')).toBe('/flags/ru.svg');
  });

  it('follows the selection when it changes', async () => {
    const trigger = await render('ru');
    fixture.componentInstance.value.set('en');
    fixture.detectChanges();
    expect(trigger.querySelector('img')?.getAttribute('src')).toBe('/flags/gb.svg');
  });

  it('renders no image for a selected option that has none', async () => {
    // Guards against an <img src="">, which the browser resolves against the page URL and
    // then actually requests.
    const trigger = await render('plain');
    expect(trigger.querySelector('img')).toBeNull();
  });

  it('renders a Tabler icon for a selected option carrying one', async () => {
    const trigger = await render('glyph');
    expect(trigger.querySelector('i.ti-world')).toBeTruthy();
  });

  it('shows nothing when there is no selection', async () => {
    const trigger = await render(null);
    expect(trigger.querySelector('img')).toBeNull();
  });

  // One option's flag beside a "3" count would claim the others share it.
  it('stays out of the trigger in multi-select', async () => {
    const trigger = await render(['en', 'ru'], true);
    expect(trigger.querySelector('img')).toBeNull();
  });

  it('keeps the trigger image decorative', async () => {
    const trigger = await render('en');
    const img = trigger.querySelector('img')!;
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('aria-hidden')).toBe('true');
  });
});

@Component({
  imports: [Dropdown],
  template: `<hh-dropdown [options]="options" [value]="value()" [multiple]="multiple()" />`,
})
class TriggerHost {
  readonly options = OPTIONS;
  // Signals rather than plain fields: `value` feeds a `model()`, and reassigning a plain
  // field between change-detection passes trips NG0100 in dev mode.
  readonly value = signal<string | string[] | null>(null);
  readonly multiple = signal(false);
}

/**
 * Panel placement.
 *
 * Choosing the roomier side was never enough on its own: the panel still rendered its full
 * height, so when neither side could hold it the overflow hung past the viewport edge and
 * was unreachable — the list scrolls inside the panel, so the page will not scroll to it.
 */
describe('Dropdown panel placement', () => {
  let fixture: ComponentFixture<TriggerHost>;

  const GAP = 6;
  const PANEL_MAX_H = 288;

  /** Positions the trigger at a given viewport offset, opens, and reads back the panel box. */
  async function place(triggerTop: number, viewportH: number) {
    await TestBed.configureTestingModule({ imports: [TriggerHost], providers: [provideTranslocoTesting()] }).compileComponents();
    fixture = TestBed.createComponent(TriggerHost);
    fixture.detectChanges();
    const btn = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    const height = 32;
    btn.getBoundingClientRect = () =>
      ({ top: triggerTop, bottom: triggerTop + height, left: 40, right: 200, width: 160, height, x: 40, y: triggerTop, toJSON: () => ({}) }) as DOMRect;
    // Stubs `documentElement.clientHeight`, which is what the component measures —
    // `innerWidth`/`innerHeight` count the scrollbars, and a panel clamped to those can
    // overflow into one and drive a resize loop.
    const root = document.documentElement;
    const originalH = Object.getOwnPropertyDescriptor(root, 'clientHeight');
    Object.defineProperty(root, 'clientHeight', { value: viewportH, configurable: true });
    btn.click();
    fixture.detectChanges();
    const panel = document.querySelector<HTMLElement>('[role="listbox"]')!;
    const box = {
      top: panel.style.top,
      bottom: panel.style.bottom,
      maxHeight: parseFloat(panel.style.maxHeight),
    };
    if (originalH) Object.defineProperty(root, 'clientHeight', originalH);
    else delete (root as unknown as Record<string, unknown>)['clientHeight'];
    return box;
  }

  afterEach(() => fixture?.destroy());

  it('opens below with a 6px offset when there is room', async () => {
    const box = await place(100, 900);
    expect(box.top).toBe('138px'); // 100 + 32 + GAP
    expect(box.bottom).toBe('');
  });

  it('never exceeds the panel max height when space is plentiful', async () => {
    const box = await place(100, 2000);
    expect(box.maxHeight).toBe(PANEL_MAX_H);
  });

  it('flips above when below is cramped and above is roomier', async () => {
    const box = await place(600, 700);
    expect(box.bottom).toBe('106px'); // 700 - 600 + GAP
    expect(box.top).toBe('');
  });

  // The regression: a side is chosen, but the panel must also be capped to it.
  it('clamps its height to the space on the chosen side', async () => {
    // 220px below the trigger, less than the 288 the panel would otherwise take.
    const box = await place(60, 312);
    expect(box.maxHeight).toBeLessThan(PANEL_MAX_H);
    expect(box.maxHeight).toBeLessThanOrEqual(312 - (60 + 32) - GAP);
  });

  it('keeps a usable panel rather than a sliver in a very short viewport', async () => {
    const box = await place(10, 90);
    expect(box.maxHeight).toBeGreaterThanOrEqual(120);
  });
});
