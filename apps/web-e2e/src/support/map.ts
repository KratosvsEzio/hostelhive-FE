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
