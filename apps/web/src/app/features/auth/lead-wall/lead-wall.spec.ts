import { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  ActivatedRoute,
  Params,
  Route,
  RouterLink,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { BehaviorSubject, map } from 'rxjs';
import { provideDataAccess } from '@core/provide-data-access';
import { LeadWall } from './lead-wall';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';

/** The component's members are `protected`; the spec asserts on them through this shape. */
interface LeadWallInternals {
  tab: WritableSignal<'register' | 'login'>;
  showErrors: WritableSignal<boolean>;
  confirmPassword: WritableSignal<string>;
  onTabChange(value: string): void;
}

/**
 * Stands in for `ActivatedRoute` with a mutable query string, so a query-param change on
 * an already-constructed instance is genuinely exercised — the route reuse strategy keeps
 * this component alive across `/auth` → `/auth?mode=login`.
 */
function stubRoute(initial: Params) {
  const queryParams$ = new BehaviorSubject<Params>(initial);
  return {
    queryParams$,
    provider: {
      provide: ActivatedRoute,
      useValue: {
        queryParamMap: queryParams$.pipe(map(convertToParamMap)),
        get snapshot() {
          return { queryParamMap: convertToParamMap(queryParams$.value) };
        },
      },
    },
  };
}

function internals(fixture: ComponentFixture<LeadWall>): LeadWallInternals {
  return fixture.componentInstance as unknown as LeadWallInternals;
}

/** The label of the highlighted tab, or null when nothing is highlighted. */
function activeTabLabel(fixture: ComponentFixture<LeadWall>): string | null {
  const buttons = Array.from(
    fixture.nativeElement.querySelectorAll('hh-tabs button'),
  ) as HTMLButtonElement[];
  const active = buttons.find((b) => b.className.includes('bg-white'));
  return active?.textContent?.trim() ?? null;
}

function heading(fixture: ComponentFixture<LeadWall>): string {
  return (
    fixture.nativeElement
      .querySelector('#hh-lead-wall-title')
      ?.textContent?.trim() ?? ''
  );
}

/** The `href` the × dismisses to, as resolved by `RouterLink`. */
function closeHref(fixture: ComponentFixture<LeadWall>): string | null {
  return fixture.nativeElement
    // Targeted by a stable hook, not by its label: the label is a translation key now,
    // and a behavioural test should not break because someone rewords a button.
    .querySelector('a[data-testid="lead-wall-close"]')
    ?.getAttribute('href');
}

/**
 * A stand-in for the real top-level config, since `closeTarget` reads `router.config` to
 * tell guarded routes from public ones. Importing `appRoutes` would eagerly pull in `Home`
 * and the maps library, so the shape is reproduced here instead.
 */
const ROUTES: Route[] = [
  { path: 'hostel/:slug', children: [] },
  { path: 'account', canActivate: [() => true], children: [] },
  { path: 'host/listings/new', canActivate: [() => true], children: [] },
];

function render(initial: Params, routes: Route[] = []) {
  const route = stubRoute(initial);
  TestBed.configureTestingModule({
    imports: [LeadWall],
    providers: [
      provideRouter(routes),
      provideDataAccess({ baseUrl: 'https://api.test' }),
      provideI18nTesting(),
      route.provider,
    ],
  });
  const fixture = TestBed.createComponent(LeadWall);
  fixture.detectChanges();
  return { fixture, queryParams$: route.queryParams$ };
}

describe('LeadWall', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('opens the Log in tab for ?mode=login', () => {
    const { fixture } = render({ mode: 'login' });
    expect(internals(fixture).tab()).toBe('login');
    expect(activeTabLabel(fixture)).toBe('Log in');
  });

  it('defaults to Register when no mode is given', () => {
    const { fixture } = render({});
    expect(internals(fixture).tab()).toBe('register');
    expect(activeTabLabel(fixture)).toBe('Register');
  });

  it('opens the Register tab for an explicit ?mode=register', () => {
    const { fixture } = render({ mode: 'register' });
    expect(internals(fixture).tab()).toBe('register');
    expect(activeTabLabel(fixture)).toBe('Register');
  });

  it.each(['foo', 'LOGIN', 'Login', ''])(
    'falls back to Register for an unrecognised mode=%j',
    (mode) => {
      const { fixture } = render({ mode });
      expect(internals(fixture).tab()).toBe('register');
      expect(activeTabLabel(fixture)).toBe('Register');
    },
  );

  it('re-seeds the tab when mode changes on a reused instance', () => {
    const { fixture, queryParams$ } = render({});
    expect(internals(fixture).tab()).toBe('register');

    queryParams$.next({ mode: 'login' });
    fixture.detectChanges();

    expect(internals(fixture).tab()).toBe('login');
    expect(activeTabLabel(fixture)).toBe('Log in');
  });

  it('keeps returnUrl intact alongside mode, in either order', () => {
    const first = render({ mode: 'login', returnUrl: '/host' });
    expect(internals(first.fixture).tab()).toBe('login');
    TestBed.resetTestingModule();

    const second = render({ returnUrl: '/host', mode: 'login' });
    expect(internals(second.fixture).tab()).toBe('login');
  });

  it('resets validation state when the user switches tabs by hand', () => {
    const { fixture } = render({});
    const vm = internals(fixture);
    vm.showErrors.set(true);
    vm.confirmPassword.set('Secret123');

    vm.onTabChange('login');

    expect(vm.tab()).toBe('login');
    expect(vm.showErrors()).toBe(false);
    expect(vm.confirmPassword()).toBe('');
  });

  it('keeps a hand-picked tab when an unrelated query param changes', () => {
    const { fixture, queryParams$ } = render({});
    internals(fixture).onTabChange('login');

    queryParams$.next({ returnUrl: '/host' });
    fixture.detectChanges();

    expect(internals(fixture).tab()).toBe('login');
    expect(activeTabLabel(fixture)).toBe('Log in');
  });

  describe('close button', () => {
    it('returns the visitor to the public page they came from', () => {
      const { fixture } = render({ returnUrl: '/hostel/lums-boys-hostel' }, ROUTES);
      expect(closeHref(fixture)).toBe('/hostel/lums-boys-hostel');
    });

    it('falls back to home when no returnUrl is given', () => {
      const { fixture } = render({}, ROUTES);
      expect(closeHref(fixture)).toBe('/');
    });

    it.each(['/account', '/account/favorites', '/host/listings/new'])(
      'falls back to home rather than bouncing off the guard on %j',
      (returnUrl) => {
        const { fixture } = render({ returnUrl }, ROUTES);
        expect(closeHref(fixture)).toBe('/');
      },
    );

    it.each(['//evil.com', '/\\evil.com', 'https://evil.com'])(
      'refuses the off-origin returnUrl %j',
      (returnUrl) => {
        const { fixture } = render({ returnUrl }, ROUTES);
        expect(closeHref(fixture)).toBe('/');
      },
    );

    it('tracks a returnUrl that changes on a reused instance', () => {
      const { fixture, queryParams$ } = render(
        { returnUrl: '/hostel/first-hostel' },
        ROUTES,
      );
      expect(closeHref(fixture)).toBe('/hostel/first-hostel');

      queryParams$.next({ returnUrl: '/account/favorites' });
      fixture.detectChanges();

      expect(closeHref(fixture)).toBe('/');
    });

    it('replaces history so browser-back does not reopen the wall', () => {
      const { fixture } = render({ returnUrl: '/hostel/lums-boys-hostel' }, ROUTES);
      const link = fixture.debugElement.query(By.css('a[data-testid="lead-wall-close"]'));
      expect(link.injector.get(RouterLink).replaceUrl).toBe(true);
    });
  });

  it('swaps the register conversion copy for log-in copy', () => {
    const registering = render({});
    expect(heading(registering.fixture)).toBe('See verified contact details');
    expect(registering.fixture.nativeElement.textContent).toContain(
      'Create a free account',
    );
    TestBed.resetTestingModule();

    const loggingIn = render({ mode: 'login' });
    expect(heading(loggingIn.fixture)).toBe('Welcome back');
    expect(loggingIn.fixture.nativeElement.textContent).not.toContain(
      'Create a free account',
    );
  });
});
