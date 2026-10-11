import { expect, test } from '@playwright/test';
import { KARACHI_PHOTON as KARACHI, stubListings, stubPhoton } from './support/stubs';

// Leaving a landing page for somewhere else. Picking another place from a gender landing page
// has to carry the landing's type into a real search of that place, and "Search everywhere"
// has to survive the map settling rather than being rewritten by it.

test.describe('picking another place from a gender landing page', () => {
  test.use({ viewport: { width: 400, height: 860 } });

  test('opens a search of that place that keeps the landing type, and Back returns to the landing', async ({
    page,
  }) => {
    const seen = await stubListings(page);
    await stubPhoton(page, [KARACHI]);

    await page.goto('/en/hostels/lahore/girls');
    await expect.poll(() => seen.genders).toContain('girls');
    await expect(page.locator('h1').first()).toHaveText('Girls hostels in Lahore');

    seen.reset();
    await page.locator('hh-place-search input').fill('Karachi');
    // The suggestions act on mousedown (so a blur cannot swallow the pick); click would be too late.
    await page
      .locator('hh-place-search button', { hasText: 'Karachi' })
      .first()
      .dispatchEvent('mousedown');

    await expect(page).toHaveURL(/\/en\/search\/karachi-[^?]*\?/);
    const url = new URL(page.url());
    expect(url.searchParams.get('gender')).toBe('girls');
    // A landing's box must not leak into the new place's search.
    expect(url.searchParams.has('ne_lat')).toBe(false);
    await expect(page.locator('h1').first()).toContainText('Karachi');

    // The search is debounced; wait for the one that targets the new place.
    await expect
      .poll(() =>
        seen.requests.some((params, i) => {
          const { north, south } = seen.bounds[i];
          return (
            params.get('f[gender_type]') === 'girls' &&
            north !== null &&
            south !== null &&
            south <= 24.8607 &&
            north >= 24.8607
          );
        }),
      )
      .toBe(true);

    await page.goBack();
    await expect(page).toHaveURL(/\/en\/hostels\/lahore\/girls(\?.*)?$/);
    await expect(page.locator('h1').first()).toHaveText('Girls hostels in Lahore');
  });
});

test.describe('search everywhere from an empty campus page', () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  test('opens a worldwide search and keeps everywhere=1 once the map settles', async ({ page }) => {
    const seen = await stubListings(page);

    await page.goto('/en/hostels/lahore/punjab-university');
    await expect.poll(() => seen.requests.length).toBeGreaterThan(0);

    seen.reset();
    await page.getByRole('button', { name: /Search everywhere/ }).first().click();

    await expect(page).toHaveURL(/\/en\/search\?(.*&)?everywhere=1/);
    // Worldwide is the whole globe, so the northern edge sits at the pole.
    await expect.poll(() => seen.bounds.some((b) => b.north === 90)).toBe(true);

    // The map mounts and settles its camera after load; that must not rewrite the URL. Leaflet
    // adds its container class and a populated pane only once the map has initialised.
    await expect(page.locator('.leaflet-container .leaflet-map-pane')).toBeAttached();
    await expect(page.locator('.leaflet-container')).toBeVisible();
    expect(new URL(page.url()).searchParams.get('everywhere')).toBe('1');

    await page.goBack();
    await expect(page).toHaveURL(/\/en\/hostels\/lahore\/punjab-university(\?.*)?$/);
    await expect(page.locator('h1').first()).toHaveText('Hostels near Punjab University');
  });
});
