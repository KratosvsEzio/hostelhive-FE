import { expect, Page, test } from '@playwright/test';
import { captureAnalytics, expectAnalyticsOn, gaEvents } from './support/analytics';
import { dragMap, waitForMap } from './support/map';
import { KARACHI_PHOTON, ListingsStub, stubListings, stubPhoton } from './support/stubs';

// Two things PR #172 changed about the bare search page (Trello #157, #161), checked with a real
// mouse pan and the events the app actually hands to gtag:
// - the heading names what is on screen: the framed country until the visitor picks the area,
//   then "This map area". A search that names a place keeps its name (Trello #160, unchanged);
// - every `search_performed` says what started it, so map browsing no longer counts as searching.

const LAHORE_SLUG_SEARCH = '/en/search/lahore';

/** Answers both country lookups with Pakistan, so the bare search frames one known country. */
async function stubVisitorCountry(page: Page): Promise<void> {
  await page.route('https://www.cloudflare.com/cdn-cgi/trace', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: 'ip=0.0.0.0\nloc=PK\n' }),
  );
  await page.route('https://api.country.is/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ ip: '0.0.0.0', country: 'PK' }),
    }),
  );
}

/** The desktop results heading (the phone layout hides it). */
const heading = (page: Page) => page.locator('hh-search-map h1');

/**
 * Waits until no listings search has gone out for `quietMs`. A search is sent 600 ms after its
 * inputs last changed, so this outlasts any camera settling still to come; anything the page
 * was going to report by itself has been sent by then.
 */
async function waitForQuiet(seen: ListingsStub, quietMs = 2_500): Promise<void> {
  let count = -1;
  let since = Date.now();
  await expect
    .poll(
      () => {
        if (seen.requests.length !== count) {
          count = seen.requests.length;
          since = Date.now();
        }
        return Date.now() - since;
      },
      { timeout: 20_000, intervals: [250] },
    )
    .toBeGreaterThanOrEqual(quietMs);
}

/** The `trigger` of every `search_performed` sent so far. */
const triggers = async (page: Page) =>
  (await gaEvents(page, 'search_performed')).map((params) => params['trigger']);

/**
 * Pans the map by mouse until the heading says the visitor chose the area. The map's move
 * handler attaches a moment after it first draws, so a drag that lands before then is lost.
 */
async function panUntilMapArea(page: Page): Promise<void> {
  await expect(async () => {
    await dragMap(page);
    await expect(heading(page)).toHaveText('This map area', { timeout: 2_000 });
  }).toPass({ timeout: 20_000, intervals: [1_000, 2_000, 3_000] });
}

test.describe('the bare search heading after a pan', () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  test('names the framed country, then "This map area" once the visitor pans', async ({ page }) => {
    const seen = await stubListings(page);
    await stubVisitorCountry(page);

    await page.goto('/en/search');
    await waitForMap(page, seen);
    await expect(heading(page)).toHaveText('Pakistan');
    await expect.poll(() => page.title()).toContain('Pakistan');

    await panUntilMapArea(page);
    await expect.poll(() => page.title()).toMatch(/^Hostels in this map area/);
  });

  test('a search that names a place keeps its name after a pan (Trello #160)', async ({ page }) => {
    const seen = await stubListings(page);
    await stubVisitorCountry(page);

    await page.goto(LAHORE_SLUG_SEARCH);
    await waitForMap(page, seen);
    await expect(heading(page)).toHaveText('Lahore');
    // Let the camera settle on Lahore first, so the URL change below is the drag's own.
    await waitForQuiet(seen);

    const before = page.url();
    await expect(async () => {
      await dragMap(page);
      expect(new URL(page.url()).searchParams.get('ne_lat')).not.toBe(
        new URL(before).searchParams.get('ne_lat'),
      );
    }).toPass({ timeout: 20_000, intervals: [1_000, 2_000, 3_000] });

    await waitForQuiet(seen);
    await expect(heading(page)).toHaveText('Lahore');
    await expect.poll(() => page.title()).toContain('Lahore');
  });
});

