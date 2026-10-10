import { expect, test } from '@playwright/test';

test('home renders the seeker hero', async ({ page }) => {
  await page.goto('/');
  // By role and name rather than `h1`: a dialog over the page can carry an h1 of its own,
  // and the hero's words are copy that changes. "hive" is the brand in every version of it.
  await expect(page.getByRole('heading', { level: 1, name: /hive/i })).toBeAttached();
});
