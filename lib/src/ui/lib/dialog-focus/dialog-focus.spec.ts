import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DialogFocus } from './dialog-focus';

@Component({
  imports: [DialogFocus],
  template: `
    <button type="button" id="opener" (click)="open.set(true)">Open</button>
    <button type="button" id="behind">Behind the overlay</button>

    @if (open()) {
      <div hhDialogFocus role="dialog" aria-modal="true" aria-label="Test dialog">
        <button type="button" id="close" (click)="open.set(false)">Close</button>
        <input id="field" />
        <button type="button" id="last">Last</button>
        <!-- Appears *after* the last control, so turning it on moves where Tab wraps. -->
        @if (showExtra()) {
          <button type="button" id="extra">Extra</button>
        }
      </div>
    }
  `,
})
class Host {
  readonly open = signal(false);
  readonly showExtra = signal(false);
}

/**
 * The keyboard half of `aria-modal`, which the attribute itself does not provide.
 *
 * These are behavioural rather than structural tests on purpose: the bug they pin is not
 * "the directive is absent" but "focus is somewhere it should not be", and that is only
 * observable by looking at `document.activeElement` after the fact. The page-behind button
 * exists in the fixture for exactly one assertion — that Tab never reaches it.
 */
describe('DialogFocus', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  /**
   * jsdom lays nothing out, so every element reports zero client rects and the directive's
   * visibility filter would discard the whole dialog. Stubbed to "everything attached to the
   * document is visible", which is true of these fixtures.
   */
  const realRects = HTMLElement.prototype.getClientRects;
  beforeAll(() => {
    HTMLElement.prototype.getClientRects = function (this: HTMLElement) {
      return (this.isConnected ? [{ width: 10, height: 10 }] : []) as unknown as DOMRectList;
    };
  });
  afterAll(() => {
    HTMLElement.prototype.getClientRects = realRects;
  });

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [Host] });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    fixture.autoDetectChanges();
    await fixture.whenStable();
  });

  const $ = <T extends HTMLElement>(id: string) =>
    fixture.nativeElement.querySelector(`#${id}`) as T;

  async function openDialog(): Promise<void> {
    $('opener').focus();
    $('opener').click();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function tab(shift = false): void {
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    dialog.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true }),
    );
  }

  // The dialog itself, not its first control — see the note in the directive: these
  // dialogs open with a dismiss scrim first in DOM order, and focusing the container is
  // what gets the title announced.
  it('moves focus onto the dialog itself when it opens', async () => {
    await openDialog();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(document.activeElement).toBe(dialog);
  });

  // Focus starts on the container, so this is the very first key a keyboard user presses.
  it('does not let Shift+Tab off the container escape the dialog', async () => {
    await openDialog();
    tab(true);

    expect(document.activeElement?.id).toBe('last');
  });

  /**
   * The second open is the one that breaks.
   *
   * With `afterNextRender` this passed on the first open and silently did nothing on every
   * one after it: the callback is queued for the render *following* the one that builds the
   * dialog, and opening a dialog changes nothing else, so in an idle app that render never
   * happens. Verified in the browser — focus stayed on the trigger for a full 1.2 seconds.
   */
  it('moves focus in again on a second open', async () => {
    await openDialog();
    const dialogOf = () => fixture.nativeElement.querySelector('[role="dialog"]');
    expect(document.activeElement).toBe(dialogOf());

    host.open.set(false);
    fixture.detectChanges();
    await fixture.whenStable();

    await openDialog();
    expect(document.activeElement).toBe(dialogOf());
  });

  it('returns focus to whatever opened it', async () => {
    await openDialog();
    host.open.set(false);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement?.id).toBe('opener');
  });

  // The finding this directive exists for: two Tab presses used to land on a control
  // underneath an opaque overlay.
  it('never lets Tab escape to the page behind', async () => {
    await openDialog();

    for (let i = 0; i < 8; i++) {
      tab();
      expect(document.activeElement?.id).not.toBe('behind');
      expect(document.activeElement?.id).not.toBe('opener');
    }
  });

  it('wraps forward from the last control to the first', async () => {
    await openDialog();
    $('last').focus();
    tab();

    expect(document.activeElement?.id).toBe('close');
  });

  it('wraps backward from the first control to the last', async () => {
    await openDialog();
    $('close').focus();
    tab(true);

    expect(document.activeElement?.id).toBe('last');
  });

  // A dialog that changes shape while open — the phone modal swapping a spinner for a
  // number — must not send Tab to a control captured when it opened.
  it('picks up controls added after it opened', async () => {
    await openDialog();

    // While `last` really is the last control, it is where Tab wraps.
    $('last').focus();
    tab();
    expect(document.activeElement?.id).toBe('close');

    host.showExtra.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    // The wrap point has moved to the newly rendered control.
    $('extra').focus();
    tab();
    expect(document.activeElement?.id).toBe('close');

    // And `last` is no longer intercepted — jsdom does not move focus for a synthetic Tab,
    // so focus staying put is what "the directive left this one to the browser" looks like.
    $('last').focus();
    tab();
    expect(document.activeElement?.id).toBe('last');
  });

  it('leaves keys other than Tab alone', async () => {
    await openDialog();
    $('field').focus();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));

    expect(document.activeElement?.id).toBe('field');
  });
});
