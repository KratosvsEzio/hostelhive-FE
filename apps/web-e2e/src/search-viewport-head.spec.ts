import { expect, Page, test } from '@playwright/test';
import { captureAnalytics, expectAnalyticsOn, gaEvents } from './support/analytics';
import { dragMapOnce, urlHasViewport, waitForMap, waitForQuiet } from './support/map';
import { liveHead, recordedTitles, recordTitles } from './support/seo';
import { stubListings } from './support/stubs';

// A place search is a place page while the map is on the place; a far viewport link is not.

const SITE = 'https://hostelhive.com';
const LAHORE_SEARCH = '/en/search/lahore';
/** A viewport nowhere near Lahore (31.5, 74.4). */
const FAR_VIEWPORT = 'ne_lat=20&ne_lng=100&sw_lat=10&sw_lng=90';
const LAHORE_TITLE = 'Hostels in Lahore — search | HostelHive';
const MAP_AREA_TITLE = 'Hostels in this map area — search | HostelHive';

/** What the page says while it is the place's page: indexable, canonical to the landing page. */
const PLACE = {
  heading: 'Lahore',
  noindex: false,
  canonicals: [`${SITE}/en/hostels/lahore`],
  ogUrls: [`${SITE}/en/hostels/lahore`],
  hreflangs: true,
  title: LAHORE_TITLE,
};

/** What the page says while it is a view of some area: out of the index, claiming no URL. */
const MAP_AREA = {
  heading: 'This map area',
  noindex: true,
  canonicals: [],
  ogUrls: [],
  hreflangs: false,
  title: MAP_AREA_TITLE,
};

/** The desktop heading and the parts of the live head that decide how the page is indexed. */
async function pageVerdict(page: Page) {
  const head = await liveHead(page);
  const heading = await page.evaluate(
    () =>
      document.querySelector('hh-search-map h1')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
  );
  return {
    heading,
    noindex: head.robots?.includes('noindex') ?? false,
    canonicals: head.canonicals,
    ogUrls: head.ogUrls,
    hreflangs: head.hreflangs > 0,
    title: head.title,
  };
}

/** The longitude the URL's viewport spans, or null until the map has written one. */
function urlSpan(page: Page): number | null {
  const params = new URL(page.url()).searchParams;
  const east = params.get('ne_lng');
  const west = params.get('sw_lng');
  return east === null || west === null ? null : Number(east) - Number(west);
}

/**
 * Presses the map's zoom button `times` times, waiting for each zoom's own viewport write before
 * the next press: Leaflet drops a press that lands while the previous zoom is still animating.
 * The first press can find no viewport in the URL yet (`before` is null), and the wait then ends
 * as soon as the span appears as a number; every later press waits for the span to change.
 */
async function zoomMap(page: Page, direction: 'in' | 'out', times: number): Promise<void> {
  for (let press = 0; press < times; press++) {
    const before = urlSpan(page);
    await page.locator(`.leaflet-control-zoom-${direction}`).click();
    await expect.poll(() => urlSpan(page), { timeout: 10_000 }).not.toBe(before);
  }
}

test.describe('the head of a search over a place', () => {
  test.use({ viewport: { width: 1400, height: 900 } });
  // The server renders each page before the browser takes over, and may wait on the listings API.
  test.setTimeout(120_000);

  test('stays the place page after a short pan writes the viewport', async ({ page }) => {
    const seen = await stubListings(page);

    await page.goto(LAHORE_SEARCH);
    await waitForMap(page, seen);
    await waitForQuiet(seen);
    await expect.poll(() => pageVerdict(page)).toEqual(PLACE);

    await dragMapOnce(page, seen);
    expect(urlHasViewport(page)).toBe(true);
    await expect.poll(() => pageVerdict(page)).toEqual(PLACE);
  });

  test('zooming far out reads as the map area, zooming back restores the place, with one page view', async ({
    page,
  }) => {
    await captureAnalytics(page);
    const seen = await stubListings(page);

    await page.goto(LAHORE_SEARCH);
    await expectAnalyticsOn(page);
    await waitForMap(page, seen);
    await waitForQuiet(seen);
    await expect.poll(() => pageVerdict(page)).toEqual(PLACE);

    await zoomMap(page, 'out', 2);
    await expect.poll(() => pageVerdict(page)).toEqual(PLACE);

    await zoomMap(page, 'out', 2);
    await expect.poll(() => pageVerdict(page)).toEqual(MAP_AREA);

    await zoomMap(page, 'in', 4);
    await expect.poll(() => pageVerdict(page)).toEqual(PLACE);

    await waitForQuiet(seen);
    expect(await gaEvents(page, 'page_view')).toHaveLength(1);
  });

  test('is the map area from the first paint when the link carries a far viewport', async ({
    page,
  }) => {
    await captureAnalytics(page);
    await recordTitles(page);
    const seen = await stubListings(page);

    await page.goto(`${LAHORE_SEARCH}?${FAR_VIEWPORT}`);
    await expectAnalyticsOn(page);
    await waitForMap(page, seen);
    await waitForQuiet(seen);
    await expect.poll(() => pageVerdict(page)).toEqual(MAP_AREA);

    const titles = await recordedTitles(page);
    expect(titles).toContain(MAP_AREA_TITLE);
    expect(titles.filter((title) => title.includes('Lahore'))).toEqual([]);

    await expect
      .poll(async () => (await gaEvents(page, 'page_view')).length, { timeout: 15_000 })
      .toBeGreaterThan(0);
    const [firstView] = await gaEvents(page, 'page_view');
    expect(firstView['page_title']).toBe(MAP_AREA_TITLE);
  });
});
