import { Component, signal, Type } from '@angular/core';
import { provideTranslocoTesting } from '../../../testing/provide-transloco-testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Input, InputSize } from './input';

@Component({
  imports: [Input],
  template: `<hh-input
    label="Password"
    type="password"
    [(value)]="password"
  />`,
})
class PasswordHost {
  readonly password = signal('hunter2');
}

@Component({
  imports: [Input],
  template: `<hh-input [type]="type()" [(value)]="value" />`,
})
class TypeHost {
  readonly type = signal('text');
  readonly value = signal('plain text');
}

@Component({
  imports: [Input],
  template: `<hh-input
    type="password"
    [disabled]="true"
    [(value)]="password"
  />`,
})
class DisabledHost {
  readonly password = signal('hunter2');
}

@Component({
  imports: [Input],
  template: `<form (submit)="onSubmit($event)">
    <hh-input type="password" [(value)]="password" />
  </form>`,
})
class FormHost {
  readonly password = signal('hunter2');
  submits = 0;

  onSubmit(event: Event): void {
    event.preventDefault();
    this.submits += 1;
  }
}

@Component({
  imports: [Input],
  template: `<hh-input
    type="password"
    [value]="password()"
    (valueChange)="password.set($event)"
  />`,
})
class OneWayHost {
  readonly password = signal('hunter2');
}

@Component({
  imports: [Input],
  template: `<hh-input
    type="password"
    autocomplete="current-password"
    [(value)]="password"
  />`,
})
class AutocompleteHost {
  readonly password = signal('hunter2');
}

@Component({
  imports: [Input],
  template: `<hh-input type="password" [(value)]="first" />
    <hh-input type="password" [(value)]="second" />`,
})
class TwoFieldHost {
  readonly first = signal('first-secret');
  readonly second = signal('second-secret');
}

@Component({
  imports: [Input],
  template: `<hh-input
    type="password"
    error="Passwords do not match."
    [(value)]="password"
  />`,
})
class ErrorHost {
  readonly password = signal('hunter2');
}

@Component({
  imports: [Input],
  template: `<hh-input type="password" [size]="size()" [(value)]="password" />`,
})
class SizeHost {
  readonly size = signal<InputSize>('md');
  readonly password = signal('hunter2');
}

async function render<T>(host: Type<T>): Promise<ComponentFixture<T>> {
  await TestBed.configureTestingModule({ imports: [host], providers: [provideTranslocoTesting()] }).compileComponents();
  const fixture = TestBed.createComponent(host);
  fixture.detectChanges();
  return fixture;
}

function field(fixture: ComponentFixture<unknown>, index = 0): HTMLElement {
  const root = fixture.nativeElement as HTMLElement;
  return root.querySelectorAll('hh-input')[index] as HTMLElement;
}

function box(fixture: ComponentFixture<unknown>, index = 0): HTMLElement {
  return field(fixture, index).querySelector('div') as HTMLElement;
}

function inputEl(
  fixture: ComponentFixture<unknown>,
  index = 0,
): HTMLInputElement {
  return field(fixture, index).querySelector('input') as HTMLInputElement;
}

function toggleEl(
  fixture: ComponentFixture<unknown>,
  index = 0,
): HTMLButtonElement | null {
  return field(fixture, index).querySelector('button');
}

function eyeIcon(fixture: ComponentFixture<unknown>, index = 0): HTMLElement {
  return toggleEl(fixture, index)?.querySelector('i') as HTMLElement;
}

function classesOf(el: Element | null): string[] {
  return Array.from(el?.classList ?? []);
}

// ti-eye is a prefix of ti-eye-off, so the icon is matched on exact class tokens.
function expectMasked(fixture: ComponentFixture<unknown>, index = 0): void {
  expect(classesOf(eyeIcon(fixture, index))).toContain('ti-eye');
  expect(classesOf(eyeIcon(fixture, index))).not.toContain('ti-eye-off');
}

function expectRevealed(fixture: ComponentFixture<unknown>, index = 0): void {
  expect(classesOf(eyeIcon(fixture, index))).toContain('ti-eye-off');
  expect(classesOf(eyeIcon(fixture, index))).not.toContain('ti-eye');
}

function clickToggle(fixture: ComponentFixture<unknown>, index = 0): void {
  toggleEl(fixture, index)?.click();
  fixture.detectChanges();
}

function typeInto(
  fixture: ComponentFixture<unknown>,
  value: string,
  index = 0,
): void {
  const el = inputEl(fixture, index);
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  fixture.detectChanges();
}

