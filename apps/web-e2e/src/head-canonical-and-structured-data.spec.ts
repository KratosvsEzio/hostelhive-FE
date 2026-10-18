import { expect, test } from '@playwright/test';
import {
  documentSurvived,
  headOf,
  jsonLdIds,
  markDocument,
  pageAddressesIn,
  waitForClient,
} from './support/seo';
import { stubListings } from './support/stubs';

// A page that asks to stay out of the index must not name another URL as its canonical, and a
// page's structured data must go with the page. Both are visible twice: in the HTML a crawler
// that never runs JavaScript receives, and in the document after a client-side navigation.

const SITE = 'https://hostelhive.com';
const POST = 'student-hostels-in-lahore-a-practical-guide';

/**
 * Pages that are `noindex`: a filtered search, an "everywhere" search, a place search opened on
 * a viewport link that frames the place, an unknown place and an unknown post.
 */
const NOINDEX_PAGES = [
  '/en/search?gender=girls',
  '/en/search?everywhere=1',
  '/en/search/lahore?ne_lat=31.75&ne_lng=74.70&sw_lat=31.30&sw_lng=74.00',
  '/en/hostels/nowhere',
  '/en/blog/no-such-post',
];

/** A place search whose link carries a viewport nowhere near Lahore (31.5, 74.4). */
const FAR_VIEWPORT_SEARCH = '/en/search/lahore?ne_lat=20&ne_lng=100&sw_lat=10&sw_lng=90';

/** Indexable pages, and the canonical each one must keep. */
const INDEXABLE_PAGES: [string, string][] = [
  ['/en', '/en'],
  ['/en/blog', '/en/blog'],
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

/** The text of the first `<h1>` in raw HTML, minus its markup and the server's anchor comments. */
function h1Of(html: string): string | null {
  const match = /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html);
  if (!match) return null;
  return match[1]
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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

  test(`${FAR_VIEWPORT_SEARCH} is titled and headed as the map area, not as the place`, async ({
    request,
  }) => {
    const res = await request.get(FAR_VIEWPORT_SEARCH, { timeout: 100_000 });
    expect(res.ok()).toBe(true);

    const html = await res.text();
    const head = headOf(html);

    expect(head.robots).toContain('noindex');
    expect(head.canonicals).toEqual([]);
    expect(head.ogUrls).toEqual([]);
    expect(head.hreflangs).toBe(0);
    expect(head.title).toBe('Hostels in this map area — search | HostelHive');
    expect(h1Of(html)).toBe('This map area');
  });

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

  test('an article left before the app boots strands none of its structured data (Trello #138)', async ({
    page,
  }) => {
    await stubListings(page);
    // Holds the article's lazy chunk, so the browser's first navigation cannot finish and the
    // article component is never created before the click: the race a slow phone loses.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/*.js', async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      if (body.includes('app-blog-article')) await held;
      await route.fulfill({ response, body });
    });

    await page.goto(`/en/blog/${POST}`, { waitUntil: 'domcontentloaded' });
    expect((await jsonLdIds(page)).sort()).toEqual(['article', 'breadcrumb']);
    await page.waitForFunction(() => !!document.querySelector('[ng-version]'));

    // Dispatched rather than clicked: the boot splash still covers the page at this point.
    await page.locator('header a[href="/en"]').first().dispatchEvent('click');
    release();

    await expect(page).toHaveURL(/\/en\/?$/);
    await waitForClient(page);
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

// The structured data names the same address as the canonical beside it, with a language: an
// unprefixed URL only redirects, and disagrees with the page it describes.
const PREFIXED = /^https:\/\/hostelhive\.com\/[a-z]{2}(\/|$)/;

type ListItem = { position: number; name: string; item: string };

test.describe('server-rendered structured data of the blog', () => {
  test.setTimeout(120_000);

  for (const lang of ['en', 'ur', 'ar']) {
    test(`/${lang}/blog/${POST} names its English canonical in the article and breadcrumb`, async ({
      request,
    }) => {
      const res = await request.get(`/${lang}/blog/${POST}`, { timeout: 100_000 });
      expect(res.ok()).toBe(true);

      const head = headOf(await res.text());
      const canonical = `${SITE}/en/blog/${POST}`;
      const article = head.jsonLdBodies['article'] as Record<string, unknown>;
      const breadcrumb = head.jsonLdBodies['breadcrumb'] as { itemListElement: ListItem[] };

      expect(head.canonicals).toEqual([canonical]);
      expect(article['url']).toBe(canonical);
      expect(article['mainEntityOfPage']).toBe(canonical);
      expect(article['inLanguage']).toBe('en');
      const trail = breadcrumb.itemListElement.map(({ position, name, item }) => [
        position,
        name,
        item,
      ]);
      expect(trail).toEqual([
        [1, 'Blog', `${SITE}/en/blog`],
        [2, article['headline'], canonical],
      ]);
      const pages = pageAddressesIn([article, breadcrumb]);
      expect(pages.length).toBeGreaterThan(0);
      for (const url of pages) expect(url).toMatch(PREFIXED);
    });
  }

  test('/ur/blog names its own canonical as the blog url and each article by its canonical', async ({
    request,
  }) => {
    const index = await request.get('/ur/blog', { timeout: 100_000 });
    expect(index.ok()).toBe(true);
    const article = await request.get(`/ur/blog/${POST}`, { timeout: 100_000 });
    expect(article.ok()).toBe(true);

    const head = headOf(await index.text());
    const blog = head.jsonLdBodies['blog'] as { url: string; blogPost: { url: string }[] };
    const [articleCanonical] = headOf(await article.text()).canonicals;

    expect(head.canonicals).toEqual([`${SITE}/ur/blog`]);
    expect(blog.url).toBe(`${SITE}/ur/blog`);
    expect(blog.blogPost.map((p) => p.url)).toContain(articleCanonical);
    expect(articleCanonical).toBe(`${SITE}/en/blog/${POST}`);
    for (const url of pageAddressesIn(blog)) expect(url).toMatch(PREFIXED);
  });
});
