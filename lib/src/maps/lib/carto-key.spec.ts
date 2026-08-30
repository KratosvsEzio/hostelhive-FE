import { LEAFLET_MAPS_CONFIG, provideLeafletMaps, withCartoKey } from './leaflet';
import type { LeafletMapsConfig } from './leaflet';

/** The value `provideLeafletMaps` would hand to `LeafletLoader`, without booting Angular. */
function resolved(key: string): LeafletMapsConfig {
  const provider = provideLeafletMaps(withCartoKey(key)) as {
    provide: unknown;
    useValue: LeafletMapsConfig;
  };
  expect(provider.provide).toBe(LEAFLET_MAPS_CONFIG);
  return provider.useValue;
}

/**
 * CARTO stopped serving these keyless and now renders "API KEY REQUIRED" into every tile
 * it sends without one. Nothing fails when the key is missing or malformed — the tiles
 * still arrive, 200, just stamped — so no error surfaces to catch a mistake here. These
 * assert the URL itself, which is the only place the mistake would show.
 */
describe('withCartoKey', () => {
  it('puts the key on the roadmap tile URL', () => {
    const url = resolved('abc123').roadmap.url;
    expect(url).toContain('rastertiles/voyager');
    expect(url.endsWith('?key=abc123')).toBe(true);
  });

  it('leaves the rest of the roadmap config alone', () => {
    const bare = resolved('').roadmap;
    const keyed = resolved('abc123').roadmap;
    expect(keyed.attribution).toBe(bare.attribution);
    expect(keyed.maxZoom).toBe(bare.maxZoom);
    expect(keyed.subdomains).toBe(bare.subdomains);
    // The placeholders Leaflet substitutes must survive — appending a query string must
    // not disturb them, or every tile request 404s.
    expect(keyed.url).toContain('{z}/{x}/{y}{r}.png');
  });

  // The satellite layer is Esri, a different provider that never wanted a CARTO key.
  // A shallow merge makes it easy to clobber, and nothing would visibly break until
  // someone switched to Satellite.
  it('does not touch the satellite layer', () => {
    expect(resolved('abc123').satellite).toEqual(resolved('').satellite);
    expect(resolved('abc123').satellite.url).toContain('arcgisonline');
  });

  // Unset is the normal state for a fresh checkout: .env is git-ignored, so a new
  // developer has no key until they request one. A watermarked map beats a broken one.
  it('changes nothing when no key is set', () => {
    expect(withCartoKey('')).toEqual({});
    expect(resolved('').roadmap.url).not.toContain('key=');
  });

  it('escapes a key that would otherwise break the query string', () => {
    expect(resolved('a b&c').roadmap.url.endsWith('?key=a%20b%26c')).toBe(true);
  });
});
