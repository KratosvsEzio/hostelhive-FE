import { SITE_ORIGIN } from './seo';

/**
 * The absolute URLs on this site that a JSON-LD value names — for specs only.
 *
 * Split in two because they follow opposite rules. A page address must carry a language
 * prefix, or it redirects and disagrees with the canonical beside it. A static asset — an
 * image, the logo — lives at the site root and must not, or it is a 404. An asset is told
 * apart by its path ending in a file extension, which no page path on this site does.
 */
export function pageAddressesIn(data: unknown): string[] {
  return siteUrlsIn(data).filter((url) => !isAsset(url));
}

/** The static assets among the site URLs a JSON-LD value names; see {@link pageAddressesIn}. */
export function assetUrlsIn(data: unknown): string[] {
  return siteUrlsIn(data).filter(isAsset);
}

function isAsset(url: string): boolean {
  return /\.[a-z0-9]+$/i.test(new URL(url).pathname);
}

function siteUrlsIn(data: unknown): string[] {
  if (typeof data === 'string') {
    return data === SITE_ORIGIN || data.startsWith(`${SITE_ORIGIN}/`) ? [data] : [];
  }
  if (Array.isArray(data)) return data.flatMap(siteUrlsIn);
  if (data && typeof data === 'object') return Object.values(data).flatMap(siteUrlsIn);
  return [];
}
