import { expect, Page } from '@playwright/test';

/** The `data-seo` id of every JSON-LD block currently in the document, in document order. */
export async function jsonLdIds(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('script[type="application/ld+json"]')].map(
      (s) => s.getAttribute('data-seo') ?? '',
    ),
  );
}

/**
 * Waits until the client app has booted and taken over the server HTML.
 *
 * Clicking earlier lands on server markup nobody is listening to, and the head blocks the server
 * wrote are stranded because the page that would clean them up never ran. Both full-screen
 * overlays have to be gone too, since either intercepts every click while it is up: the startup
 * veil, which can legitimately stay for up to six seconds when a startup lookup hangs, and the
 * boot splash from index.html, which holds for a minimum time after navigation starts.
 */
export async function waitForClient(page: Page): Promise<void> {
  await page.waitForFunction(
    () => !!document.querySelector('[ng-version]') && !document.querySelector('[ngh]'),
  );
  await expect(page.locator('div.fixed.inset-0[role="status"]')).toHaveCount(0, {
    timeout: 10_000,
  });
  await expect(page.locator('#hh-boot:not(.hh-boot-out)')).toHaveCount(0, { timeout: 10_000 });
}

/** Marks the document so a later check can tell a client navigation from a full reload. */
export async function markDocument(page: Page): Promise<void> {
  await page.evaluate(() => ((window as unknown as { __spa: number }).__spa = 1));
}

/** True while the document marked by `markDocument` is still the one on screen. */
export async function documentSurvived(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as unknown as { __spa?: number }).__spa === 1);
}

/** What the server-rendered head of a page declares, read from the raw HTML. */
export interface RawHead {
  /** The `href` of every `<link rel="canonical">`. */
  canonicals: string[];
  /** The `content` of every `og:url` meta tag. */
  ogUrls: string[];
  /** The `content` of the robots meta tag, or null when there is none. */
  robots: string | null;
  /** The number of `<link rel="alternate" hreflang>` tags. */
  hreflangs: number;
  /** The `data-seo` id of every JSON-LD block, in document order. */
  jsonLd: string[];
  /** The `content` of every `og:locale` meta tag. */
  ogLocales: string[];
  /** The text of the `<title>`, or null when there is none. */
  title: string | null;
  /** The `content` of every `og:title` meta tag. */
  ogTitles: string[];
  /** The `content` of every `twitter:title` meta tag. */
  twitterTitles: string[];
  /** The `content` of the description meta tag, or null when there is none. */
  description: string | null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function attrOf(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return match ? decodeEntities(match[1]) : null;
}

/**
 * Reads the head out of raw HTML, as a crawler that never runs JavaScript sees it.
 *
 * Counts tags rather than querying a DOM on purpose: the page's own scripts have not run, so
 * anything found here was written by the server (or shipped statically in `index.html`).
 */
export function headOf(html: string): RawHead {
  const links = html.match(/<link\b[^>]*>/g) ?? [];
  const metas = html.match(/<meta\b[^>]*>/g) ?? [];
  const scripts = html.match(/<script\b[^>]*application\/ld\+json[^>]*>/g) ?? [];
  const titleMatch = /<title[^>]*>([^<]*)<\/title>/.exec(html);

  return {
    canonicals: links
      .filter((t) => attrOf(t, 'rel') === 'canonical')
      .map((t) => attrOf(t, 'href') ?? ''),
    ogUrls: metas
      .filter((t) => attrOf(t, 'property') === 'og:url')
      .map((t) => attrOf(t, 'content') ?? ''),
    robots:
      metas.filter((t) => attrOf(t, 'name') === 'robots').map((t) => attrOf(t, 'content'))[0] ??
      null,
    hreflangs: links.filter(
      (t) => attrOf(t, 'rel') === 'alternate' && attrOf(t, 'hreflang') !== null,
    ).length,
    jsonLd: scripts.map((t) => attrOf(t, 'data-seo') ?? ''),
    ogLocales: metas
      .filter((t) => attrOf(t, 'property') === 'og:locale')
      .map((t) => attrOf(t, 'content') ?? ''),
    title: titleMatch ? decodeEntities(titleMatch[1]) : null,
    ogTitles: metas
      .filter((t) => attrOf(t, 'property') === 'og:title')
      .map((t) => attrOf(t, 'content') ?? ''),
    twitterTitles: metas
      .filter(
        (t) => attrOf(t, 'name') === 'twitter:title' || attrOf(t, 'property') === 'twitter:title',
      )
      .map((t) => attrOf(t, 'content') ?? ''),
    description:
      metas.filter((t) => attrOf(t, 'name') === 'description').map((t) => attrOf(t, 'content'))[0] ??
      null,
  };
}

/** The same shape as `headOf`, read from the live document of a page the client app has taken over. */
export async function liveHead(page: Page): Promise<RawHead> {
  return page.evaluate(() => {
    const metaContent = (selector: string) =>
      [...document.querySelectorAll(selector)].map((m) => m.getAttribute('content') ?? '');
    return {
      canonicals: [...document.querySelectorAll('link[rel="canonical"]')].map(
        (l) => l.getAttribute('href') ?? '',
      ),
      ogUrls: metaContent('meta[property="og:url"]'),
      robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null,
      hreflangs: document.querySelectorAll('link[rel="alternate"][hreflang]').length,
      jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map(
        (s) => s.getAttribute('data-seo') ?? '',
      ),
      ogLocales: metaContent('meta[property="og:locale"]'),
      title: document.title || null,
      ogTitles: metaContent('meta[property="og:title"]'),
      twitterTitles: metaContent('meta[name="twitter:title"], meta[property="twitter:title"]'),
      description:
        document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null,
    };
  });
}

type TitleLog = { __titles?: string[]; __gaTitles?: string[]; __gaHooked?: boolean };

/**
 * Starts logging every `document.title` change, from before the first script runs.
 *
 * Call it before `page.goto`: it is an init script, so it is installed in every document the page
 * loads, and a MutationObserver on the whole document appends the new title to `window.__titles`
 * each time it differs from the last one. The first entry is the title the page started with, so
 * a flash of the wrong title is visible even when it was corrected a frame later. Read with
 * `recordedTitles`.
 */
export async function recordTitles(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as TitleLog;
    w.__titles = [];
    let last: string | null = null;
    const note = () => {
      if (document.title === last) return;
      last = document.title;
      w.__titles?.push(last);
    };
    note();
    new MutationObserver(note).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    document.addEventListener('DOMContentLoaded', note);
  });
}

