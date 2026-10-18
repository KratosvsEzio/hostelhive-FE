import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route, Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appRoutes } from './app.routes';
import { BillingInvoiceDetail } from '@features/host/subscription/billing-invoice-detail';
import { BillingInvoices } from '@features/host/subscription/billing-invoices';
import { RouteHead, routeHeadFor } from '@core/route-head';
import { PageRoute, pageRoutes } from '@core/route-walk-testing';
import { at, loadLocale } from '@core/i18n/locale-files-testing';
import { DISALLOWED_PATHS } from '@core/robots';
import { CLIENT_ONLY } from './app.routes.server';
import { sitemapPaths } from '@features/public/landing/sitemap-urls';
import { SINGLE_LANGUAGE_PAGES, pageLocales } from '@core/i18n/content-locale';
import { BLOG_POSTS } from '@features/public/blog/blog-posts';
import { BillingPage } from '@features/host/subscription/billing-page';
import { PaymentStep } from '@features/host/subscription/payment-step';
import { Pricing } from '@features/public/pricing/pricing';
import { Role, SessionStore } from '@core/auth';
import { AdminBillingPayments } from '@features/admin/billing/payments/admin-billing-payments';
import { AdminVerification } from '@features/admin/billing/verification/admin-verification';
import { AdminHostelBilling } from '@features/admin/billing/hostel/admin-hostel-billing';

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
    expect(settled.original).toBe(PaymentStep);
  });

  it.each([
    ['/host/nHelLt/subscription/invoices', BillingInvoices],
    ['/host/nHelLt/subscription/invoices/inv1', BillingInvoiceDetail],
    ['/ur/host/nHelLt/subscription/invoices', BillingInvoices],
    ['/ur/host/nHelLt/subscription/invoices/inv1', BillingInvoiceDetail],
  ])('serves the invoice pages at %s', async (path, component) => {
    const settled = await settleOn(path);

    expect(settled.url).toBe(path);
    expect(settled.original).toBe(component);
  });
});

