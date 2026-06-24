import { expect, test } from '@playwright/test';

test('home renders the seeker hero', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('hostel');
});
