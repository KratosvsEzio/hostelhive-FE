import { expect, test } from '@playwright/test';
import { dragMap, waitForMap } from './support/map';
import { liveHead, waitForClient } from './support/seo';
import { stubListings } from './support/stubs';

// "Search everywhere" from a place's search path has to leave that place behind: the address, the
// heading, the head and the header's Where field all describe a worldwide search, and a later pan
// must not bring the place back.

const LAHORE_SEARCH = '/en/search/lahore?place=Lahore&lat=31.5204&lng=74.3587&zoom=11';

test.describe('search everywhere from a place search', () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  test('leaves the place behind, stays worldwide after a pan, and Back returns to the place', async ({
    page,
  }) => {
    const seen = await stubListings(page);
    const where = page.locator('app-search-bar hh-place-search input');

    await page.goto(LAHORE_SEARCH);
    await waitForClient(page);
    await waitForMap(page, seen);
    await expect(page.locator('h1').first()).toContainText('Lahore');

    seen.reset();
    await page
      .getByRole('button', { name: /Search everywhere/ })
      .first()
      .click();

    await expect(page).toHaveURL(/\/en\/search\?(.*&)?everywhere=1/);
    expect(new URL(page.url()).pathname).not.toContain('lahore');
    // Worldwide is the whole globe, so the northern edge sits at the pole.
    await expect.poll(() => seen.bounds.some((b) => b.north === 90)).toBe(true);
    await expect(page.locator('h1').first()).toContainText(/everywhere/i);
    await expect(where).toHaveValue('');
    const head = await liveHead(page);
    expect(head.robots).toMatch(/noindex/);
    expect(head.canonicals).toHaveLength(0);

    // The map's move handler attaches a moment after it first draws; drag until the pan sticks.
    await expect(async () => {
      await dragMap(page);
      const params = new URL(page.url()).searchParams;
      expect(params.has('ne_lat')).toBe(true);
      expect(params.has('everywhere')).toBe(false);
    }).toPass({ timeout: 20_000, intervals: [1_000, 2_000, 3_000] });

    await expect(page.locator('h1').first()).not.toContainText('Lahore');
    await expect.poll(() => page.title()).not.toContain('Lahore');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    await expect(where).toHaveValue('');
    expect(new URL(page.url()).pathname).not.toContain('lahore');

    // The pan's own search uses the panned box, not the whole globe.
    const pannedNorth = Number(new URL(page.url()).searchParams.get('ne_lat'));
    expect(pannedNorth).toBeLessThan(90);
    await expect
      .poll(() =>
        seen.bounds.some(({ north }) => north !== null && Math.abs(north - pannedNorth) < 0.001),
      )
      .toBe(true);

    await page.goBack();
    await expect(page).toHaveURL(/\/en\/search\/lahore(\?.*)?$/);
    await expect(page.locator('h1').first()).toContainText('Lahore');
  });
});