describe('the admin billing URLs', () => {
  afterEach(() => TestBed.resetTestingModule());

  /** Signs in as a session holding these roles and every flag, so only the role decides. */
  function signInAs(...roles: Role[]): void {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SessionStore,
          useValue: {
            hasRole: (...wanted: Role[]) => roles.some((r) => wanted.includes(r)),
            hasPermission: () => true,
          },
        },
      ],
    });
  }

  it.each([
    ['/admin/payments', '/admin/billing/payments'],
    ['/ur/admin/payments', '/ur/admin/billing/payments'],
  ])('sends the old payments page %s to %s', async (path, target) => {
    const settled = await settleOn(path);

    expect(settled.url).toBe(target);
    expect(settled.original).toBe(AdminBillingPayments);
  });

  it.each(['/admin/billing', '/ur/admin/billing'])(
    'opens the verification queue at %s',
    async (path) => {
      const settled = await settleOn(path);

      expect(settled.url).toBe(`${path}/verification`);
      expect(settled.original).toBe(AdminVerification);
    },
  );

  it('serves the billing of one hostel', async () => {
    const settled = await settleOn('/admin/billing/hostels/nHelLt');

    expect(settled.url).toBe('/admin/billing/hostels/nHelLt');
    expect(settled.original).toBe(AdminHostelBilling);
  });

  it.each([
    ['/admin', '/admin/billing/verification'],
    ['/ur/admin', '/ur/admin/billing/verification'],
  ])('lands an admin from %s on the verification queue', async (path, target) => {
    signInAs('admin');

    const settled = await settleOn(path);

    expect(settled.url).toBe(target);
  });

  it.each([
    ['/admin', '/admin/roles'],
    ['/ur/admin', '/ur/admin/roles'],
  ])('lands a super-admin without the admin role from %s on the first other page', async (path, target) => {
    signInAs('super-admin');

    const settled = await settleOn(path);

    expect(settled.url).toBe(target);
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
    // A single-language page still answers at /ur/…, but is listed in its own language only.
    const listed = ['en', 'ur'].flatMap((code) =>
      STATIC.filter((p) => pageLocales(p || '/').includes(code)).map((p) => `/${code}${p}`),
    );

    expect([...shallow].sort()).toEqual([...listed].sort());
    expect(shallow).not.toContain('/ur/privacy-policy');
  });

  it('puts exactly the 8 index routes in the sitemap', () => {
    const localised = appRoutes[0].children ?? [];
    const indexPaths = localised.filter((r) => r.data?.['head'] === 'index').map((r) => r.path);

    expect(indexPaths).toHaveLength(8);
    const paths = sitemapPaths();
    for (const path of indexPaths) {
      expect(paths, path).toContain(`/en/${path}`);
      if (SINGLE_LANGUAGE_PAGES[`/${path}`]) {
        expect(paths, path).not.toContain(`/ur/${path}`);
      } else {
        expect(paths, path).toContain(`/ur/${path}`);
      }
    }
  });

  // The head reads the route data and the sitemap reads the table; two lists of one fact
  // drift the first time somebody adds a page to only one of them.
  it('marks exactly the single-language pages with their content language', () => {
    const localised = appRoutes[0].children ?? [];
    const marked = Object.fromEntries(
      localised
        .filter((r) => r.data?.['contentLocale'] !== undefined)
        .map((r) => [`/${r.path}`, r.data?.['contentLocale']]),
    );

    expect(marked).toEqual(SINGLE_LANGUAGE_PAGES);
    for (const r of localised.filter((x) => x.data?.['contentLocale'] !== undefined)) {
      expect(r.data?.['head'], r.path).toBe('index');
    }
  });

  // Unlisted is not unserved: a visitor browsing in Arabic still reads the page at /ar/.
  it.each(['/ar/privacy-policy', '/de/terms-of-service', '/ar/service-policy', '/de/credits'])(
    'settles %s on its own address as an English-content index page',
    async (url) => {
      const settled = await settleOn(url);

      expect(settled.url).toBe(url);
      expect(settled.head).toEqual({ head: 'index', contentLocale: 'en' });
    },
  );

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

/**
 * Path prefixes whose pages are deliberately kept out of the index: the client-only areas,
 * the auth screens, the token links and the payment return pages. Read from
 * `DISALLOWED_PATHS`, which robots.txt is generated from, so a new private area is covered
 * once it is added there. An entry can be more than one segment (`billing/payment`).
 */
const NOINDEX_PUBLIC: readonly string[] = DISALLOWED_PATHS;

