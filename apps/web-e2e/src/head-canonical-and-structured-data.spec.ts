import { expect, test } from '@playwright/test';
import { documentSurvived, headOf, jsonLdIds, markDocument, waitForClient } from './support/seo';
import { stubListings } from './support/stubs';

// A page that asks to stay out of the index must not name another URL as its canonical, and a
// page's structured data must go with the page. Both are visible twice: in the HTML a crawler
// that never runs JavaScript receives, and in the document after a client-side navigation.

const SITE = 'https://hostelhive.com';
const POST = 'student-hostels-in-lahore-a-practical-guide';

/** Pages that are `noindex`: a filtered, an "everywhere", an unknown place and an unknown post. */
const NOINDEX_PAGES = [
  '/en/search?gender=girls',
  '/en/search?everywhere=1',
  '/en/hostels/nowhere',
  '/en/blog/no-such-post',
];

/** Indexable pages, and the canonical each one must keep. */
const INDEXABLE_PAGES: [string, string][] = [
  ['/en', '/en'],
  ['/en/blog', '/en/blog'],
  [`/en/blog/${POST}`, `/en/blog/${POST}`],
  ['/en/pricing', '/en/pricing'],
  ['/en/search/lahore', '/en/hostels/lahore'],
  ['/ur/blog', '/ur/blog'],
];

/** The blocks each page ships in its server HTML. */
const JSON_LD_PAGES: [string, string[]][] = [
  ['/en', ['organization', 'website']],
  ['/en/blog', ['blog']],
  [`/en/blog/${POST}`, ['article', 'breadcrumb']],
];

test.describe('server-rendered head', () => {
  // Some pages wait on the listings API before the server finishes rendering.
  test.setTimeout(120_000);

  for (const path of NOINDEX_PAGES) {
    test(`${path} is noindex with no canonical, og:url or hreflang`, async ({ request }) => {
      const res = await request.get(path, { timeout: 100_000 });
      expect(res.ok()).toBe(true);

      const head = headOf(await res.text());

      expect(head.robots).toContain('noindex');
      expect(head.canonicals).toEqual([]);
      expect(head.ogUrls).toEqual([]);
      expect(head.hreflangs).toBe(0);
    });
  }

  for (const [path, canonical] of INDEXABLE_PAGES) {
    test(`${path} keeps one canonical, a matching og:url and its hreflang set`, async ({
      request,
    }) => {
      const res = await request.get(path, { timeout: 100_000 });
      expect(res.ok()).toBe(true);

      const head = headOf(await res.text());

      expect(head.robots).toContain('index');
      expect(head.robots).not.toContain('noindex');
      expect(head.canonicals).toEqual([`${SITE}${canonical}`]);
      expect(head.ogUrls).toEqual([`${SITE}${canonical}`]);
      expect(head.hreflangs).toBeGreaterThan(0);
    });
  }

  for (const [path, ids] of JSON_LD_PAGES) {
    test(`${path} ships its structured data in the raw HTML`, async ({ request }) => {
      const res = await request.get(path, { timeout: 100_000 });
      expect(res.ok()).toBe(true);

      const head = headOf(await res.text());

      expect([...head.jsonLd].sort()).toEqual([...ids].sort());
    });
  }
});

test.describe('client navigation', () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  const sorted = (page: Parameters<typeof jsonLdIds>[0]) => async () =>
    (await jsonLdIds(page)).sort();

  test('home structured data stays on the home page and the blog data on the blog', async ({
    page,
  }) => {
    await stubListings(page);

    await page.goto('/en');
    await expect.poll(sorted(page)).toEqual(['organization', 'website']);
    await waitForClient(page);
    await markDocument(page);

    await page.locator('footer a[href="/en/blog"]').first().click();
    await expect(page).toHaveURL(/\/en\/blog\/?$/);
    expect(await documentSurvived(page)).toBe(true);
    await expect.poll(sorted(page)).toEqual(['blog']);

    await waitForClient(page);
    await page.locator('header a[href="/en"]').first().click();
    await expect(page).toHaveURL(/\/en\/?$/);
    expect(await documentSurvived(page)).toBe(true);
    await expect.poll(sorted(page)).toEqual(['organization', 'website']);
  });

  test('an article carries its structured data to no other page', async ({ page }) => {
    await stubListings(page);

    await page.goto('/en/blog');
    await expect.poll(sorted(page)).toEqual(['blog']);
    await waitForClient(page);
    await markDocument(page);

    await page.locator(`a[href="/en/blog/${POST}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`/en/blog/${POST}/?$`));
    expect(await documentSurvived(page)).toBe(true);
    await expect.poll(sorted(page)).toEqual(['article', 'breadcrumb']);

    await waitForClient(page);
    await page.locator('header a[href="/en"]').first().click();
    await expect(page).toHaveURL(/\/en\/?$/);
    expect(await documentSurvived(page)).toBe(true);
    await expect.poll(sorted(page)).toEqual(['organization', 'website']);
  });

  test('leaving a noindex search for an indexable page brings back one canonical and og:url', async ({
    page,
  }) => {
    await stubListings(page);

    await page.goto('/en/search?gender=girls');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    await expect(page.locator('meta[property="og:url"]')).toHaveCount(0);

    await waitForClient(page);
    await markDocument(page);
    await page.locator('header a[href="/en"]').first().click();
    await expect(page).toHaveURL(/\/en\/?$/);
    expect(await documentSurvived(page)).toBe(true);

    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${SITE}/en`);
    await expect(page.locator('meta[property="og:url"]')).toHaveCount(1);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', `${SITE}/en`);
    await expect(page.locator('meta[name="robots"]')).not.toHaveAttribute('content', /noindex/);
  });
});
