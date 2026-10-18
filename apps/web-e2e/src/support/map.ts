import { expect, Page } from '@playwright/test';
import { ListingsStub } from './stubs';

/** True once the camera settling has written a viewport into the URL. */
export const urlHasViewport = (page: Page) => new URL(page.url()).searchParams.has('ne_lat');

/**
 * Waits until the map is interactive: it has searched once, its pane exists and its tiles and
 * zoom control are drawn. Dragging before that moves nothing, so the URL never changes.
 */
export async function waitForMap(page: Page, seen: ListingsStub): Promise<void> {
  await expect.poll(() => seen.requests.length, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(page.locator('.leaflet-container .leaflet-map-pane')).toBeAttached();
  await expect(page.locator('.leaflet-container .leaflet-control-zoom').first()).toBeVisible();
}

/**
 * Drags the map sideways; the camera settling writes the viewport into the URL.
 *
 * Holds still before letting go, so the drag ends where the mouse stops. A release mid-swipe
 * makes Leaflet glide on for about a second, and the camera settles only when the glide ends
 * or the next mousedown cuts it short. The URL change a caller waits on after a drag could
 * then be the previous drag's, with this drag's own viewport write still to come.
 */
export async function dragMap(page: Page): Promise<void> {
  const box = await page.locator('.leaflet-container').first().boundingBox();
  if (!box) {
    throw new Error('the map has no box to drag');
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 300, y - 100, { steps: 10 });
  // Leaflet throws a glide only from the pointer positions of the last 50 ms before release.
  // eslint-disable-next-line playwright/no-wait-for-timeout -- the pause is the gesture itself
  await page.waitForTimeout(100);
  await page.mouse.up();
}

/**
 * Waits until no listings search has gone out for `quietMs`. A search is sent 600 ms after its
 * inputs last changed, so this outlasts any camera settling still to come; anything the page
 * was going to report by itself has been sent by then.
 */
export async function waitForQuiet(seen: ListingsStub, quietMs = 2_500): Promise<void> {
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

/**
 * Drags the map exactly once, then waits until that drag's own viewport write has landed and the
 * page has gone quiet. Fails rather than dragging again when the drag is lost: a second drag
 * moves a small place's map twice as far, which can take the place out of frame.
 *
 * Call it once the map is up and the page quiet (`waitForMap`, then `waitForQuiet`), so the drag
 * lands on a map that is listening. The URL may carry no viewport yet: a place search writes one
 * only after its camera moves or fits results, so the north edge read first can be null, and the
 * first value to appear, or to change, is this drag's.
 */
export async function dragMapOnce(page: Page, seen: ListingsStub): Promise<void> {
  const northEdge = () => new URL(page.url()).searchParams.get('ne_lat');
  const before = northEdge();
  await dragMap(page);
  await expect
    .poll(
      () => {
        const now = northEdge();
        return now !== null && now !== before;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  await waitForQuiet(seen);
}

/**
 * Drags the map until a search for the moved viewport has gone out, then waits for the page to go
 * quiet. For a page that never writes its viewport into the URL, such as a landing page, where
 * `dragMapOnce` would wait on a URL change that never comes.
 *
 * The pan is read from the searches instead. It has landed once a search that arrived after the
 * drag began has a west edge more than 0.001 degrees from the west edge of the latest search
 * before it, so the caller must have the page quiet first (`waitForMap`, then `waitForQuiet`):
 * a search still on its way from the load would pass for the drag's.
 *
 * Unlike `dragMapOnce`, a drag that is lost is made again. That is safe only because such a page
 * writes no URL: a repeated drag cannot leave a viewport write behind to race what the caller
 * asserts next. It does move the map twice as far, so callers should compare the moved viewport
 * with a tolerance, not with an exact distance.
 */
export async function dragMapUntilSearched(page: Page, seen: ListingsStub): Promise<void> {
  const latest = seen.bounds[seen.bounds.length - 1];
  if (!latest || latest.west === null) {
    throw new Error('no search has gone out yet, so there is no viewport to move from');
  }
  const westBefore = latest.west;
  const sentBefore = seen.requests.length;
  const searchedMoved = () => {
    const sent = seen.bounds.slice(sentBefore);
    return sent.some((b) => b.west !== null && Math.abs(b.west - westBefore) > 0.001);
  };

  await expect(async () => {
    await dragMap(page);
    await expect.poll(searchedMoved, { timeout: 6_000 }).toBe(true);
  }).toPass({ timeout: 30_000 });
  await waitForQuiet(seen);
}
