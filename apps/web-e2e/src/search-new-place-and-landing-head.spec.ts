import { expect, Page, test } from '@playwright/test';
import { KARACHI_PHOTON, ListingsStub, stubListings, stubPhoton } from './support/stubs';

// A new place is a new search, and a landing page's structured data belongs to that page alone.
// Picking another place on /search has to route by the new place and drop the old map box, and
// leaving a landing page has to take its breadcrumb and FAQ markup with it.

const KARACHI_LAT = 24.8607;
const LAHORE_SEARCH = '/en/search/lahore?place=Lahore&lat=31.5204&lng=74.3587&zoom=11';
const LAHORE_WORLD_SEARCH = '/en/search?place=Lahore&lat=31.5204&lng=74.3587&zoom=11';

/** The `data-seo` id of every JSON-LD block currently in the document, in document order. */
async function jsonLdIds(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('script[type="application/ld+json"]')].map(
      (s) => s.getAttribute('data-seo') ?? '',
    ),
  );
}

const countOf = async (page: Page, id: string) =>
  (await jsonLdIds(page)).filter((x) => x === id).length;

const urlHasViewport = (page: Page) => new URL(page.url()).searchParams.has('ne_lat');

/**
 * Waits until the map is interactive: it has searched once, its pane exists and its tiles and
 * zoom control are drawn. Dragging before that moves nothing, so the URL never changes.
 */
async function waitForMap(page: Page, seen: ListingsStub): Promise<void> {
  await expect.poll(() => seen.requests.length, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(page.locator('.leaflet-container .leaflet-map-pane')).toBeAttached();
  await expect(page.locator('.leaflet-container .leaflet-control-zoom').first()).toBeVisible();
}

/** Drags the map sideways; the camera settling writes the viewport into the URL. */
async function dragMap(page: Page): Promise<void> {
  const box = await page.locator('.leaflet-container').first().boundingBox();
  if (!box) {
    throw new Error('the map has no box to drag');
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 300, y - 100, { steps: 10 });
  await page.mouse.up();
}

/** Types into a place field and picks the Karachi suggestion. */
async function pickKarachi(page: Page, scope: string): Promise<void> {
  await page.locator(`${scope} hh-place-search input`).fill('Karachi');
  // The suggestions act on mousedown (so a blur cannot swallow the pick); click would be too late.
  await page
    .locator(`${scope} hh-place-search button`, { hasText: 'Karachi' })
    .first()
    .dispatchEvent('mousedown');
}

test.describe('picking another place on the phone search', () => {
  test.use({ viewport: { width: 400, height: 860 } });

  test('routes to the new place, names it in the head, and Back returns to the old one', async ({
    page,
  }) => {
    const seen = await stubListings(page);
    await stubPhoton(page, [KARACHI_PHOTON]);

    await page.goto(LAHORE_SEARCH);
    // Let the map load Lahore before the pick, so its first search is not mistaken for the pick's.
    await waitForMap(page, seen);

    seen.reset();
    await pickKarachi(page, 'hh-search-map');

    await expect(page).toHaveURL(/\/en\/search\/karachi-[^?]*\?/);
    // The map settling on the new place rewrites the URL; the head must survive that rewrite.
    await expect.poll(() => urlHasViewport(page), { timeout: 10_000 }).toBe(true);

    await expect.poll(() => page.title()).toContain('Karachi');
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical ?? '').not.toContain('/hostels/lahore');

    await expect
      .poll(() =>
        seen.bounds.some(
          ({ north, south }) =>
            north !== null && south !== null && south <= KARACHI_LAT && north >= KARACHI_LAT,
        ),
      )
      .toBe(true);

    await page.goBack();
    await expect(page).toHaveURL(/\/en\/search\/lahore(\?.*)?$/);
  });
});

