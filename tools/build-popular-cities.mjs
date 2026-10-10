// Builds `apps/web/public/geo/cities/{ISO2}.json` — each country's ten most populous cities,
// so the home page can offer "popular cities" for a country before it has a single listing.
//
// Source: GeoNames `cities15000` (every place of 15,000+ people), CC-BY 4.0 — the page that
// shows these credits "City data: GeoNames" with a link, which is what the licence asks.
//
// Output shape: `[{ "name", "lat", "lng", "population" }, …]`, most populous first, one small
// file per country so a visitor downloads only their own (well under 1KB each).
//
// Pakistan is skipped on purpose: its popular cities are the hand-picked list in
// `features/public/home/home-cities/city-photos.ts`, which has photographs and landing pages
// that a population ranking knows nothing about. Writing PK.json would only ship a file the
// app never reads.
//
// Re-run:  node tools/build-popular-cities.mjs
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const SRC = 'https://download.geonames.org/export/dump/cities15000.zip';
const OUT = join(process.cwd(), 'apps/web/public/geo/cities');
const PER_COUNTRY = 10;
const SKIP = new Set(['PK']);

// Parts of a city, and places that no longer exist, are not cities a visitor would pick:
// PPLX is a section of a populated place (a borough, a district), the rest are historical,
// abandoned or destroyed.
const NOT_A_CITY = new Set(['PPLX', 'PPLH', 'PPLQ', 'PPLW', 'PPLCH']);

// GeoNames files some boroughs as towns in their own right (Brooklyn, Queens and Manhattan are
// PPLA2, not PPLX). One that close to a city at least twice its size opens the same patch of the
// search map, so it would be a second globe for one destination. Capitals and first-order seats
// are never folded: Manila and Kuwait City sit beside bigger neighbours and are still the names
// a visitor looks for.
const SAME_PLACE_KM = 15;
const SAME_PLACE_SIZE_RATIO = 2;
const NEVER_FOLDED = new Set(['PPLC', 'PPLA']);

function isPartOf(place, bigger) {
  return (
    !NEVER_FOLDED.has(place.featureCode) &&
    bigger.population >= place.population * SAME_PLACE_SIZE_RATIO &&
    distanceKm(bigger, place) < SAME_PLACE_KM
  );
}

function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** The one file inside a zip, inflated — enough of the format for a single-entry GeoNames dump. */
function unzipOnlyEntry(zip) {
  // The end-of-central-directory record sits in the last 64KB + 22 bytes of the archive.
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip archive');
  const central = zip.readUInt32LE(eocd + 16);
  if (zip.readUInt32LE(central) !== 0x02014b50)
    throw new Error('Bad central directory');
  const method = zip.readUInt16LE(central + 10);
  const compressedSize = zip.readUInt32LE(central + 20);
  const local = zip.readUInt32LE(central + 42);
  // The local header repeats the name and its own extra field, whose length can differ.
  const dataStart =
    local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  const data = zip.subarray(dataStart, dataStart + compressedSize);
  if (method === 0) return data;
  if (method === 8) return inflateRawSync(data);
  throw new Error(`Unsupported zip compression method ${method}`);
}

const round = (n) => Math.round(n * 1e4) / 1e4;

const work = mkdtempSync(join(tmpdir(), 'geonames-'));
try {
  const res = await fetch(SRC, {
    headers: { 'User-Agent': 'HostelHiveBot/1.0 (map data build)' },
  });
  if (!res.ok) throw new Error(`GeoNames fetch failed: ${res.status}`);
  const zipPath = join(work, 'cities15000.zip');
  const zip = Buffer.from(await res.arrayBuffer());
  writeFileSync(zipPath, zip);
  const text = unzipOnlyEntry(zip).toString('utf8');

  /** @type {Map<string, {name: string, lat: number, lng: number, population: number, featureCode: string}[]>} */
  const byCountry = new Map();
  for (const line of text.split('\n')) {
    if (!line) continue;
    const f = line.split('\t');
    const [
      name,
      ascii,
      lat,
      lng,
      featureClass,
      featureCode,
      country,
      population,
    ] = [
      f[1],
      f[2],
      Number(f[4]),
      Number(f[5]),
      f[6],
      f[7],
      f[8],
      Number(f[14]),
    ];
    if (featureClass !== 'P' || NOT_A_CITY.has(featureCode)) continue;
    if (!/^[A-Z]{2}$/.test(country) || SKIP.has(country)) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !(population > 0))
      continue;
    const label = (name || ascii).trim();
    if (!label) continue;
    let list = byCountry.get(country);
    if (!list) byCountry.set(country, (list = []));
    list.push({
      name: label,
      lat: round(lat),
      lng: round(lng),
      population,
      featureCode,
    });
  }

  // Rewritten whole, so a country that drops out of the source does not leave a stale file.
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  let files = 0;
  let bytes = 0;
  const nearby = [];
  for (const [country, places] of [...byCountry].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    places.sort(
      (a, b) => b.population - a.population || a.name.localeCompare(b.name),
    );
    // The same name twice is two GeoNames records for one city as far as a visitor can tell
    // (a city and its namesake district, say); the most populous one stands for both.
    const seen = new Set();
    const top = [];
    for (const place of places) {
      const key = place.name.toLocaleLowerCase('en');
      if (seen.has(key)) continue;
      seen.add(key);
      if (top.some((kept) => isPartOf(place, kept))) {
        nearby.push(`${country} ${place.name}`);
        continue;
      }
      top.push(place);
      if (top.length === PER_COUNTRY) break;
    }
    const json = JSON.stringify(
      top.map(({ name, lat, lng, population }) => ({
        name,
        lat,
        lng,
        population,
      })),
    );
    writeFileSync(join(OUT, `${country}.json`), json);
    files++;
    bytes += Buffer.byteLength(json);
  }
  console.log(
    `Wrote ${files} countries, ${(bytes / 1024).toFixed(1)}KB, to ${OUT}`,
  );
  console.log(
    `Folded ${nearby.length} places into a bigger neighbour: ${nearby.join(', ')}`,
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}
