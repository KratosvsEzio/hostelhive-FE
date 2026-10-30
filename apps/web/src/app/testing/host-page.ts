import { Component, EnvironmentProviders, Provider, Type } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RouteReuseStrategy, Router, Routes, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { API_CONFIG } from '@core/api-config';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { AppRouteReuseStrategy } from '@app/route-reuse-strategy';
import { BillingMode, HOSTEL_ID } from './host-builders';
import {
  HostBookingsApiStub,
  HostOpsApiStub,
  HostShellApiStub,
  NotificationSpy,
  seedHostPropertyStore,
} from './host-stubs';

/** Where any navigation outside the pages under test lands, e.g. `/host/h1/overview`. */
@Component({ template: '' })
class Elsewhere {}

/** The page components a test mounts; omit the ones it does not need. */
export interface HostTestPages {
  bookings?: Type<unknown>;
  invoices?: Type<unknown>;
  rooms?: Type<unknown>;
  roomDetail?: Type<unknown>;
}

const DRAWER_HOST = { drawerHost: true };

/**
 * The host routes the pages under test sit in, shaped like `HOST_ROUTES` without its guards or
 * shell: `bookings/:bookingId` a sibling of `bookings`, `invoices` with `create` / `edit/:billId` /
 * `view/:billId` children on the same component, the drawer routes flagged `drawerHost`, and
 * `rooms/:roomId` unflagged. A `**` route absorbs any other navigation so it cannot throw.
 */
export function hostTestRoutes(pages: HostTestPages): Routes {
  const children: Routes = [];
  if (pages.bookings) {
    children.push(
      { path: 'bookings', component: pages.bookings, data: DRAWER_HOST },
      { path: 'bookings/:bookingId', component: pages.bookings, data: DRAWER_HOST },
    );
  }
  if (pages.invoices) {
    const component = pages.invoices;
    children.push({
      path: 'invoices',
      children: [
        { path: '', pathMatch: 'full', component, data: DRAWER_HOST },
        { path: 'create', component, data: DRAWER_HOST },
        { path: 'edit/:billId', component, data: DRAWER_HOST },
        { path: 'view/:billId', component, data: DRAWER_HOST },
      ],
    });
  }
  if (pages.rooms || pages.roomDetail) {
    const rooms: Routes = [];
    if (pages.rooms) {
      rooms.push(
        { path: '', pathMatch: 'full', component: pages.rooms, data: DRAWER_HOST },
        { path: 'create', component: pages.rooms, data: DRAWER_HOST },
        { path: 'edit/:roomId', component: pages.rooms, data: DRAWER_HOST },
      );
    }
    if (pages.roomDetail) rooms.push({ path: ':roomId', component: pages.roomDetail });
    children.push({ path: 'rooms', children: rooms });
  }
  return [
    { path: 'host/:hostelId', children },
    { path: '**', component: Elsewhere },
  ];
}

/** Every stub a host page spec talks to, built fresh per test. */
export interface HostPageDeps {
  ops: HostOpsApiStub;
  bookings: HostBookingsApiStub;
  notifications: NotificationSpy;
  shell: HostShellApiStub;
}

export function hostPageDeps(): HostPageDeps {
  return {
    ops: new HostOpsApiStub(),
    bookings: new HostBookingsApiStub(),
    notifications: new NotificationSpy(),
    shell: new HostShellApiStub(),
  };
}

/**
 * Providers for a host page: real router (with the app's reuse strategy) over
 * {@link hostTestRoutes}, key-echo i18n, and the stubs in `deps`.
 *
 * `HttpClientTesting` sits underneath as a backstop for services the page reaches that are not
 * stubbed here (the subscription store, the locale store): their requests stay pending rather
 * than leaving the test environment.
 */
export function hostPageProviders(
  pages: HostTestPages,
  deps: HostPageDeps,
): (Provider | EnvironmentProviders)[] {
  return [
    provideRouter(hostTestRoutes(pages)),
    { provide: RouteReuseStrategy, useClass: AppRouteReuseStrategy },
    provideHttpClient(),
    provideHttpClientTesting(),
    { provide: API_CONFIG, useValue: { baseUrl: 'https://api.test' } },
    provideI18nTesting(),
    deps.ops.provider(),
    deps.bookings.provider(),
    deps.notifications.provider(),
    deps.shell.provider(),
  ];
}

export interface HostPageOptions {
  /** The selected hostel's billing cycle; `'night'` unless said. */
  billing?: BillingMode;
  /** Stubs to use instead of fresh ones — set replies on them before opening. */
  deps?: HostPageDeps;
  /** Extra providers, appended last so they win. */
  providers?: (Provider | EnvironmentProviders)[];
}

/** A host page mounted at a URL, with the means to move the URL and read the result. */
export interface HostPage<T> {
  readonly component: T;
  readonly el: HTMLElement;
  readonly deps: HostPageDeps;
  readonly router: Router;
  readonly harness: RouterTestingHarness;
  /** Navigates as the browser would (deep link, back, a typed URL) and settles. */
  navigate(url: string): Promise<void>;
  /** Lets pending navigations and async work finish, then renders. */
  settle(): Promise<void>;
  /** The router's current URL. */
  url(): string;
}

/**
 * Mounts `component` at `url` inside {@link hostTestRoutes}, with the store seeded and every
 * dependency stubbed.
 *
 * Navigation is real, so the page's own `navigateByUrl` / `navigate` calls move the URL, a
 * same-component route change reuses the instance exactly as in the app, and `router.url` is the
 * assertion. Spy on `page.router` methods when the call itself is the point.
 */
export async function openHostPage<T>(
  url: string,
  component: Type<T>,
  pages: HostTestPages,
  opts: HostPageOptions = {},
): Promise<HostPage<T>> {
  const deps = opts.deps ?? hostPageDeps();
  TestBed.configureTestingModule({
    providers: [...hostPageProviders(pages, deps), ...(opts.providers ?? [])],
  });
  seedHostPropertyStore(opts.billing ?? 'night', hostIdOf(url));
  const harness = await RouterTestingHarness.create();
  const instance = await harness.navigateByUrl(url, component);
  const router = TestBed.inject(Router);
  const settle = async (): Promise<void> => {
    await harness.fixture.whenStable();
    harness.detectChanges();
  };
  await settle();
  return {
    component: instance,
    el: harness.routeNativeElement as HTMLElement,
    deps,
    router,
    harness,
    navigate: async (next: string) => {
      await harness.navigateByUrl(next);
      await settle();
    },
    settle,
    url: () => router.url,
  };
}

function hostIdOf(url: string): string {
  return /^\/(?:[a-z]{2}\/)?host\/([^/?#]+)/.exec(url)?.[1] ?? HOSTEL_ID;
}
