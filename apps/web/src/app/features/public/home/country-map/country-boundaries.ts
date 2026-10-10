import type { FeatureCollection } from 'geojson';

/** geoBoundaries' metadata API for the open-licence (gbOpen) release. */
const API = 'https://www.geoboundaries.org/api/current/gbOpen';

/** Credit the licence asks for wherever the shapes are drawn. */
export const BOUNDARIES_ATTRIBUTION =
  'Boundaries: <a href="https://www.geoboundaries.org" target="_blank" rel="noopener">geoBoundaries</a>';

/** The metadata record for a country's first-level divisions, by ISO alpha-3. */
export function boundaryMetadataUrl(iso3: string): string {
  return `${API}/${iso3.toUpperCase()}/ADM1/`;
}

/**
 * The same file at an address a page is allowed to read.
 *
 * The API points at `github.com/<owner>/<repo>/raw/<ref>/<path>`, which answers with a redirect
 * carrying an *empty* `Access-Control-Allow-Origin` — and a browser rejects a cross-origin
 * redirect that fails the CORS check, so following it from the page always fails. The files are
 * Git LFS objects, and the redirect's own target, `media.githubusercontent.com`, serves them
 * with `Access-Control-Allow-Origin: *`, so the request goes there directly. Anything not
 * shaped like a GitHub raw link is returned untouched, in case the data moves somewhere that
 * needs no rewriting.
 */
export function corsReadableUrl(url: string): string {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/(.+)$/.exec(
    url,
  );
  return match
    ? `https://media.githubusercontent.com/media/${match[1]}/${match[2]}/${match[3]}`
    : url;
}

/**
 * A country's provinces or states as GeoJSON, from geoBoundaries' simplified ADM1 release.
 *
 * Two requests: the metadata record names the current file, which is then fetched. Rejects
 * on anything short of a non-empty FeatureCollection — a country geoBoundaries does not cover
 * answers the first request with a 404 — and the caller decides what a missing map means.
 *
 * `fetch` rather than `HttpClient`, so the app's interceptors never attach the session token
 * to a third party or raise the API error toast for a map nobody asked about.
 */
export async function fetchCountryBoundaries(
  iso3: string,
): Promise<FeatureCollection> {
  const meta = await getJson(boundaryMetadataUrl(iso3));
  const record = (Array.isArray(meta) ? meta[0] : meta) as Record<
    string,
    unknown
  > | null;
  const file = record?.['simplifiedGeometryGeoJSON'];
  if (typeof file !== 'string' || !file.startsWith('https://')) {
    throw new Error(`No simplified ADM1 boundaries for ${iso3}`);
  }
  const collection = (await getJson(
    corsReadableUrl(file),
  )) as FeatureCollection | null;
  if (
    collection?.type !== 'FeatureCollection' ||
    !collection.features?.length
  ) {
    throw new Error(`Unusable ADM1 boundaries for ${iso3}`);
  }
  return collection;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  return res.json();
}