const isUnder = (path: string, area: string) => path === area || path.startsWith(`${area}/`);
const underNoindex = (path: string) => NOINDEX_PUBLIC.some((area) => isUnder(path, area));
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
    expect(pages.filter((p) => isUnder(p.path, area)).length, area).toBeGreaterThan(0);
  });

  it('gives every page outside the noindex areas a head owner', () => {
    const unflagged = pages.filter((p) => !underNoindex(p.path) && p.head === undefined);

    expect(
      unflagged,
      `These pages render a component but declare no data.head, so they would ship noindex: ${show(unflagged)}. Set head to 'page' or 'index' on the route or a parent, or add its path prefix to DISALLOWED_PATHS if the page is meant to stay out of the index.`,
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

/**
 * The English title every titled page ends up with, by path under the language prefix.
 *
 * Pinned as plain text so a changed label key, a changed wording in `en.json` or a changed
 * title template shows up here: Google Analytics history is keyed on these strings. The
 * public indexable titles are also covered against the server render in the e2e lane; this
 * table is the only check on the client-only and console ones. Wording that changed on
 * purpose: "Service policy", "Access blocked" and "Overview" now follow the standard template.
 */
const EXPECTED_TITLES: Record<string, string> = {
  'privacy-policy': 'Privacy Policy — HostelHive',
  'terms-of-service': 'Terms of Service — HostelHive',
  'service-policy': 'Service policy — HostelHive',
  credits: 'Image credits — HostelHive',
  about: 'About Us — HostelHive',
  faqs: 'FAQs — HostelHive',
  careers: 'Careers — HostelHive',
  contact: 'Contact Us — HostelHive',
  auth: 'Log in or sign up — HostelHive',
  'auth/forgot-password': 'Reset password — HostelHive',
  confirm_invitation: 'Confirm your account — HostelHive',
  reset_password: 'Reset password — HostelHive',
  'account/bookings': 'Your bookings — HostelHive',
  'account/bookings/:id': 'Booking — HostelHive',
  'account/bookings/:id/edit': 'Change booking — HostelHive',
  'account/favorites': 'Favorites — HostelHive',
  'account/settings': 'Account settings — HostelHive',
  'account/security': 'Password & security — HostelHive',
  notifications: 'Notifications — HostelHive',
  'billing/payment/success': 'Payment — HostelHive',
  'billing/payment/cancel': 'Payment — HostelHive',
  'host/listings/new': 'List your hostel — HostelHive',
  forbidden: 'Access blocked — HostelHive',
  'host/hostels/new': 'New hostel — HostelHive',
  'host/:hostelId/profile': 'Hostel profile — HostelHive',
  'host/:hostelId/more': 'More — HostelHive',
  'host/:hostelId/team': 'Team & staff — HostelHive',
  'host/:hostelId/team/edit/:staffId': 'Edit staff — HostelHive',
  'host/:hostelId/bookings': 'Bookings — HostelHive',
  'host/:hostelId/bookings/:bookingId': 'Bookings — HostelHive',
  'host/:hostelId/rooms': 'Rooms — HostelHive',
  'host/:hostelId/rooms/create': 'Add room — HostelHive',
  'host/:hostelId/rooms/bulk': 'Bulk add rooms — HostelHive',
  'host/:hostelId/rooms/edit/:roomId': 'Edit room — HostelHive',
  'host/:hostelId/rooms/:roomId': 'Room details — HostelHive',
  'host/:hostelId/tenants': 'Tenants — HostelHive',
  'host/:hostelId/tenants/create': 'Register Tenant — HostelHive',
  'host/:hostelId/tenants/edit/:tenantId': 'Edit tenant — HostelHive',
  'host/:hostelId/tenants/profile/:tenantId': 'Tenant Profile — HostelHive',
  'host/:hostelId/utilities': 'Utilities — HostelHive',
  'host/:hostelId/utilities/add': 'Add utility bill — HostelHive',
  'host/:hostelId/utilities/edit/:billId': 'Edit utility bill — HostelHive',
  'host/:hostelId/invoices': 'Invoices — HostelHive',
  'host/:hostelId/invoices/create': 'New invoice — HostelHive',
  'host/:hostelId/invoices/edit/:billId': 'Edit invoice — HostelHive',
  'host/:hostelId/invoices/view/:billId': 'Invoice — HostelHive',
  'host/:hostelId/expenses': 'Expenses — HostelHive',
  'host/:hostelId/expenses/new': 'New expense — HostelHive',
  'host/:hostelId/expenses/:expenseId': 'Expense — HostelHive',
  'host/:hostelId/expenses/:expenseId/edit': 'Edit expense — HostelHive',
  'host/:hostelId/mess': 'Mess — HostelHive',
  'host/:hostelId/mess/add': 'Add grocery — HostelHive',
  'host/:hostelId/mess/confirmations': 'Meal confirmations — HostelHive',
  'host/:hostelId/mess/notifications': 'Meal notifications — HostelHive',
  'host/:hostelId/overview': 'Overview — HostelHive',
  'host/:hostelId/overview/revenue': 'Revenue detail — HostelHive',
  'host/:hostelId/overview/movement': 'Tenant movement — HostelHive',
  'host/:hostelId/overview/occupancy': 'Occupancy trend — HostelHive',
  'host/:hostelId/subscription': 'Billing — HostelHive',
  'host/:hostelId/subscription/pay/:invoiceId': 'Pay invoice — HostelHive',
  'host/:hostelId/subscription/invoices': 'Billing history — HostelHive',
  'host/:hostelId/subscription/invoices/:invoiceId': 'Invoice — HostelHive',
  'admin/roles': 'Roles & permissions — HostelHive Admin',
  'admin/billing/verification': 'Payments to verify — HostelHive Admin',
  'admin/billing/payments': 'Payments — HostelHive Admin',
  'admin/billing/invoices': 'Invoices — HostelHive Admin',
  'admin/billing/plans': 'Plans & prices — HostelHive Admin',
  'admin/billing/hostels/:hostelId': 'Hostel billing — HostelHive Admin',
  'admin/listings': 'All listings — HostelHive Admin',
  'admin/queue': 'Review queue — HostelHive Admin',
  'admin/review/:id': 'Listing review — HostelHive Admin',
  'moderator/queue': 'Review queue — HostelHive',
  'moderator/review/:id': 'Listing review — HostelHive',
  'moderator/media': 'Media queue — HostelHive',
  'moderator/audit': 'Audit log — HostelHive',
};

/** The title a route ends up with in English: its label key in the admin or the standard template. */
function englishTitle(en: ReturnType<typeof loadLocale>, path: string, key: string): string {
  const admin = path === 'admin' || path.startsWith('admin/');
  const template = at(en, admin ? 'seo.adminPageTitle' : 'seo.pageTitle') as string;
  return template.replace('{{page}}', at(en, key) as string);
}

/** What the route titles are: label keys, on routes that own no head of their own. */
describe('the title of every page route', () => {
  let pages: PageRoute[];
  const en = loadLocale('en.json');

  beforeAll(async () => {
    pages = await pageRoutes(appRoutes[0].children ?? []);
  });

  it('declares no title on any route that owns its head, which writes its own', () => {
    const owners = pages.filter((p) => p.head === 'page');
    const titled = owners.filter((p) => p.resolvedTitle !== undefined);

    // Vacuity: the walk reaches the four page-owned routes that used to carry a title.
    for (const path of ['', 'pricing', 'blog', 'hostel/:slug']) {
      expect(
        owners.map((p) => p.path),
        path,
      ).toContain(path);
    }
    expect(
      titled,
      `These routes own their head but still declare a title, which would compete with the page's own: ${show(titled)}.`,
    ).toEqual([]);
  });

  it('declares only dotted label keys that hold text in English', () => {
    const titled = pages.filter((p) => p.title !== undefined);

    expect(titled.length).toBeGreaterThan(60);
    const bad = titled
      .filter((p) => {
        const key = p.title as string;
        const text = /^[A-Za-z]\w*(\.\w+)+$/.test(key) ? at(en, key) : undefined;
        return typeof text !== 'string' || text.trim() === '';
      })
      .map((p) => `/:locale/${p.path} -> ${p.title}`);

    expect(
      bad,
      'A route title must be a Transloco key with English text, not display text.',
    ).toEqual([]);
  });

  it('pins the set of titled pages to the table below', () => {
    const titled = pages.filter((p) => p.resolvedTitle !== undefined).map((p) => p.path);

    expect([...new Set(titled)].sort()).toEqual(Object.keys(EXPECTED_TITLES).sort());
  });

  it('gives every titled page the same English title it had before titles were translated', () => {
    const actual = Object.fromEntries(
      pages
        .filter((p) => p.resolvedTitle !== undefined)
        .map((p) => [p.path, englishTitle(en, p.path, p.resolvedTitle as string)]),
    );

    expect(actual).toEqual(EXPECTED_TITLES);
  });
});
