import { Page, Route } from '@playwright/test';

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

/** A geocoder suggestion for Karachi, for specs that pick a place other than the one on screen. */
export const KARACHI_PHOTON = {
  geometry: { type: 'Point', coordinates: [67.0011, 24.8607] },
  properties: {
    osm_id: 1,
    name: 'Karachi',
    type: 'city',
    state: 'Sindh',
    country: 'Pakistan',
    countrycode: 'PK',
    extent: [66.8, 25.1, 67.3, 24.7],
  },
};

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

/** What a stubbed endpoint should do: wait, answer with a status, and carry a body. */
export interface StubOptions {
  /** Hold the response back this long, to keep the page in its loading state. */
  delayMs?: number;
  /** HTTP status to answer with. Defaults to 200. */
  status?: number;
  /** Replaces the default body. Sent as JSON. */
  body?: unknown;
}

/**
 * A minimal raw `/public/hostel_detail/:id` document the listing page's mapper accepts: a name,
 * area and city, a gender type, one photo, one shared room type with a price, and a host.
 */
export function hostelDetailFixture(overrides: Record<string, unknown> = {}): {
  hostel: Record<string, unknown>;
  success: boolean;
} {
  return {
    success: true,
    hostel: {
      id: 1,
      name: 'Stub Hostel',
      description: 'A stubbed hostel for head and title checks.',
      gender_type: 'co-living',
      property_type: 'building',
      total_rooms: 4,
      total_floors: 2,
      address_1: '12 Test Street',
      address_2: null,
      city: 'Lahore',
      state: 'Punjab',
      country: 'Pakistan',
      area: 'Gulberg',
      latitude: 31.5204,
      longitude: 74.3587,
      min_price: 15000,
      max_price: 15000,
      currency: 'PKR',
      billing_frequency: 'month',
      primary_phone: '+923001234567',
      secondary_phone: null,
      nearby_landmarks: 'Liberty Market',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      host: { id: 'hOsT01', name: 'Stub Host', email: 'host@example.test', is_active: true },
      hostel_offers: [],
      offers: [{ id: 1, name: 'WiFi', slug: 'wifi', icon: null }],
      attachments: [
        {
          id: 'att1',
          content_type: 'image/png',
          attachment_type: 'photo',
          is_primary: true,
          // A data URI, so the gallery never reaches for the network.
          url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          attachment_label: null,
        },
      ],
      room_types: [
        {
          id: 1,
          name: 'Shared Dorm',
          description: 'Four beds',
          capacity: 4,
          price: 15000,
          discounted_price: null,
          is_discountable: false,
          is_bookable: true,
          occupancy_type: 'shared',
          attachments: [],
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ],
      rooms: [],
      status: { id: 1, slug: 'active', name: 'Active' },
      ...overrides,
    },
  };
}

/** Answers a credentialed cross-origin API call: echoes the request's Origin, since `*` is rejected. */
async function fulfillApi(
  page: Page,
  route: Route,
  options: StubOptions,
  fallbackBody: unknown,
): Promise<void> {
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
  if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
  await route.fulfill({
    status: options.status ?? 200,
    contentType: 'application/json',
    headers: cors,
    body: JSON.stringify(options.body ?? fallbackBody),
  });
}

/**
 * Stubs `GET /public/hostel_detail/:id` for every id with {@link hostelDetailFixture} (or `body`).
 * Use `delayMs` to hold the listing in its loading state and `status: 404` or `500` for the
 * removed and failed states.
 */
export async function stubHostelDetail(page: Page, options: StubOptions = {}): Promise<void> {
  await page.route('**/public/hostel_detail/**', (route) =>
    fulfillApi(page, route, options, hostelDetailFixture()),
  );
}

/**
 * Stubs `GET /api/nps_ratings`, which the listing page calls on load and on `?review=`. Answers an
 * empty list by default; `body` should be `{ ratings: [...] }`.
 */
export async function stubReviews(page: Page, options: StubOptions = {}): Promise<void> {
  await page.route('**/api/nps_ratings**', (route) =>
    fulfillApi(page, route, options, { ratings: [] }),
  );
}
