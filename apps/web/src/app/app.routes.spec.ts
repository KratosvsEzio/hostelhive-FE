import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route, Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appRoutes } from './app.routes';
import { BillingPage } from '@features/host/subscription/billing-page';
import { PaymentStep } from '@features/host/subscription/payment-step';
import { Pricing } from '@features/public/pricing/pricing';

@Component({ selector: 'hh-route-stub', template: '' })
class RouteStub {}

/**
 * The real route tree, reduced to what recognition needs.
 *
 * Paths, redirects, matchers and lazy children are kept as they are, so the router decides
 * exactly as it does in production. Guards are dropped and components swapped for an empty
 * stub, which keeps every console page out of the test and lets an unauthenticated session
 * navigate. The component a route would have rendered is kept in `data.original`.
 */
function recognitionOnly(routes: Route[]): Route[] {
  return routes.map((route) => {
    const { canActivate, canActivateChild, canDeactivate, resolve, ...kept } = route;
    void canActivate;
    void canActivateChild;
    void canDeactivate;
    void resolve;
    const lite: Route = { ...kept };
    if (route.component) {
      lite.component = RouteStub;
      lite.data = { ...route.data, original: route.component };
    }
    if (route.loadComponent) {
      lite.loadComponent = () => RouteStub;
      lite.data = { ...route.data, originalLoader: route.loadComponent };
    }
    if (route.children) {
      lite.children = recognitionOnly(route.children);
    }
    const lazy = route.loadChildren;
    if (typeof lazy === 'function') {
      lite.loadChildren = async () => recognitionOnly((await lazy()) as Route[]);
    }
    return lite;
  });
}

async function settleOn(
  url: string,
): Promise<{ url: string; original: unknown; loaded: () => Promise<unknown> }> {
  TestBed.configureTestingModule({ providers: [provideRouter(recognitionOnly(appRoutes))] });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  const router = TestBed.inject(Router);
  let leaf = router.routerState.snapshot.root;
  while (leaf.firstChild) leaf = leaf.firstChild;
  const loader = leaf.data['originalLoader'] as (() => unknown) | undefined;
  return {
    url: router.url,
    original: leaf.data['original'],
    // A lazy route's component is only known by running its loader.
    loaded: async () => (loader ? await loader() : undefined),
  };
}

describe('the removed billing and contract URLs', () => {
  afterEach(() => TestBed.resetTestingModule());

  const removed = [
    '/admin/contracts',
    '/host/listings/new/payment',
    '/host/nHelLt/subscription/payments',
    '/host/nHelLt/subscription/current',
    '/host/nHelLt/subscription/checkout/p1',
  ];

  it.each(removed)('sends %s to the home page', async (path) => {
    const settled = await settleOn(path);

    expect(settled.url).toBe('/');
  });

  it.each(removed)('sends the /ur/ copy of %s to the home page in Urdu', async (path) => {
    const settled = await settleOn(`/ur${path}`);

    expect(settled.url).toBe('/ur');
  });

  it('still serves the billing page itself', async () => {
    const settled = await settleOn('/host/nHelLt/subscription');

    expect(settled.url).toBe('/host/nHelLt/subscription');
    expect(settled.original).toBe(BillingPage);
  });

  it('still serves the billing page under a language prefix', async () => {
    const settled = await settleOn('/ur/host/nHelLt/subscription');

    expect(settled.url).toBe('/ur/host/nHelLt/subscription');
    expect(settled.original).toBe(BillingPage);
  });

  it('serves the payment step for an invoice', async () => {
    const settled = await settleOn('/host/nHelLt/subscription/pay/inv1');

    expect(settled.url).toBe('/host/nHelLt/subscription/pay/inv1');
    expect(settled.original).toBe(PaymentStep);
  });
});

describe('the public pricing page', () => {
  afterEach(() => TestBed.resetTestingModule());

  it.each(['/pricing', '/ur/pricing'])('serves the pricing page at %s', async (path) => {
    const settled = await settleOn(path);

    expect(settled.url).toBe(path);
    expect(await settled.loaded()).toBe(Pricing);
  });
});

/**
 * Meal confirmations are accepted only from notifications; no email or message links to a
 * confirm page. `/mess/confirm` was a mock opt-in page and `/meal_confirmation` is the URL the
 * backend builds but never sends. Both land on the notifications list rather than a 404.
 */
describe('the retired meal-confirmation URLs', () => {
  afterEach(() => TestBed.resetTestingModule());

  const retired = ['/mess/confirm?token=x', '/meal_confirmation?token=x'];

  it.each(retired)('sends %s to the notifications list', async (path) => {
    const settled = await settleOn(path);

    expect(settled.url).toBe('/notifications');
  });

  it.each(retired)('sends the /ur/ copy of %s to the notifications list in Urdu', async (path) => {
    const settled = await settleOn(`/ur${path}`);

    expect(settled.url).toBe('/ur/notifications');
  });
});
