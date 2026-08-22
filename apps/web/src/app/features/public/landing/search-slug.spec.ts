import { PLACES } from './places';
import { UNIVERSITIES } from './universities';
import { resolveSearchSlug } from './search-slug';
import { toLocationSlug } from '@util/location-slug';

describe('resolveSearchSlug', () => {
  it('places a curated city', () => {
    const lahore = resolveSearchSlug('lahore');
    expect(lahore?.name).toBe('Lahore');
    expect(lahore?.lat).toBeCloseTo(31.5, 0);
    expect(lahore?.lng).toBeCloseTo(74.3, 0);
  });

  it('places a campus at the campus, not at its city', () => {
    const campus = resolveSearchSlug('punjab-university');
    const lahore = resolveSearchSlug('lahore');
    expect(campus?.name).toBe('Punjab University');
    // The whole point of a campus page: "near PU" is not "somewhere in Lahore".
    expect(campus?.lat).not.toBe(lahore?.lat);
    expect(campus?.lng).not.toBe(lahore?.lng);
  });

  // A city frame has to be wider than a campus frame, or "near campus" means nothing.
  it('frames a campus tighter than a city', () => {
    const campusZoom = resolveSearchSlug('punjab-university')?.zoom ?? 0;
    const cityZoom = resolveSearchSlug('lahore')?.zoom ?? 0;
    expect(cityZoom).toBeGreaterThan(0);
    expect(campusZoom).toBeGreaterThan(cityZoom);
  });

  // The curated name, not an unslugified guess — `fromLocationSlug` would give "Uet Lahore".
  it('returns the real name rather than a title-cased slug', () => {
    expect(resolveSearchSlug('uet-lahore')?.name).toBe('UET Lahore');
    expect(resolveSearchSlug('lums')?.name).toBe('LUMS');
  });

  // Country-wide is the honest answer for a slug we cannot place — better than claiming
  // a scope in the heading that the query never applied.
  it('declines anything uncurated', () => {
    expect(resolveSearchSlug('dha-phase-5')).toBeNull();
    expect(resolveSearchSlug('gulberg-lahore')).toBeNull();
    expect(resolveSearchSlug('')).toBeNull();
    expect(resolveSearchSlug(null)).toBeNull();
    expect(resolveSearchSlug(undefined)).toBeNull();
  });

  // Cities are checked first; a collision would silently shadow one table with the other.
  it('has no slug appearing in both tables', () => {
    const cities = new Set(PLACES.map((p) => p.slug));
    const clashes = UNIVERSITIES.filter((u) => cities.has(u.slug)).map((u) => u.slug);
    expect(clashes).toEqual([]);
  });

  // Every curated slug must survive the round trip the search bar performs, or a search
  // for that place would produce a URL its own landing page cannot resolve.
  it('resolves every slug the search bar can generate for a curated place', () => {
    for (const p of PLACES) {
      expect(toLocationSlug(p.name)).toBe(p.slug);
      expect(resolveSearchSlug(p.slug)).not.toBeNull();
    }
    for (const u of UNIVERSITIES) {
      expect(resolveSearchSlug(u.slug)).not.toBeNull();
    }
  });
});
