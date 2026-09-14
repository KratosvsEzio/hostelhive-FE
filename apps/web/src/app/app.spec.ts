import { TestBed } from '@angular/core/testing';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideI18nTesting()],
    }).compileComponents();
  });

  it('creates the root app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });
});


/**
 * The skip link's one job: move focus, not just the scroll position.
 *
 * A skip link that only scrolls leaves focus in the header, so the reader's very next Tab
 * walks straight back into the navigation they asked to skip — it looks like it worked and
 * changed nothing. That is the failure this pins.
 *
 * The handler is tested directly rather than through a rendered shell: rendering pulls in the
 * header, and with it the whole auth and API provider graph, none of which this behaviour
 * depends on. The separate trap — that `<a href="#main-content">` resolves against
 * `<base href="/">` and navigates to the landing page — cannot be reproduced in jsdom and is
 * recorded in the template comment instead.
 */
describe('App.skipToContent', () => {
  afterEach(() => document.getElementById('main-content')?.remove());

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideI18nTesting()],
    }).compileComponents();
  });

  function withMain(): { app: { skipToContent(): void }; main: HTMLElement } {
    const main = document.createElement('main');
    main.id = 'main-content';
    main.tabIndex = -1;
    document.body.appendChild(main);
    const app = TestBed.createComponent(App).componentInstance as unknown as {
      skipToContent(): void;
    };
    return { app, main };
  }

  it('moves focus onto the main landmark', () => {
    const { app, main } = withMain();

    app.skipToContent();

    expect(document.activeElement).toBe(main);
  });

  // The shell is not the only thing on the page — a dialog or a route without the landmark
  // must not throw on the first Tab of every visit.
  it('does nothing when there is no main landmark', () => {
    const app = TestBed.createComponent(App).componentInstance as unknown as {
      skipToContent(): void;
    };

    expect(() => app.skipToContent()).not.toThrow();
  });
});