// jsdom never runs the native activation behaviour for key events, so it is emulated here.
function activateWithKey(el: HTMLElement, key: string): void {
  const notPrevented = el.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
  );
  const nativelyActivates =
    el instanceof HTMLButtonElement && (key === 'Enter' || key === ' ');
  if (notPrevented && nativelyActivates) el.click();
}

describe('Input', () => {
  describe('reveal toggle presence', () => {
    it('renders exactly one reveal toggle inside the field box for password fields', async () => {
      const fixture = await render(PasswordHost);
      const root = fixture.nativeElement as HTMLElement;
      expect(
        box(fixture).querySelectorAll('button[type="button"]').length,
      ).toBe(1);
      expect(root.querySelectorAll('button').length).toBe(1);
    });

    it('renders no reveal toggle for text, email and number fields', async () => {
      const fixture = await render(TypeHost);
      for (const type of ['text', 'email', 'number']) {
        fixture.componentInstance.type.set(type);
        fixture.detectChanges();
        expect(inputEl(fixture).type).toBe(type);
        expect(toggleEl(fixture)).toBeNull();
      }
    });

    it('renders no reveal toggle while the field is disabled', async () => {
      const fixture = await render(DisabledHost);
      expect(inputEl(fixture).disabled).toBe(true);
      expect(toggleEl(fixture)).toBeNull();
    });
  });

  describe('toggling', () => {
    it('switches the rendered input type between password and text and back', async () => {
      const fixture = await render(PasswordHost);
      expect(inputEl(fixture).type).toBe('password');
      clickToggle(fixture);
      expect(inputEl(fixture).type).toBe('text');
      clickToggle(fixture);
      expect(inputEl(fixture).type).toBe('password');
    });

    it('swaps the eye icon between the masked and revealed states', async () => {
      const fixture = await render(PasswordHost);
      expectMasked(fixture);
      clickToggle(fixture);
      expectRevealed(fixture);
      clickToggle(fixture);
      expectMasked(fixture);
    });

    it('leaves the declared type unchanged when the value is revealed', async () => {
      const fixture = await render(PasswordHost);
      const instance = fixture.debugElement.query(By.directive(Input))
        .componentInstance as Input;
      expect(instance.type()).toBe('password');
      clickToggle(fixture);
      expect(inputEl(fixture).type).toBe('text');
      expect(instance.type()).toBe('password');
    });

    it('keeps the reveal state independent per field', async () => {
      const fixture = await render(TwoFieldHost);
      clickToggle(fixture, 0);
      expect(inputEl(fixture, 0).type).toBe('text');
      expect(inputEl(fixture, 1).type).toBe('password');
      expectMasked(fixture, 1);
    });
  });

  describe('form safety', () => {
    it('declares the toggle as a non-submitting button', async () => {
      const fixture = await render(PasswordHost);
      expect(toggleEl(fixture)?.type).toBe('button');
    });

    it('does not submit the surrounding form when the toggle is clicked', async () => {
      const fixture = await render(FormHost);
      clickToggle(fixture);
      expect(inputEl(fixture).type).toBe('text');
      expect(fixture.componentInstance.submits).toBe(0);
    });
  });

  describe('keyboard', () => {
    it('renders the toggle as a natively focusable button element', async () => {
      const toggle = toggleEl(await render(PasswordHost));
      expect(toggle?.tagName).toBe('BUTTON');
      expect(toggle?.getAttribute('role')).toBeNull();
      expect(toggle?.hasAttribute('tabindex')).toBe(false);
      expect(toggle?.tabIndex).toBe(0);
    });

    it('reveals the value when the toggle is activated with Enter', async () => {
      const fixture = await render(PasswordHost);
      activateWithKey(toggleEl(fixture) as HTMLElement, 'Enter');
      fixture.detectChanges();
      expect(inputEl(fixture).type).toBe('text');
    });

    it('reveals the value when the toggle is activated with Space', async () => {
      const fixture = await render(PasswordHost);
      activateWithKey(toggleEl(fixture) as HTMLElement, ' ');
      fixture.detectChanges();
      expect(inputEl(fixture).type).toBe('text');
    });

    it('places the toggle after the input so it comes next in tab order', async () => {
      const fixture = await render(PasswordHost);
      const position = inputEl(fixture).compareDocumentPosition(
        toggleEl(fixture) as Node,
      );
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  describe('accessibility', () => {
    it('reflects the reveal state in aria-pressed', async () => {
      const fixture = await render(PasswordHost);
      expect(toggleEl(fixture)?.getAttribute('aria-pressed')).toBe('false');
      clickToggle(fixture);
      expect(toggleEl(fixture)?.getAttribute('aria-pressed')).toBe('true');
      clickToggle(fixture);
      expect(toggleEl(fixture)?.getAttribute('aria-pressed')).toBe('false');
    });

    it('keeps the accessible name stable across toggles', async () => {
      const fixture = await render(PasswordHost);
      const before = toggleEl(fixture)?.getAttribute('aria-label');
      expect(before).toBeTruthy();
      clickToggle(fixture);
      expect(toggleEl(fixture)?.getAttribute('aria-label')).toBe(before);
    });

    it('hides the decorative eye icon from assistive technology', async () => {
      const fixture = await render(PasswordHost);
      expect(eyeIcon(fixture).getAttribute('aria-hidden')).toBe('true');
    });

    it('points aria-controls at the input it reveals', async () => {
      const fixture = await render(PasswordHost);
      const id = inputEl(fixture).id;
      expect(id).toBeTruthy();
      expect(toggleEl(fixture)?.getAttribute('aria-controls')).toBe(id);
    });
  });

  describe('reveal reset', () => {
    it('remasks the field when the value is cleared by the parent', async () => {
      const fixture = await render(PasswordHost);
      clickToggle(fixture);
      expect(inputEl(fixture).type).toBe('text');
      fixture.componentInstance.password.set('');
      fixture.detectChanges();
      expect(inputEl(fixture).type).toBe('password');
      expectMasked(fixture);
    });

    it('remasks the field when cleared through a one-way value binding', async () => {
      const fixture = await render(OneWayHost);
      clickToggle(fixture);
      expect(inputEl(fixture).type).toBe('text');
      fixture.componentInstance.password.set('');
      fixture.detectChanges();
      expect(inputEl(fixture).type).toBe('password');
      expectMasked(fixture);
    });

    it('stays revealed while the user keeps typing', async () => {
      const fixture = await render(PasswordHost);
      clickToggle(fixture);
      typeInto(fixture, 'hunter2x');
      expect(fixture.componentInstance.password()).toBe('hunter2x');
      expect(inputEl(fixture).type).toBe('text');
      expectRevealed(fixture);
    });

    it('remasks the field once the user deletes the last character', async () => {
      const fixture = await render(PasswordHost);
      clickToggle(fixture);
      typeInto(fixture, 'h');
      expect(inputEl(fixture).type).toBe('text');
      typeInto(fixture, '');
      expect(inputEl(fixture).type).toBe('password');
      expectMasked(fixture);
    });

    it('starts masked and stays masked until the toggle is used', async () => {
      const fixture = await render(PasswordHost);
      typeInto(fixture, 'another-secret');
      expect(inputEl(fixture).type).toBe('password');
      expect(toggleEl(fixture)?.getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('autocomplete', () => {
    it('forwards the provided autocomplete value to the input', async () => {
      const fixture = await render(AutocompleteHost);
      expect(inputEl(fixture).getAttribute('autocomplete')).toBe(
        'current-password',
      );
    });

    it('emits no autocomplete attribute when none is provided', async () => {
      const fixture = await render(PasswordHost);
      expect(inputEl(fixture).hasAttribute('autocomplete')).toBe(false);
    });
  });

  describe('password field hygiene', () => {
    it('turns off autocapitalize, autocorrect and spellcheck for password fields', async () => {
      const el = inputEl(await render(PasswordHost));
      expect(el.getAttribute('autocapitalize')).toBe('none');
      expect(el.getAttribute('autocorrect')).toBe('off');
      expect(el.getAttribute('spellcheck')).toBe('false');
    });

    it('leaves those attributes off for non-password fields', async () => {
      const el = inputEl(await render(TypeHost));
      expect(el.hasAttribute('autocapitalize')).toBe(false);
      expect(el.hasAttribute('autocorrect')).toBe(false);
      expect(el.hasAttribute('spellcheck')).toBe(false);
    });
  });

  describe('toggle styling', () => {
    it('keeps the toggle neutral instead of red in the error state', async () => {
      const fixture = await render(ErrorHost);
      const classes = classesOf(toggleEl(fixture));
      expect(classes).toContain('text-ink-400');
      expect(classes).not.toContain('text-danger');
    });

    it('sizes the toggle to match the field size', async () => {
      const fixture = await render(SizeHost);
      expect(classesOf(toggleEl(fixture))).toEqual(
        expect.arrayContaining(['h-7', 'w-7', 'text-base']),
      );
      fixture.componentInstance.size.set('sm');
      fixture.detectChanges();
      expect(classesOf(toggleEl(fixture))).toEqual(
        expect.arrayContaining(['h-6', 'w-6', 'text-sm']),
      );
    });
  });
});
