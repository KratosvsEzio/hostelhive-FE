import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslocoTesting } from '../../../testing/provide-transloco-testing';
import { DialogFocus } from '../dialog-focus/dialog-focus';
import { ContextMenu } from './context-menu';

/**
 * The shape every host table uses: a ⋮ per row opens the menu, "Delete" closes the menu and
 * opens a confirm dialog in the same handler, and the dialog's Cancel closes it.
 *
 * The dialog comes first in the template, as it does on Host → Expenses. That order is the
 * one that matters: the dialog is created — and records `activeElement` — before the menu is
 * torn down, so only the menu's click-time focus move can hand it the ⋮.
 */
@Component({
  imports: [ContextMenu, DialogFocus],
  template: `
    @if (confirmOpen()) {
      <div hhDialogFocus role="dialog" aria-modal="true" aria-label="Delete?">
        <button type="button" id="cancel" (click)="confirmOpen.set(false)">Cancel</button>
      </div>
    }

    <button type="button" id="trigger" (click)="menuOpen.set(true)">⋮</button>

    @if (menuOpen()) {
      <hh-context-menu [top]="0" [right]="0" (closed)="menuOpen.set(false)">
        <button type="button" role="menuitem" id="view" (click)="menuOpen.set(false)">View</button>
        <button type="button" role="menuitem" id="delete" (click)="askDelete()">Delete</button>
      </hh-context-menu>
    }
  `,
})
class Host {
  readonly menuOpen = signal(false);
  readonly confirmOpen = signal(false);

  askDelete(): void {
    this.menuOpen.set(false);
    this.confirmOpen.set(true);
  }
}

describe('ContextMenu focus', () => {
  let fixture: ComponentFixture<Host>;
  let el: HTMLElement;

  const q = (sel: string) => el.querySelector<HTMLElement>(sel);

  /** Focus then click, as a pointer or Enter on a focused button does in Chrome. */
  const press = (sel: string) => {
    const b = q(sel);
    if (!b) throw new Error(`${sel} is not rendered`);
    b.focus();
    b.click();
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideTranslocoTesting()],
    });
    fixture = TestBed.createComponent(Host);
    fixture.autoDetectChanges();
    el = fixture.nativeElement;
    document.body.appendChild(el);
  });

  afterEach(() => el.remove());

  it('returns focus to the ⋮ trigger when a dialog opened from a menu item closes', () => {
    press('#trigger');
    press('#delete');

    expect(q('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(q('[role="dialog"]'));

    press('#cancel');

    expect(q('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(q('#trigger'));
  });

  it('returns focus to the trigger when an item only closes the menu', () => {
    press('#trigger');
    press('#view');

    expect(q('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(q('#trigger'));
  });

  it('returns focus to the trigger when the backdrop closes the menu', () => {
    press('#trigger');
    press('hh-context-menu > button');

    expect(q('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(q('#trigger'));
  });

  it('does not pull focus out of a dialog an item opened', () => {
    press('#trigger');
    // The dialog takes focus in the same pass that removes the menu; the menu's teardown
    // must not take it back.
    press('#delete');

    expect(document.activeElement).toBe(q('[role="dialog"]'));
  });

  it('does not move focus when the click that opened it focused nothing (Safari)', () => {
    (document.activeElement as HTMLElement | null)?.blur();
    q('#trigger')?.click();
    fixture.detectChanges();
    q('hh-context-menu > button')?.click();
    fixture.detectChanges();

    expect(q('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });
});
