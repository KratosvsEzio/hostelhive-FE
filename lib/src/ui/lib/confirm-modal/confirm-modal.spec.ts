import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslocoTesting } from '../../../testing/provide-transloco-testing';
import { ConfirmModal } from './confirm-modal';

/**
 * The cancel button is the whole point of a confirmation dialog, and it is one guard away
 * from vanishing: it used to be hidden whenever no `cancelLabel` was passed, which is how
 * nine "delete this permanently?" dialogs ended up offering a single red Delete button and
 * no way out but the backdrop.
 *
 * So the three cases are asserted by name. An *unset* label means "show it, with the default
 * wording"; an *empty* label is how an alert — "photo limit reached" — opts out of having a
 * second button at all; a given label is used verbatim.
 */
@Component({
  imports: [ConfirmModal],
  template: `
    <button type="button" id="opener" (click)="open.set(true)">Delete</button>
    <!-- Stands in for a drawer, whose own Escape would close the form behind the dialog. -->
    <div tabindex="-1" (keydown.escape)="behind.set(behind() + 1)">
      @if (open()) {
        <hh-confirm-modal
          title="Delete room 12?"
          [cancelLabel]="cancelLabel()"
          [confirmDisabled]="confirmDisabled()"
          confirmLabel="Delete"
          (confirm)="confirmed.set(confirmed() + 1)"
          (cancel)="onCancel()"
        >
          This cannot be undone.
        </hh-confirm-modal>
      }
    </div>
  `,
})
class Host {
  readonly open = signal(true);
  readonly cancelLabel = signal<string | undefined>(undefined);
  readonly confirmDisabled = signal(false);
  /** Close on cancel, as every real parent does. Off where a test counts presses. */
  readonly closeOnCancel = signal(false);
  readonly confirmed = signal(0);
  readonly cancelled = signal(0);
  readonly behind = signal(0);

  onCancel(): void {
    this.cancelled.set(this.cancelled() + 1);
    if (this.closeOnCancel()) this.open.set(false);
  }
}

/**
 * The dialog's action buttons, in order.
 *
 * The row is the flex that holds them, and it is the only one inside the dialog panel. Found
 * by structure rather than by taking every `<button>` in the tree, because the dismiss
 * backdrop is a button as well.
 */
function actionRow(el: HTMLElement): HTMLButtonElement[] {
  const row = el.querySelector('div.flex.gap-3');
  return [...(row?.querySelectorAll('button') ?? [])] as HTMLButtonElement[];
}

async function render() {
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
    // The action row, read in order.
    //
    // Scoped to that row rather than to every button in the dialog: the dismiss backdrop is
    // a button too — it has to be, or the modal cannot be closed from a keyboard — and a
    // bare `querySelectorAll('button')` counted it as a third action.
    buttons: () => actionRow(el),
    labels: () => actionRow(el).map((b) => (b.textContent ?? '').trim()),
  };
}

describe('ConfirmModal — the way out', () => {
  it('offers a cancel button when no label is given', async () => {
    const { labels } = await render();

    // Two buttons, and the destructive one is not the only thing on offer.
    expect(labels()).toHaveLength(2);
    expect(labels()[1]).toBe('Delete');
  });

  it('uses the label it is given', async () => {
    const { fixture, host, labels } = await render();
    host.cancelLabel.set('Keep booking');
    fixture.detectChanges();

    expect(labels()[0]).toBe('Keep booking');
  });

  // An alert has nothing to cancel — "photo limit reached" is a fact, not a question — so an
  // empty string is the deliberate opt-out. Anything else must keep its way out.
  it('drops the cancel button only for an explicit empty label', async () => {
    const { fixture, host, labels } = await render();
    host.cancelLabel.set('');
    fixture.detectChanges();

    expect(labels()).toEqual(['Delete']);
  });

  it('reports which button was pressed', async () => {
    const { fixture, host, buttons } = await render();

    buttons()[0].click();
    expect(host.cancelled()).toBe(1);
    expect(host.confirmed()).toBe(0);

    buttons()[1].click();
    fixture.detectChanges();
    expect(host.confirmed()).toBe(1);
  });
});

describe('ConfirmModal — Escape', () => {
  function pressEscape(el: HTMLElement): void {
    const target =
      (el.querySelector('[role="dialog"]') as HTMLElement | null) ?? el;
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
  }

  it('cancels, and never confirms', async () => {
    const { fixture, host } = await render();

    pressEscape(fixture.nativeElement);

    expect(host.cancelled()).toBe(1);
    expect(host.confirmed()).toBe(0);
  });

  // The dialog is the only thing that answers: a drawer behind it keeps its form.
  it('does not reach whatever is behind the dialog', async () => {
    const { fixture, host } = await render();

    pressEscape(fixture.nativeElement);

    expect(host.behind()).toBe(0);
  });

  // `confirmDisabled` means the parent cannot take an answer yet, mid-request or still
  // loading -- and "no" is an answer. It still must not fall through to the drawer.
  it('is ignored while the confirm is disabled', async () => {
    const { fixture, host } = await render();
    host.confirmDisabled.set(true);
    fixture.detectChanges();

    pressEscape(fixture.nativeElement);

    expect(host.cancelled()).toBe(0);
    expect(host.confirmed()).toBe(0);
    expect(host.behind()).toBe(0);
  });

  it('returns focus to the control that opened the dialog', async () => {
    const { fixture, host } = await render();
    host.open.set(false);
    host.closeOnCancel.set(true);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const opener = el.querySelector('#opener') as HTMLButtonElement;

    opener.focus();
    opener.click();
    fixture.detectChanges();
    expect(document.activeElement).toBe(el.querySelector('[role="dialog"]'));

    pressEscape(el);
    fixture.detectChanges();

    expect(el.querySelector('hh-confirm-modal')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
