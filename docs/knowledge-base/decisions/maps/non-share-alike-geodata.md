# Only attribution-only or public-domain geodata ships in the bundle

**Status:** Accepted
**Area:** [maps](../../area/maps.md)

## Context
Two datasets are bundled as static assets: Pakistan's administrative boundaries for the Explore-Pakistan drill-down (`apps/web/public/geo/pak-adm1.json` and siblings), and one map frame per country so search can open on the visitor's country (`apps/web/public/geo/country-bounds.json`). Whatever licence the source carries attaches to files this site serves.

## Decision
- Boundaries come from **geoBoundaries gbOpen** (CC-BY 4.0, attribute "geoBoundaries"), pinned to one release commit. They are simplified with mapshaper to TopoJSON keeping only `shapeName` (`tools/build-pak-geo.mjs`).
- Country frames come from **Natural Earth 1:50m admin-0** (public domain), which carries ISO-3166 alpha-2 on each feature. Each frame is the bbox of the country's **largest landmass**, rounded to 4 dp (`tools/build-country-bounds.mjs`).

## Alternatives rejected
- **Share-alike sources.** mledoze/countries, the obvious join for ISO codes, is ODbL and would put share-alike terms on a shipped asset (`tools/build-country-bounds.mjs` header). `tools/build-pak-geo.mjs` chose gbOpen as the commercial-safe set for the same reason.
- **The union bbox of a country.** Russia and Fiji straddle the antimeridian (their box spans -180..180, i.e. the whole world), and the United States' box would stretch from Guam to Maine.
- **Asking a geocoder for the country frame at runtime.** That adds a third-party request before first paint and spends a shared fair-use quota (`apps/web/src/app/core/geo/country-bounds.ts`).

## Consequences
- Regenerating is manual: `node tools/build-pak-geo.mjs` and `node tools/build-country-bounds.mjs`. Both fetch from GitHub and write into `apps/web/public/geo/`.
- geoBoundaries attribution is required wherever the drill-down appears.
- `apps/web/public/geo/pak-adm0.json` is generated but not loaded by the current drill-down.

## Evidence
- `tools/build-pak-geo.mjs`, `tools/build-country-bounds.mjs`, `apps/web/src/app/core/geo/country-bounds.ts`
- 809e378 feat(search): open on the visitor's country, and offer a way out when it is empty
