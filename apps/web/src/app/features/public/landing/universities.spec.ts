import { GENDER_SEGMENTS, PLACES } from './places';
import { UNIVERSITIES, findUniversity, universitiesIn } from './universities';
import { sitemapPaths } from './sitemap-urls';

describe('university registry', () => {
  it('gives every campus a unique slug', () => {
    const slugs = UNIVERSITIES.map((u) => u.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  // A campus under a city that has no landing page would be unreachable: the route is
  // /hostels/:place/:campus, so the place has to resolve first.
  it('places every campus in a city that has its own page', () => {
    const places = new Set(PLACES.map((p) => p.slug));
    for (const u of UNIVERSITIES) {
      expect(places.has(u.placeSlug)).toBe(true);
    }
  });

  // The second URL segment is a gender or a campus, and gender is resolved first. A
  // campus slugged "girls" would be permanently shadowed.
  it('never collides with a gender segment', () => {
    const genders = Object.keys(GENDER_SEGMENTS);
    for (const u of UNIVERSITIES) {
      expect(genders).not.toContain(u.slug);
    }
  });

  it('gives every campus its own copy, not a shared template', () => {
    const blurbs = UNIVERSITIES.map((u) => u.blurb);
    expect(new Set(blurbs).size).toBe(blurbs.length);
    for (const u of UNIVERSITIES) {
      expect(u.blurb.length).toBeGreaterThan(60);
      expect(u.name.trim()).not.toBe('');
      expect(u.shortName.trim()).not.toBe('');
    }
  });

  // Campus coordinates, not the city centre — the seeded search opens on what a student
  // means by "near". A campus sitting exactly on its city's coordinates is a copy-paste.
  it('uses campus coordinates rather than the city centre', () => {
    for (const u of UNIVERSITIES) {
      const place = PLACES.find((p) => p.slug === u.placeSlug)!;
      expect(u.lat).not.toBe(place.lat);
      expect(u.lng).not.toBe(place.lng);
      // Pakistan's bounding box, roughly — catches a transposed lat/lng.
      expect(u.lat).toBeGreaterThan(23);
      expect(u.lat).toBeLessThan(37);
      expect(u.lng).toBeGreaterThan(60);
      expect(u.lng).toBeLessThan(78);
    }
  });
});

describe('findUniversity', () => {
  it('resolves a campus within its own city', () => {
    expect(findUniversity('lahore', 'punjab-university')?.shortName).toBe(
      'Punjab University',
    );
  });

  // Scoping by city is what stops /hostels/karachi/lums rendering a Lahore campus under
  // a Karachi URL — a page that would be wrong and indexable.
  it('refuses a campus that belongs to a different city', () => {
    expect(findUniversity('karachi', 'lums')).toBeNull();
  });

  it('is null for an unknown or missing slug', () => {
    expect(findUniversity('lahore', 'not-a-university')).toBeNull();
    expect(findUniversity('lahore', null)).toBeNull();
  });
});

describe('universitiesIn', () => {
  it('lists only the campuses of that city', () => {
    for (const u of universitiesIn('lahore')) {
      expect(u.placeSlug).toBe('lahore');
    }
    expect(universitiesIn('lahore').length).toBeGreaterThan(0);
  });

  it('is empty for a city with no campuses yet', () => {
    expect(universitiesIn('sialkot')).toEqual([]);
  });
});

describe('sitemap', () => {
  // An unlisted campus page is one nothing links to from outside and nothing crawls.
  it('lists every campus page', () => {
    const paths = sitemapPaths();
    for (const u of UNIVERSITIES) {
      expect(paths).toContain(`/hostels/${u.placeSlug}/${u.slug}`);
    }
  });
});
