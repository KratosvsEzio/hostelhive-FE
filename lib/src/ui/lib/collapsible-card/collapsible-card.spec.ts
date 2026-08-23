import { Component, signal } from '@angular/core';
import { provideTranslocoTesting } from '../../../testing/provide-transloco-testing';
import { TestBed } from '@angular/core/testing';
import { CollapsibleCard } from './collapsible-card';

@Component({
  imports: [CollapsibleCard],
  template: `
    <hh-collapsible-card heading="Photos" [(open)]="open">
      <span aside class="count">· 8</span>
      <p class="body">body content</p>
    </hh-collapsible-card>
  `,
})
class Host {
  readonly open = signal(true);
}

async function render() {
  await TestBed.configureTestingModule({ imports: [Host], providers: [provideTranslocoTesting()] }).compileComponents();
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    host: fixture.componentInstance,
    toggle: () => el.querySelector('button') as HTMLButtonElement,
    body: () => el.querySelector('button + div') as HTMLElement,
  };
}

describe('CollapsibleCard', () => {
  it('starts expanded — a page of collapsed headings hides everything on arrival', async () => {
    const { toggle, body } = await render();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(body().hasAttribute('hidden')).toBe(false);
  });

  it('collapses and re-expands on click', async () => {
    const { fixture, toggle, body } = await render();

    toggle().click();
    fixture.detectChanges();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(body().hasAttribute('hidden')).toBe(true);

    toggle().click();
    fixture.detectChanges();
    expect(body().hasAttribute('hidden')).toBe(false);
  });

  it('writes the state back through [(open)]', async () => {
    const { fixture, host, toggle } = await render();
    toggle().click();
    fixture.detectChanges();
    expect(host.open()).toBe(false);
  });

  // Collapsing must not destroy the body: half-typed input and scroll position survive,
  // and a native form submit still sees every field.
  it('keeps the body in the DOM while collapsed', async () => {
    const { fixture, toggle, body } = await render();
    toggle().click();
    fixture.detectChanges();
    expect(body().querySelector('.body')?.textContent).toContain('body content');
  });

  it('renders the heading and projects aside content beside it', async () => {
    const { toggle } = await render();
    expect(toggle().textContent).toContain('Photos');
    expect(toggle().querySelector('.count')?.textContent).toContain('· 8');
  });
});
