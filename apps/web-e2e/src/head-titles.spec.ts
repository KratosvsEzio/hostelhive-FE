import { expect, Page, test } from '@playwright/test';
import {
  documentSurvived,
  gaTitles,
  markDocument,
  recordedTitles,
  recordTitles,
  titleAtNavigationEnd,
  waitForClient,
} from './support/seo';
import { stubHostelDetail, stubListings, stubReviews } from './support/stubs';

// The tab title belongs to the page that is showing: it never reads as "not found" while a
// listing loads, survives a query-only navigation, and is the page's own whenever analytics
// looks at it. The listing is stubbed (the API is not under test); the server render is not.

const LISTING = '/en/hostel/stub-hostel';
const NEUTRAL = 'Hostel details — HostelHive';
const NOT_FOUND = 'Listing not found — HostelHive';
const OWN = 'Stub Hostel';
const SEARCH_TITLE = /^Hostels in .+ — search \| HostelHive$/;

/** Lets the router and the page effects that follow a navigation run before the title is read. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 300)));
}

/** Navigates through the app's own router, as a link would, without a page load. */
async function navigateInApp(page: Page, url: string): Promise<void> {
  await page.evaluate((target) => {
    const ng = (
      window as unknown as { ng?: { getComponent: (el: Element) => Record<string, unknown> } }
    ).ng;
    const root = document.querySelector('app-root');
    if (!ng || !root) throw new Error('navigateInApp needs the Angular dev server (window.ng)');
    const host = ng.getComponent(root);
    type Navigating = { navigateByUrl: (u: string) => Promise<boolean> };
    const isRouter = (v: unknown): v is Navigating =>
      typeof v === 'object' &&
      v !== null &&
      typeof (v as { navigateByUrl?: unknown }).navigateByUrl === 'function';
    const router = isRouter(host['router']) ? host['router'] : Object.values(host).find(isRouter);
    if (!router) throw new Error('navigateInApp could not find the Router on app-root');
    void router.navigateByUrl(target);
  }, url);
}

test.describe('listing title while it loads', () => {
  test.setTimeout(120_000);

  test('a slow listing is never titled as not found, and ends on its own title', async ({
    page,
  }) => {
    await stubReviews(page);
    await stubHostelDetail(page, { delayMs: 1500 });
    await recordTitles(page);

    await page.goto(LISTING, { timeout: 100_000 });
    await expect
      .poll(async () => (await recordedTitles(page)).at(-1) ?? '', { timeout: 30_000 })
      .toContain(OWN);

    // The first entry can be the empty title of a document that has not parsed its head yet.
    const recorded = (await recordedTitles(page)).filter(Boolean);
    // What the server rendered is not under test: its fetch is not stubbed, so with the API up it
    // can legitimately say "not found". Only titles the client writes after taking over count.
    const titles = recorded.filter((title, index) => index > 0 || title !== NOT_FOUND);
    expect(titles).not.toContain(NOT_FOUND);
    // The check that catches the regression: when the server and the loading client both say
    // "not found", the title never changes, nothing new is recorded, and only this line fails.
    expect(titles[0]).toBe(NEUTRAL);
    expect(titles.at(-1)).toContain(OWN);
  });
});

test.describe('titles through client navigation', () => {
  test.use({ viewport: { width: 1400, height: 900 } });
  test.setTimeout(120_000);

  test('a query-only navigation after the review deep-link keeps the listing title', async ({
    page,
  }) => {
    await stubReviews(page);
    await stubHostelDetail(page);
    await recordTitles(page);

    await page.goto(`${LISTING}?review=5`, { timeout: 100_000 });
    await expect.poll(() => page.url(), { timeout: 30_000 }).not.toContain('review=');
    await settle(page);
    await waitForClient(page);

    // The deep-link's own removal can finish before the page's head is written, so it alone
    // cannot show a title being overwritten; a navigation after the listing is on screen can.
    await navigateInApp(page, `${LISTING}?x=1`);
    await expect.poll(() => page.url(), { timeout: 30_000 }).toContain('x=1');
    await settle(page);

    const titles = (await recordedTitles(page)).filter(Boolean);
    const firstOwn = titles.findIndex((t) => t.includes(OWN));
    expect(firstOwn).toBeGreaterThanOrEqual(0);
    // Once the listing has its own title, nothing may put a different one back.
    expect(titles.slice(firstOwn).every((t) => t.includes(OWN))).toBe(true);
    expect(await page.title()).toContain(OWN);
  });

  // Guards the search title only: the reading is taken at NavigationEnd plus one timeout, which is
  // earlier than where analytics now waits, so this says nothing about when analytics sends.
  test('search has its own title right after a client navigation from another page', async ({
    page,
  }) => {
    await stubListings(page);

    await page.goto('/en/about');
    await waitForClient(page);
    await markDocument(page);
    await titleAtNavigationEnd(page);

    await navigateInApp(page, '/en/search');
    await expect(page).toHaveURL(/\/en\/search/);
    expect(await documentSurvived(page)).toBe(true);

    await expect.poll(async () => (await gaTitles(page)).length).toBeGreaterThan(0);
    for (const title of await gaTitles(page)) {
      expect(title).toMatch(SEARCH_TITLE);
    }
  });

  test('search keeps its title through a filter change', async ({ page }) => {
    await stubListings(page);

    await page.goto('/en/search');
    await waitForClient(page);
    await expect.poll(() => page.title()).toMatch(SEARCH_TITLE);
    await markDocument(page);
    await titleAtNavigationEnd(page);

    await page.getByRole('button', { name: /Filters/ }).click();
    await page.getByRole('button', { name: 'Girls', exact: true }).click();
    await page.getByRole('button', { name: 'Show results' }).click();
    await expect(page).toHaveURL(/gender=girls/);
    expect(await documentSurvived(page)).toBe(true);

    await expect.poll(async () => (await gaTitles(page)).length).toBeGreaterThan(0);
    await settle(page);
    expect(await page.title()).toMatch(SEARCH_TITLE);
    for (const title of await gaTitles(page)) {
      expect(title).toMatch(SEARCH_TITLE);
    }
  });
});
