import { expect, Page, test } from '@playwright/test';
import {
  documentSurvived,
  headOf,
  liveHead,
  markDocument,
  openSignIn,
  switchLanguage,
  waitForClient,
} from './support/seo';
import { stubListings } from './support/stubs';

// Every route ends up with a head that describes it. Static pages get an indexable default with
// their own canonical, the pages that must stay out of the index say so, and the head follows
// the language and the page through client navigations. Each check is made twice where it
// matters: in the HTML a crawler receives, and in the document after the client app has run.

const SITE = 'https://hostelhive.com';
const INDEX = 'index, follow, max-image-preview:large';
const NOINDEX = 'noindex, nofollow';
const HREFLANGS = 19;
const BLOG_TITLE = 'Blog — guides to hostels, campuses and the north | HostelHive';

/** The default description every static page without a key of its own carries. */
const DEFAULT_DESCRIPTION = {
  en: 'Search verified hostels, PGs and co-living. Filter by city, budget, gender and room sharing — no brokers, no surprises.',
  ur: 'تصدیق شدہ ہاسٹل، پی جی اور کو-لِوِنگ تلاش کریں۔ شہر، بجٹ، جنس اور کمرہ شیئرنگ کے حساب سے فلٹر کریں — نہ دلال، نہ کوئی حیرت۔',
};

/** The translated description of the four static pages that name one. */
const ABOUT_DESCRIPTION = {
  en: 'Making student accommodation safer and easier to find',
  ur: 'طلبہ کی رہائش کو محفوظ اور تلاش کرنے میں آسان بنانا',
};

const KEYED_DESCRIPTION: Record<string, Record<'en' | 'ur', string>> = {
  about: ABOUT_DESCRIPTION,
  faqs: {
    en: 'Everything you need to know about using HostelHive',
    ur: 'HostelHive استعمال کرنے کے بارے میں سب کچھ جو آپ کو جاننا چاہیے',
  },
  careers: {
    en: "HostelHive is on a mission to make student accommodation safer, more transparent, and easier to find. We're a small, fast-moving team and we're looking for people who want to build something that matters.",
    ur: 'HostelHive کا مشن طلبہ کی رہائش کو محفوظ تر، زیادہ شفاف اور تلاش کرنے میں آسان بنانا ہے۔ ہم ایک چھوٹی، تیز رفتار ٹیم ہیں اور ایسے لوگوں کی تلاش میں ہیں جو کچھ بامعنی بنانا چاہتے ہوں۔',
  },
  contact: {
    en: "We'd love to hear from you. Reach out through any of the channels below.",
    ur: 'ہم آپ سے سننا چاہیں گے۔ نیچے دیے گئے کسی بھی ذریعے سے رابطہ کریں۔',
  },
};

/** The static pages that are indexed, which are also the ones the sitemap lists. */
const INDEX_PAGES = [
  'about',
  'faqs',
  'careers',
  'contact',
  'privacy-policy',
  'terms-of-service',
  'service-policy',
  'credits',
];

const LANGUAGES = [
  ['en', 'en_PK'],
  ['ur', 'ur_PK'],
] as const;

const descriptionOf = (page: string, lang: 'en' | 'ur') =>
  KEYED_DESCRIPTION[page]?.[lang] ?? DEFAULT_DESCRIPTION[lang];

const countOf = (page: Page, selector: string) => page.locator(selector).count();

