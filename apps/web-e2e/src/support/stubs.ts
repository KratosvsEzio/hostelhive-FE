import { Page } from '@playwright/test';

/** The bounding box a listings search carried, or null for a side the request omitted. */
export interface SentBounds {
  north: number | null;
  south: number | null;
  east: number | null;
  west: number | null;
}

export interface ListingsStub {
  /** Every listings search received so far, as the API would see its query. */
  readonly requests: URLSearchParams[];
  /** `f[gender_type]` of every search (null when a request carries none). */
  readonly genders: (string | null)[];
  /** Bounding box of every search. */
  readonly bounds: SentBounds[];
  reset: () => void;
}

const num = (value: string | null): number | null => (value === null ? null : Number(value));

/** Reads the bounding box out of one search's query. */
export function boundsOf(params: URLSearchParams): SentBounds {
  return {
    north: num(params.get('f[bounding][north]')),
    south: num(params.get('f[bounding][south]')),
    east: num(params.get('f[bounding][east]')),
    west: num(params.get('f[bounding][west]')),
  };
}

/**
 * Stubs the listings endpoint with an empty page and records every search it receives. The API
 * is not the thing under test, and an empty list keeps the page out of any error state.
 *
 * The app calls the API with credentials, and a browser rejects a credentialed response whose
 * allowed origin is `*`. So the stub echoes the request's own Origin and allows credentials;
 * anything looser puts the page into its "couldn't load listings" state and the test then
 * exercises the error branch instead of the one it names.
 */
export async function stubListings(
  page: Page,
  body: unknown = {
    hostels: [],
    pagination: { current_page: 1, total_pages: 1, total_count: 0 },
  },
): Promise<ListingsStub> {
  const requests: URLSearchParams[] = [];

  await page.route('**/public/hostels**', async (route) => {
    const request = route.request();
    const origin = request.headers()['origin'] ?? new URL(page.url()).origin;
    const cors = {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': '*',
    };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    // SearchParams decodes the brackets, so keys read as the API sees them.
    requests.push(new URL(request.url()).searchParams);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: cors,
      body: JSON.stringify(body),
    });
  });

  return {
    requests,
    get genders() {
      return requests.map((p) => p.get('f[gender_type]'));
    },
    get bounds() {
      return requests.map(boundsOf);
    },
    reset: () => {
      requests.length = 0;
    },
  };
}

/** Stubs the place-search geocoder so the suggestion list is exactly `features`. */
export async function stubPhoton(page: Page, features: unknown[]): Promise<void> {
  await page.route('**/photon.komoot.io/**', async (route) => {
    const origin = route.request().headers()['origin'] ?? new URL(page.url()).origin;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': origin,
        'access-control-allow-credentials': 'true',
      },
      body: JSON.stringify({ features }),
    });
  });
}
