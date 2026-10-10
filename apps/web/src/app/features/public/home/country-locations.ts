import { toLocationSlug } from '@util/location-slug';

/** The slice of a hostel the tally reads; `Listing` satisfies it. */
export interface LocatedHostel {
  city?: string;
  state?: string;
  lat?: number;
  lng?: number;
}

export interface CityTally {
  name: string;
  slug: string;
  count: number;
  /** The mean of its hostels' coordinates, or null when none of them carries a usable pair. */
  lat: number | null;
  lng: number | null;
}

export interface RegionTally {
  name: string;
  slug: string;
  count: number;
  /** Cities with hostels in this region, busiest first; counts are within the region. */
  cities: { name: string; slug: string; count: number }[];
}

export interface CountryLocations {
  total: number;
  regions: RegionTally[];
  cities: CityTally[];
}

export const NO_LOCATIONS: CountryLocations = {
  total: 0,
  regions: [],
  cities: [],
};

/**
 * One place, gathered across every spelling hosts typed for it.
 *
 * City and state are free text, so "Lahore", "lahore" and "Lahore " all arrive. They are
 * grouped by slug and shown under whichever spelling most hostels used — the first one seen
 * on a tie, so the result does not depend on how the engine happened to sort equal scores.
 */
class Bucket {
  count = 0;
  private readonly spellings = new Map<string, number>();
  private latSum = 0;
  private lngSum = 0;
  private located = 0;

  constructor(readonly slug: string) {}

  add(spelling: string, lat?: number, lng?: number): void {
    this.count++;
    this.spellings.set(spelling, (this.spellings.get(spelling) ?? 0) + 1);
    const point = coordinate(lat, lng);
    if (point) {
      this.latSum += point.lat;
      this.lngSum += point.lng;
      this.located++;
    }
  }

  name(): string {
    let best = '';
    let votes = 0;
    for (const [spelling, n] of this.spellings) {
      if (n > votes) {
        best = spelling;
        votes = n;
      }
    }
    return best;
  }

  centre(): { lat: number | null; lng: number | null } {
    return this.located
      ? { lat: this.latSum / this.located, lng: this.lngSum / this.located }
      : { lat: null, lng: null };
  }
}

/**
 * Regions and cities that have hostels, with how many each has, from a list of hostels.
 *
 * A stopgap until the backend offers a locations endpoint: it can only count the hostels it
 * was handed, so once a country holds more than one page of them every figure here is an
 * undercount and a quiet city may be missing altogether.
 *
 * A hostel with no city still counts towards its region, and one with no region towards its
 * city — each half is useful on its own.
 */
export function tallyLocations(
  hostels: readonly LocatedHostel[],
): CountryLocations {
  const cities = new Map<string, Bucket>();
  const regions = new Map<
    string,
    { bucket: Bucket; cities: Map<string, number> }
  >();

  for (const h of hostels) {
    const city = clean(h.city);
    const citySlug = city ? toLocationSlug(city) : '';
    if (citySlug) bucketFor(cities, citySlug).add(city, h.lat, h.lng);

    const state = clean(h.state);
    const stateSlug = state ? toLocationSlug(state) : '';
    if (!stateSlug) continue;
    let region = regions.get(stateSlug);
    if (!region) {
      region = { bucket: new Bucket(stateSlug), cities: new Map() };
      regions.set(stateSlug, region);
    }
    region.bucket.add(state);
    if (citySlug)
      region.cities.set(citySlug, (region.cities.get(citySlug) ?? 0) + 1);
  }

  const cityList = [...cities.values()]
    .map((b) => ({
      name: b.name(),
      slug: b.slug,
      count: b.count,
      ...b.centre(),
    }))
    .sort(busiestFirst);

  const regionList = [...regions.values()]
    .map(({ bucket, cities: within }) => ({
      name: bucket.name(),
      slug: bucket.slug,
      count: bucket.count,
      cities: [...within]
        .map(([slug, count]) => ({
          name: cities.get(slug)?.name() ?? slug,
          slug,
          count,
        }))
        .sort(busiestFirst),
    }))
    .sort(busiestFirst);

  return { total: hostels.length, regions: regionList, cities: cityList };
}

/**
 * Whether two spellings name the same region — "Islamabad" and "Islamabad Capital Territory",
 * "Punjab Province" and "Punjab".
 *
 * Hosts type the province freely and the boundary data names it formally, so an exact match
 * would leave most of the list unable to find its shape on the map. One name has to appear in
 * the other as whole words, which keeps "Punjab" from matching a "Punjabi Bagh".
 */
export function sameRegionName(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const x = a ? toLocationSlug(a) : '';
  const y = b ? toLocationSlug(b) : '';
  if (!x || !y) return false;
  return x === y || `-${x}-`.includes(`-${y}-`) || `-${y}-`.includes(`-${x}-`);
}

function bucketFor(map: Map<string, Bucket>, slug: string): Bucket {
  let bucket = map.get(slug);
  if (!bucket) {
    bucket = new Bucket(slug);
    map.set(slug, bucket);
  }
  return bucket;
}

function clean(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, ' ') ?? '';
}

// The mapper turns a missing coordinate into 0, so the null island is read as "unknown".
function coordinate(
  lat: number | undefined,
  lng: number | undefined,
): { lat: number; lng: number } | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return lat === 0 && lng === 0 ? null : { lat, lng };
}

function busiestFirst(
  a: { name: string; count: number },
  b: { name: string; count: number },
): number {
  return b.count - a.count || a.name.localeCompare(b.name);
}
