import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { StatusPill } from './status-pill';

@Component({
  imports: [StatusPill],
  template: `<hh-status-pill tone="ok" [dot]="true">Paid</hh-status-pill>`,
})
class Host {}

describe('StatusPill', () => {
  it('applies the tone classes and projects its label', async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
    }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector(
      'hh-status-pill',
    ) as HTMLElement;
    expect(el.className).toContain('text-ok');
    expect(el.textContent).toContain('Paid');
  });
});