test.describe('server-rendered head of a route without its own SEO', () => {
  // Some pages wait on the listings API before the server finishes rendering.
  test.setTimeout(120_000);

  for (const path of INDEX_PAGES) {
    for (const [lang, ogLocale] of LANGUAGES) {
      test(`/${lang}/${path} names itself as canonical and og:url, with its own locale and description`, async ({
        request,
      }) => {
        const res = await request.get(`/${lang}/${path}`, { timeout: 100_000 });
        expect(res.ok()).toBe(true);

        const head = headOf(await res.text());
        const self = `${SITE}/${lang}/${path}`;

        expect(head.canonicals).toEqual([self]);
        expect(head.ogUrls).toEqual([self]);
        expect(head.hreflangs).toBe(HREFLANGS);
        expect(head.robots).toBe(INDEX);
        expect(head.ogLocales).toEqual([ogLocale]);
        expect(head.description).toBe(descriptionOf(path, lang));
      });
    }
  }

  for (const lang of ['en', 'ur']) {
    test(`/${lang}/auth is noindex with no canonical, og:url or hreflang`, async ({ request }) => {
      const res = await request.get(`/${lang}/auth`, { timeout: 100_000 });
      expect(res.ok()).toBe(true);

      const head = headOf(await res.text());

      expect(head.robots).toBe(NOINDEX);
      expect(head.canonicals).toEqual([]);
      expect(head.ogUrls).toEqual([]);
      expect(head.hreflangs).toBe(0);
    });
  }

  for (const path of ['/en/forbidden', '/en/account/settings']) {
    test(`${path} ships no canonical, og:url or og:locale of a page it is not`, async ({
      request,
    }) => {
      const res = await request.get(path, { timeout: 100_000 });
      expect(res.ok()).toBe(true);

      const head = headOf(await res.text());

      expect(head.canonicals).toEqual([]);
      expect(head.ogUrls).toEqual([]);
      expect(head.ogLocales).toEqual([]);
    });
  }

  for (const [lang, ogLocale] of LANGUAGES) {
    test(`/${lang}/hostels/lahore declares one ${ogLocale} og:locale`, async ({ request }) => {
      const res = await request.get(`/${lang}/hostels/lahore`, { timeout: 100_000 });
      expect(res.ok()).toBe(true);

      const head = headOf(await res.text());

      expect(head.ogLocales).toEqual([ogLocale]);
    });
  }

  test('/en/blog is titled by the blog itself, not by its route', async ({ request }) => {
    const res = await request.get('/en/blog', { timeout: 100_000 });
    expect(res.ok()).toBe(true);

    const head = headOf(await res.text());

    expect(head.title).toBe(BLOG_TITLE);
  });
});