test.describe('searching a new place from the header after the map has moved', () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  /** Opens `start` and pans the map until the moved viewport is in the URL; returns the recorded searches. */
  async function openPannedSearch(page: Page, start: string) {
    const seen = await stubListings(page);
    await stubPhoton(page, [KARACHI_PHOTON]);

    await page.goto(start);
    await waitForMap(page, seen);
    // The map's move handler attaches a moment after it first draws, so a drag that lands before
    // that is lost; drag again until the camera settling reaches the URL.
    await expect(async () => {
      await dragMap(page);
      expect(urlHasViewport(page)).toBe(true);
    }).toPass({ timeout: 20_000, intervals: [1_000, 2_000, 3_000] });

    // A late camera write after the pick re-reads the bar's place from the URL and undoes the
    // pick, so let the URL and the searches go quiet first.
    let previous = '';
    let quietReads = 0;
    await expect
      .poll(
        () => {
          const now = `${page.url()}|${seen.requests.length}`;
          quietReads = now === previous ? quietReads + 1 : 0;
          previous = now;
          return quietReads;
        },
        { intervals: [500], timeout: 15_000 },
      )
      .toBeGreaterThanOrEqual(3);
    return seen;
  }

  /**
   * Picks Karachi in the header bar and returns once the pick has stuck. The bar re-reads its
   * place from the URL while the map is still settling, which can undo a pick made too early, so
   * only the pick is retried here; Search is never pressed until the field holds Karachi steadily.
   */
  async function pickKarachiInHeader(page: Page): Promise<void> {
    const field = page.locator('app-search-bar hh-place-search input');
    await expect(async () => {
      await pickKarachi(page, 'app-search-bar');
      await expect(field).toHaveValue(/Karachi/, { timeout: 2_000 });
      const reads: string[] = [];
      for (let i = 0; i < 5; i++) {
        reads.push(await field.inputValue());
      }
      expect(reads.every((value) => /Karachi/.test(value))).toBe(true);
    }).toPass({ timeout: 20_000, intervals: [500, 1_000, 2_000] });
  }

  /** Lahore's box is only ever the one the map was panned to; Karachi's search must not use it. */
  const urlNorthEdge = (page: Page) => Number(new URL(page.url()).searchParams.get('ne_lat'));
  const framesKarachi = ({ north, south }: { north: number | null; south: number | null }) =>
    north !== null && south !== null && south <= KARACHI_LAT && north >= KARACHI_LAT;
  const framesLahore = ({ south }: { south: number | null }) => south !== null && south > 30;

  test('from the bare search, the old map box is dropped and the request frames the new place', async ({
    page,
  }) => {
    const seen = await openPannedSearch(page, LAHORE_WORLD_SEARCH);
    await pickKarachiInHeader(page);
    // Still the bare search, so the Search click below crosses to a different route config and
    // builds a new map, which is the case that used to restore the old box.
    await expect(page).toHaveURL(/\/en\/search\?/);

    seen.reset();
    await page.locator('app-search-bar button.hhsb-go').click();

    await expect(page).toHaveURL(/\/en\/search\/karachi-[^?]*\?/);
    // A null param reads as 0; Lahore's panned box (about 31.5) must never come back.
    await expect.poll(() => urlNorthEdge(page)).toBeLessThan(30);
    await expect.poll(() => seen.bounds.some(framesKarachi)).toBe(true);
    expect(seen.bounds.some(framesLahore)).toBe(false);
  });

  test('from a place search, the reused map frames the new place too', async ({ page }) => {
    const seen = await openPannedSearch(page, LAHORE_SEARCH);
    await pickKarachiInHeader(page);
    await expect(page).toHaveURL(/\/en\/search\/lahore\?/);

    seen.reset();
    await page.locator('app-search-bar button.hhsb-go').click();

    await expect(page).toHaveURL(/\/en\/search\/karachi-[^?]*\?/);
    await expect.poll(() => urlNorthEdge(page)).toBeLessThan(30);
    await expect.poll(() => seen.bounds.some(framesKarachi)).toBe(true);
    expect(seen.bounds.some(framesLahore)).toBe(false);
  });
});

test.describe('structured data of a landing page', () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  test('leaves with the page when navigating to the home page', async ({ page }) => {
    await stubListings(page);

    await page.goto('/en/hostels/lahore');
    await expect.poll(() => countOf(page, 'place-breadcrumb')).toBe(1);
    await expect.poll(() => countOf(page, 'place-faq')).toBe(1);

    await page.locator('header a[href="/en"]').first().click();
    await expect(page).toHaveURL(/\/en\/?$/);

    await expect.poll(() => countOf(page, 'organization')).toBeGreaterThan(0);
    expect(await countOf(page, 'place-breadcrumb')).toBe(0);
    expect(await countOf(page, 'place-faq')).toBe(0);
  });

  test('is replaced, not duplicated, when moving to a sibling landing page', async ({ page }) => {
    await stubListings(page);

    await page.goto('/en/hostels/lahore');
    await expect.poll(() => countOf(page, 'place-breadcrumb')).toBe(1);

    await page.locator('a[href="/en/hostels/lahore/girls"]').first().click();
    await expect(page).toHaveURL(/\/en\/hostels\/lahore\/girls(\?.*)?$/);

    await expect.poll(() => countOf(page, 'place-breadcrumb')).toBe(1);
    await expect.poll(() => countOf(page, 'place-faq')).toBe(1);

    const breadcrumb = await page
      .locator('script[type="application/ld+json"][data-seo="place-breadcrumb"]')
      .textContent();
    expect(breadcrumb ?? '').toMatch(/girls/i);
  });
});

test.describe('server-rendered landing page', () => {
  // Clearing on destroy runs after the document is serialised, so the raw HTML must still
  // carry both blocks. The render may wait on the listings API, hence the generous timeout.
  test('ships its breadcrumb and FAQ structured data in the raw HTML', async ({ request }) => {
    test.setTimeout(120_000);

    const res = await request.get('/en/hostels/lahore', { timeout: 100_000 });
    expect(res.ok()).toBe(true);

    const html = await res.text();
    expect(html).toContain('data-seo="place-breadcrumb"');
    expect(html).toContain('data-seo="place-faq"');
  });
});
