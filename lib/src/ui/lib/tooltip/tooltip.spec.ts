import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TooltipFixed } from './tooltip';

@Component({
  imports: [TooltipFixed],
  template: `<button type="button" [hhTooltip]="text()">OUT</button>`,
})
class Host {
  // A signal, not a field: reassigning a plain field between change-detection passes trips
  // NG0100 in dev mode, which reads as a tooltip failure and is not one.
  readonly text = signal('Checked out');
}

/**
 * `TooltipFixed` is often the only place an abbreviation is expanded.
 *
 * That is why it answers to focus as well as hover: a keyboard user who can reach a control
 * but not point at it would otherwise have no way to find out what "OUT" means. It appends to
 * `<body>` rather than drawing in place because its callers sit inside `overflow: hidden`
 * panels that would clip a CSS tooltip.
 */
describe('TooltipFixed', () => {
  let fixture: ComponentFixture<Host>;

  function tips(): string[] {
    return [...document.body.children]
      .filter((n) => n.tagName === 'DIV' && (n.getAttribute('style') ?? '').includes('position: fixed'))
      .map((n) => n.textContent ?? '');
  }

  function trigger(type: string): void {
    const btn = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    btn.dispatchEvent(
      type === 'focus' || type === 'blur'
        ? new FocusEvent(type)
        : new MouseEvent(type),
    );
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('shows the full text on hover', () => {
    trigger('mouseenter');
    expect(tips()).toEqual(['Checked out']);
  });

  it('clears it again on leave', () => {
    trigger('mouseenter');
    trigger('mouseleave');
    expect(tips()).toEqual([]);
  });

  // The keyboard route. Without it the abbreviation has no expansion for anyone not pointing.
  it('shows on focus and clears on blur', () => {
    trigger('focus');
    expect(tips()).toEqual(['Checked out']);

    trigger('blur');
    expect(tips()).toEqual([]);
  });

  // Measured as a delta, not an absolute: these specs share one `<body>`, so a stray popup
  // from a neighbour would fail this for the wrong reason.
  it('renders nothing when there is no text to show', () => {
    fixture.componentInstance.text.set('');
    fixture.detectChanges();

    const before = tips().length;
    trigger('mouseenter');

    expect(tips().length).toBe(before);
  });

  // The popup lives on <body>, so a component torn down mid-hover would strand it there.
  it('takes its popup with it when destroyed', () => {
    trigger('mouseenter');
    expect(tips().length).toBe(1);

    fixture.destroy();
    expect(tips()).toEqual([]);
  });

  it('never swallows the pointer', () => {
    trigger('mouseenter');
    const tip = [...document.body.children].find(
      (n) => n.tagName === 'DIV' && (n.getAttribute('style') ?? '').includes('position: fixed'),
    ) as HTMLElement;
    expect(tip.style.pointerEvents).toBe('none');
  });
});
