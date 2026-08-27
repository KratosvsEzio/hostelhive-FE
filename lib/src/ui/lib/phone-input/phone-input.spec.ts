import { Component, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslocoTesting } from '../../../testing/provide-transloco-testing';
import { PhoneInput } from './phone-input';

@Component({
  imports: [PhoneInput],
  template: `<hh-phone-input [(phone)]="phone" />`,
})
class Host {
  readonly phone = signal('');
}

/**
 * Showing a number the form already has.
 *
 * The wrapped widget takes a starting number from `initialValue` and writes its parsed result
 * into `fieldControl` — two different things, and this wrapper bound only the second. So a
 * form that loaded a saved number rendered an empty field, and the host was invited to retype
 * what they had already given.
 *
 * It went unnoticed because no screen displayed this input over stored data: it was create-only
 * on the hostel form, and the staff drawer is the one place that edits it. Both edit surfaces
 * on the hostel — the profile and the moderator's review — now show it, so this had to work.
 */
describe('PhoneInput seeding', () => {
  /** The widget seeds itself inside a `setTimeout`; nothing is true until that has run. */
  async function render(initial: string): Promise<{
    fixture: ComponentFixture<Host>;
    host: Host;
    input: HTMLInputElement | null;
  }> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideTranslocoTesting(), provideHttpClient(), provideNoopAnimations()],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.phone.set(initial);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 300));
    fixture.detectChanges();
    return {
      fixture,
      host: fixture.componentInstance,
      input: fixture.nativeElement.querySelector('input'),
    };
  }

  it('shows a number the form already had', async () => {
    const { host, input } = await render('+923001234567');

    expect(host.phone()).toBe('+923001234567');
    // Rendered nationally — the model stays E.164, which is what the API is given.
    expect(input?.value.replace(/\s/g, '')).toBe('03001234567');
  });

  it('keeps the model in E.164 whatever the field displays', async () => {
    const { host } = await render('+441632960961');
    expect(host.phone()).toBe('+441632960961');
  });

  // The create case: nothing to seed, and nothing invented.
  it('starts empty when there is no number yet', async () => {
    const { host, input } = await render('');

    expect(host.phone()).toBe('');
    expect(input?.value ?? '').toBe('');
  });
});
