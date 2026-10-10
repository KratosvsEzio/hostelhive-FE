import { genderRoutesFor } from './gender-routes';

/** What every gender page under Lahore should offer, whichever of them the visitor is on. */
const LAHORE = {
  all: { path: '/hostels/lahore', gender: null },
  girls: { path: '/hostels/lahore/girls', gender: null },
  boys: { path: '/hostels/lahore/boys', gender: null },
  coliving: { path: '/hostels/lahore/co-living', gender: null },
  backpacker: { path: '/hostels/lahore', gender: 'backpacker' },
};

describe('genderRoutesFor', () => {
  // A page whose path does not fix a type has nothing to undo, so it keeps the query merge.
  describe('pages that are not a gender page', () => {
    it.each([null, undefined, ''])('offers no routes for the segment %j', (segment) => {
      expect(genderRoutesFor('lahore', segment)).toBeNull();
    });

    it('offers no routes for a campus page, which shares the segment position', () => {
      expect(genderRoutesFor('lahore', 'punjab-university')).toBeNull();
    });

    it('offers no routes for an unknown segment', () => {
      expect(genderRoutesFor('lahore', 'women')).toBeNull();
    });

    // The segment table is a plain object, so an inherited key must not read as a segment.
    it.each(['constructor', 'toString', 'hasOwnProperty', '__proto__'])(
      'does not mistake the inherited key %s for a segment',
      (segment) => {
        expect(genderRoutesFor('lahore', segment)).toBeNull();
      },
    );
  });

  describe('a gender segment on a place with no landing page', () => {
    it('offers no routes for an unknown place', () => {
      expect(genderRoutesFor('atlantis', 'girls')).toBeNull();
    });

    it.each([null, undefined, ''])('offers no routes for the place %j', (place) => {
      expect(genderRoutesFor(place, 'girls')).toBeNull();
    });
  });

  describe('a gender page', () => {
    it('maps every type to the page it lives at, un-localised', () => {
      expect(genderRoutesFor('lahore', 'girls')).toEqual(LAHORE);
    });

    it('sends Any type up to the city page without a gender', () => {
      expect(genderRoutesFor('lahore', 'girls')?.all).toEqual({
        path: '/hostels/lahore',
        gender: null,
      });
    });

    it('keeps backpacker on the city page, carrying the type in the query', () => {
      expect(genderRoutesFor('lahore', 'girls')?.backpacker).toEqual({
        path: '/hostels/lahore',
        gender: 'backpacker',
      });
    });

    it('uses the co-living slug rather than the type name for its page', () => {
      expect(genderRoutesFor('lahore', 'girls')?.coliving.path).toBe('/hostels/lahore/co-living');
    });

    it('adds no language prefix, which the caller owns', () => {
      const routes = genderRoutesFor('lahore', 'girls');
      for (const route of Object.values(routes ?? {})) {
        expect(route.path.startsWith('/hostels/')).toBe(true);
      }
    });

    it.each(['boys', 'co-living'])('offers the same map from the %s page', (segment) => {
      expect(genderRoutesFor('lahore', segment)).toEqual(LAHORE);
    });

    it('follows the place it is given', () => {
      expect(genderRoutesFor('karachi', 'boys')?.girls.path).toBe('/hostels/karachi/girls');
    });
  });
});
