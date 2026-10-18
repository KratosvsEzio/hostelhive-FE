import { expect, Page, test } from '@playwright/test';
import { waitForMap } from './support/map';
import { waitForClient } from './support/seo';
import { ListingsStub, stubListings } from './support/stubs';

// A price sort over no accommodation type is read as Recommended, and cleaned out of the address.

const SEARCH = '/en/search';
const STALE_SEARCH = '/en/search/lahore?sort=price-asc';
const GIRLS_PAGE_PRICE_SORTED = '/en/hostels/lahore/girls?sort=price-asc';

/** True when a search asked the API to order its results, by either field the app sorts on. */
const sendsSort = (params: URLSearchParams) =>
  params.has('sort[starting_price]') || params.has('sort[created_at]');

const lastRequest = (seen: ListingsStub): URLSearchParams | undefined =>
  seen.requests[seen.requests.length - 1];

const historyLength = (page: Page) => page.evaluate(() => history.length);

const urlParams = (page: Page) => new URL(page.url()).searchParams;

const filtersButton = (page: Page) =>
  page.locator('hh-search-filters').getByRole('button', { name: /Filters/ });
const filtersBadge = (page: Page) => page.locator('hh-search-filters .relative > span');

test.describe('a link with a price sort and no accommodation type', () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  test('is searched as Recommended, cleaned without a history entry, and stays clean when a type is picked', async ({
    page,
  }) => {
    // Two full page loads and a header search against the dev server.
    test.setTimeout(60_000);
    const seen = await stubListings(page);
    const bar = page.locator('app-search-bar');

    await page.goto(SEARCH);
    await waitForClient(page);
    await waitForMap(page, seen);
    const entriesBefore = await historyLength(page);

    seen.reset();
    await page.goto(STALE_SEARCH);
    await waitForClient(page);
    await waitForMap(page, seen);

    await expect.poll(() => urlParams(page).has('sort'), { timeout: 10_000 }).toBe(false);
    expect(new URL(page.url()).pathname).toBe('/en/search/lahore');
    expect(seen.requests.some(sendsSort)).toBe(false);
    // The button has to be there for an absent badge to mean anything.
    await expect(filtersButton(page)).toBeVisible();
    await expect(filtersBadge(page)).toHaveCount(0);
    expect(await historyLength(page)).toBe(entriesBefore + 1);

    seen.reset();
    await bar.locator('button.hhsb-seg', { hasText: 'Accommodation' }).click();
    await bar.getByRole('button', { name: 'Girls', exact: true }).click();
    await bar.locator('button.hhsb-go').click();

    await expect.poll(() => urlParams(page).get('gender'), { timeout: 10_000 }).toBe('girls');
    expect(page.url()).not.toContain('sort=');
    await expect
      .poll(() => lastRequest(seen)?.get('f[gender_type]'), { timeout: 10_000 })
      .toBe('girls');
    expect(lastRequest(seen)?.has('sort[starting_price]')).toBe(false);
    expect(seen.requests.some(sendsSort)).toBe(false);

    await page.goBack();
    // The entry before the search carries no type, so its absence is what shows Back has landed.
    await expect.poll(() => urlParams(page).has('gender'), { timeout: 10_000 }).toBe(false);
    expect(new URL(page.url()).pathname).toBe('/en/search/lahore');
    expect(urlParams(page).has('sort')).toBe(false);
  });
});

test.describe('a gender landing page with a price sort', () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  test('keeps the sort in the address, sends it with the type, and counts both', async ({
    page,
  }) => {
    const seen = await stubListings(page);

    await page.goto(GIRLS_PAGE_PRICE_SORTED);
    await waitForClient(page);

    await expect
      .poll(() =>
        seen.requests.some(
          (p) => p.get('f[gender_type]') === 'girls' && p.get('sort[starting_price]') === 'asc',
        ),
      )
      .toBe(true);
    // The type from the path and the sort from the query are two filters.
    await expect(filtersBadge(page)).toHaveText('2');
    expect(urlParams(page).get('sort')).toBe('price-asc');
  });
});
