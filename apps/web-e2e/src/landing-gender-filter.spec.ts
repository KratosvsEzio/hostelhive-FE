import { expect, Page, test } from '@playwright/test';

// The type filter on a gender landing page. The path fixes the type there, so changing it
// has to move to the page for the new type; a query-only change leaves the list unchanged.

const GIRLS_PAGE = '/en/hostels/lahore/girls';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};

/**
 * Stubs the listings endpoint with an empty page and records the `f[gender_type]` of every
 * search it receives (null when the request carries none). The API is not the thing under
 * test, and an empty list keeps the page out of any error state.
 */
async function stubListings(page: Page): Promise<{ genders: (string | null)[]; reset: () => void }> {
  const genders: (string | null)[] = [];
  await page.route('**/public/hostels**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    // SearchParams decodes the brackets, so the key reads as the API sees it.
    genders.push(new URL(request.url()).searchParams.get('f[gender_type]'));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify({
        hostels: [],
        pagination: { current_page: 1, total_pages: 1, total_count: 0 },
      }),
    });
  });
  return { genders, reset: () => (genders.length = 0) };
}

async function openFilters(page: Page): Promise<void> {
  // Unanchored: an icon-font glyph precedes the label in the accessible name.
  await page.getByRole('button', { name: /Filters/ }).click();
  await expect(page.getByRole('button', { name: 'Show results' })).toBeVisible();
}

const typeButton = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true });

test.describe('gender landing page type filter', () => {
  test('choosing "Any type" on the girls page moves to the city page and lifts the filter', async ({
    page,
  }) => {
    const seen = await stubListings(page);
    await page.goto(GIRLS_PAGE);

    // The list is seeded from the path, and the control must say the same thing.
    await expect.poll(() => seen.genders).toContain('girls');
    await openFilters(page);
    await expect(typeButton(page, 'Girls')).toHaveAttribute('aria-pressed', 'true');
    await expect(typeButton(page, 'Any type')).toHaveAttribute('aria-pressed', 'false');

    seen.reset();
    await typeButton(page, 'Any type').click();
    await page.getByRole('button', { name: 'Show results' }).click();

    await expect(page).toHaveURL(/\/en\/hostels\/lahore(\?.*)?$/);
    // Searches are debounced; wait for the one that follows the navigation.
    await expect.poll(() => seen.genders.length).toBeGreaterThan(0);
    expect(seen.genders.every((g) => g === null)).toBe(true);

    await openFilters(page);
    await expect(typeButton(page, 'Any type')).toHaveAttribute('aria-pressed', 'true');
  });

  test('choosing "Boys" on the girls page moves to the boys page and searches boys', async ({
    page,
  }) => {
    const seen = await stubListings(page);
    await page.goto(GIRLS_PAGE);
    await expect.poll(() => seen.genders).toContain('girls');

    await openFilters(page);
    seen.reset();
    await typeButton(page, 'Boys').click();
    await page.getByRole('button', { name: 'Show results' }).click();

    await expect(page).toHaveURL(/\/en\/hostels\/lahore\/boys(\?.*)?$/);
    // The page component is reused across the two routes, so this proves the list follows.
    await expect.poll(() => seen.genders).toContain('boys');
    expect(seen.genders).not.toContain('girls');

    await openFilters(page);
    await expect(typeButton(page, 'Boys')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Back after lifting the filter returns to the girls page with girls searched', async ({
    page,
  }) => {
    const seen = await stubListings(page);
    await page.goto(GIRLS_PAGE);
    await expect.poll(() => seen.genders).toContain('girls');

    await openFilters(page);
    await typeButton(page, 'Any type').click();
    await page.getByRole('button', { name: 'Show results' }).click();
    await expect(page).toHaveURL(/\/en\/hostels\/lahore(\?.*)?$/);
    await expect.poll(() => seen.genders.length).toBeGreaterThan(0);

    // A history entry per change is what makes Back work; replacing the URL would skip it.
    seen.reset();
    await page.goBack();

    await expect(page).toHaveURL(/\/en\/hostels\/lahore\/girls(\?.*)?$/);
    await expect.poll(() => seen.genders).toContain('girls');
    await openFilters(page);
    await expect(typeButton(page, 'Girls')).toHaveAttribute('aria-pressed', 'true');
  });

  // A gender in the query that is not a known type is ignored, so the path's own type applies.
  for (const value of ['bogus', '']) {
    test(`an unknown gender query value "${value}" is ignored on the girls page`, async ({
      page,
    }) => {
      const seen = await stubListings(page);
      await page.goto(`${GIRLS_PAGE}?gender=${value}`);

      await expect.poll(() => seen.genders).toContain('girls');
      // Requests with no gender record null, so compare against the exact bad values.
      expect(seen.genders).not.toContain('bogus');
      expect(seen.genders).not.toContain('');

      await openFilters(page);
      await expect(typeButton(page, 'Girls')).toHaveAttribute('aria-pressed', 'true');
    });
  }
});
