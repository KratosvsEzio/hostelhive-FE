import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route, Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { RenderMode } from '@angular/ssr';
import { appRoutes } from '@app/app.routes';
import { CLIENT_ONLY, serverRoutes } from '@app/app.routes.server';
import { SessionStore, authGuard } from '@core/auth';
import { LocaleStore } from '@core/i18n/locale-store';
import { DISALLOWED_PATHS } from '@core/robots';
import { PAYMENT_RETURN_ROUTES } from './payment-return.routes';
import { PaymentCancelled } from './payment-cancelled';
import { PaymentSuccess } from './payment-success';

@Component({ selector: 'hh-route-stub', template: '' })
class RouteStub {}

/**
 * The real route tree with every page swapped for an empty stub, the page it would have
 * rendered kept in `data.original`. With `keepGuards` the guards stay, so the language
 * redirect and the sign-in wall run as they do in production.
 */
function stubbed(routes: Route[], keepGuards: boolean): Route[] {
  return routes.map((route) => {
    const { canActivate, canActivateChild, canDeactivate, resolve, ...kept } =
      route;
    const lite: Route = keepGuards ? { ...route } : { ...kept };
    void canActivate;
    void canActivateChild;
    void canDeactivate;
    void resolve;
    if (route.component) {
      lite.component = RouteStub;
      lite.data = { ...route.data, original: route.component };
    }
    if (route.loadComponent) {
      lite.loadComponent = () => RouteStub;
      lite.data = { ...route.data, originalLoader: route.loadComponent };
    }
    if (route.children) {
      lite.children = stubbed(route.children, keepGuards);
    }
    const lazy = route.loadChildren;
    if (typeof lazy === 'function') {
      lite.loadChildren = async () =>
        stubbed((await lazy()) as Route[], keepGuards);
    }
    return lite;
  });
}

interface Settled {
  url: string;
  original: unknown;
  query: Record<string, string>;
}

async function settleOn(
  url: string,
  options: { keepGuards: boolean; signedIn?: boolean; preference?: string },
): Promise<Settled> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(stubbed(appRoutes, options.keepGuards)),
      {
        provide: SessionStore,
        useValue: { isAuthenticated: () => !!options.signedIn },
      },
      {
        provide: LocaleStore,
        useValue: {
          active: () => 'en',
          storedPreference: () => options.preference ?? null,
        },
      },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  const router = TestBed.inject(Router);
  let leaf = router.routerState.snapshot.root;
  while (leaf.firstChild) leaf = leaf.firstChild;
  return {
    url: router.url,
    original: leaf.data['original'],
    query: { ...leaf.queryParams } as Record<string, string>,
  };
}

describe('the payment return routes', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('maps success and cancel to their pages, titled for the tab', () => {
    expect(PAYMENT_RETURN_ROUTES).toEqual([
      {
        path: 'success',
        component: PaymentSuccess,
        title: 'Payment — HostelHive',
      },
      {
        path: 'cancel',
        component: PaymentCancelled,
        title: 'Payment — HostelHive',
      },
    ]);
  });

  it('sits behind the sign-in guard alone, in both trees', () => {
    for (const mount of appRoutes) {
      const route = mount.children?.find((r) => r.path === 'billing/payment');
      expect(route, mount.path).toBeDefined();
      expect(route?.canActivate).toEqual([authGuard]);
    }
  });

  describe('recognition', () => {
    it.each([
      ['/billing/payment/success?invoice=x', PaymentSuccess],
      ['/ur/billing/payment/success?invoice=x', PaymentSuccess],
      ['/billing/payment/cancel?invoice=x', PaymentCancelled],
      ['/ur/billing/payment/cancel?invoice=x', PaymentCancelled],
    ])('serves %s without losing the invoice', async (url, page) => {
      const settled = await settleOn(url, { keepGuards: false });

      expect(settled.url).toBe(url);
      expect(settled.original).toBe(page);
      expect(settled.query['invoice']).toBe('x');
    });
  });

  describe('with the real guards', () => {
    it('gives a bare return link the remembered language, keeping the invoice', async () => {
      const settled = await settleOn('/billing/payment/success?invoice=x', {
        keepGuards: true,
        signedIn: true,
      });

      expect(settled.url).toBe('/en/billing/payment/success?invoice=x');
      expect(settled.original).toBe(PaymentSuccess);
      expect(settled.query['invoice']).toBe('x');
    });

    it('gives a bare return link the stored language preference, keeping the invoice', async () => {
      const settled = await settleOn('/billing/payment/success?invoice=x', {
        keepGuards: true,
        signedIn: true,
        preference: 'ur',
      });

      expect(settled.url).toBe('/ur/billing/payment/success?invoice=x');
      expect(settled.original).toBe(PaymentSuccess);
      expect(settled.query['invoice']).toBe('x');
    });

    it('serves a prefixed return link as it is', async () => {
      const settled = await settleOn('/ur/billing/payment/success?invoice=x', {
        keepGuards: true,
        signedIn: true,
      });

      expect(settled.url).toBe('/ur/billing/payment/success?invoice=x');
      expect(settled.original).toBe(PaymentSuccess);
    });

    it.each([
      [
        '/billing/payment/success?invoice=x',
        '/en/billing/payment/success?invoice=x',
      ],
      [
        '/ur/billing/payment/success?invoice=x',
        '/ur/billing/payment/success?invoice=x',
      ],
      [
        '/ur/billing/payment/cancel?invoice=x',
        '/ur/billing/payment/cancel?invoice=x',
      ],
    ])(
      'sends a signed-out visit to %s to sign in, coming back with the invoice',
      async (url, back) => {
        const settled = await settleOn(url, { keepGuards: true });
        const landed = new URL(settled.url, 'https://hostelhive.test');

        expect(landed.pathname).toMatch(/\/auth$/);
        expect(landed.searchParams.get('mode')).toBe('login');
        expect(landed.searchParams.get('returnUrl')).toBe(back);
        expect(landed.searchParams.get('returnUrl')).toContain('invoice=x');
      },
    );
  });
});

describe('the payment return pages outside the browser', () => {
  it('are never server-rendered, in any language', () => {
    expect(CLIENT_ONLY).toContain('billing/payment');
    for (const path of ['billing/payment/**', '*/billing/payment/**']) {
      const route = serverRoutes.find((r) => r.path === path);
      expect(route?.renderMode, path).toBe(RenderMode.Client);
    }
  });

  // The SSR build fails on a server route whose bare form names no route in the app.
  it.each(CLIENT_ONLY)(
    'names %s exactly as a route path in both trees',
    (path) => {
      for (const mount of appRoutes) {
        const paths = (mount.children ?? []).map((r) => r.path);
        expect(paths, mount.path).toContain(path);
      }
    },
  );

  it('are kept out of search engines', () => {
    expect(DISALLOWED_PATHS as readonly string[]).toContain('billing/payment');
  });
});
