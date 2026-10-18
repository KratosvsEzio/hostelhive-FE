/**
 * A map viewport in degrees, as Leaflet reports it and as the backend wants it —
 * `f[bounding][…]` is a geo_bounding_box on `location`.
 *
 * Longitudes are not wrapped. The map has no `worldCopyJump` and no `maxBounds`, so a view
 * panned a world over reads past ±180 rather than folding back (see `framesPlace`).
 */
export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * How far the view's centre may sit from the place's and still frame it, on each axis, in
 * tiles at the place's zoom.
 *
 * A tile is 256 px, `360 / 2^zoom` degrees of longitude, so this is about 0.35° (~33 km) for
 * a city at zoom 11 and 0.09° (~8 km) for a campus at 13: room to pan around the place, or
 * to zoom into one of its neighbourhoods, with its centre off the screen.
 */
export const NEAR_TILES = 2;

/**
 * The widest view that still frames a place, in tiles at its zoom: about 5.6° of longitude
 * (~530 km) for a city and 1.4° for a campus. Wider is a region with the place somewhere in
 * it, Lahore on a map of Pakistan, rather than the place.
 *
 * Measured across the longitude span only, because the place's own opening view must never
 * trip it. Width is bounded by real screens (a 3844 px pane is 15 tiles at the place's zoom);
 * height is not, with a phone held upright or a crawler rendering into a tall window.
 */
export const CAP_TILES = 32;

/**
 * Whether `view` still frames the place centred on `centre`, whose own frame is `zoom` — the
 * test that decides whether a search's heading may keep naming the place.
 *
 * Out once the view is wider than {@link CAP_TILES}. Otherwise in when the place's centre is
 * on screen, or the view's centre is within {@link NEAR_TILES} of it. Either alone fails:
 * centre-on-screen keeps "Lahore" over a map of the whole country and drops it inside one of
 * its own neighbourhoods.
 *
 * Framed whenever it cannot be judged: no view yet (until the map reports a view of its own,
 * after a recentre) or no known centre (a typed place nobody located). With no zoom, only the
 * on-screen test applies.
 */
export function framesPlace(
  view: Bounds | null,
  centre: { lat: number; lng: number } | null,
  zoom: number | null,
): boolean {
  if (!view || !centre) return true;
  const midLat = (view.north + view.south) / 2;
  const midLng = (view.east + view.west) / 2;
  // The copy of the place nearest the view: the map does not wrap, so a pan a world over
  // reads the same place 360° away.
  const lng = centre.lng + 360 * Math.round((midLng - centre.lng) / 360);
  const inView =
    centre.lat >= view.south && centre.lat <= view.north && lng >= view.west && lng <= view.east;
  if (zoom == null) return inView;

  const tile = 360 / 2 ** zoom;
  if (view.east - view.west > CAP_TILES * tile) return false;
  // A tile spans fewer degrees of latitude than of longitude, by the cosine of the latitude.
  const latTile = tile * Math.cos((centre.lat * Math.PI) / 180);
  const near =
    Math.abs(midLng - lng) <= NEAR_TILES * tile &&
    Math.abs(midLat - centre.lat) <= NEAR_TILES * latTile;
  return inView || near;
}
