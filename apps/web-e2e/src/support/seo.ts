import { Page } from '@playwright/test';

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
 * wrote are stranded because the page that would clean them up never ran.
 */
export async function waitForClient(page: Page): Promise<void> {
  await page.waitForFunction(
    () => !!document.querySelector('[ng-version]') && !document.querySelector('[ngh]'),
  );
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
}

function attrOf(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return match ? match[1] : null;
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
  };
}
