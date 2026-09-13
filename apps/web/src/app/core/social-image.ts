/**
 * The picture a link preview shows.
 *
 * `Seo` falls back to the HostelHive logo when a page supplies nothing, and for a long time
 * every page except the listing did exactly that — so a shared search, a shared city page
 * and a shared home page were three identical pictures of a logo, on a head that declares
 * `twitter:card: summary_large_image`. In a market where links are passed around on
 * WhatsApp, that preview is most of the first impression.
 *
 * These are the 1200x630 cards written beside the carousel tiles by
 * `tools/fetch-city-images.mjs` and `tools/fetch-hero-images.mjs`. The tiles themselves are
 * 560x480 — under Facebook's 600px floor and the wrong aspect for the 1.91:1 crop — so they
 * could not be reused, and upscaling them would have been soft on the one screen that
 * matters here.
 *
 * Absolute, because og:image and Schema.org both require it: a crawler has no page to
 * resolve a relative path against.
 */
import { SITE_ORIGIN } from './seo';

/**
 * A city's landmark, for its landing page.
 *
 * Every `PLACES` slug has a matching card; `social-image.spec.ts` fails if one ever does
 * not, which is the only way to catch it — a missing og:image is silent, and the page it
 * spoils is the one nobody views in a browser.
 */
export function placeSocialImage(slug: string): string {
  return `${SITE_ORIGIN}/cities/social/${slug}.jpg`;
}

/**
 * The card for pages that are not about one city: the home page and search.
 *
 * A dormitory rather than a landmark — those pages are about what the site *does*, and a
 * photograph of Badshahi Mosque on a national home page claims a city the page is not about.
 */
export const DEFAULT_SOCIAL_IMAGE = `${SITE_ORIGIN}/hero/social/dorm.jpg`;
