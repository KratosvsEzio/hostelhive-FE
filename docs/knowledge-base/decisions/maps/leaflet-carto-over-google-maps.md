# Leaflet with CARTO Voyager tiles, not Google Maps

**Status:** Accepted
**Area:** [maps](../../area/maps.md)

## Context
The map went through three states. It started as a faux CSS map. Next came Leaflet with OpenStreetMap tiles. Then came a full Google stack: Maps JS, `AdvancedMarkerElement` pins and Places autocomplete, keyed through a generated env file. The Google stack needed a billable key restricted by HTTP referrer, and that restriction blocks the Capacitor WebView origins (`MOBILE.md`). It was replaced by Leaflet again and deleted in 59d3692. Later, CARTO started requiring a key for its basemap and stamped every keyless tile, with no failed request anywhere (d7e3812).

## Decision
Render maps with Leaflet, loaded on demand in the browser (`LeafletLoader`, `lib/src/maps/lib/leaflet.ts`). The everyday basemap is CARTO Voyager raster tiles. Their key comes from `.env` (`CARTO_BASEMAP_KEY`), is written to the git-ignored maps.env.ts by `tools/generate-maps-env.mjs`, and is attached by `withCartoKey`. Esri World Imagery backs the satellite toggle. The provider is config in one file: swapping it is a change to `DEFAULT_CONFIG` and nowhere else.

## Alternatives rejected
- **Google Maps + Places.** Billable per load and per autocomplete request, and the referrer-restricted key breaks inside the mobile WebView. Removed as dead code in 59d3692. `SharedMap` notes that Leaflet has no invoice to avoid (`lib/src/maps/lib/shared-map.ts`).
- **Keyless tile providers**, each measured at real Pakistani addresses (d7e3812):
  - Esri: no residential street grid in the semi-rural areas where hostels sit.
  - Wikimedia: its terms forbid non-Wikimedia sites.
  - OSM Germany: restricts commercial use.
  - OSM/HOT community servers: donation-funded, no SLA.
- **Failing hard on a missing key.** Rejected so that a fresh checkout without `.env` still gets a usable, watermarked map.

## Consequences
- CARTO's free tier is 5M tiles a month with commercial use allowed, and attribution must stay visible. `SharedMap` reuses one map across search → listing → back, partly to keep tile requests down.
- The CARTO key is public by design (it travels in the tile URL). It is protected by the domain allow-list set on the key, not by secrecy.
- A wrong key produces no error. `lib/src/maps/lib/carto-key.spec.ts` can only assert the URL shape.
- `map-style.airbnb.json` and the Google section of `MOBILE.md` are leftovers of the rejected option.

## Evidence
- d7e3812 fix(maps): pay CARTO's toll, and stop the basemap arriving stamped
- 59d3692 chore: delete dead components, the Google Maps stack, and unused fixtures
- `lib/src/maps/lib/leaflet.ts`, `apps/web/src/app/app.config.ts`, `apps/web/project.json` (`sync-maps-env`)
- `docs/HostelHive-Implementation-Plan.md` (execution log entries for the Leaflet → Google switch, marked superseded)
