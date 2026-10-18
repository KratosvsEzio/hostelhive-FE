import { expect, Page, test } from '@playwright/test';
import { dragMapUntilSearched, waitForMap, waitForQuiet } from './support/map';
import {
  documentSurvived,
  liveHead,
  markDocument,
  switchLanguage,
  waitForClient,
} from './support/seo';
import { LAHORE_RESULTS, ListingsStub, SentBounds, stubListings } from './support/stubs';

// A landing page's map searches what it shows; its address and its head stay the place's.

const SITE = 'https://hostelhive.com';
const LANDING = '/en/hostels/lahore';
/** A viewport nowhere near Lahore (31.5, 74.4). */
const FAR_VIEWPORT = 'ne_lat=20&ne_lng=100&sw_lat=10&sw_lng=90';
const FAR_QUERY = { ne_lat: '20', ne_lng: '100', sw_lat: '10', sw_lng: '90' };
const INDEX = 'index, follow, max-image-preview:large';
const HREFLANGS = 19;
/** The centre the landing page's seed names. */
const LAHORE = { lat: 31.52, lng: 74.36 };
/** North edge of the 60 km box around Lahore, the search a landing page opens with. */
const NEAR_NORTH = 32.0609;

/** What the page says while it is the clean, indexable page of Lahore in English. */
const LAHORE_PAGE = {
  heading: 'Hostels in Lahore',
  robots: INDEX,
  canonicals: [`${SITE}${LANDING}`],
  ogUrls: [`${SITE}${LANDING}`],
  hreflangs: HREFLANGS,
};

/** The heading and the parts of the live head that decide how the page is indexed. */
async function pageVerdict(page: Page) {
  const head = await liveHead(page);
  const heading = await page.evaluate(
    () => document.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
  );
  return {
    heading,
    robots: head.robots,
    canonicals: head.canonicals,
    ogUrls: head.ogUrls,
    hreflangs: head.hreflangs,
  };
}

/** The query string the address carries now, as the router left it. */
function queryOf(page: Page): Record<string, string> {
  const query: Record<string, string> = {};
  new URL(page.url()).searchParams.forEach((value, key) => {
    query[key] = value;
  });
  return query;
}

/** True for the 60 km search a landing page opens with, not a box the map sent itself. */
const isNearBox = (b: SentBounds): boolean =>
  b.north !== null && Math.abs(b.north - NEAR_NORTH) <= 0.01;

/** True when the middle of the searched box is within a degree of Lahore. */
function isAroundLahore(b: SentBounds): boolean {
  if (b.north === null || b.south === null || b.east === null || b.west === null) return false;
  const lat = (b.north + b.south) / 2;
  const lng = (b.east + b.west) / 2;
  return Math.abs(lat - LAHORE.lat) < 1 && Math.abs(lng - LAHORE.lng) < 1;
}

/** The box of the newest search; fails the test when none has gone out. */
function latestBox(seen: ListingsStub): SentBounds {
  const latest = seen.bounds[seen.bounds.length - 1];
  if (!latest) throw new Error('no search has gone out yet');
  return latest;
}

/**
 * Opens the landing page on `search` and waits until its map has settled: the camera has sent a
 * box of its own, which is when an address that was going to gain a viewport would have gained
 * it, and the page has then gone quiet.
 */
async function openLanding(page: Page, search = ''): Promise<ListingsStub> {
  // With no results the map never settles its camera, and nothing would try to write a viewport.
  const seen = await stubListings(page, LAHORE_RESULTS);
  await page.goto(`${LANDING}${search}`);
  await waitForMap(page, seen);
  await expect.poll(() => seen.bounds.some((b) => !isNearBox(b)), { timeout: 20_000 }).toBe(true);
  await waitForQuiet(seen);
  return seen;
}

test.describe('a landing page with results on its map', () => {
  test.use({ viewport: { width: 1400, height: 900 } });
  // The server renders each page before the browser takes over, and may wait on the listings API.
  test.setTimeout(120_000);

  test('keeps a clean address and its indexable head while its map is panned', async ({ page }) => {
    const seen = await openLanding(page);

    expect(queryOf(page)).toEqual({});
    await expect.poll(() => pageVerdict(page)).toEqual(LAHORE_PAGE);

    const settled = latestBox(seen);
    await dragMapUntilSearched(page, seen);

    const moved = latestBox(seen);
    expect(isAroundLahore(moved), `searched ${JSON.stringify(moved)}`).toBe(true);
    expect(moved.west).not.toBe(settled.west);
    expect(queryOf(page)).toEqual({});
    await expect.poll(() => pageVerdict(page)).toEqual(LAHORE_PAGE);
  });

  test('opened on a far viewport link searches Lahore and keeps the link and its head', async ({
    page,
  }) => {
    const seen = await openLanding(page, `?${FAR_VIEWPORT}`);

    expect(seen.bounds.filter((b) => !isAroundLahore(b))).toEqual([]);
    expect(seen.bounds.map((b) => b.north)).not.toContain(20);
    expect(queryOf(page)).toEqual(FAR_QUERY);
    await expect.poll(() => pageVerdict(page)).toEqual(LAHORE_PAGE);

    const settled = latestBox(seen);
    await dragMapUntilSearched(page, seen);

    const moved = latestBox(seen);
    expect(isAroundLahore(moved), `searched ${JSON.stringify(moved)}`).toBe(true);
    expect(moved.west).not.toBe(settled.west);
    expect(queryOf(page)).toEqual(FAR_QUERY);
    await expect.poll(() => pageVerdict(page)).toEqual(LAHORE_PAGE);
  });

  test('keeps its map pan and a clean address when the language is switched', async ({ page }) => {
    const seen = await openLanding(page);
    await dragMapUntilSearched(page, seen);
    await waitForClient(page);
    await markDocument(page);
    seen.reset();

    await switchLanguage(page, 'ur');
    await expect(page).toHaveURL(/\/ur\/hostels\/lahore\/?$/);
    expect(await documentSurvived(page)).toBe(true);

    await expect
      .poll(async () => (await liveHead(page)).canonicals)
      .toEqual([`${SITE}/ur/hostels/lahore`]);
    const head = await liveHead(page);
    expect(head.robots).toBe(INDEX);
    expect(head.ogUrls).toEqual([`${SITE}/ur/hostels/lahore`]);
    expect(head.hreflangs).toBe(HREFLANGS);

    // A map built afresh would open on the place and send the 60 km box again.
    await waitForQuiet(seen);
    expect(seen.bounds.filter(isNearBox)).toEqual([]);
  });
});
