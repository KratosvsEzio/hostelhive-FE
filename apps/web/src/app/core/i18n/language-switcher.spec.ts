import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { LanguageSwitcher } from './language-switcher';
import { LocaleStore } from './locale-store';
import { DEFAULT_LOCALE } from './locales';

/**
 * Why these tests exist.
 *
 * The panel used to be dismissed by a `<button class="fixed inset-0">` backdrop, which reads
 * as "cover the viewport" and did not cover it. The header this control sits in carries
 * `backdrop-blur`, and a `backdrop-filter` promotes that ancestor to the containing block for
 * every `fixed` descendant beneath it — so the backdrop resolved to the header's own 1815×64
 * box inside a 1830×940 viewport. Clicking anywhere below the header, which is nearly the
 * whole page, hit nothing, and there was no Escape handler to fall back on.
 *
 * The trap here is that the broken version *looks* correct in source and in a unit test: a
 * backdrop element is present, it has a click handler, and the handler closes the panel. It
 * only fails against real layout. So these tests pin the behaviour — dismissal actually
 * happening — and additionally assert the absence of the element, since that element is the
 * specific thing that cannot work in this position.
 */
describe('LanguageSwitcher', () => {
  let fixture: ComponentFixture<LanguageSwitcher>;

  function render(): ComponentFixture<LanguageSwitcher> {
    TestBed.configureTestingModule({
      imports: [LanguageSwitcher],
      providers: [
        {
          provide: LocaleStore,
          useValue: { active: signal(DEFAULT_LOCALE), switchTo: vi.fn() },
        },
      ],
    });
    const f = TestBed.createComponent(LanguageSwitcher);
    f.detectChanges();
    return f;
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const trigger = () => el().querySelector('button') as HTMLButtonElement;
  const panel = () => el().querySelector('[role="listbox"]');

  /** Opens the panel the way a visitor does, through the trigger. */
  function openPanel(): void {
    trigger().click();
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    fixture = render();
  });

  it('opens on the trigger', () => {
    expect(panel()).toBeNull();

    openPanel();

    expect(panel()).not.toBeNull();
  });

  // The bug. A click on the page body is the ordinary way anyone dismisses a menu, and it
  // is exactly the click the clipped backdrop could not receive.
  it('closes on a click anywhere outside it', () => {
    openPanel();

    document.body.click();
    fixture.detectChanges();

    expect(panel()).toBeNull();
  });

  it('stays open for a click inside the panel', () => {
    openPanel();

    (panel() as HTMLElement).click();
    fixture.detectChanges();

    expect(panel()).not.toBeNull();
  });

  // The trigger sits inside the host, so its own handler runs before the document listener.
  // If the guards were wrong, the document listener would immediately undo the toggle and
  // the panel would never appear — or would never close from its own trigger.
  it('toggles from the trigger without the document listener undoing it', () => {
    openPanel();
    expect(panel()).not.toBeNull();

    trigger().click();
    fixture.detectChanges();

    expect(panel()).toBeNull();
  });

  // There was no keyboard exit at all: a keyboard user who opened this had to tab through
  // all eighteen options to get past it.
  it('closes on Escape and hands focus back to the trigger', () => {
    openPanel();
    (panel()?.querySelector('button') as HTMLButtonElement).focus();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  /**
   * A guard on the shape of the fix, not just its effect.
   *
   * Dismissal could be made to pass again by reintroducing a backdrop and testing it with a
   * synthetic click, which is what made the original bug survive review. There is no backdrop
   * that works in this position unless it is portalled out of the blurred header, so the
   * element's absence is the honest thing to assert.
   */
  it('dismisses without a viewport-covering backdrop element', () => {
    openPanel();

    const fixedChildren = Array.from(el().querySelectorAll('*')).filter((n) =>
      (n.getAttribute('class') ?? '').split(/\s+/).includes('fixed'),
    );

    expect(fixedChildren).toEqual([]);
  });

  it('leaves the document alone once destroyed', () => {
    openPanel();
    fixture.destroy();

    // Would throw if the listeners outlived the component.
    expect(() => document.body.click()).not.toThrow();
  });
});
