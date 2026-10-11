import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route, Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appRoutes } from './app.routes';
import { RouteHead, routeHeadFor } from '@core/route-head';
import { DISALLOWED_PATHS } from '@core/robots';
import { CLIENT_ONLY } from './app.routes.server';
import { sitemapPaths } from '@features/public/landing/sitemap-urls';
import { BLOG_POSTS } from '@features/public/blog/blog-posts';
import { BillingPage } from '@features/host/subscription/billing-page';
import { PayPlaceholder } from '@features/host/subscription/pay-placeholder';
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

async function settleOn(url: string): Promise<{
  url: string;
  original: unknown;
  loaded: () => Promise<unknown>;
  head: RouteHead;
}> {
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
    head: routeHeadFor(router.routerState.snapshot),
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
    expect(settled.original).toBe(PayPlaceholder);
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

/** Every route that says who writes its head, and the sitemap that must agree with it. */
describe('who owns each route head', () => {
  afterEach(() => TestBed.resetTestingModule());

  const STATIC = [
    '',
    '/about',
    '/faqs',
    '/blog',
    '/pricing',
    '/contact',
    '/careers',
    '/privacy-policy',
    '/terms-of-service',
    '/service-policy',
    '/credits',
  ];
  const staticUrls = ['en', 'ur'].flatMap((code) => STATIC.map((p) => `/${code}${p}`));

  it.each(staticUrls)('settles %s on its own address with an indexable head owner', async (url) => {
    const settled = await settleOn(url);

    expect(settled.url).toBe(url);
    expect(['index', 'page']).toContain(settled.head.head);
  });

  it('has the sitemap list exactly the static URLs checked above, and no other shallow ones', () => {
    // Static pages are at most a language and one segment: ['', 'en', 'about'].
    const shallow = sitemapPaths().filter(
      (p) => p.split('/').length <= 3 && ['en', 'ur'].includes(p.split('/')[1]),
    );

    expect([...shallow].sort()).toEqual([...staticUrls].sort());
  });

  it('puts exactly the 8 index routes in the sitemap', () => {
    const localised = appRoutes[0].children ?? [];
    const indexPaths = localised.filter((r) => r.data?.['head'] === 'index').map((r) => r.path);

    expect(indexPaths).toHaveLength(8);
    const paths = sitemapPaths();
    for (const path of indexPaths) {
      expect(paths, path).toContain(`/en/${path}`);
      expect(paths, path).toContain(`/ur/${path}`);
    }
  });

  it.each([
    [`/en/blog/${BLOG_POSTS[0].slug}`],
    ['/en/hostel/some-listing'],
    ['/en/search/lahore'],
    ['/en/hostels/lahore/girls'],
  ])('lets %s inherit the page-owned head from its parent route', async (url) => {
    const settled = await settleOn(url);

    expect(settled.url).toBe(url);
    expect(settled.head.head).toBe('page');
  });

  it('sends the account help redirect to the FAQs, which have an index head', async () => {
    const settled = await settleOn('/en/account/help');

    // Bare `/faqs`: recognitionOnly drops the keepLocale guard that would add the language back.
    expect(settled.url).toBe('/faqs');
    expect(settled.head.head).toBe('index');
  });
});

/** A route that renders a page, with where it sits and which head owner it ends up with. */
interface PageRoute {
  /** The path under the language prefix, e.g. `account/settings`. */
  path: string;
  head: RouteHead['head'];
}

/** Resolves a `loadChildren` result to its routes, whichever shape the loader returned. */
async function lazyRoutes(route: Route, where: string): Promise<Route[]> {
  const loaded: unknown = await (route.loadChildren as () => unknown)();
  if (Array.isArray(loaded)) return loaded as Route[];
  const fromDefault = (loaded as { default?: unknown } | null)?.default;
  if (Array.isArray(fromDefault)) return fromDefault as Route[];
  throw new Error(`The lazy children of "${where}" are not a route array, so they cannot be read`);
}

/**
 * Every route under the language prefix that renders a component, lazy children included.
 *
 * `head` is the deepest `data.head` on the way down, the same rule `routeHeadFor` applies at
 * runtime. Redirects render nothing and are skipped.
 */
async function pageRoutes(
  routes: Route[],
  prefix = '',
  inherited?: RouteHead['head'],
): Promise<PageRoute[]> {
  const found: PageRoute[] = [];
  for (const route of routes) {
    if (route.redirectTo !== undefined) continue;
    const path = [prefix, route.path].filter(Boolean).join('/');
    const head = (route.data?.['head'] as RouteHead['head']) ?? inherited;
    if (route.component || route.loadComponent) found.push({ path, head });
    if (route.children) found.push(...(await pageRoutes(route.children, path, head)));
    if (typeof route.loadChildren === 'function') {
      found.push(...(await pageRoutes(await lazyRoutes(route, path), path, head)));
    }
  }
  return found;
}

/**
 * First path segments whose pages are deliberately kept out of the index: the client-only
 * areas, the auth screens and the two token links. Read from `DISALLOWED_PATHS`, which
 * robots.txt is generated from, so a new private area is covered once it is added there.
 */
const NOINDEX_PUBLIC: readonly string[] = DISALLOWED_PATHS;

const underNoindex = (path: string) => NOINDEX_PUBLIC.includes(path.split('/')[0]);
const show = (routes: PageRoute[]) => routes.map((r) => `/:locale/${r.path}`).join(', ');

/** Every page route, so a forgotten head flag is caught whether or not the sitemap lists it. */
describe('the head owner of every page route', () => {
  let pages: PageRoute[];

  beforeAll(async () => {
    pages = await pageRoutes(appRoutes[0].children ?? []);
  });

  it('keeps every client-only area inside the noindex allow-list', () => {
    for (const area of CLIENT_ONLY) expect(NOINDEX_PUBLIC, area).toContain(area);
  });

  it.each(NOINDEX_PUBLIC)('finds at least one page under %s, so the walk is not vacuous', (area) => {
    expect(pages.filter((p) => p.path.split('/')[0] === area).length, area).toBeGreaterThan(0);
  });

  it('gives every page outside the noindex areas a head owner', () => {
    const unflagged = pages.filter((p) => !underNoindex(p.path) && p.head === undefined);

    expect(
      unflagged,
      `These pages render a component but declare no data.head, so they would ship noindex: ${show(unflagged)}. Set head to 'page' or 'index' on the route or a parent, or add the first path segment to DISALLOWED_PATHS if the page is meant to stay out of the index.`,
    ).toEqual([]);
  });

  it('gives no page under a noindex area a head owner', () => {
    const leaking = pages.filter((p) => underNoindex(p.path) && p.head !== undefined);

    expect(
      leaking,
      `These pages sit under a noindex area but resolve to an indexable head: ${show(leaking)}. Remove data.head from them or from a parent.`,
    ).toEqual([]);
  });
});
