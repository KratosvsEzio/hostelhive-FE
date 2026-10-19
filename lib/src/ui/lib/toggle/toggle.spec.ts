import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Toggle } from './toggle';

@Component({
  imports: [Toggle],
  template: `
    <hh-toggle
      [(checked)]="on"
      [disabled]="off()"
      [describedBy]="hint()"
      [label]="name()"
      [labelledBy]="nameId()"
    />
    <p id="the-hint">Charged on the renewal date.</p>
    <p id="the-name">Automatic renewal</p>
  `,
})
class Host {
  readonly on = signal(false);
  readonly off = signal(false);
  readonly hint = signal<string | null>(null);
  readonly name = signal<string | null>(null);
  readonly nameId = signal<string | null>(null);
}

async function render() {
  await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    host: fixture.componentInstance,
    switchEl: () => el.querySelector('[role="switch"]') as HTMLButtonElement,
  };
}

describe('Toggle', () => {
  it('flips its value on click and reports it', async () => {
    const { fixture, host, switchEl } = await render();
    expect(switchEl().getAttribute('aria-checked')).toBe('false');

    switchEl().click();
    fixture.detectChanges();

    expect(host.on()).toBe(true);
    expect(switchEl().getAttribute('aria-checked')).toBe('true');
  });

  it('ignores a click while disabled', async () => {
    const { fixture, host, switchEl } = await render();
    host.off.set(true);
    fixture.detectChanges();

    switchEl().click();
    fixture.detectChanges();

    expect(host.on()).toBe(false);
  });

  it('carries no aria-describedby until it is given one', async () => {
    const { switchEl } = await render();

    expect(switchEl().hasAttribute('aria-describedby')).toBe(false);
  });

  it('describes the switch button itself by the hint it is given', async () => {
    const { fixture, host, switchEl } = await render();
    host.hint.set('the-hint');
    fixture.detectChanges();

    const id = switchEl().getAttribute('aria-describedby');
    expect(id).toBe('the-hint');
    const hint = (fixture.nativeElement as HTMLElement).querySelector(`#${id}`);
    expect(hint?.textContent).toBe('Charged on the renewal date.');
  });

  it('drops the description when the hint is taken away', async () => {
    const { fixture, host, switchEl } = await render();
    host.hint.set('the-hint');
    fixture.detectChanges();
    host.hint.set(null);
    fixture.detectChanges();

    expect(switchEl().hasAttribute('aria-describedby')).toBe(false);
  });

  it('has no name of its own until it is given one', async () => {
    const { switchEl } = await render();

    expect(switchEl().hasAttribute('aria-label')).toBe(false);
    expect(switchEl().hasAttribute('aria-labelledby')).toBe(false);
  });

  it('is named by label, set as aria-label on the switch button', async () => {
    const { fixture, host, switchEl } = await render();
    host.name.set('Automatic renewal');
    fixture.detectChanges();

    expect(switchEl().getAttribute('aria-label')).toBe('Automatic renewal');
  });

  it('is named by labelledBy, pointing the switch button at that text', async () => {
    const { fixture, host, switchEl } = await render();
    host.nameId.set('the-name');
    fixture.detectChanges();

    const id = switchEl().getAttribute('aria-labelledby');
    expect(id).toBe('the-name');
    const text = (fixture.nativeElement as HTMLElement).querySelector(`#${id}`)?.textContent;
    expect(text).toBe('Automatic renewal');
  });
});
