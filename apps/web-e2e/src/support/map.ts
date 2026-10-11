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

/** Drags the map sideways; the camera settling writes the viewport into the URL. */
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
  await page.mouse.up();
}
