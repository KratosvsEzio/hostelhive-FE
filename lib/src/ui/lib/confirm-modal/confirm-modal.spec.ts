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
    <hh-confirm-modal
      title="Delete room 12?"
      [cancelLabel]="cancelLabel()"
      confirmLabel="Delete"
      (confirm)="confirmed.set(confirmed() + 1)"
      (cancel)="cancelled.set(cancelled() + 1)"
    >
      This cannot be undone.
    </hh-confirm-modal>
  `,
})
class Host {
  readonly cancelLabel = signal<string | undefined>(undefined);
  readonly confirmed = signal(0);
  readonly cancelled = signal(0);
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
    // The action row is the last two-button flex in the dialog; read its buttons in order.
    buttons: () => [...el.querySelectorAll('button')] as HTMLButtonElement[],
    labels: () =>
      [...el.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim()),
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