test.describe('client navigation between pages with and without their own SEO', () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  test('leaving a landing page for a static page leaves none of the landing page behind', async ({
    page,
  }) => {
    await stubListings(page);

    await page.goto('/en/hostels/lahore');
    await expect
      .poll(async () => (await liveHead(page)).canonicals)
      .toEqual([`${SITE}/en/hostels/lahore`]);
    await waitForClient(page);
    await markDocument(page);

    await page.locator('footer a[href="/en/about"]').first().click();
    await expect(page).toHaveURL(/\/en\/about\/?$/);
    expect(await documentSurvived(page)).toBe(true);

    await expect
      .poll(async () => (await liveHead(page)).canonicals)
      .toEqual([`${SITE}/en/about`]);
    const head = await liveHead(page);
    expect(head.ogUrls).toEqual([`${SITE}/en/about`]);
    expect(head.robots).toBe(INDEX);
    expect(head.description).toBe(ABOUT_DESCRIPTION.en);
    expect(head.hreflangs).toBe(HREFLANGS);
    expect(head.jsonLd).toEqual([]);
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
      'href',
      `${SITE}/en/about`,
    );
    expect(await countOf(page, 'link[rel="preload"][as="image"]')).toBe(0);
  });

  test('a language switch on a static page rewrites its head in the new language', async ({
    page,
  }) => {
    await page.goto('/en/about');
    await expect
      .poll(async () => (await liveHead(page)).canonicals)
      .toEqual([`${SITE}/en/about`]);
    await waitForClient(page);
    await markDocument(page);

    await switchLanguage(page, 'ur');
    await expect(page).toHaveURL(/\/ur\/about\/?$/);
    expect(await documentSurvived(page)).toBe(true);

    await expect
      .poll(async () => (await liveHead(page)).canonicals)
      .toEqual([`${SITE}/ur/about`]);
    const head = await liveHead(page);
    expect(head.ogUrls).toEqual([`${SITE}/ur/about`]);
    expect(head.ogLocales).toEqual(['ur_PK']);
    expect(head.description).toBe(ABOUT_DESCRIPTION.ur);
    expect(head.hreflangs).toBe(HREFLANGS);
  });

  test('a noindex page leaves no canonical, and each page after it brings its own', async ({
    page,
  }) => {
    await page.goto('/en/about');
    await expect
      .poll(async () => (await liveHead(page)).canonicals)
      .toEqual([`${SITE}/en/about`]);
    await waitForClient(page);
    await markDocument(page);

    await openSignIn(page);
    await expect(page).toHaveURL(/\/en\/auth/);
    expect(await documentSurvived(page)).toBe(true);

    await expect.poll(async () => (await liveHead(page)).robots).toBe(NOINDEX);
    const auth = await liveHead(page);
    expect(auth.canonicals).toEqual([]);
    expect(auth.ogUrls).toEqual([]);
    expect(auth.hreflangs).toBe(0);

    // Back is a client popstate: the noindex head must give way to the static page's own.
    await page.goBack();
    await expect(page).toHaveURL(/\/en\/about\/?$/);
    expect(await documentSurvived(page)).toBe(true);
    await expect
      .poll(async () => (await liveHead(page)).canonicals)
      .toEqual([`${SITE}/en/about`]);
    const back = await liveHead(page);
    expect(back.robots).toBe(INDEX);
    expect(back.ogUrls).toEqual([`${SITE}/en/about`]);
    expect(back.hreflangs).toBe(HREFLANGS);

    await openSignIn(page);
    await expect(page).toHaveURL(/\/en\/auth/);
    await waitForClient(page);
    // The sign-in dialog has no footer, so leave through its close link and go on from there.
    await page.getByRole('link', { name: 'Close' }).click();
    await expect(page).toHaveURL(/\/en\/?$/);
    expect(await documentSurvived(page)).toBe(true);
    await expect
      .poll(async () => (await liveHead(page)).canonicals)
      .toEqual([`${SITE}/en`]);

    await page.locator('footer a[href="/en/contact"]').first().click();
    await expect(page).toHaveURL(/\/en\/contact\/?$/);
    expect(await documentSurvived(page)).toBe(true);

    await expect
      .poll(async () => (await liveHead(page)).canonicals)
      .toEqual([`${SITE}/en/contact`]);
    const contact = await liveHead(page);
    expect(contact.ogUrls).toEqual([`${SITE}/en/contact`]);
    expect(contact.robots).toBe(INDEX);
    expect(contact.description).toBe(KEYED_DESCRIPTION['contact'].en);
  });

  test('back and forward each restore the head of the page they land on', async ({ page }) => {
    await stubListings(page);

    await page.goto('/en/hostels/lahore');
    await expect
      .poll(async () => (await liveHead(page)).canonicals)
      .toEqual([`${SITE}/en/hostels/lahore`]);
    await waitForClient(page);
    await markDocument(page);

    await page.locator('footer a[href="/en/about"]').first().click();
    await expect(page).toHaveURL(/\/en\/about\/?$/);
    await expect
      .poll(async () => (await liveHead(page)).canonicals)
      .toEqual([`${SITE}/en/about`]);

    await page.goBack();
    await expect(page).toHaveURL(/\/en\/hostels\/lahore\/?$/);
    expect(await documentSurvived(page)).toBe(true);
    await expect
      .poll(async () => (await liveHead(page)).canonicals)
      .toEqual([`${SITE}/en/hostels/lahore`]);
    expect((await liveHead(page)).ogUrls).toEqual([`${SITE}/en/hostels/lahore`]);

    await page.goForward();
    await expect(page).toHaveURL(/\/en\/about\/?$/);
    expect(await documentSurvived(page)).toBe(true);
    await expect
      .poll(async () => (await liveHead(page)).canonicals)
      .toEqual([`${SITE}/en/about`]);
    const head = await liveHead(page);
    expect(head.ogUrls).toEqual([`${SITE}/en/about`]);
    expect(head.description).toBe(ABOUT_DESCRIPTION.en);
    expect(head.jsonLd).toEqual([]);
  });

  test('the blog follows a language switch: canonical, og:url, locale and one block of structured data', async ({
    page,
  }) => {
    await stubListings(page);

    await page.goto('/en/blog');
    await expect
      .poll(async () => (await liveHead(page)).canonicals)
      .toEqual([`${SITE}/en/blog`]);
    await waitForClient(page);
    await markDocument(page);

    await switchLanguage(page, 'ur');
    await expect(page).toHaveURL(/\/ur\/blog\/?$/);
    expect(await documentSurvived(page)).toBe(true);

    await expect
      .poll(async () => (await liveHead(page)).canonicals)
      .toEqual([`${SITE}/ur/blog`]);
    const head = await liveHead(page);
    expect(head.ogUrls).toEqual([`${SITE}/ur/blog`]);
    expect(head.ogLocales).toEqual(['ur_PK']);
    expect(head.hreflangs).toBe(HREFLANGS);
    expect(head.jsonLd).toEqual(['blog']);
    expect(head.title).toBe(BLOG_TITLE);
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
      'href',
      `${SITE}/en/blog`,
    );
  });
});
