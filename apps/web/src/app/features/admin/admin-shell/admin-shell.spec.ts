import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { AdminShell } from './admin-shell';

@Component({
  imports: [AdminShell],
  template: `
    <hh-admin-shell heading="Roles and seats 7Q">
      <button actions type="button" data-testid="projected-action">
        Invite
      </button>
      <p data-testid="projected-body">Body 4Z</p>
    </hh-admin-shell>
  `,
})
class Host {}

describe('AdminShell', () => {
  function render(): HTMLElement {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideI18nTesting()],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('renders exactly one h1 carrying its heading', () => {
    const root = render();

    const headings = root.querySelectorAll('h1');
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent?.trim()).toBe('Roles and seats 7Q');
  });

  it('projects the actions slot into the header and the content into the body', () => {
    const root = render();

    const header = root.querySelector('header')!;
    expect(
      header.querySelector('[data-testid="projected-action"]'),
    ).not.toBeNull();
    expect(
      header.querySelector('[data-testid="projected-body"]'),
    ).toBeNull();
    expect(
      root.querySelector('[data-testid="projected-body"]')?.textContent,
    ).toBe('Body 4Z');
  });

  it('leaves no title attribute on the host, so no native tooltip shadows the heading', () => {
    const root = render();

    expect(root.querySelector('hh-admin-shell')!.hasAttribute('title')).toBe(
      false,
    );
  });
});
