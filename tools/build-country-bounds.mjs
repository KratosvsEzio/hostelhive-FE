// Builds `apps/web/public/geo/country-bounds.json` — one map viewport per country, so the
// search page can open on wherever the visitor is without asking a geocoder at page load.
//
// Source: Natural Earth 1:50m admin-0 (public domain, no attribution required — the same
// reason `build-pak-geo.mjs` chose gbOpen over a share-alike set). It carries ISO 3166-1
// alpha-2 on the features themselves, so nothing has to be joined against a second dataset;
// the obvious candidate for that join, mledoze/countries, is ODbL and would put share-alike
// terms on an asset we ship.
//
// Output shape: `{ "PK": [west, south, east, north], … }` — the order Leaflet's
// `fitBounds` wants, rounded to 4dp (~11m, far finer than a country frame needs) to keep
// the file around 12KB.
//
// Re-run:  node tools/build-country-bounds.mjs
import { geoArea } from 'd3-geo';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';
const OUT = join(process.cwd(), 'apps/web/public/geo');

/**
 * The bbox of a country's **largest landmass**, not of everything it owns.
 *
 * A union bbox is useless for the countries that need it most. Russia and Fiji straddle the
 * antimeridian, so theirs spans -180..180 and "show me my country" renders the whole world;
 * the United States' reaches from Guam to Maine once Alaska and the Pacific territories are
 * in. Taking the single biggest polygon frames the part a visitor means when they say where
 * they are, and leaves the outlying islands off the opening view where they belong.
 */
function mainLandmassBounds(geometry) {
  const polygons =
    geometry.type === 'MultiPolygon'
      ? geometry.coordinates.map((coordinates) => ({ type: 'Polygon', coordinates }))
      : [geometry];

  let best = null;
  let bestArea = -1;
  for (const polygon of polygons) {
    const area = geoArea(polygon);
    if (area > bestArea) {
      bestArea = area;
      best = polygon;
    }
  }
  if (!best) return null;

  let west = 180;
  let south = 90;
  let east = -180;
  let north = -90;
  for (const ring of best.coordinates) {
    for (const [lng, lat] of ring) {
      if (lng < west) west = lng;
      if (lng > east) east = lng;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  }
  return [west, south, east, north];
}

const round = (n) => Math.round(n * 1e4) / 1e4;

const res = await fetch(SRC);
if (!res.ok) throw new Error(`Natural Earth fetch failed: ${res.status}`);
const { features } = await res.json();

const bounds = {};
let skipped = 0;
for (const f of features) {
  const p = f.properties ?? {};
  // `ISO_A2` is "-99" for a handful of disputed or de-facto entries; `ISO_A2_EH` fills
  // several of those in, which is worth six more countries for one fallback.
  const code = [p.ISO_A2, p.ISO_A2_EH].find((c) => /^[A-Z]{2}$/.test(c ?? ''));
  if (!code) {
    skipped++;
    continue;
  }
  const box = mainLandmassBounds(f.geometry);
  if (box) bounds[code] = box.map(round);
}

const sorted = Object.fromEntries(Object.keys(bounds).sort().map((k) => [k, bounds[k]]));

mkdirSync(OUT, { recursive: true });
const file = join(OUT, 'country-bounds.json');
writeFileSync(file, JSON.stringify(sorted) + '\n');

const kb = (JSON.stringify(sorted).length / 1024).toFixed(1);
console.log(`${Object.keys(sorted).length} countries → ${file} (${kb}KB)`);
if (skipped) console.log(`${skipped} feature(s) skipped: no ISO 3166-1 alpha-2 code`);