/** Every distinct consecutive `document.title` seen since `recordTitles`, oldest first. */
export async function recordedTitles(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as TitleLog).__titles ?? []);
}

/**
 * Logs `document.title` at `NavigationEnd` plus one `setTimeout(0)`, the moment the analytics
 * service used to read it. Each reading is appended to `window.__gaTitles`.
 *
 * The service no longer reads then: it waits for the head to settle (and for one more macrotask),
 * so these readings are an early snapshot of the title, not what analytics sends. Use them to check
 * what the tab shows right after a navigation, never to claim analytics timing.
 *
 * It hooks the router through the root component (`ng.getComponent(app-root).router`), which
 * exists on the dev server only, so run it after `waitForClient` against `nx serve`, not against
 * a production build. Only navigations after the call are logged, which makes it a client
 * navigation tool; a full load has already finished its `NavigationEnd`. Idempotent. Read with
 * `gaTitles`.
 */
export async function titleAtNavigationEnd(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as TitleLog;
    if (w.__gaHooked) return;
    const ng = (
      window as unknown as { ng?: { getComponent: (el: Element) => Record<string, unknown> } }
    ).ng;
    const root = document.querySelector('app-root');
    if (!ng || !root) throw new Error('titleAtNavigationEnd needs the Angular dev server (window.ng)');
    const host = ng.getComponent(root);
    type Evented = { events: { subscribe: (fn: (e: unknown) => void) => void } };
    const isRouter = (v: unknown): v is Evented =>
      typeof v === 'object' &&
      v !== null &&
      typeof (v as { events?: { subscribe?: unknown } }).events?.subscribe === 'function';
    const router = isRouter(host['router']) ? host['router'] : Object.values(host).find(isRouter);
    if (!router) throw new Error('titleAtNavigationEnd could not find the Router on app-root');
    w.__gaTitles = [];
    w.__gaHooked = true;
    router.events.subscribe((e) => {
      // NavigationEnd is EventType 1; matching the number avoids importing the class here.
      if ((e as { type?: number }).type !== 1) return;
      setTimeout(() => w.__gaTitles?.push(document.title), 0);
    });
  });
}

/** The `document.title` read at each `NavigationEnd` plus one timeout since `titleAtNavigationEnd`, oldest first. */
export async function gaTitles(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as TitleLog).__gaTitles ?? []);
}

/** Switches the interface language through the header's language picker. */
export async function switchLanguage(page: Page, code: string): Promise<void> {
  // A click can land while the startup veil or another menu is still settling, so open and pick as one retried step.
  await expect(async () => {
    await page.getByRole('button', { name: /^Language:/ }).first().click({ timeout: 5_000 });
    await page
      .locator(`button[role="option"][lang="${code}"]`)
      .first()
      .click({ timeout: 5_000 });
  }).toPass({ timeout: 25_000 });
}

/** Opens the header's account menu and follows its sign-in link, retrying a click that lands too early. */
export async function openSignIn(page: Page): Promise<void> {
  await expect(async () => {
    await page.getByRole('button', { name: 'Account menu' }).first().click({ timeout: 5_000 });
    await page.locator('a[href*="/auth"]').first().click({ timeout: 5_000 });
  }).toPass({ timeout: 25_000 });
}