test.describe('search_performed trigger', () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await captureAnalytics(page);
    await stubVisitorCountry(page);
  });

  test('a fresh load reports one arrival, and the country framing settling adds nothing', async ({
    page,
  }) => {
    const seen = await stubListings(page);

    await page.goto('/en/search');
    await expectAnalyticsOn(page);
    await waitForMap(page, seen);
    await expect(heading(page)).toHaveText('Pakistan');
    await waitForQuiet(seen);

    expect(await triggers(page)).toEqual(['arrival']);
  });

  test('a pan reports map', async ({ page }) => {
    const seen = await stubListings(page);

    await page.goto('/en/search');
    await expectAnalyticsOn(page);
    await waitForMap(page, seen);
    await waitForQuiet(seen);
    const sent = (await triggers(page)).length;

    await panUntilMapArea(page);
    await waitForQuiet(seen);

    const after = (await triggers(page)).slice(sent);
    expect(after.length).toBeGreaterThan(0);
    expect(new Set(after)).toEqual(new Set(['map']));
  });

  test('a place picked from the header bar reports one place', async ({ page }) => {
    const seen = await stubListings(page);
    await stubPhoton(page, [KARACHI_PHOTON]);

    await page.goto('/en/search');
    await expectAnalyticsOn(page);
    await waitForMap(page, seen);
    await waitForQuiet(seen);
    const sent = (await triggers(page)).length;

    await page.locator('app-search-bar hh-place-search input').fill('Karachi');
    // The suggestions act on mousedown (so a blur cannot swallow the pick); click is too late.
    await page
      .locator('app-search-bar hh-place-search button', { hasText: 'Karachi' })
      .first()
      .dispatchEvent('mousedown');
    await page.locator('app-search-bar button.hhsb-go').click();

    // Bare /search to /search/<slug> is another route config, so this is a new search page:
    // its first search must read as the pick, not as an arrival.
    await expect(page).toHaveURL(/\/en\/search\/karachi-[^?]*\?/);
    await expect(heading(page)).toHaveText(/Karachi/);
    await waitForQuiet(seen);

    expect((await triggers(page)).slice(sent)).toEqual(['place']);
  });
});

test.describe('search_performed trigger of a place picked on the phone map page', () => {
  // The map page's own place field shows at phone width; on desktop the header bar has it.
  test.use({ viewport: { width: 400, height: 860 } });

  test.beforeEach(async ({ page }) => {
    await captureAnalytics(page);
    await stubVisitorCountry(page);
  });

  /** Opens `start`, picks Karachi in the map page's field, and returns the triggers it sent. */
  async function pickKarachiFrom(page: Page, start: string): Promise<unknown[]> {
    const seen = await stubListings(page);
    await stubPhoton(page, [KARACHI_PHOTON]);

    await page.goto(start);
    await expectAnalyticsOn(page);
    await waitForMap(page, seen);
    await waitForQuiet(seen);
    const sent = (await triggers(page)).length;

    await page.locator('hh-search-map hh-place-search input').fill('Karachi');
    // The suggestions act on mousedown (so a blur cannot swallow the pick); click is too late.
    await page
      .locator('hh-search-map hh-place-search button', { hasText: 'Karachi' })
      .first()
      .dispatchEvent('mousedown');

    await expect(page).toHaveURL(/\/en\/search\/karachi-[^?]*\?/);
    await waitForQuiet(seen);
    return (await triggers(page)).slice(sent);
  }

  test('from a place search, the reused page reports one place', async ({ page }) => {
    // The camera flying to Karachi is part of the pick, not a second, map, search.
    expect(await pickKarachiFrom(page, LAHORE_SLUG_SEARCH)).toEqual(['place']);
  });

  test('from the bare search, the new page it builds reports one place', async ({ page }) => {
    // Another route config, so a new search page: its first search is the pick, not an arrival.
    expect(await pickKarachiFrom(page, '/en/search')).toEqual(['place']);
  });
});
