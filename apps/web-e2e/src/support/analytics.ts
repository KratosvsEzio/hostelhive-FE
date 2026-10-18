import { expect, Page } from '@playwright/test';

/** The `localStorage` key the app keeps the visitor's analytics choice under. */
const CONSENT_KEY = 'hh.consent.analytics';

/**
 * Turns analytics on for this page and keeps every byte of it in the browser.
 *
 * The e2e dev server is built with a fake measurement id (`playwright.config.ts`), and every
 * spec starts having declined. This grants consent before the app boots, so `start()` installs
 * `gtag` on load, and aborts Google's hosts: gtag.js never loads, so `gtag` stays the app's own
 * stub, which only pushes onto `window.dataLayer` for {@link gaEvents} to read.
 */
export async function captureAnalytics(page: Page): Promise<void> {
  await page.route(/^https:\/\/([^/]+\.)?(googletagmanager|google-analytics)\.com\//, (route) =>
    route.abort(),
  );
  await page.route(/^https:\/\/analytics\.google\.com\//, (route) => route.abort());
  await page.addInitScript(([key]) => window.localStorage.setItem(key, 'granted'), [CONSENT_KEY]);
}

/** Every `gtag('event', name, params)` the page has sent so far, oldest first. */
export async function gaEvents(page: Page, name: string): Promise<Record<string, unknown>[]> {
  return page.evaluate((wanted) => {
    const layer = (window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? [];
    return Array.from(layer)
      .map((entry) => Array.from(entry))
      .filter((args) => args[0] === 'event' && args[1] === wanted)
      .map((args) => (args[2] ?? {}) as Record<string, unknown>);
  }, name);
}

/**
 * Fails fast, and says why, when the app under test has analytics off: a reused or deployed
 * server built without a measurement id sends nothing, which would otherwise read as a
 * missing event.
 */
export async function expectAnalyticsOn(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => typeof (window as unknown as { gtag?: unknown }).gtag), {
      message:
        'window.gtag never appeared: the server under test was built without GA_MEASUREMENT_ID ' +
        '(the e2e webServer in playwright.config.ts sets one)',
    })
    .toBe('function');
}
